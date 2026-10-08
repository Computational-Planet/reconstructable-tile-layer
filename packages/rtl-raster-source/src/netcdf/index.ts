import {
  abortable,
  combineSignals,
  RasterError,
  throwIfAborted,
  type RasterErrorCode,
} from "../errors.js";
import type { RasterArray, RasterReadOptions, RasterReadResult, RasterSource } from "../types.js";
import { checkBudget, memoryBudget, validateRead } from "../validation.js";
import { describeSlice, describeVariable } from "./cf.js";
import type {
  NetCDFDataset,
  NetCDFMetadata,
  NetCDFSliceOptions,
  OpenNetCDFOptions,
  SlabRequest,
} from "./types.js";

export type {
  NetCDFAttribute,
  NetCDFAttributes,
  NetCDFDataset,
  NetCDFMetadata,
  NetCDFSliceLayout,
  NetCDFSliceOptions,
  NetCDFVariable,
  OpenNetCDFOptions,
} from "./types.js";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

class Dataset implements NetCDFDataset {
  metadata!: NetCDFMetadata;
  readonly lifetime = new AbortController();
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  get closed() {
    return this.lifetime.signal.aborted;
  }

  describeVariable(name: string) {
    if (this.closed) throw new RasterError("closed", "NetCDF dataset is closed.");
    return deepFreeze(describeVariable(this.metadata, name));
  }

  constructor(
    private readonly worker: Worker,
    readonly budget: number,
  ) {
    worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error)
        request.reject(new RasterError(data.error.code as RasterErrorCode, data.error.message));
      else request.resolve(data.result);
    };
    worker.onerror = (event) =>
      this.fail(new RasterError("unsupported-format", `NetCDF worker failed: ${event.message}`));
    worker.onmessageerror = () =>
      this.fail(new RasterError("invalid-metadata", "Cannot receive a NetCDF worker response."));
  }

  private fail(error: RasterError) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.close();
  }

  async request<T>(kind: string, payload: object, signal?: AbortSignal): Promise<T> {
    if (this.closed) throw new RasterError("closed", "NetCDF dataset is closed.");
    throwIfAborted(signal);
    const signals = combineSignals([signal, this.lifetime.signal]);
    const task = this.queue.then(() => {
      throwIfAborted(signals.signal);
      return new Promise<unknown>((resolve, reject) => {
        const id = ++this.nextId;
        this.pending.set(id, { resolve, reject });
        try {
          this.worker.postMessage({ id, kind, ...payload });
        } catch (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
    this.queue = task.catch(() => undefined);
    // 引擎当前的有界解码可继续完成；取消立即返回，并在下一次操作前等待旧任务释放缓冲区。
    void task.finally(signals.dispose).catch(() => undefined);
    return abortable(task, signals.signal) as Promise<T>;
  }

  async readCoordinate(
    name: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<RasterArray> {
    const variable = this.metadata.variables.find((v) => v.name === name);
    if (!variable || variable.shape.length !== 1)
      throw new RangeError("readCoordinate requires a one-dimensional variable.");
    return this.read({ variable: name, starts: [0], counts: [...variable.shape] }, options.signal);
  }

  private read(request: SlabRequest, signal?: AbortSignal): Promise<RasterArray> {
    checkBudget(request.counts.reduce((a, b) => a * b, 1) * 8 * 3, this.budget);
    return this.request("slab", { request }, signal);
  }

  async selectSlice(options: NetCDFSliceOptions): Promise<RasterSource> {
    if (this.closed) throw new RasterError("closed", "NetCDF dataset is closed.");
    throwIfAborted(options.signal);
    const descriptor = await describeSlice(this.metadata, options, (request) =>
      this.read(request, options.signal),
    );
    const lifetime = new AbortController();
    const dataset = this;
    const { metadata } = descriptor;
    return {
      metadata,
      get closed() {
        return dataset.closed || lifetime.signal.aborted;
      },
      async readWindow(options: RasterReadOptions): Promise<RasterReadResult> {
        if (dataset.closed || lifetime.signal.aborted)
          throw new RasterError("closed", "NetCDF slice is closed.");
        throwIfAborted(options.signal);
        const { width, height, bands } = validateRead(metadata, options);
        checkBudget(width * height * 8 * Math.max(2, bands.length), dataset.budget);
        const [left, top, right, bottom] = options.window;
        const columns = options.sampleColumns
          ? [...options.sampleColumns]
          : Array.from({ length: width }, (_, i) =>
              Math.floor(left + ((i + 0.5) * (right - left)) / width),
            );
        const rows = options.sampleRows
          ? [...options.sampleRows]
          : Array.from({ length: height }, (_, i) =>
              Math.floor(top + ((i + 0.5) * (bottom - top)) / height),
            );
        const signals = combineSignals([options.signal, lifetime.signal]);
        try {
          const result = await dataset.request<RasterArray>(
            "grid",
            {
              request: {
                variable: metadata.slice!.variable,
                xDimension: descriptor.xDimension,
                yDimension: descriptor.yDimension,
                indices: descriptor.indices,
                columns,
                rows,
              },
            },
            signals.signal,
          );
          return {
            width,
            height,
            window: options.window,
            bands: bands.map((_, i) => (i === 0 ? result : result.slice())),
          };
        } finally {
          signals.dispose();
        }
      },
      close() {
        lifetime.abort();
      },
    };
  }

  close() {
    if (this.closed) return;
    this.lifetime.abort();
    this.worker.terminate();
    for (const request of this.pending.values())
      request.reject(new RasterError("closed", "NetCDF dataset is closed."));
    this.pending.clear();
  }
}

/** Opens local CF/COARDS NetCDF3 or NetCDF4. No worker or WASM is started by importing this module. */
export async function openNetCDFSource(
  file: Blob,
  options: OpenNetCDFOptions = {},
): Promise<NetCDFDataset> {
  throwIfAborted(options.signal);
  const budget = memoryBudget(options.memoryBudgetBytes);
  const worker = options.workerFactory
    ? options.workerFactory()
    : new Worker(new URL("../workers/netcdf.js", import.meta.url), { type: "module" });
  const dataset = new Dataset(worker, budget);
  try {
    dataset.metadata = deepFreeze(
      await dataset.request<NetCDFMetadata>("open", { file, budget }, options.signal),
    );
    return dataset;
  } catch (error) {
    dataset.close();
    throw error;
  }
}

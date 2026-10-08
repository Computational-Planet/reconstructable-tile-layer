import type { RasterSource } from "rtl-raster-source";
import { checkAbort, RasterConversionError } from "./errors.js";
import { prepareSource } from "./prepare.js";
import { checkedOptions, outputFilename } from "./validation.js";
import type { ConversionJob, WorkerReply } from "./internal/protocol.js";
import type {
  RasterConverter,
  RasterConverterOptions,
  RasterConversionResult,
  ToCOGOptions,
} from "./types.js";

export { RasterConversionError, type RasterConversionErrorCode } from "./errors.js";
export type {
  RasterConverter,
  RasterConverterOptions,
  RasterConverterAssets,
  GeographicExportGrid,
  RasterReprojection,
  ToCOGOptions,
  RasterConversionProgress,
  RasterConversionResult,
  ConvertedRasterMetadata,
  ProvenanceValue,
} from "./types.js";

/** Configure a converter without initializing GDAL; each toCOG job owns one disposable Worker. */
export async function createRasterConverter(
  config: RasterConverterOptions,
): Promise<RasterConverter> {
  const budget = config.memoryBudgetBytes ?? 256 * 1024 * 1024;
  const timeoutMs = config.workerTimeoutMs ?? 180000;
  if (
    !Number.isSafeInteger(budget) ||
    budget < 1024 * 1024 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new RasterConversionError(
      "invalid-input",
      "Use a memory budget of at least 1 MiB and a positive Worker timeout.",
    );
  const absolute = (url: string | URL) => new URL(url, globalThis.location?.href).href;
  const assets = {
    js: absolute(config.assets.js),
    wasm: absolute(config.assets.wasm),
    data: absolute(config.assets.data),
  };
  let disposed = false;
  let controller: AbortController | undefined;
  let worker: Worker | undefined;
  return {
    get disposed() {
      return disposed;
    },
    get busy() {
      return !!controller;
    },
    dispose() {
      disposed = true;
      controller?.abort();
      worker?.terminate();
    },
    async toCOG(
      input: Blob | RasterSource,
      options: ToCOGOptions = {},
    ): Promise<RasterConversionResult> {
      if (disposed) throw new RasterConversionError("closed", "The raster converter is disposed.");
      if (controller)
        throw new RasterConversionError(
          "busy",
          "This converter already has an active job; await or cancel it before starting another.",
        );
      controller = new AbortController();
      const active = controller;
      const abort = () => active.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      try {
        checkAbort(active.signal);
        checkedOptions(options);
        options.onProgress?.({ stage: "preparing" });
        const isFile = input instanceof Blob;
        let files: File[];
        if (isFile) {
          if (options.grid || options.bands)
            throw new RasterConversionError(
              "invalid-input",
              "grid/bands apply to RasterSource inputs; open a source first to select bands or a geographic grid.",
            );
          if (input.size > budget)
            throw new RasterConversionError(
              "resource-limit",
              "Input file exceeds memoryBudgetBytes.",
            );
          const header = new Uint8Array(await input.slice(0, 4).arrayBuffer());
          const tiff =
            (header[0] === 73 &&
              header[1] === 73 &&
              [42, 43].includes(header[2]) &&
              header[3] === 0) ||
            (header[0] === 77 &&
              header[1] === 77 &&
              header[2] === 0 &&
              [42, 43].includes(header[3]));
          if (!tiff)
            throw new RasterConversionError(
              "unsupported-format",
              "File conversion accepts TIFF/BigTIFF. Open NetCDF with rtl-raster-source/netcdf and pass its selected slice.",
            );
          files = [new File([input], "input.tif")];
        } else files = await prepareSource(input, options, budget, active.signal);
        checkAbort(active.signal);
        const job: ConversionJob = {
          files,
          assets,
          memoryBudgetBytes: budget,
          compression: options.compression ?? "DEFLATE",
          overviewResampling: options.overviewResampling ?? "nearest",
          blockSize: options.blockSize ?? 256,
          georeference: options.georeference,
          reproject: options.reproject,
        };
        worker = config.workerFactory?.() ?? new Worker(new URL("./worker.js", import.meta.url));
        const running = worker;
        const result = await new Promise<Extract<WorkerReply, { result: unknown }>["result"]>(
          (resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>;
            const finish = (
              error?: Error,
              value?: Extract<WorkerReply, { result: unknown }>["result"],
            ) => {
              clearTimeout(timer);
              active.signal.removeEventListener("abort", cancelled);
              running.onmessage = null;
              running.onerror = null;
              running.onmessageerror = null;
              running.terminate();
              if (error) reject(error);
              else resolve(value!);
            };
            const cancelled = () =>
              finish(new RasterConversionError("aborted", "Raster conversion was cancelled."));
            active.signal.addEventListener("abort", cancelled, { once: true });
            timer = setTimeout(
              () =>
                finish(
                  new RasterConversionError(
                    "engine-error",
                    "Conversion Worker timed out and was terminated.",
                  ),
                ),
              timeoutMs,
            );
            running.onerror = (event) =>
              finish(
                new RasterConversionError(
                  "engine-error",
                  event.message || "Conversion Worker could not load.",
                ),
              );
            running.onmessageerror = () =>
              finish(
                new RasterConversionError("engine-error", "Could not decode the Worker reply."),
              );
            running.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
              if ("progress" in data) {
                try {
                  options.onProgress?.(data.progress);
                } catch (error) {
                  finish(error instanceof Error ? error : new Error(String(error)));
                }
              } else if ("error" in data)
                finish(new RasterConversionError(data.error.code, data.error.message));
              else finish(undefined, data.result);
            };
            if (active.signal.aborted) cancelled();
            else {
              try {
                running.postMessage(job);
              } catch (error) {
                finish(error instanceof Error ? error : new Error(String(error)));
              }
            }
          },
        );
        checkAbort(active.signal);
        const name = isFile
          ? ((input as File).name ?? "raster")
          : (input.metadata.name ?? input.metadata.slice?.variable ?? "slice");
        const filename = outputFilename(options.filename ?? name);
        const provenance = {
          schema: "rtl-raster-provenance/1",
          source: isFile
            ? { filename: name, bytes: input.size, georeferenceOverride: options.georeference }
            : input.metadata,
          processing: {
            compression: job.compression,
            overviewResampling: job.overviewResampling,
            bands: options.bands,
            grid: options.grid,
            reproject: options.reproject,
            sampleValues: isFile
              ? "Original GDAL samples and band metadata"
              : "Float64 physical values; stored NoData/validRange checked before scale/offset; missing=NaN",
          },
          context: options.provenance,
          output: result.metadata,
          diagnostics: result.diagnostics,
        };
        const provenanceBlob = new Blob(
          [
            JSON.stringify(
              provenance,
              (_, value) =>
                typeof value === "number" && !Number.isFinite(value) ? String(value) : value,
              2,
            ),
          ],
          { type: "application/json" },
        );
        options.onProgress?.({ stage: "done" });
        return {
          blob: new Blob([result.bytes], { type: "image/tiff" }),
          filename,
          metadata: result.metadata,
          provenanceBlob,
          provenanceFilename: `${filename}.json`,
          diagnostics: result.diagnostics,
        };
      } catch (error) {
        if (disposed)
          throw new RasterConversionError(
            "closed",
            "The converter was disposed during conversion.",
          );
        if (active.signal.aborted)
          throw new RasterConversionError("aborted", "Raster conversion was cancelled.");
        throw error;
      } finally {
        worker?.terminate();
        worker = undefined;
        controller = undefined;
        options.signal?.removeEventListener("abort", abort);
      }
    },
  };
}

export type RasterErrorCode =
  | "unsupported-format"
  | "unsupported-crs"
  | "unsupported-grid"
  | "invalid-metadata"
  | "resource-limit"
  | "aborted"
  | "closed";

export class RasterError extends Error {
  readonly code: RasterErrorCode;
  constructor(code: RasterErrorCode, message: string) {
    super(message);
    this.name = "RasterError";
    this.code = code;
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RasterError("aborted", "Raster operation was cancelled.");
}

/** Settles promptly on abort even if an engine cannot interrupt its current decode. */
export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new RasterError("aborted", "Raster operation was cancelled."));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) onAbort();
  });
}

export function combineSignals(signals: readonly (AbortSignal | undefined)[]) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const signal of signals) signal?.removeEventListener("abort", abort);
    },
  };
}

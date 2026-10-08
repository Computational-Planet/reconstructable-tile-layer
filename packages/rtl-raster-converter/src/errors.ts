export type RasterConversionErrorCode =
  | "aborted"
  | "closed"
  | "busy"
  | "invalid-input"
  | "unsupported-format"
  | "unsupported-grid"
  | "resource-limit"
  | "engine-error";

export class RasterConversionError extends Error {
  constructor(
    readonly code: RasterConversionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RasterConversionError";
  }
}

export function checkAbort(signal: AbortSignal): void {
  if (signal.aborted)
    throw new RasterConversionError("aborted", "Raster conversion was cancelled.");
}

import { RasterError } from "./errors.js";
import type { RasterMetadata, RasterReadOptions } from "./types.js";

export const DEFAULT_MEMORY_BUDGET = 64 * 1024 * 1024;

export function memoryBudget(value = DEFAULT_MEMORY_BUDGET): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("memoryBudgetBytes must be a positive safe integer.");
  }
  return value;
}

export function checkBudget(bytes: number, budget: number): void {
  if (!Number.isSafeInteger(bytes) || bytes > budget) {
    throw new RasterError(
      "resource-limit",
      `Read needs approximately ${bytes} bytes; budget is ${budget}. Use a smaller window or convert to COG with overviews.`,
    );
  }
}

export function validateRead(metadata: RasterMetadata, options: RasterReadOptions) {
  const [left, top, right, bottom] = options.window;
  if (
    !options.window.every(Number.isSafeInteger) ||
    left < 0 ||
    top < 0 ||
    right > metadata.width ||
    bottom > metadata.height ||
    right <= left ||
    bottom <= top
  ) {
    throw new RangeError("window must contain integer pixel edges inside the raster.");
  }
  const width = options.width ?? options.sampleColumns?.length ?? right - left;
  const height = options.height ?? options.sampleRows?.length ?? bottom - top;
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new RangeError("Output width and height must be positive integers.");
  }
  for (const [samples, count, start, end] of [
    [options.sampleColumns, width, left, right],
    [options.sampleRows, height, top, bottom],
  ] as const) {
    if (
      samples &&
      (samples.length !== count ||
        samples.some((i) => !Number.isSafeInteger(i) || i < start || i >= end))
    )
      throw new RangeError("Sample indices must match the output size and lie inside window.");
  }
  const bands = options.bands ? [...options.bands] : metadata.bands.map((_, i) => i);
  if (
    !bands.length ||
    bands.some((n) => !Number.isInteger(n) || n < 0 || n >= metadata.bands.length)
  ) {
    throw new RangeError("bands must contain valid zero-based band indices.");
  }
  return { width, height, bands };
}

export function freezeMetadata(metadata: RasterMetadata): RasterMetadata {
  Object.freeze(metadata.crs);
  Object.freeze(metadata.bounds);
  Object.freeze(metadata.transform);
  if (metadata.coordinates) {
    Object.freeze(metadata.coordinates.x);
    Object.freeze(metadata.coordinates.y);
    Object.freeze(metadata.coordinates);
  }
  for (const band of metadata.bands) {
    Object.freeze(band.noData);
    Object.freeze(band.validRange);
    Object.freeze(band);
  }
  Object.freeze(metadata.bands);
  for (const overview of metadata.overviews) Object.freeze(overview);
  Object.freeze(metadata.overviews);
  Object.freeze(metadata.warnings);
  if (metadata.slice) {
    Object.freeze(metadata.slice.indices);
    Object.freeze(metadata.slice.dimensions);
    for (const attributes of [
      metadata.slice.attributes,
      metadata.slice.datasetAttributes,
      ...(metadata.slice.selections ?? []).map((selection) => selection.coordinate?.attributes),
    ]) {
      if (!attributes) continue;
      for (const value of Object.values(attributes)) Object.freeze(value);
      Object.freeze(attributes);
    }
    for (const selection of metadata.slice.selections ?? []) {
      Object.freeze(selection.coordinate);
      Object.freeze(selection);
    }
    Object.freeze(metadata.slice.selections);
    Object.freeze(metadata.slice);
  }
  return Object.freeze(metadata);
}

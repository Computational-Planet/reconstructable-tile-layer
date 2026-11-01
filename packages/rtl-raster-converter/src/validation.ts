import type { RasterBounds } from "rtl-raster-source";
import { RasterConversionError } from "./errors.js";
import type { ToCOGOptions } from "./types.js";

export function checkedSize(width: number, height: number, bands: number, budget: number): void {
  const bytes = width * height * bands * 8;
  if (![width, height, bands].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new RasterConversionError(
      "invalid-input",
      "Raster size and band count must be positive integers.",
    );
  // 预算覆盖两份 Float64 数值缓冲；引擎基线、GPU 与浏览器总内存不在此估计内。
  if (!Number.isSafeInteger(bytes) || bytes * 2 > budget)
    throw new RasterConversionError(
      "resource-limit",
      "Raster working-buffer estimate exceeds memoryBudgetBytes; select a smaller output grid.",
    );
}

export function checkedBounds(bounds: RasterBounds, geographic: boolean): void {
  const [west, south, east, north] = bounds;
  if (
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    east <= west ||
    north <= south ||
    (geographic && (east - west > 360 + 1e-7 || south < -90 || north > 90))
  )
    throw new RasterConversionError(
      "invalid-input",
      "Expected ordered pixel-edge bounds within the target CRS; geographic latitude must be within ±90°.",
    );
}

export function checkedOptions(options: ToCOGOptions): void {
  if (options.compression && !["DEFLATE", "LZW", "NONE"].includes(options.compression))
    throw new RasterConversionError("invalid-input", "Unsupported lossless compression.");
  if (
    options.overviewResampling &&
    !["nearest", "average", "mode"].includes(options.overviewResampling)
  )
    throw new RasterConversionError("invalid-input", "Unsupported overview resampling.");
  if (options.blockSize && ![128, 256, 512].includes(options.blockSize))
    throw new RasterConversionError("invalid-input", "blockSize must be 128, 256 or 512.");
  if (options.grid) {
    checkedBounds(options.grid.bounds, true);
    if (options.grid.resampling !== "nearest")
      throw new RasterConversionError(
        "invalid-input",
        "Scientific grid sampling currently supports nearest only.",
      );
  }
  if (options.reproject) {
    checkedBounds(options.reproject.bounds, options.reproject.epsg === 4326);
    if (
      ![4326, 3857].includes(options.reproject.epsg) ||
      !["nearest", "bilinear", "cubic"].includes(options.reproject.resampling)
    )
      throw new RasterConversionError(
        "invalid-input",
        "Unsupported reprojection CRS or resampling.",
      );
  }
  if (options.georeference) {
    const { epsg, transform: t } = options.georeference;
    if (
      !Number.isSafeInteger(epsg) ||
      epsg <= 0 ||
      t.length !== 6 ||
      !t.every(Number.isFinite) ||
      t[1] <= 0 ||
      t[5] >= 0 ||
      t[2] !== 0 ||
      t[4] !== 0
    )
      throw new RasterConversionError(
        "invalid-input",
        "Explicit TIFF georeference needs a valid EPSG and north-up corner transform.",
      );
  }
}

export function outputFilename(name: string): string {
  const stem =
    name
      .replace(/\.[^.]*$/, "")
      .replace(/[^\p{L}\p{N}_.-]+/gu, "_")
      .slice(0, 150) || "raster";
  return `${stem}.cog.tif`;
}

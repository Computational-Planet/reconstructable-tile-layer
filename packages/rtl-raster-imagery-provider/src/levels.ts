import type { RasterMetadata } from "rtl-raster-source";

export interface RasterLevelOptions {
  readonly tileSize?: number;
  /** Requestable limit (0–24); defaults to max(2, nativeMaximumLevel). */
  readonly maximumLevel?: number;
}

export interface RasterLevelInfo {
  readonly tileSize: number;
  readonly minimumLevel: 0;
  /** Approximate level matching stored pixels in the file's 1×1 root layout, not an overview index. */
  readonly nativeMaximumLevel: number;
  readonly maximumLevel: number;
  readonly recommendedReconstructionLevel: number;
}

/** Describes the virtual tile pyramid without reading pixels or starting a Worker. */
export function getRasterLevelInfo(
  metadata: Pick<RasterMetadata, "width" | "height">,
  options: RasterLevelOptions = {},
): RasterLevelInfo {
  const tileSize = options.tileSize ?? 256;
  if (!Number.isInteger(tileSize) || tileSize < 16 || tileSize > 1024)
    throw new RangeError("tileSize must be an integer from 16 to 1024.");
  if (![metadata.width, metadata.height].every((size) => Number.isSafeInteger(size) && size > 0))
    throw new RangeError("Raster dimensions must be positive safe integers.");
  const nativeMaximumLevel = Math.min(
    24,
    Math.max(0, Math.ceil(Math.log2(Math.max(metadata.width, metadata.height) / tileSize))),
  );
  // COG 概览描述存储分辨率，RTL 层级描述空间切分；两者不能用同一个上限约束。
  // 低分辨率源至少可细分到 L2；更高层级仍按原始数值最近邻采样，不创造细节。
  const maximumLevel = options.maximumLevel ?? Math.max(2, nativeMaximumLevel);
  if (!Number.isInteger(maximumLevel) || maximumLevel < 0 || maximumLevel > 24)
    throw new RangeError("maximumLevel must be an integer from 0 to 24.");
  return {
    tileSize,
    minimumLevel: 0,
    nativeMaximumLevel,
    maximumLevel,
    recommendedReconstructionLevel: Math.min(3, maximumLevel),
  };
}

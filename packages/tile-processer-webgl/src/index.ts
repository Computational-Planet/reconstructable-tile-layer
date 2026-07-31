/**
 * WebGL tile reprojection and clipping processor with the historical name.
 * Image methods resolve to `null` for cancelled work and recoverable provider,
 * rendering, or export failures.
 */
export { CesiumTileProcesser } from "./cesium-tile-processer.js";

/** Correctly spelled alias with the same nullable image-result contract. */
export { CesiumTileProcesser as CesiumTileProcessor } from "./cesium-tile-processer.js";

export type {
  /** Named WebGL buffers used by the draw pipeline. */
  Buffers,
  /** Options accepted by the historical processor name. */
  CesiumTileProcesserOptions,
  /** Statistics returned by the historical processor name. */
  CesiumTileProcesserStats,
  /** Correctly spelled options alias. */
  CesiumTileProcessorOptions,
  /** Correctly spelled statistics alias. */
  CesiumTileProcessorStats,
  /** One polygon exterior and its optional holes. */
  ClipPolygon,
  /** One or more polygons used as a tile clip mask. */
  TileClipArea,
  /** Retained processed image returned to a caller. */
  TileImageAsset,
  /** Runtime representation used for a processed image. */
  TileImageOutputType,
  /** Low-level timing observer with the historical spelling. */
  TileProcesserBenchmarkObserver,
  /** Timing stage with the historical spelling. */
  TileProcesserBenchmarkStage,
  /** Correctly spelled low-level timing observer alias. */
  TileProcessorBenchmarkObserver,
  /** Correctly spelled timing-stage alias. */
  TileProcessorBenchmarkStage,
  /** Cumulative cache, queue, rendering, and export metrics. */
  TileProcessorCumulativeStats,
  /** Active WebGL context and renderer-slot counters. */
  RendererPoolStats,
  /** Cesium imagery tile coordinates. */
  TileXYZ,
  /** Information reported by the active WebGL context. */
  WebGLContextInfo,
  /** WebGL program and resolved shader locations. */
  WebGLProgramInfo,
} from "./types.js";

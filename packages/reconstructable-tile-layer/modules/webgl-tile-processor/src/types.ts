import type { ImageryProvider, ImageryTypes } from "cesium";

/** Identifies a Cesium imagery tile by its column, row, and level. */
export type TileXYZ = {
  /** Zero-based tile column. */
  x: number;
  /** Zero-based tile row. */
  y: number;
  /** Zero-based imagery level. */
  z: number;
};

/** Selects how a processed tile image is exposed to the caller. */
export type TileImageOutputType = "dataUrl" | "blobUrl" | "canvas";

/**
 * A retained processed image.
 *
 * Every successful API call returns one retained reference. Call `release`
 * exactly once when that reference is no longer needed. Processing APIs return
 * `null` instead when work is cancelled or cannot produce an image.
 */
export type TileImageAsset = {
  /** Image source accepted by Cesium materials and browser image APIs. */
  source: string | HTMLCanvasElement;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Runtime representation used by `source`. */
  kind: TileImageOutputType;
  /** Releases this caller's retained reference. */
  release: () => void;
};

/** Defines one tile-local polygon exterior and its optional holes. */
export type ClipPolygon = {
  /** Flat `[x0, y0, x1, y1, ...]` exterior ring in tile-local coordinates. */
  exterior: Array<number>;
  /** Optional flat interior rings in the same coordinate system. */
  interiors?: Array<Array<number>>;
};

/** Defines one or more polygons used to clip a processed tile. */
export type TileClipArea = {
  /** Polygon parts included in this clip area. */
  polygons: ClipPolygon[];
};

/** Describes the WebGL implementation used by the renderer pool. */
export type WebGLContextInfo = {
  /** Value reported by `gl.VERSION`. */
  webglVersion: string;
  /** Value reported by `gl.SHADING_LANGUAGE_VERSION`. */
  shadingLanguageVersion: string;
  /** Unmasked vendor when available, otherwise `gl.VENDOR`. */
  vendor: string;
  /** Unmasked renderer when available, otherwise `gl.RENDERER`. */
  renderer: string;
};

/** Timing stage reported by the optional low-level observer. */
export type TileProcesserBenchmarkStage = "provider" | "masking";

/** Correctly spelled alias for `TileProcesserBenchmarkStage`. */
export type TileProcessorBenchmarkStage = TileProcesserBenchmarkStage;

/** Receives low-level provider and masking timing intervals. */
export type TileProcesserBenchmarkObserver = {
  /** Records one completed timing interval in milliseconds. */
  onStageOperation(
    stage: TileProcesserBenchmarkStage,
    startTimeMs: number,
    endTimeMs: number,
  ): void;
};

/** Correctly spelled alias for `TileProcesserBenchmarkObserver`. */
export type TileProcessorBenchmarkObserver = TileProcesserBenchmarkObserver;

/** Cumulative counters and durations recorded by a tile processor. */
export type TileProcessorCumulativeStats = {
  /** Total processed-image requests, including cache hits. */
  totalRequests: number;
  /** Source imagery requests served from the completed-image cache. */
  imageCacheHits: number;
  /** Source imagery requests not found in the completed-image cache. */
  imageCacheMisses: number;
  /** Source imagery requests joined to an existing promise. */
  imagePromiseHits: number;
  /** Calls made to `ImageryProvider.requestImage`. */
  imageRequestAttempts: number;
  /** Source imagery requests that produced an image. */
  imageRequestSuccesses: number;
  /** Source imagery requests that threw or rejected. */
  imageRequestFailures: number;
  /** Source imagery requests that returned no request or image. */
  imageRequestUndefined: number;
  /** Source images evicted because the cache reached capacity. */
  imageEvictions: number;
  /** Processed-image requests served from the result cache. */
  resultCacheHits: number;
  /** Processed-image requests not found in the result cache. */
  resultCacheMisses: number;
  /** Processed-image requests joined to an existing promise. */
  resultPromiseHits: number;
  /** Processed assets evicted because the cache reached capacity. */
  resultEvictions: number;
  /** Number of clip-mask preparation operations. */
  maskPreparationCount: number;
  /** Cumulative clip-mask preparation time in milliseconds. */
  maskPreparationMs: number;
  /** Polygon parts submitted for mask triangulation. */
  maskPolygonCount: number;
  /** Interior rings submitted for mask triangulation. */
  maskInteriorRingCount: number;
  /** Triangles produced for stencil masks. */
  maskTriangleCount: number;
  /** Invalid or degenerate polygons skipped during triangulation. */
  maskSkippedPolygonCount: number;
  /** Render jobs completed by the renderer pool. */
  renderedJobCount: number;
  /** Assets completed by the export stage. */
  exportedAssetCount: number;
  /** Cumulative provider request time in milliseconds. */
  imageRequestMs: number;
  /** Cumulative render-queue wait time in milliseconds. */
  queueWaitMs: number;
  /** Cumulative render-queue wait time in milliseconds. */
  renderQueueWaitMs: number;
  /** Cumulative texture upload time in milliseconds. */
  textureUploadMs: number;
  /** Cumulative WebGL draw time in milliseconds. */
  drawMs: number;
  /** Cumulative FBO-to-canvas copy time in milliseconds. */
  copyToCanvasMs: number;
  /** Cumulative canvas snapshot time in milliseconds. */
  snapshotMs: number;
  /** Cumulative time for which render slots were held. */
  slotHoldMs: number;
  /** Cumulative asset export time in milliseconds. */
  exportMs: number;
  /** Cumulative PNG encoding time in milliseconds. */
  encodeMs: number;
  /** Cumulative Cesium material-application time supplied by callers. */
  materialApplyMs: number;
  /** Highest simultaneous busy-slot count observed. */
  maxBusySlotCount: number;
  /** Highest queued render-job count observed. */
  maxQueuedJobCount: number;
  /** Highest queued plus active export count observed. */
  maxPendingExportCount: number;
  /** Highest pending source-image promise count observed. */
  maxPendingImagePromiseCount: number;
  /** Highest pending processed-result promise count observed. */
  maxPendingResultPromiseCount: number;
};

/** Renderer-pool counters included in the public stats snapshot. */
export type RendererPoolStats = {
  /** Number of active WebGL contexts. */
  contextCount: number;
  /** Number of reusable rendering slots. */
  slotCount: number;
  /** Number of slots currently processing jobs. */
  busySlotCount: number;
  /** WebGL context-loss events observed by the pool. */
  contextLostCount: number;
};

/** Complete, point-in-time statistics for a `CesiumTileProcesser`. */
export type CesiumTileProcesserStats = RendererPoolStats &
  WebGLContextInfo &
  TileProcessorCumulativeStats & {
    /** Version of this statistics object shape. */
    statsSchemaVersion: number;
    /** Compatible alias for the active renderer slot count. */
    poolSize: number;
    /** Compatible alias for the active busy-slot count. */
    busyRendererCount: number;
    /** Render jobs currently waiting for a slot. */
    queuedJobCount: number;
    /** Export jobs currently queued or active. */
    pendingExportCount: number;
    /** Source imagery promises currently cached. */
    pendingImagePromiseCount: number;
    /** Completed source imagery entries currently cached. */
    imageBufferSize: number;
    /** Completed processed-image entries currently cached. */
    resultBufferSize: number;
    /** Processed-image promises currently shared by callers. */
    pendingResultPromiseCount: number;
  };

/** Correctly spelled alias for `CesiumTileProcesserStats`. */
export type CesiumTileProcessorStats = CesiumTileProcesserStats;

/** Configures dimensions, shaders, pooling, output, and cache limits. */
export type CesiumTileProcesserOptions = {
  /** Output tile width in pixels. Defaults to `256`. */
  width?: number;
  /** Output tile height in pixels. Defaults to `256`. */
  height?: number;
  /** Optional replacement vertex-shader source. */
  vsSource?: string;
  /** Optional replacement fragment-shader source. */
  fsSource?: string;
  /** Number of vertex rows used by the reprojection mesh. Defaults to `64`. */
  vertexRowNum?: number;
  /** Number of reusable texture/FBO slots in single-context mode. */
  slotCount?: number;
  /** Default representation returned by image-based methods. */
  outputType?: TileImageOutputType;
  /**
   * Legacy multi-canvas WebGL context count.
   *
   * @deprecated In the default single-context mode this is only a compatible
   * alias for `slotCount`.
   */
  poolSize?: number;
  /** Enables the legacy multi-canvas, multi-context renderer pool. */
  legacyCanvasPool?: boolean;
  /** Maximum number of source imagery tiles retained in memory. */
  maxImageCacheSize?: number;
  /** Maximum number of processed image assets retained in memory. */
  maxResultCacheSize?: number;
  /** Optional low-level timing observer. */
  benchmarkObserver?: TileProcesserBenchmarkObserver;
};

/** Correctly spelled alias for `CesiumTileProcesserOptions`. */
export type CesiumTileProcessorOptions = CesiumTileProcesserOptions;

/** WebGL program and its resolved attribute and uniform locations. */
export type WebGLProgramInfo = {
  /** Linked WebGL program. */
  program: WebGLProgram;
  /** Attribute locations keyed by shader variable name. */
  attribLocations: {
    [key: string]: number;
  };
  /** Uniform locations keyed by shader variable name. */
  uniformLocations: {
    [key: string]: WebGLUniformLocation | null;
  };
};

/** Named WebGL buffers used by the tile draw pipeline. */
export type Buffers = {
  [key: string]: WebGLBuffer | null;
};

/** Internal timing recorded while a renderer owns a slot. */
export type RenderTiming = {
  renderQueueWaitMs: number;
  textureUploadMs: number;
  drawMs: number;
  copyToCanvasMs: number;
  snapshotMs: number;
  slotHoldMs: number;
};

/** Internal render result passed to the export queue. */
export type RenderResult = {
  snapshotCanvas: HTMLCanvasElement;
  timing: RenderTiming;
};

/** Internal timing recorded while encoding an exported asset. */
export type ExportTiming = {
  exportMs: number;
  encodeMs: number;
};

/** Internal WebGL program set used by each renderer. */
export type TileProgramInfo = {
  defaultProgramInfo: WebGLProgramInfo;
  clipProgramInfo: WebGLProgramInfo;
  maskProgramInfo: WebGLProgramInfo;
};

/** Internal metrics collected while triangulating clip masks. */
export type ClipMaskDebugStats = {
  collectDeviation: boolean;
  polygonCount: number;
  interiorRingCount: number;
  skippedPolygonCount: number;
  triangleCount: number;
  maxTriangleDeviation: number;
  highDeviationPolygonCount: number;
};

/** Internal render request queued for an available worker. */
export type RenderJob = {
  x: number;
  y: number;
  level: number;
  provider: ImageryProvider;
  image: ImageryTypes;
  outputType: TileImageOutputType;
  queuedAt: number;
  polygonVerticesList?: Array<Array<number>>;
  clipMaskVertices?: Float32Array;
  resolve: (value: RenderResult | null) => void;
  reject: (reason?: unknown) => void;
};

/** Internal renderer worker contract. */
export type RenderWorker = {
  busy: boolean;
  render(job: Omit<RenderJob, "resolve" | "reject">): Promise<RenderResult | null>;
};

/** Internal renderer-pool contract used by the public processor facade. */
export type RendererPool = {
  workers: RenderWorker[];
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
  vertexRowNum: number;
  destroy(): void;
  getStats(): RendererPoolStats;
  getContextInfo(): WebGLContextInfo;
};

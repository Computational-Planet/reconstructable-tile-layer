import { ImageryProvider, ImageryTypes } from "cesium";
import earcut from "earcut";
import {
  clipFS,
  defaultFS,
  defaultVS,
  maskFS,
  maskVS,
} from "./shader/defaultShaders";
import {
  createEmptyTexture,
  drawScene,
  drawSceneClipped,
  drawSceneMasked,
  generateTexture,
  getIdentityTextureCoordData,
  initPositionBuffer,
  initShaderProgram,
  initTextureCoordBuffer,
  updateTextureCoordBuffer,
  uploadImageToTexture,
} from "./glInitFunc";

const EXPORT_CONCURRENCY = 4;
const POOL_STATS_SCHEMA_VERSION = 3;
const GEOMETRY_DEBUG_LOG_LIMIT = 40;
let geometryDebugLogCount = 0;

class CachedPromise<T> {
  private cacheMap = new Map<string, Promise<T>>();

  has(key: string): boolean {
    return this.cacheMap.has(key);
  }

  getOrCreate(key: string, promiseFn: () => Promise<T>): Promise<T> {
    if (!this.cacheMap.has(key)) {
      const promise = promiseFn().catch((error) => {
        this.cacheMap.delete(key);
        throw error;
      });
      this.cacheMap.set(key, promise);
    }
    return this.cacheMap.get(key)!;
  }

  delete(key: string): void {
    this.cacheMap.delete(key);
  }

  clear(): void {
    this.cacheMap.clear();
  }

  get size() {
    return this.cacheMap.size;
  }
}

class LRUCache<T> {
  private cache = new Map<string, T>();

  constructor(
    private maxSize: number,
    private onEvict?: (
      value: T,
      reason: "capacity" | "replace" | "clear"
    ) => void
  ) {}

  get(key: string) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T) {
    if (this.maxSize <= 0) {
      this.onEvict?.(value, "capacity");
      return;
    }
    const previousValue = this.cache.get(key);
    if (previousValue !== undefined) {
      this.cache.delete(key);
      this.onEvict?.(previousValue, "replace");
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      const oldestValue = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldestValue !== undefined) {
        this.onEvict?.(oldestValue, "capacity");
      }
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.forEach((value) => this.onEvict?.(value, "clear"));
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

type TileXYZ = { x: number; y: number; z: number };

export type TileImageOutputType = "dataUrl" | "blobUrl" | "canvas";

export type TileImageAsset = {
  source: string | HTMLCanvasElement;
  width: number;
  height: number;
  kind: TileImageOutputType;
  release: () => void;
};

export type ClipPolygon = {
  exterior: Array<number>;
  interiors?: Array<Array<number>>;
};

export type TileClipArea = {
  polygons: ClipPolygon[];
};

class RetainedTileImageAsset implements TileImageAsset {
  private _referenceCount = 0;
  private _released = false;

  constructor(
    readonly source: string | HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    readonly kind: TileImageOutputType
  ) {}

  retain() {
    if (this._released) {
      throw new Error("无法复用已经释放的瓦片图像资源");
    }
    this._referenceCount++;
    return this;
  }

  release = () => {
    if (this._referenceCount <= 0) {
      return;
    }
    this._referenceCount--;
    if (this._referenceCount === 0) {
      this.dispose();
    }
  };

  private dispose() {
    if (this._released) {
      return;
    }
    this._released = true;
    if (
      this.kind === "blobUrl" &&
      typeof this.source === "string" &&
      typeof URL !== "undefined"
    ) {
      URL.revokeObjectURL(this.source);
    }
    if (this.kind === "canvas" && isCanvasElement(this.source)) {
      this.source.width = 0;
      this.source.height = 0;
    }
  }
}

type RenderTiming = {
  renderQueueWaitMs: number;
  textureUploadMs: number;
  drawMs: number;
  copyToCanvasMs: number;
  snapshotMs: number;
  slotHoldMs: number;
};

type RenderResult = {
  snapshotCanvas: HTMLCanvasElement;
  timing: RenderTiming;
};

type ExportTiming = {
  exportMs: number;
  encodeMs: number;
};

type ExportResult = {
  asset: RetainedTileImageAsset;
  timing: ExportTiming;
};

type RenderJob = {
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

type ExportJob = {
  snapshotCanvas: HTMLCanvasElement;
  outputType: TileImageOutputType;
  resolve: (value: ExportResult | null) => void;
  reject: (reason?: unknown) => void;
};

type RenderWorker = {
  busy: boolean;
  render(
    job: Omit<RenderJob, "resolve" | "reject">
  ): Promise<RenderResult | null>;
};

type TileProgramInfo = {
  defaultProgramInfo: WebGLProgramInfo;
  clipProgramInfo: WebGLProgramInfo;
  maskProgramInfo: WebGLProgramInfo;
};

type RendererPoolStats = {
  contextCount: number;
  slotCount: number;
  busySlotCount: number;
  contextLostCount: number;
};

export type WebGLContextInfo = {
  webglVersion: string;
  shadingLanguageVersion: string;
  vendor: string;
  renderer: string;
};

export type TileProcessorCumulativeStats = {
  totalRequests: number;
  imageCacheHits: number;
  imageCacheMisses: number;
  imagePromiseHits: number;
  imageRequestAttempts: number;
  imageRequestSuccesses: number;
  imageRequestFailures: number;
  imageRequestUndefined: number;
  imageEvictions: number;
  resultCacheHits: number;
  resultCacheMisses: number;
  resultPromiseHits: number;
  resultEvictions: number;
  maskPreparationCount: number;
  maskPreparationMs: number;
  maskPolygonCount: number;
  maskInteriorRingCount: number;
  maskTriangleCount: number;
  maskSkippedPolygonCount: number;
  renderedJobCount: number;
  exportedAssetCount: number;
  imageRequestMs: number;
  queueWaitMs: number;
  renderQueueWaitMs: number;
  textureUploadMs: number;
  drawMs: number;
  copyToCanvasMs: number;
  snapshotMs: number;
  slotHoldMs: number;
  exportMs: number;
  encodeMs: number;
  materialApplyMs: number;
  maxBusySlotCount: number;
  maxQueuedJobCount: number;
  maxPendingExportCount: number;
  maxPendingImagePromiseCount: number;
  maxPendingResultPromiseCount: number;
};

export type CesiumTileProcesserStats = RendererPoolStats &
  WebGLContextInfo &
  TileProcessorCumulativeStats & {
    statsSchemaVersion: number;
    poolSize: number;
    busyRendererCount: number;
    queuedJobCount: number;
    pendingExportCount: number;
    pendingImagePromiseCount: number;
    imageBufferSize: number;
    resultBufferSize: number;
    pendingResultPromiseCount: number;
  };

type RendererPool = {
  workers: RenderWorker[];
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
  vertexRowNum: number;
  destroy(): void;
  getStats(): RendererPoolStats;
  getContextInfo(): WebGLContextInfo;
};

type ClipMaskDebugStats = {
  collectDeviation: boolean;
  polygonCount: number;
  interiorRingCount: number;
  skippedPolygonCount: number;
  triangleCount: number;
  maxTriangleDeviation: number;
  highDeviationPolygonCount: number;
};

class LegacyCanvasTileRenderer implements RenderWorker {
  busy = false;
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext | null;
  private _programInfo: TileProgramInfo;
  private _buffers: Buffers;
  private _vertexRowNum: number;
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: TileImageAsset | null = null;
  private _destroyed = false;
  private _contextLostCount = 0;

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    this._canvas = canvas;
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;
    this._canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this._contextLostCount++;
    });

    this._context = this._canvas.getContext("webgl", {
      alpha: true,
      stencil: true,
    });
    if (!this._context) {
      throw new Error(
        "无法初始化WebGL，你的浏览器、操作系统或硬件可能不支持WebGL"
      );
    }
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    this._programInfo = createProgramInfo(this._context, options);
    this._vertexRowNum = options.vertexRowNum ?? 64;
    this._buffers = {
      position: initPositionBuffer(this._context, this._vertexRowNum),
      textureCoord: null,
    };
  }

  get width() {
    return this._canvas.width;
  }

  get height() {
    return this._canvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  get vertexRowNum() {
    return this._vertexRowNum;
  }

  get contextLostCount() {
    return this._contextLostCount;
  }

  getContextInfo() {
    return this._context
      ? readWebGLContextInfo(this._context)
      : EMPTY_WEBGL_CONTEXT_INFO;
  }

  get currentTileXYZ() {
    return this._currentTileXYZ;
  }

  get currentResult() {
    return this._currentResult;
  }

  async render(job: Omit<RenderJob, "resolve" | "reject">) {
    if (this._destroyed || !this._context) {
      return null;
    }

    const {
      x,
      y,
      level,
      provider,
      image,
      polygonVerticesList,
      clipMaskVertices,
    } = job;
    const gl = this._context;
    this._currentTileXYZ = { x, y, z: level };

    const slotStart = now();
    const renderQueueWaitMs = Math.max(0, slotStart - job.queuedAt);
    const textureCoordBuffer = initTextureCoordBuffer(
      gl,
      this._vertexRowNum,
      provider,
      x,
      y,
      level
    );
    this._buffers.textureCoord = textureCoordBuffer;
    const texture = generateTexture(gl, image);
    const textureUploadMs = now() - slotStart;

    try {
      const drawStart = now();
      if (clipMaskVertices?.length) {
        drawSceneMasked(
          gl,
          this._vertexRowNum,
          this._programInfo.defaultProgramInfo,
          this._programInfo.maskProgramInfo,
          texture,
          this._buffers,
          clipMaskVertices
        );
      } else if (polygonVerticesList?.length) {
        polygonVerticesList.forEach((polygonVertices, index) => {
          drawSceneClipped(
            gl,
            this._vertexRowNum,
            this._programInfo.clipProgramInfo,
            texture,
            this._buffers,
            polygonVertices,
            { clear: index === 0 }
          );
        });
      } else {
        drawScene(
          gl,
          this._vertexRowNum,
          this._programInfo.defaultProgramInfo,
          texture,
          this._buffers
        );
      }
      gl.flush();
      const drawMs = now() - drawStart;

      const snapshotStart = now();
      const snapshotCanvas = cloneCanvas(this._canvas);
      const snapshotMs = now() - snapshotStart;

      return {
        snapshotCanvas,
        timing: {
          renderQueueWaitMs,
          textureUploadMs,
          drawMs,
          copyToCanvasMs: 0,
          snapshotMs,
          slotHoldMs: now() - slotStart,
        },
      };
    } finally {
      gl.deleteTexture(texture);
      gl.deleteBuffer(textureCoordBuffer);
      if (this._buffers.textureCoord === textureCoordBuffer) {
        this._buffers.textureCoord = null;
      }
    }
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    if (this._context) {
      this._context.deleteBuffer(this._buffers.position);
      if (this._buffers.textureCoord) {
        this._context.deleteBuffer(this._buffers.textureCoord);
      }
      this._context.deleteProgram(this._programInfo.defaultProgramInfo.program);
      this._context.deleteProgram(this._programInfo.clipProgramInfo.program);
      this._context.deleteProgram(this._programInfo.maskProgramInfo.program);
      this._context.getExtension("WEBGL_lose_context")?.loseContext();
      this._context = null;
    }

    this._buffers = { position: null, textureCoord: null };
    this._canvas.width = 0;
    this._canvas.height = 0;
  }
}

class LegacyCanvasRendererPool implements RendererPool {
  workers: LegacyCanvasTileRenderer[] = [];

  constructor(
    externalCanvas: HTMLCanvasElement | undefined,
    options: CesiumTileProcesserOptions
  ) {
    const poolSize = externalCanvas
      ? 1
      : normalizeLegacyPoolSize(options.poolSize ?? getDefaultLegacyPoolSize());

    for (let i = 0; i < poolSize; i++) {
      const canvas =
        i === 0 && externalCanvas
          ? externalCanvas
          : createInternalCanvas(options);
      this.workers.push(new LegacyCanvasTileRenderer(canvas, options));
    }
  }

  get width() {
    return this.workers[0]?.width ?? 0;
  }

  get height() {
    return this.workers[0]?.height ?? 0;
  }

  get canvas() {
    return this.workers[0]?.canvas;
  }

  get vertexRowNum() {
    return this.workers[0]?.vertexRowNum ?? 0;
  }

  destroy() {
    this.workers.forEach((renderer) => renderer.destroy());
    this.workers = [];
  }

  getStats() {
    return {
      contextCount: this.workers.length,
      slotCount: this.workers.length,
      busySlotCount: this.workers.filter((renderer) => renderer.busy).length,
      contextLostCount: this.workers.reduce(
        (sum, renderer) => sum + renderer.contextLostCount,
        0
      ),
    };
  }

  getContextInfo() {
    return this.workers[0]?.getContextInfo() ?? EMPTY_WEBGL_CONTEXT_INFO;
  }
}

class SingleContextRenderSlot implements RenderWorker {
  busy = false;
  inputTexture: WebGLTexture | null;
  outputTexture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  depthStencilBuffer: WebGLRenderbuffer | null;
  textureCoordBuffer: WebGLBuffer | null;

  constructor(
    private renderer: SingleContextTileRenderer,
    readonly index: number
  ) {
    const gl = renderer.context;
    this.inputTexture = createEmptyTexture(gl, renderer.width, renderer.height);
    this.outputTexture = createEmptyTexture(
      gl,
      renderer.width,
      renderer.height
    );
    this.framebuffer = gl.createFramebuffer();
    this.depthStencilBuffer = gl.createRenderbuffer();
    this.textureCoordBuffer = gl.createBuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencilBuffer);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_STENCIL,
      renderer.width,
      renderer.height
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      this.depthStencilBuffer
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO 初始化失败，slot=${index}, status=${status}`);
    }
  }

  render(job: Omit<RenderJob, "resolve" | "reject">) {
    return this.renderer.renderSlot(this, job);
  }

  destroy(gl: WebGLRenderingContext) {
    gl.deleteTexture(this.inputTexture);
    gl.deleteTexture(this.outputTexture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteRenderbuffer(this.depthStencilBuffer);
    gl.deleteBuffer(this.textureCoordBuffer);
    this.inputTexture = null;
    this.outputTexture = null;
    this.framebuffer = null;
    this.depthStencilBuffer = null;
    this.textureCoordBuffer = null;
  }
}

class SingleContextTileRenderer implements RendererPool {
  workers: SingleContextRenderSlot[] = [];
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext;
  private _programInfo: TileProgramInfo;
  private _buffers: Buffers;
  private _displayBuffers: Buffers;
  private _vertexRowNum: number;
  private _contextLostCount = 0;
  private _destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    this._canvas = canvas;
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;
    this._canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this._contextLostCount++;
    });

    const context = this._canvas.getContext("webgl", {
      alpha: true,
      stencil: true,
    });
    if (!context) {
      throw new Error(
        "无法初始化WebGL，你的浏览器、操作系统或硬件可能不支持WebGL"
      );
    }
    this._context = context;
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    this._programInfo = createProgramInfo(this._context, options);
    this._vertexRowNum = options.vertexRowNum ?? 64;
    const position = initPositionBuffer(this._context, this._vertexRowNum);
    const screenTextureCoord = createIdentityTextureCoordBuffer(
      this._context,
      this._vertexRowNum
    );
    this._buffers = {
      position,
      textureCoord: null,
    };
    this._displayBuffers = {
      position,
      textureCoord: screenTextureCoord,
    };

    const slotCount = normalizeSlotCount(
      options.slotCount ?? options.poolSize ?? 4
    );
    for (let i = 0; i < slotCount; i++) {
      this.workers.push(new SingleContextRenderSlot(this, i));
    }
  }

  get context() {
    return this._context;
  }

  get width() {
    return this._canvas.width;
  }

  get height() {
    return this._canvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  get vertexRowNum() {
    return this._vertexRowNum;
  }

  async renderSlot(
    slot: SingleContextRenderSlot,
    job: Omit<RenderJob, "resolve" | "reject">
  ) {
    if (this._destroyed) {
      return null;
    }

    const {
      x,
      y,
      level,
      provider,
      image,
      polygonVerticesList,
      clipMaskVertices,
    } = job;
    const gl = this._context;

    const slotStart = now();
    const renderQueueWaitMs = Math.max(0, slotStart - job.queuedAt);
    updateTextureCoordBuffer(
      gl,
      slot.textureCoordBuffer,
      this._vertexRowNum,
      provider,
      x,
      y,
      level
    );
    uploadImageToTexture(gl, slot.inputTexture, image, false);
    const textureUploadMs = now() - slotStart;

    const drawStart = now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    this._buffers.textureCoord = slot.textureCoordBuffer;
    if (clipMaskVertices?.length) {
      drawSceneMasked(
        gl,
        this._vertexRowNum,
        this._programInfo.defaultProgramInfo,
        this._programInfo.maskProgramInfo,
        slot.inputTexture,
        this._buffers,
        clipMaskVertices
      );
    } else if (polygonVerticesList?.length) {
      polygonVerticesList.forEach((polygonVertices, index) => {
        drawSceneClipped(
          gl,
          this._vertexRowNum,
          this._programInfo.clipProgramInfo,
          slot.inputTexture,
          this._buffers,
          polygonVertices,
          { clear: index === 0 }
        );
      });
    } else {
      drawScene(
        gl,
        this._vertexRowNum,
        this._programInfo.defaultProgramInfo,
        slot.inputTexture,
        this._buffers
      );
    }
    const drawMs = now() - drawStart;

    // 将当前 slot 的 FBO 结果复制回默认 framebuffer，供稳定快照导出使用。
    const copyStart = now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    drawScene(
      gl,
      this._vertexRowNum,
      this._programInfo.defaultProgramInfo,
      slot.outputTexture,
      this._displayBuffers
    );
    gl.flush();
    const copyToCanvasMs = now() - copyStart;

    // 只把同步快照计入 slot 占用；后续 PNG/DataURL 编码交给独立导出队列。
    const snapshotStart = now();
    const snapshotCanvas = cloneCanvas(this._canvas);
    const snapshotMs = now() - snapshotStart;

    return {
      snapshotCanvas,
      timing: {
        renderQueueWaitMs,
        textureUploadMs,
        drawMs,
        copyToCanvasMs,
        snapshotMs,
        slotHoldMs: now() - slotStart,
      },
    };
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    this.workers.forEach((slot) => slot.destroy(this._context));
    this.workers = [];
    this._context.deleteBuffer(this._buffers.position);
    this._context.deleteBuffer(this._displayBuffers.textureCoord);
    this._context.deleteProgram(this._programInfo.defaultProgramInfo.program);
    this._context.deleteProgram(this._programInfo.clipProgramInfo.program);
    this._context.deleteProgram(this._programInfo.maskProgramInfo.program);
    this._context.getExtension("WEBGL_lose_context")?.loseContext();
    this._buffers = { position: null, textureCoord: null };
    this._displayBuffers = { position: null, textureCoord: null };
    this._canvas.width = 0;
    this._canvas.height = 0;
  }

  getStats() {
    return {
      contextCount: 1,
      slotCount: this.workers.length,
      busySlotCount: this.workers.filter((slot) => slot.busy).length,
      contextLostCount: this._contextLostCount,
    };
  }

  getContextInfo() {
    return readWebGLContextInfo(this._context);
  }
}

/**
 * 获取指定瓦片，并使用WebGL进行重投影，随后输出处理后的影像的类。
 *
 * 默认使用单 WebGL context + texture/FBO slot 池。
 * 若需要旧版多 canvas/context 行为，可显式传入 legacyCanvasPool: true。
 */
export class CesiumTileProcesser {
  private static _providerIds = new WeakMap<ImageryProvider, number>();
  private static _nextProviderId = 0;
  private _rendererPool: RendererPool;
  private _jobQueue: RenderJob[] = [];
  private _exportQueue: ExportJob[] = [];
  private _activeExportCount = 0;
  private _imageCachePromise = new CachedPromise<ImageryTypes>();
  private _imageBuffer: LRUCache<ImageryTypes>;
  private _resultBuffer: LRUCache<RetainedTileImageAsset>;
  private _resultPromises = new Map<
    string,
    Promise<RetainedTileImageAsset | null>
  >();
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: TileImageAsset | null = null;
  private _cacheToken = 0;
  private _destroyed = false;
  private _outputType: TileImageOutputType;
  private _stats: TileProcessorCumulativeStats = {
    totalRequests: 0,
    imageCacheHits: 0,
    imageCacheMisses: 0,
    imagePromiseHits: 0,
    imageRequestAttempts: 0,
    imageRequestSuccesses: 0,
    imageRequestFailures: 0,
    imageRequestUndefined: 0,
    imageEvictions: 0,
    resultCacheHits: 0,
    resultCacheMisses: 0,
    resultPromiseHits: 0,
    resultEvictions: 0,
    maskPreparationCount: 0,
    maskPreparationMs: 0,
    maskPolygonCount: 0,
    maskInteriorRingCount: 0,
    maskTriangleCount: 0,
    maskSkippedPolygonCount: 0,
    renderedJobCount: 0,
    exportedAssetCount: 0,
    imageRequestMs: 0,
    queueWaitMs: 0,
    renderQueueWaitMs: 0,
    textureUploadMs: 0,
    drawMs: 0,
    copyToCanvasMs: 0,
    snapshotMs: 0,
    slotHoldMs: 0,
    exportMs: 0,
    encodeMs: 0,
    materialApplyMs: 0,
    maxBusySlotCount: 0,
    maxQueuedJobCount: 0,
    maxPendingExportCount: 0,
    maxPendingImagePromiseCount: 0,
    maxPendingResultPromiseCount: 0,
  };

  constructor(options?: CesiumTileProcesserOptions);
  constructor(canvas: HTMLCanvasElement, options?: CesiumTileProcesserOptions);
  constructor(
    canvasOrOptions?: HTMLCanvasElement | CesiumTileProcesserOptions,
    options: CesiumTileProcesserOptions = {}
  ) {
    const externalCanvas = isCanvasElement(canvasOrOptions)
      ? canvasOrOptions
      : undefined;
    const resolvedOptions = externalCanvas
      ? options
      : (canvasOrOptions as CesiumTileProcesserOptions | undefined) ?? {};

    this._outputType = resolvedOptions.outputType ?? "blobUrl";
    this._imageBuffer = new LRUCache<ImageryTypes>(
      resolvedOptions.maxImageCacheSize ?? 256,
      (_image, reason) => {
        if (reason === "capacity") {
          this._stats.imageEvictions++;
        }
      }
    );
    this._resultBuffer = new LRUCache<RetainedTileImageAsset>(
      resolvedOptions.maxResultCacheSize ?? 512,
      (asset, reason) => {
        if (reason === "capacity") {
          this._stats.resultEvictions++;
        }
        asset.release();
      }
    );

    this._rendererPool =
      resolvedOptions.legacyCanvasPool === true
        ? new LegacyCanvasRendererPool(externalCanvas, resolvedOptions)
        : new SingleContextTileRenderer(
            externalCanvas ?? createInternalCanvas(resolvedOptions),
            resolvedOptions
          );
  }

  get width() {
    return this._rendererPool.width;
  }

  get height() {
    return this._rendererPool.height;
  }

  get canvas() {
    return this._rendererPool.canvas;
  }

  get vertexRowNum() {
    return this._rendererPool.vertexRowNum;
  }

  get currentTileXYZ() {
    return this._currentTileXYZ;
  }

  get currentResult() {
    return this._currentResult;
  }

  private static getProviderKey(provider: ImageryProvider) {
    if (!CesiumTileProcesser._providerIds.has(provider)) {
      CesiumTileProcesser._providerIds.set(
        provider,
        CesiumTileProcesser._nextProviderId++
      );
    }
    return `provider-${CesiumTileProcesser._providerIds.get(provider)}`;
  }

  private getRawTileKey(
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number
  ) {
    return `${CesiumTileProcesser.getProviderKey(provider)}:${x}/${y}/${level}`;
  }

  private getResultKey(
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number,
    outputType: TileImageOutputType,
    clipKey = "full"
  ) {
    return `${this.getRawTileKey(
      provider,
      x,
      y,
      level
    )}:${clipKey}:${outputType}`;
  }

  private getPolygonHash(polygonVertices: Array<number>) {
    let hash = 2166136261;
    for (let i = 0; i < polygonVertices.length; i++) {
      const value = polygonVertices[i].toFixed(6);
      for (let j = 0; j < value.length; j++) {
        hash ^= value.charCodeAt(j);
        hash = Math.imul(hash, 16777619);
      }
    }
    return `${polygonVertices.length}-${(hash >>> 0).toString(36)}`;
  }

  private getPolygonListHash(polygonVerticesList: Array<Array<number>>) {
    let hash = 2166136261;
    const polygonHashes = polygonVerticesList
      .map((polygonVertices) => this.getPolygonHash(polygonVertices))
      .sort();

    polygonHashes.forEach((polygonHash) => {
      for (let i = 0; i < polygonHash.length; i++) {
        hash ^= polygonHash.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    });
    return `${polygonVerticesList.length}-${(hash >>> 0).toString(36)}`;
  }

  private getTileClipAreaHash(clipArea: TileClipArea) {
    const polygonHashes = clipArea.polygons.map((polygon) => {
      const ringHashes = [
        `e:${this.getPolygonHash(polygon.exterior)}`,
        ...(polygon.interiors ?? []).map(
          (ring) => `i:${this.getPolygonHash(ring)}`
        ),
      ];
      return ringHashes.join("|");
    });
    return polygonHashes.join(";");
  }

  private getTileClipAreaListHash(clipAreas: TileClipArea[]) {
    let hash = 2166136261;
    const areaHashes = clipAreas
      .map((clipArea) => this.getTileClipAreaHash(clipArea))
      .sort();

    areaHashes.forEach((areaHash) => {
      for (let i = 0; i < areaHash.length; i++) {
        hash ^= areaHash.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    });
    return `${clipAreas.length}-${(hash >>> 0).toString(36)}`;
  }

  private async getImage(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    cacheToken: number
  ) {
    const tileKey = this.getRawTileKey(provider, x, y, level);
    const bufferedImage = this._imageBuffer.get(tileKey);
    if (bufferedImage) {
      this._stats.imageCacheHits++;
      return bufferedImage;
    }

    if (this._imageCachePromise.has(tileKey)) {
      this._stats.imagePromiseHits++;
    } else {
      this._stats.imageCacheMisses++;
    }

    const imagePromise = this._imageCachePromise.getOrCreate(
      tileKey,
      async () => {
        const requestStart = now();
        this._stats.imageRequestAttempts++;
        try {
          const request = provider.requestImage(x, y, level);
          if (!request) {
            this._stats.imageRequestUndefined++;
            throw new Error("图像获取失败");
          }
          const requestedImage = await request;
          if (!requestedImage) {
            this._stats.imageRequestUndefined++;
            throw new Error("图像获取失败");
          }
          this._stats.imageRequestSuccesses++;
          return requestedImage;
        } catch (error) {
          this._stats.imageRequestFailures++;
          throw error;
        } finally {
          this._stats.imageRequestMs += now() - requestStart;
        }
      }
    );
    this._stats.maxPendingImagePromiseCount = Math.max(
      this._stats.maxPendingImagePromiseCount,
      this._imageCachePromise.size
    );
    const image = await imagePromise;

    if (cacheToken === this._cacheToken) {
      this._imageBuffer.set(tileKey, image);
    }
    this._imageCachePromise.delete(tileKey);
    return image;
  }

  private enqueueRender(job: Omit<RenderJob, "resolve" | "reject">) {
    if (this._destroyed) {
      return Promise.resolve(null);
    }

    return new Promise<RenderResult | null>((resolve, reject) => {
      this._jobQueue.push({ ...job, resolve, reject });
      this._stats.maxQueuedJobCount = Math.max(
        this._stats.maxQueuedJobCount,
        this._jobQueue.length
      );
      this.processJobQueue();
    });
  }

  private processJobQueue() {
    if (this._destroyed) {
      this.resolveQueuedJobsAsNull();
      return;
    }

    while (this._jobQueue.length > 0) {
      const worker = this._rendererPool.workers.find((item) => !item.busy);
      if (!worker) {
        return;
      }

      const job = this._jobQueue.shift();
      if (!job) {
        return;
      }

      worker.busy = true;
      this._stats.maxBusySlotCount = Math.max(
        this._stats.maxBusySlotCount,
        this._rendererPool.workers.filter((item) => item.busy).length
      );
      Promise.resolve()
        .then(() => worker.render(job))
        .then((result) => {
          if (result) {
            this.recordRenderTiming(result.timing);
            this._currentTileXYZ = {
              x: job.x,
              y: job.y,
              z: job.level,
            };
          }
          job.resolve(result);
        })
        .catch(job.reject)
        .finally(() => {
          worker.busy = false;
          this.processJobQueue();
        });
    }
  }

  private enqueueExport(
    snapshotCanvas: HTMLCanvasElement,
    outputType: TileImageOutputType
  ) {
    if (this._destroyed) {
      disposeSnapshotCanvas(snapshotCanvas);
      return Promise.resolve(null);
    }

    return new Promise<ExportResult | null>((resolve, reject) => {
      this._exportQueue.push({
        snapshotCanvas,
        outputType,
        resolve,
        reject,
      });
      this._stats.maxPendingExportCount = Math.max(
        this._stats.maxPendingExportCount,
        this._exportQueue.length + this._activeExportCount
      );
      this.processExportQueue();
    });
  }

  private processExportQueue() {
    if (this._destroyed) {
      this.resolveQueuedExportsAsNull();
      return;
    }

    while (
      this._activeExportCount < EXPORT_CONCURRENCY &&
      this._exportQueue.length > 0
    ) {
      const job = this._exportQueue.shift();
      if (!job) {
        return;
      }

      this._activeExportCount++;
      Promise.resolve()
        .then(() => createAssetFromSnapshot(job.snapshotCanvas, job.outputType))
        .then((result) => {
          this.recordExportTiming(result.timing);
          job.resolve(result);
        })
        .catch(job.reject)
        .finally(() => {
          disposeSnapshotCanvas(job.snapshotCanvas);
          this._activeExportCount--;
          this.processExportQueue();
        });
    }
  }

  private reprojectInternal(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    outputType: TileImageOutputType,
    polygonVerticesList?: Array<Array<number>>,
    clipMaskVertices?: Float32Array,
    clipKeyOverride?: string
  ) {
    if (this._destroyed) {
      return Promise.resolve(null);
    }

    this._stats.totalRequests++;
    const clipKey =
      clipKeyOverride ??
      (polygonVerticesList?.length
        ? `clip-${this.getPolygonListHash(polygonVerticesList)}`
        : "full");
    const resultKey = this.getResultKey(
      provider,
      x,
      y,
      level,
      outputType,
      clipKey
    );
    const bufferedResult = this._resultBuffer.get(resultKey);
    if (bufferedResult) {
      this._stats.resultCacheHits++;
      return Promise.resolve(bufferedResult.retain());
    }

    const pendingResult = this._resultPromises.get(resultKey);
    if (pendingResult) {
      this._stats.resultPromiseHits++;
      return pendingResult.then((asset) => asset?.retain() ?? null);
    }

    this._stats.resultCacheMisses++;
    const cacheToken = this._cacheToken;
    const resultPromise = this.getImage(x, y, level, provider, cacheToken)
      .then((image) =>
        this.enqueueRender({
          x,
          y,
          level,
          provider,
          image,
          outputType,
          queuedAt: now(),
          polygonVerticesList,
          clipMaskVertices,
        })
      )
      .then((result) => {
        if (!result) {
          return null;
        }

        if (outputType === "canvas") {
          this.recordExportTiming({ exportMs: 0, encodeMs: 0 });
          return createCanvasAssetFromSnapshot(result.snapshotCanvas);
        }

        return this.enqueueExport(result.snapshotCanvas, outputType).then(
          (exportResult) => exportResult?.asset ?? null
        );
      })
      .then((asset) => {
        if (asset) {
          this._currentResult = asset;
        }
        if (asset && cacheToken === this._cacheToken) {
          this._resultBuffer.set(resultKey, asset.retain());
        }
        return asset;
      })
      .catch((error) => {
        console.error("获取或处理图像时发生错误:", error);
        return null;
      })
      .finally(() => {
        this._resultPromises.delete(resultKey);
      });

    this._resultPromises.set(resultKey, resultPromise);
    this._stats.maxPendingResultPromiseCount = Math.max(
      this._stats.maxPendingResultPromiseCount,
      this._resultPromises.size
    );
    return resultPromise.then((asset) => asset?.retain() ?? null);
  }

  // 产出重投影的结果，保留旧版 data URL 字符串接口。
  async reprojectTile(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider
  ) {
    const asset = await this.reprojectInternal(
      x,
      y,
      level,
      provider,
      "dataUrl"
    );
    if (!asset) {
      return null;
    }
    try {
      return typeof asset.source === "string"
        ? asset.source
        : asset.source.toDataURL();
    } finally {
      asset.release();
    }
  }

  // 产出经过裁剪的重投影瓦片，保留旧版 data URL 字符串接口。
  async reprojectClippedTile(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider
  ) {
    const asset = await this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      [createTileClipAreaFromFlatPolygon(polygonVertices)],
      provider,
      "dataUrl"
    );
    if (!asset) {
      return null;
    }
    try {
      return typeof asset.source === "string"
        ? asset.source
        : asset.source.toDataURL();
    } finally {
      asset.release();
    }
  }

  async reprojectTileImage(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType
  ): Promise<TileImageAsset | null> {
    return this.reprojectInternal(x, y, level, provider, outputType);
  }

  async reprojectClippedTileImage(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType
  ): Promise<TileImageAsset | null> {
    return this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      [createTileClipAreaFromFlatPolygon(polygonVertices)],
      provider,
      outputType
    );
  }

  async reprojectMultiClippedTileImage(
    x: number,
    y: number,
    level: number,
    polygonVerticesList: Array<Array<number>>,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType
  ): Promise<TileImageAsset | null> {
    return this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      polygonVerticesList.map(createTileClipAreaFromFlatPolygon),
      provider,
      outputType
    );
  }

  async reprojectMultiClippedTileAreaImage(
    x: number,
    y: number,
    level: number,
    clipAreas: TileClipArea[],
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType
  ): Promise<TileImageAsset | null> {
    if (clipAreas.length === 0) {
      return this.reprojectTileImage(x, y, level, provider, outputType);
    }

    const maskPreparationStart = now();
    const clipKey = `area-${this.getTileClipAreaListHash(clipAreas)}`;
    const debugStats = createClipMaskDebugStats();
    const clipMaskVertices = createClipMaskVertices(clipAreas, debugStats);
    this._stats.maskPreparationCount++;
    this._stats.maskPreparationMs += now() - maskPreparationStart;
    this._stats.maskPolygonCount += debugStats.polygonCount;
    this._stats.maskInteriorRingCount += debugStats.interiorRingCount;
    this._stats.maskTriangleCount += debugStats.triangleCount;
    this._stats.maskSkippedPolygonCount += debugStats.skippedPolygonCount;
    logClipMaskDebug(
      { x, y, z: level },
      clipAreas,
      clipMaskVertices,
      debugStats
    );
    if (clipMaskVertices.length === 0) {
      return null;
    }

    return this.reprojectInternal(
      x,
      y,
      level,
      provider,
      outputType,
      undefined,
      clipMaskVertices,
      clipKey
    );
  }

  recordMaterialApplyMs(durationMs: number) {
    this._stats.materialApplyMs += durationMs;
  }

  clearBuffer() {
    this._cacheToken++;
    this._imageBuffer.clear();
    this._resultBuffer.clear();
    this._imageCachePromise.clear();
    this._resultPromises.clear();
    this.resolveQueuedJobsAsNull();
    this.resolveQueuedExportsAsNull();
  }

  getPoolStats(): CesiumTileProcesserStats {
    const rendererStats = this._rendererPool.getStats();
    return {
      statsSchemaVersion: POOL_STATS_SCHEMA_VERSION,
      poolSize: rendererStats.slotCount,
      busyRendererCount: rendererStats.busySlotCount,
      queuedJobCount: this._jobQueue.length,
      pendingExportCount: this._exportQueue.length + this._activeExportCount,
      pendingImagePromiseCount: this._imageCachePromise.size,
      imageBufferSize: this._imageBuffer.size,
      resultBufferSize: this._resultBuffer.size,
      pendingResultPromiseCount: this._resultPromises.size,
      ...rendererStats,
      ...this._rendererPool.getContextInfo(),
      ...this._stats,
    };
  }

  destroy() {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.clearBuffer();
    this._rendererPool.destroy();
  }

  private recordRenderTiming(timing: RenderTiming) {
    this._stats.renderedJobCount++;
    this._stats.queueWaitMs += timing.renderQueueWaitMs;
    this._stats.renderQueueWaitMs += timing.renderQueueWaitMs;
    this._stats.textureUploadMs += timing.textureUploadMs;
    this._stats.drawMs += timing.drawMs;
    this._stats.copyToCanvasMs += timing.copyToCanvasMs;
    this._stats.snapshotMs += timing.snapshotMs;
    this._stats.slotHoldMs += timing.slotHoldMs;
  }

  private recordExportTiming(timing: ExportTiming) {
    this._stats.exportedAssetCount++;
    this._stats.exportMs += timing.exportMs;
    this._stats.encodeMs += timing.encodeMs;
  }

  private resolveQueuedJobsAsNull() {
    const queuedJobs = this._jobQueue;
    this._jobQueue = [];
    queuedJobs.forEach((job) => job.resolve(null));
  }

  private resolveQueuedExportsAsNull() {
    const queuedExports = this._exportQueue;
    this._exportQueue = [];
    queuedExports.forEach((job) => {
      disposeSnapshotCanvas(job.snapshotCanvas);
      job.resolve(null);
    });
  }
}

function createProgramInfo(
  gl: WebGLRenderingContext,
  options: CesiumTileProcesserOptions
) {
  const vsSource = options.vsSource ?? defaultVS;
  const fsSource = options.fsSource ?? defaultFS;
  const fsSourceClip = options.fsSource ?? clipFS;

  const defaultShaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const clipShaderProgram = initShaderProgram(gl, vsSource, fsSourceClip);
  const maskShaderProgram = initShaderProgram(gl, maskVS, maskFS);
  if (!defaultShaderProgram || !clipShaderProgram || !maskShaderProgram) {
    throw new Error("初始化着色器程序失败");
  }

  return {
    defaultProgramInfo: {
      program: defaultShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(
          defaultShaderProgram,
          "aVertexPosition"
        ),
        textureCoord: gl.getAttribLocation(
          defaultShaderProgram,
          "aTextureCoord"
        ),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(
          defaultShaderProgram,
          "uProjectionMatrix"
        ),
        modelViewMatrix: gl.getUniformLocation(
          defaultShaderProgram,
          "uModelViewMatrix"
        ),
        uSampler: gl.getUniformLocation(defaultShaderProgram, "uSampler"),
      },
    },
    clipProgramInfo: {
      program: clipShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(
          clipShaderProgram,
          "aVertexPosition"
        ),
        textureCoord: gl.getAttribLocation(clipShaderProgram, "aTextureCoord"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(
          clipShaderProgram,
          "uProjectionMatrix"
        ),
        modelViewMatrix: gl.getUniformLocation(
          clipShaderProgram,
          "uModelViewMatrix"
        ),
        uSampler: gl.getUniformLocation(clipShaderProgram, "uSampler"),
        polygonVerticesCount: gl.getUniformLocation(
          clipShaderProgram,
          "polygonVerticesCount"
        ),
        polygonVertices: gl.getUniformLocation(
          clipShaderProgram,
          "polygonVertices"
        ),
      },
    },
    maskProgramInfo: {
      program: maskShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(
          maskShaderProgram,
          "aVertexPosition"
        ),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(
          maskShaderProgram,
          "uProjectionMatrix"
        ),
        modelViewMatrix: gl.getUniformLocation(
          maskShaderProgram,
          "uModelViewMatrix"
        ),
      },
    },
  };
}

async function createAssetFromSnapshot(
  snapshotCanvas: HTMLCanvasElement,
  outputType: TileImageOutputType
): Promise<ExportResult> {
  const width = snapshotCanvas.width;
  const height = snapshotCanvas.height;
  const exportStart = now();

  if (outputType === "dataUrl") {
    const encodeStart = now();
    const source = snapshotCanvas.toDataURL();
    const encodeMs = now() - encodeStart;
    return {
      asset: new RetainedTileImageAsset(source, width, height, "dataUrl"),
      timing: {
        exportMs: now() - exportStart,
        encodeMs,
      },
    };
  }

  if (
    typeof URL === "undefined" ||
    typeof snapshotCanvas.toBlob !== "function"
  ) {
    const encodeStart = now();
    const source = snapshotCanvas.toDataURL();
    const encodeMs = now() - encodeStart;
    return {
      asset: new RetainedTileImageAsset(source, width, height, "dataUrl"),
      timing: {
        exportMs: now() - exportStart,
        encodeMs,
      },
    };
  }

  const encodeStart = now();
  const blob = await canvasToBlob(snapshotCanvas);
  const encodeMs = now() - encodeStart;
  return {
    asset: new RetainedTileImageAsset(
      URL.createObjectURL(blob),
      width,
      height,
      "blobUrl"
    ),
    timing: {
      exportMs: now() - exportStart,
      encodeMs,
    },
  };
}

function createCanvasAssetFromSnapshot(snapshotCanvas: HTMLCanvasElement) {
  return new RetainedTileImageAsset(
    snapshotCanvas,
    snapshotCanvas.width,
    snapshotCanvas.height,
    "canvas"
  );
}

function createTileClipAreaFromFlatPolygon(
  polygonVertices: Array<number>
): TileClipArea {
  return {
    polygons: [
      {
        exterior: closeMaskRing(polygonVertices),
      },
    ],
  };
}

function createClipMaskDebugStats(): ClipMaskDebugStats {
  return {
    collectDeviation: isDeepTimeGeoDebugEnabled(),
    polygonCount: 0,
    interiorRingCount: 0,
    skippedPolygonCount: 0,
    triangleCount: 0,
    maxTriangleDeviation: 0,
    highDeviationPolygonCount: 0,
  };
}

function createClipMaskVertices(
  clipAreas: TileClipArea[],
  debugStats?: ClipMaskDebugStats
) {
  const maskVertices: number[] = [];
  clipAreas.forEach((clipArea) => {
    clipArea.polygons.forEach((polygon) => {
      appendPolygonMaskVertices(polygon, maskVertices, debugStats);
    });
  });
  return new Float32Array(maskVertices);
}

function appendPolygonMaskVertices(
  polygon: ClipPolygon,
  maskVertices: number[],
  debugStats?: ClipMaskDebugStats
) {
  if (debugStats) {
    debugStats.polygonCount++;
    debugStats.interiorRingCount += polygon.interiors?.length ?? 0;
  }

  const exterior = orientEarcutRing(
    prepareEarcutRing(polygon.exterior),
    "exterior"
  );
  if (!exterior) {
    debugStats && debugStats.skippedPolygonCount++;
    return;
  }

  const flatVertices = [...exterior];
  const holeIndices: number[] = [];
  polygon.interiors?.forEach((interior) => {
    const ring = orientEarcutRing(prepareEarcutRing(interior), "interior");
    if (!ring) {
      return;
    }
    holeIndices.push(flatVertices.length / 2);
    flatVertices.push(...ring);
  });

  const indices = earcut(flatVertices, holeIndices, 2);
  if (debugStats) {
    debugStats.triangleCount += indices.length / 3;
    if (debugStats.collectDeviation) {
      const deviation = getEarcutAreaDeviation(
        flatVertices,
        holeIndices,
        indices
      );
    debugStats.maxTriangleDeviation = Math.max(
      debugStats.maxTriangleDeviation,
      deviation
    );
    if (deviation > 0.01) {
      debugStats.highDeviationPolygonCount++;
    }
  }
  }

  indices.forEach((vertexIndex) => {
    const index = vertexIndex * 2;
    maskVertices.push(flatVertices[index], flatVertices[index + 1]);
  });
}

function logClipMaskDebug(
  tile: TileXYZ,
  clipAreas: TileClipArea[],
  maskVertices: Float32Array,
  debugStats?: ClipMaskDebugStats
) {
  if (
    !isDeepTimeGeoDebugEnabled() ||
    !debugStats ||
    geometryDebugLogCount >= GEOMETRY_DEBUG_LOG_LIMIT
  ) {
    return;
  }

  const shouldLog =
    maskVertices.length === 0 ||
    debugStats.maxTriangleDeviation > 0.01 ||
    geometryDebugLogCount < 5;
  if (!shouldLog) {
    return;
  }

  geometryDebugLogCount++;
  console.debug("[DeepTimeGeo] GPU mask tile", {
    tile,
    clipAreaCount: clipAreas.length,
    polygonCount: debugStats.polygonCount,
    interiorRingCount: debugStats.interiorRingCount,
    skippedPolygonCount: debugStats.skippedPolygonCount,
    triangleCount: debugStats.triangleCount,
    maskVertexCount: maskVertices.length / 2,
    maxTriangleDeviation: debugStats.maxTriangleDeviation,
    highDeviationPolygonCount: debugStats.highDeviationPolygonCount,
  });
}

function prepareEarcutRing(ring: Array<number>) {
  const openRing: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i];
    const y = ring[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const previousX = openRing[openRing.length - 2];
    const previousY = openRing[openRing.length - 1];
    if (
      previousX !== undefined &&
      Math.abs(previousX - x) < 1e-9 &&
      Math.abs(previousY - y) < 1e-9
    ) {
      continue;
    }

    openRing.push(x, y);
  }

  if (openRing.length >= 4) {
    const firstX = openRing[0];
    const firstY = openRing[1];
    const lastX = openRing[openRing.length - 2];
    const lastY = openRing[openRing.length - 1];
    if (Math.abs(firstX - lastX) < 1e-9 && Math.abs(firstY - lastY) < 1e-9) {
      openRing.splice(openRing.length - 2, 2);
    }
  }

  if (openRing.length < 6 || Math.abs(openRingArea(openRing)) < 1e-12) {
    return null;
  }

  return openRing;
}

function orientEarcutRing(
  ring: number[] | null,
  ringRole: "exterior" | "interior"
) {
  if (!ring) {
    return null;
  }

  const area = openRingArea(ring);
  const shouldReverse = ringRole === "exterior" ? area > 0 : area < 0;
  return shouldReverse ? reverseFlatRing(ring) : ring;
}

function reverseFlatRing(ring: Array<number>) {
  const reversed: number[] = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) {
    reversed.push(ring[i], ring[i + 1]);
  }
  return reversed;
}

function closeMaskRing(ring: Array<number>) {
  if (ring.length < 4) {
    return ring;
  }

  const closed = [...ring];
  const firstX = closed[0];
  const firstY = closed[1];
  const lastX = closed[closed.length - 2];
  const lastY = closed[closed.length - 1];
  if (Math.abs(firstX - lastX) > 1e-9 || Math.abs(firstY - lastY) > 1e-9) {
    closed.push(firstX, firstY);
  }
  return closed;
}

function openRingArea(ring: Array<number>) {
  let area = 0;
  const pointCount = Math.floor(ring.length / 2);
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount;
    area += ring[i * 2] * ring[next * 2 + 1] - ring[next * 2] * ring[i * 2 + 1];
  }
  return area / 2;
}

function getEarcutAreaDeviation(
  vertices: Array<number>,
  holeIndices: Array<number>,
  triangleIndices: Array<number>
) {
  const polygonArea = getPreparedPolygonArea(vertices, holeIndices);
  if (polygonArea <= 0) {
    return 0;
  }

  return (
    Math.abs(getTriangleIndicesArea(vertices, triangleIndices) - polygonArea) /
    polygonArea
  );
}

function getPreparedPolygonArea(
  vertices: Array<number>,
  holeIndices: Array<number>
) {
  const holeStarts = holeIndices.map((index) => index * 2);
  const ringEnds = [...holeStarts, vertices.length];
  let area = Math.abs(openRingAreaRange(vertices, 0, ringEnds[0]));

  holeStarts.forEach((start, index) => {
    area -= Math.abs(openRingAreaRange(vertices, start, ringEnds[index + 1]));
  });

  return area;
}

function openRingAreaRange(
  ring: Array<number>,
  startIndex: number,
  endIndex: number
) {
  let area = 0;
  const pointCount = Math.floor((endIndex - startIndex) / 2);
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount;
    const currentIndex = startIndex + i * 2;
    const nextIndex = startIndex + next * 2;
    area +=
      ring[currentIndex] * ring[nextIndex + 1] -
      ring[nextIndex] * ring[currentIndex + 1];
  }
  return area / 2;
}

function getTriangleIndicesArea(
  vertices: Array<number>,
  triangleIndices: Array<number>
) {
  let area = 0;
  for (let i = 0; i + 2 < triangleIndices.length; i += 3) {
    const a = triangleIndices[i] * 2;
    const b = triangleIndices[i + 1] * 2;
    const c = triangleIndices[i + 2] * 2;
    area += Math.abs(
      (vertices[a] * (vertices[b + 1] - vertices[c + 1]) +
        vertices[b] * (vertices[c + 1] - vertices[a + 1]) +
        vertices[c] * (vertices[a + 1] - vertices[b + 1])) /
        2
    );
  }
  return area;
}

function isDeepTimeGeoDebugEnabled() {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("deepTimeGeoDebug") === "1"
  );
}

function cloneCanvas(sourceCanvas: HTMLCanvasElement) {
  if (typeof document === "undefined") {
    throw new Error("无法创建Canvas快照：当前环境不存在document对象");
  }

  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = sourceCanvas.width;
  snapshotCanvas.height = sourceCanvas.height;
  const context = snapshotCanvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建Canvas 2D上下文");
  }
  context.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  return snapshotCanvas;
}

function disposeSnapshotCanvas(snapshotCanvas: HTMLCanvasElement) {
  snapshotCanvas.width = 0;
  snapshotCanvas.height = 0;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas导出Blob失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function createIdentityTextureCoordBuffer(
  gl: WebGLRenderingContext,
  vertexRowNum: number
) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    getIdentityTextureCoordData(vertexRowNum),
    gl.STATIC_DRAW
  );
  return buffer;
}

function isCanvasElement(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== "undefined" &&
    value instanceof HTMLCanvasElement
  );
}

function createInternalCanvas(options: CesiumTileProcesserOptions) {
  if (typeof document === "undefined") {
    throw new Error("无法创建内部Canvas：当前环境不存在document对象");
  }

  const canvas = document.createElement("canvas");
  canvas.width = options.width ?? 256;
  canvas.height = options.height ?? 256;
  return canvas;
}

function getDefaultLegacyPoolSize() {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    return Math.min(
      4,
      Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))
    );
  }
  return 3;
}

function normalizeLegacyPoolSize(poolSize: number) {
  return Math.min(4, Math.max(1, Math.floor(poolSize)));
}

function normalizeSlotCount(slotCount: number) {
  return Math.min(8, Math.max(1, Math.floor(slotCount)));
}

const EMPTY_WEBGL_CONTEXT_INFO: WebGLContextInfo = {
  webglVersion: "unavailable",
  shadingLanguageVersion: "unavailable",
  vendor: "unavailable",
  renderer: "unavailable",
};

function readWebGLContextInfo(gl: WebGLRenderingContext): WebGLContextInfo {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;

  return {
    webglVersion: String(gl.getParameter(gl.VERSION)),
    shadingLanguageVersion: String(
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    ),
    vendor: String(
      gl.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)
    ),
    renderer: String(
      gl.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
    ),
  };
}

function now() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

// 输出类的选项
export type CesiumTileProcesserOptions = {
  width?: number; // 瓦片宽度
  height?: number; // 瓦片高度
  vsSource?: string; // 顶点着色器
  fsSource?: string; // 片段着色器
  vertexRowNum?: number; // 顶点行数
  slotCount?: number; // 单 WebGL context 内复用的 texture/FBO 槽位数
  outputType?: TileImageOutputType; // 新图像资源接口的默认输出类型
  /**
   * @deprecated 旧版多 canvas / 多 WebGL context 数量。
   * 默认单 context 模式下仅作为 slotCount 的兼容别名。
   */
  poolSize?: number;
  legacyCanvasPool?: boolean; // 显式启用旧版多 canvas/context 池
  maxImageCacheSize?: number; // 原始影像缓存上限
  maxResultCacheSize?: number; // 重投影结果缓存上限
};

// TS中需要定义该变量的类型（没有预定义）
export type WebGLProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    [key: string]: number;
  };
  uniformLocations: {
    [key: string]: WebGLUniformLocation | null;
  };
};

// 缓冲区的类型
export type Buffers = {
  [key: string]: WebGLBuffer | null;
};

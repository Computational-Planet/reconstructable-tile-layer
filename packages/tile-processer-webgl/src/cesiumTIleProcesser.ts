import { ImageryProvider, ImageryTypes } from "cesium";
import { clipFS, defaultFS, defaultVS } from "./shader/defaultShaders";
import {
  drawScene,
  drawSceneClipped,
  generateTexture,
  initPositionBuffer,
  initShaderProgram,
  initTextureCoordBuffer,
} from "./glInitFunc";

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
}

class LRUCache<T> {
  private cache = new Map<string, T>();

  constructor(private maxSize: number) {}

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
      return;
    }
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

type TileXYZ = { x: number; y: number; z: number };

type RenderJob = {
  x: number;
  y: number;
  level: number;
  provider: ImageryProvider;
  image: ImageryTypes;
  polygonVertices?: Array<number>;
  resolve: (value: string | null) => void;
  reject: (reason?: unknown) => void;
};

class SingleCanvasTileRenderer {
  busy = false;
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext | null;
  private _programInfo: {
    defaultProgramInfo: WebGLProgramInfo;
    clipProgramInfo: WebGLProgramInfo;
  };
  private _buffers: Buffers;
  private _vertexRowNum: number;
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: string | null = null;
  private _destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    this._canvas = canvas;
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;

    this._context = this._canvas.getContext("webgl", { alpha: true });
    if (!this._context) {
      throw new Error(
        "无法初始化WebGL，你的浏览器、操作系统或硬件可能不支持WebGL"
      );
    }
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    const vsSource = options.vsSource ?? defaultVS;
    const fsSource = options.fsSource ?? defaultFS;
    const fsSourceClip = options.fsSource ?? clipFS;

    const defaultShaderProgram = initShaderProgram(
      this._context,
      vsSource,
      fsSource
    );
    const clipShaderProgram = initShaderProgram(
      this._context,
      vsSource,
      fsSourceClip
    );
    if (!defaultShaderProgram || !clipShaderProgram) {
      throw new Error("初始化着色器程序失败");
    }

    this._programInfo = {
      defaultProgramInfo: {
        program: defaultShaderProgram,
        attribLocations: {
          vertexPosition: this._context.getAttribLocation(
            defaultShaderProgram,
            "aVertexPosition"
          ),
          textureCoord: this._context.getAttribLocation(
            defaultShaderProgram,
            "aTextureCoord"
          ),
        },
        uniformLocations: {
          projectionMatrix: this._context.getUniformLocation(
            defaultShaderProgram,
            "uProjectionMatrix"
          ),
          modelViewMatrix: this._context.getUniformLocation(
            defaultShaderProgram,
            "uModelViewMatrix"
          ),
          uSampler: this._context.getUniformLocation(
            defaultShaderProgram,
            "uSampler"
          ),
        },
      },
      clipProgramInfo: {
        program: clipShaderProgram,
        attribLocations: {
          vertexPosition: this._context.getAttribLocation(
            clipShaderProgram,
            "aVertexPosition"
          ),
          textureCoord: this._context.getAttribLocation(
            clipShaderProgram,
            "aTextureCoord"
          ),
        },
        uniformLocations: {
          projectionMatrix: this._context.getUniformLocation(
            clipShaderProgram,
            "uProjectionMatrix"
          ),
          modelViewMatrix: this._context.getUniformLocation(
            clipShaderProgram,
            "uModelViewMatrix"
          ),
          uSampler: this._context.getUniformLocation(
            clipShaderProgram,
            "uSampler"
          ),
          polygonVerticesCount: this._context.getUniformLocation(
            clipShaderProgram,
            "polygonVerticesCount"
          ),
          polygonVertices: this._context.getUniformLocation(
            clipShaderProgram,
            "polygonVertices"
          ),
        },
      },
    };

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

  get currentTileXYZ() {
    return this._currentTileXYZ;
  }

  get currentResult() {
    return this._currentResult;
  }

  render(job: Omit<RenderJob, "resolve" | "reject">) {
    if (this._destroyed || !this._context) {
      return null;
    }

    const { x, y, level, provider, image, polygonVertices } = job;
    const gl = this._context;
    this._currentTileXYZ = { x, y, z: level };

    // 每个 renderer 独占一个 canvas；临时 buffer/texture 在本次绘制后释放。
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

    try {
      if (polygonVertices) {
        drawSceneClipped(
          gl,
          this._vertexRowNum,
          this._programInfo.clipProgramInfo,
          texture,
          this._buffers,
          polygonVertices
        );
      } else {
        drawScene(
          gl,
          this._vertexRowNum,
          this._programInfo.defaultProgramInfo,
          texture,
          this._buffers
        );
      }

      this._currentResult = this._canvas.toDataURL();
      return this._currentResult;
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
      this._context.getExtension("WEBGL_lose_context")?.loseContext();
      this._context = null;
    }

    this._buffers = { position: null, textureCoord: null };
    this._canvas.width = 0;
    this._canvas.height = 0;
  }
}

/**
 * 获取指定瓦片，并使用WebGL进行重投影，随后输出处理后的影像的类。
 *
 * 支持两种构造方式：
 * - new CesiumTileProcesser(options)：内部自动创建不可见 canvas 池。
 * - new CesiumTileProcesser(canvas, options)：兼容旧调用，仅使用传入 canvas。
 */
export class CesiumTileProcesser {
  private static _providerIds = new WeakMap<ImageryProvider, number>();
  private static _nextProviderId = 0;
  private _renderers: SingleCanvasTileRenderer[] = [];
  private _jobQueue: RenderJob[] = [];
  private _imageCachePromise = new CachedPromise<ImageryTypes>();
  private _imageBuffer: LRUCache<ImageryTypes>;
  private _resultBuffer: LRUCache<string>;
  private _resultPromises = new Map<string, Promise<string | null>>();
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: string | null = null;
  private _cacheToken = 0;
  private _destroyed = false;
  private _stats = {
    totalRequests: 0,
    imageCacheHits: 0,
    imageCacheMisses: 0,
    imagePromiseHits: 0,
    resultCacheHits: 0,
    resultCacheMisses: 0,
    resultPromiseHits: 0,
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
    const poolSize = externalCanvas
      ? 1
      : normalizePoolSize(
          resolvedOptions.poolSize ?? getDefaultInternalPoolSize()
        );

    this._imageBuffer = new LRUCache<ImageryTypes>(
      resolvedOptions.maxImageCacheSize ?? 256
    );
    this._resultBuffer = new LRUCache<string>(
      resolvedOptions.maxResultCacheSize ?? 512
    );

    for (let i = 0; i < poolSize; i++) {
      const canvas =
        i === 0 && externalCanvas
          ? externalCanvas
          : createInternalCanvas(resolvedOptions);
      this._renderers.push(new SingleCanvasTileRenderer(canvas, resolvedOptions));
    }
  }

  get width() {
    return this._renderers[0]?.width ?? 0;
  }

  get height() {
    return this._renderers[0]?.height ?? 0;
  }

  get canvas() {
    return this._renderers[0]?.canvas;
  }

  get vertexRowNum() {
    return this._renderers[0]?.vertexRowNum ?? 0;
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
    clipKey = "full"
  ) {
    return `${this.getRawTileKey(provider, x, y, level)}:${clipKey}`;
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

    const image = await this._imageCachePromise.getOrCreate(
      tileKey,
      async () => {
        const requestedImage = await provider.requestImage(x, y, level);
        if (!requestedImage) {
          throw new Error("图像获取失败");
        }
        return requestedImage;
      }
    );

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

    return new Promise<string | null>((resolve, reject) => {
      this._jobQueue.push({ ...job, resolve, reject });
      this.processJobQueue();
    });
  }

  private processJobQueue() {
    if (this._destroyed) {
      this.resolveQueuedJobsAsNull();
      return;
    }

    while (this._jobQueue.length > 0) {
      const renderer = this._renderers.find((item) => !item.busy);
      if (!renderer) {
        return;
      }

      const job = this._jobQueue.shift();
      if (!job) {
        return;
      }

      renderer.busy = true;
      Promise.resolve()
        .then(() => renderer.render(job))
        .then((result) => {
          this._currentTileXYZ = {
            x: job.x,
            y: job.y,
            z: job.level,
          };
          this._currentResult = result;
          job.resolve(result);
        })
        .catch(job.reject)
        .finally(() => {
          renderer.busy = false;
          this.processJobQueue();
        });
    }
  }

  private reprojectInternal(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    polygonVertices?: Array<number>
  ) {
    if (this._destroyed) {
      return Promise.resolve(null);
    }

    this._stats.totalRequests++;
    const clipKey = polygonVertices
      ? `clip-${this.getPolygonHash(polygonVertices)}`
      : "full";
    const resultKey = this.getResultKey(provider, x, y, level, clipKey);
    const bufferedResult = this._resultBuffer.get(resultKey);
    if (bufferedResult) {
      this._stats.resultCacheHits++;
      return Promise.resolve(bufferedResult);
    }

    const pendingResult = this._resultPromises.get(resultKey);
    if (pendingResult) {
      this._stats.resultPromiseHits++;
      return pendingResult;
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
          polygonVertices,
        })
      )
      .then((result) => {
        if (result && cacheToken === this._cacheToken) {
          this._resultBuffer.set(resultKey, result);
        }
        return result;
      })
      .catch((error) => {
        console.error("获取或处理图像时发生错误:", error);
        return null;
      })
      .finally(() => {
        this._resultPromises.delete(resultKey);
      });

    this._resultPromises.set(resultKey, resultPromise);
    return resultPromise;
  }

  // 产出重投影的结果
  async reprojectTile(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider
  ) {
    return this.reprojectInternal(x, y, level, provider);
  }

  // 产出经过裁剪的重投影瓦片（部分透明），需要输入顶点坐标，坐标是相对于纹理坐标定义的(0-1)
  async reprojectClippedTile(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider
  ) {
    return this.reprojectInternal(x, y, level, provider, polygonVertices);
  }

  clearBuffer() {
    this._cacheToken++;
    this._imageBuffer.clear();
    this._resultBuffer.clear();
    this._imageCachePromise.clear();
    this._resultPromises.clear();
    this.resolveQueuedJobsAsNull();
  }

  getPoolStats() {
    return {
      poolSize: this._renderers.length,
      busyRendererCount: this._renderers.filter((renderer) => renderer.busy)
        .length,
      queuedJobCount: this._jobQueue.length,
      imageBufferSize: this._imageBuffer.size,
      resultBufferSize: this._resultBuffer.size,
      pendingResultPromiseCount: this._resultPromises.size,
      ...this._stats,
    };
  }

  destroy() {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.clearBuffer();
    this._renderers.forEach((renderer) => renderer.destroy());
    this._renderers = [];
  }

  private resolveQueuedJobsAsNull() {
    const queuedJobs = this._jobQueue;
    this._jobQueue = [];
    queuedJobs.forEach((job) => job.resolve(null));
  }
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

function getDefaultInternalPoolSize() {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    return Math.min(
      4,
      Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))
    );
  }
  return 3;
}

function normalizePoolSize(poolSize: number) {
  return Math.min(8, Math.max(1, Math.floor(poolSize)));
}

// 输出类的选项
export type CesiumTileProcesserOptions = {
  width?: number; // 瓦片宽度
  height?: number; // 瓦片高度
  vsSource?: string; // 顶点着色器
  fsSource?: string; // 片段着色器
  vertexRowNum?: number; // 顶点行数
  poolSize?: number; // 内部不可见 canvas 的数量
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

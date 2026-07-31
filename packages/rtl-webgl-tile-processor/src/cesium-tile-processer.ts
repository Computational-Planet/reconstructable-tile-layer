import { ImageryProvider, type ImageryTypes } from "cesium";
import { CachedPromise, LRUCache } from "./cache.js";
import { disposeSnapshotCanvas, isCanvasElement } from "./canvas.js";
import {
  createAssetFromSnapshot,
  createCanvasAssetFromSnapshot,
  type ExportResult,
} from "./canvasExport.js";
import {
  createClipMaskDebugStats,
  createClipMaskVertices,
  createTileClipAreaFromFlatPolygon,
  logClipMaskDebug,
} from "./maskGeometry.js";
import { createRendererPool } from "./rendererPool.js";
import { RetainedTileImageAsset } from "./tileImageAsset.js";
import { now } from "./time.js";
import type {
  CesiumTileProcesserOptions,
  CesiumTileProcesserStats,
  ExportTiming,
  RendererPool,
  RenderJob,
  RenderResult,
  RenderTiming,
  TileClipArea,
  TileImageAsset,
  TileImageOutputType,
  TileProcesserBenchmarkObserver,
  TileProcessorCumulativeStats,
  TileXYZ,
} from "./types.js";

const EXPORT_CONCURRENCY = 4;
const POOL_STATS_SCHEMA_VERSION = 3;

type ExportJob = {
  snapshotCanvas: HTMLCanvasElement;
  outputType: TileImageOutputType;
  resolve: (value: ExportResult | null) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Reprojects Cesium imagery tiles with WebGL and optionally clips the result.
 *
 * The default renderer uses one WebGL context with reusable texture/FBO slots.
 * Set `legacyCanvasPool` to use the compatible multi-canvas renderer instead.
 * The historical `Processer` spelling is preserved for compatibility; new code
 * may import the correctly spelled `CesiumTileProcessor` alias.
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
  private _resultPromises = new Map<string, Promise<RetainedTileImageAsset | null>>();
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: TileImageAsset | null = null;
  private _cacheToken = 0;
  private _destroyed = false;
  private _outputType: TileImageOutputType;
  private _benchmarkObserver?: TileProcesserBenchmarkObserver;
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

  /** Creates a processor with an internally managed canvas. */
  constructor(options?: CesiumTileProcesserOptions);
  /** Creates a processor that renders through the supplied canvas. */
  constructor(canvas: HTMLCanvasElement, options?: CesiumTileProcesserOptions);
  constructor(
    canvasOrOptions?: HTMLCanvasElement | CesiumTileProcesserOptions,
    options: CesiumTileProcesserOptions = {},
  ) {
    const externalCanvas = isCanvasElement(canvasOrOptions) ? canvasOrOptions : undefined;
    const resolvedOptions = externalCanvas
      ? options
      : ((canvasOrOptions as CesiumTileProcesserOptions | undefined) ?? {});

    this._outputType = resolvedOptions.outputType ?? "blobUrl";
    this._benchmarkObserver = resolvedOptions.benchmarkObserver;
    this._imageBuffer = new LRUCache<ImageryTypes>(
      resolvedOptions.maxImageCacheSize ?? 256,
      (_image, reason) => {
        if (reason === "capacity") {
          this._stats.imageEvictions++;
        }
      },
    );
    this._resultBuffer = new LRUCache<RetainedTileImageAsset>(
      resolvedOptions.maxResultCacheSize ?? 512,
      (asset, reason) => {
        if (reason === "capacity") {
          this._stats.resultEvictions++;
        }
        asset.release();
      },
    );

    this._rendererPool = createRendererPool(externalCanvas, resolvedOptions);
  }

  /** Output tile width in pixels. */
  get width() {
    return this._rendererPool.width;
  }

  /** Output tile height in pixels. */
  get height() {
    return this._rendererPool.height;
  }

  /** Canvas used by the first renderer, when available. */
  get canvas() {
    return this._rendererPool.canvas;
  }

  /** Number of vertex rows in the reprojection mesh. */
  get vertexRowNum() {
    return this._rendererPool.vertexRowNum;
  }

  /** Most recently completed tile coordinates, or `undefined`. */
  get currentTileXYZ() {
    return this._currentTileXYZ;
  }

  /** Most recently produced retained asset, or `null`. */
  get currentResult() {
    return this._currentResult;
  }

  private static getProviderKey(provider: ImageryProvider) {
    if (!CesiumTileProcesser._providerIds.has(provider)) {
      CesiumTileProcesser._providerIds.set(provider, CesiumTileProcesser._nextProviderId++);
    }
    return `provider-${CesiumTileProcesser._providerIds.get(provider)}`;
  }

  private getRawTileKey(provider: ImageryProvider, x: number, y: number, level: number) {
    return `${CesiumTileProcesser.getProviderKey(provider)}:${x}/${y}/${level}`;
  }

  private getResultKey(
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number,
    outputType: TileImageOutputType,
    clipKey = "full",
  ) {
    return `${this.getRawTileKey(provider, x, y, level)}:${clipKey}:${outputType}`;
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
        ...(polygon.interiors ?? []).map((ring) => `i:${this.getPolygonHash(ring)}`),
      ];
      return ringHashes.join("|");
    });
    return polygonHashes.join(";");
  }

  private getTileClipAreaListHash(clipAreas: TileClipArea[]) {
    let hash = 2166136261;
    const areaHashes = clipAreas.map((clipArea) => this.getTileClipAreaHash(clipArea)).sort();

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
    cacheToken: number,
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

    const imagePromise = this._imageCachePromise.getOrCreate(tileKey, async () => {
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
        const requestEnd = now();
        this._stats.imageRequestMs += requestEnd - requestStart;
        this._benchmarkObserver?.onStageOperation("provider", requestStart, requestEnd);
      }
    });
    this._stats.maxPendingImagePromiseCount = Math.max(
      this._stats.maxPendingImagePromiseCount,
      this._imageCachePromise.size,
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
        this._jobQueue.length,
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
        this._rendererPool.workers.filter((item) => item.busy).length,
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

  private enqueueExport(snapshotCanvas: HTMLCanvasElement, outputType: TileImageOutputType) {
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
        this._exportQueue.length + this._activeExportCount,
      );
      this.processExportQueue();
    });
  }

  private processExportQueue() {
    if (this._destroyed) {
      this.resolveQueuedExportsAsNull();
      return;
    }

    while (this._activeExportCount < EXPORT_CONCURRENCY && this._exportQueue.length > 0) {
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
    clipKeyOverride?: string,
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
    const resultKey = this.getResultKey(provider, x, y, level, outputType, clipKey);
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
    let processingStart: number | null = null;
    const resultPromise = this.getImage(x, y, level, provider, cacheToken)
      .then((image) => {
        processingStart = now();
        return this.enqueueRender({
          x,
          y,
          level,
          provider,
          image,
          outputType,
          queuedAt: now(),
          polygonVerticesList,
          clipMaskVertices,
        });
      })
      .then((result) => {
        if (!result) {
          return null;
        }

        if (outputType === "canvas") {
          this.recordExportTiming({ exportMs: 0, encodeMs: 0 });
          return createCanvasAssetFromSnapshot(result.snapshotCanvas);
        }

        return this.enqueueExport(result.snapshotCanvas, outputType).then(
          (exportResult) => exportResult?.asset ?? null,
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
        if (processingStart !== null) {
          this._benchmarkObserver?.onStageOperation("masking", processingStart, now());
        }
        this._resultPromises.delete(resultKey);
      });

    this._resultPromises.set(resultKey, resultPromise);
    this._stats.maxPendingResultPromiseCount = Math.max(
      this._stats.maxPendingResultPromiseCount,
      this._resultPromises.size,
    );
    return resultPromise.then((asset) => asset?.retain() ?? null);
  }

  /**
   * Reprojects a tile and returns a data URL.
   *
   * @deprecated Use `reprojectTileImage` and release the returned asset.
   */
  async reprojectTile(x: number, y: number, level: number, provider: ImageryProvider) {
    const asset = await this.reprojectInternal(x, y, level, provider, "dataUrl");
    if (!asset) {
      return null;
    }
    try {
      return typeof asset.source === "string" ? asset.source : asset.source.toDataURL();
    } finally {
      asset.release();
    }
  }

  /**
   * Reprojects and clips a tile, then returns a data URL.
   *
   * @deprecated Use `reprojectClippedTileImage` and release the returned asset.
   */
  async reprojectClippedTile(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider,
  ) {
    const asset = await this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      [createTileClipAreaFromFlatPolygon(polygonVertices)],
      provider,
      "dataUrl",
    );
    if (!asset) {
      return null;
    }
    try {
      return typeof asset.source === "string" ? asset.source : asset.source.toDataURL();
    } finally {
      asset.release();
    }
  }

  /** Reprojects a complete tile into the requested output representation. */
  async reprojectTileImage(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    return this.reprojectInternal(x, y, level, provider, outputType);
  }

  /** Produces the processed image for a complete source tile. */
  async processSourceTileImage(
    x: number,
    y: number,
    level: number,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    return this.reprojectTileImage(x, y, level, provider, outputType);
  }

  /** Reprojects a tile clipped by one flat tile-local polygon. */
  async reprojectClippedTileImage(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    return this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      [createTileClipAreaFromFlatPolygon(polygonVertices)],
      provider,
      outputType,
    );
  }

  /** Reprojects a tile clipped by multiple flat tile-local polygons. */
  async reprojectMultiClippedTileImage(
    x: number,
    y: number,
    level: number,
    polygonVerticesList: Array<Array<number>>,
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    return this.reprojectMultiClippedTileAreaImage(
      x,
      y,
      level,
      polygonVerticesList.map(createTileClipAreaFromFlatPolygon),
      provider,
      outputType,
    );
  }

  /**
   * Reprojects a tile clipped by polygon areas that may contain holes.
   *
   * Coordinates are tile-local values, normally in the `[0, 1]` range.
   */
  async reprojectMultiClippedTileAreaImage(
    x: number,
    y: number,
    level: number,
    clipAreas: TileClipArea[],
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    if (clipAreas.length === 0) {
      return this.reprojectTileImage(x, y, level, provider, outputType);
    }

    const maskPreparationStart = now();
    const clipKey = `area-${this.getTileClipAreaListHash(clipAreas)}`;
    const debugStats = createClipMaskDebugStats();
    const clipMaskVertices = createClipMaskVertices(clipAreas, debugStats);
    const maskPreparationEnd = now();
    this._stats.maskPreparationCount++;
    this._stats.maskPreparationMs += maskPreparationEnd - maskPreparationStart;
    this._benchmarkObserver?.onStageOperation("masking", maskPreparationStart, maskPreparationEnd);
    this._stats.maskPolygonCount += debugStats.polygonCount;
    this._stats.maskInteriorRingCount += debugStats.interiorRingCount;
    this._stats.maskTriangleCount += debugStats.triangleCount;
    this._stats.maskSkippedPolygonCount += debugStats.skippedPolygonCount;
    logClipMaskDebug({ x, y, z: level }, clipAreas, clipMaskVertices, debugStats);
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
      clipKey,
    );
  }

  /** Produces one transparent processed image from tile-local plate-domain masks. */
  async processMaskedSourceTileImage(
    x: number,
    y: number,
    level: number,
    clipAreas: TileClipArea[],
    provider: ImageryProvider,
    outputType: TileImageOutputType = this._outputType,
  ): Promise<TileImageAsset | null> {
    return this.reprojectMultiClippedTileAreaImage(x, y, level, clipAreas, provider, outputType);
  }

  /** Adds a Cesium material-application duration to cumulative statistics. */
  recordMaterialApplyMs(durationMs: number) {
    this._stats.materialApplyMs += durationMs;
  }

  /**
   * Clears source and processed caches and resolves queued work with `null`.
   * The processor remains usable after this call.
   */
  clearBuffer() {
    this._cacheToken++;
    this._imageBuffer.clear();
    this._resultBuffer.clear();
    this._imageCachePromise.clear();
    this._resultPromises.clear();
    this.resolveQueuedJobsAsNull();
    this.resolveQueuedExportsAsNull();
  }

  /** Returns a point-in-time snapshot of pool, cache, and timing statistics. */
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

  /** Returns the WebGL processor's cache, queue, rendering, and export metrics. */
  getRuntimeStats(): CesiumTileProcesserStats {
    return this.getPoolStats();
  }

  /**
   * Permanently destroys WebGL resources, canvases, queues, and caches.
   * A destroyed processor must not be reused.
   */
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

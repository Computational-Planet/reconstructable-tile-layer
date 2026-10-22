import {
  Credit,
  Ellipsoid,
  Event,
  type GeographicTilingScheme,
  Math as CesiumMath,
  NeverTileDiscardPolicy,
  Rectangle,
  RequestState,
  TileProviderError,
  type ImageryLayerFeatureInfo,
  type ImageryProvider,
  type Request,
} from "cesium";
import {
  planGeographicRead,
  getGeographicBounds,
  openRasterSource,
  RasterError,
  toPhysicalValue,
  type OpenRasterOptions,
  type RasterSource,
} from "rtl-raster-source";
import { resolveStyle, writeColor, type RasterStyle, type ResolvedRasterStyle } from "./style.js";
import { getRasterLevelInfo, type RasterLevelOptions } from "./levels.js";
import { RasterTilingScheme } from "./RasterTilingScheme.js";

export interface RasterImageryProviderOptions extends OpenRasterOptions, RasterLevelOptions {
  readonly ellipsoid?: Ellipsoid;
  readonly style?: RasterStyle;
  readonly credit?: string | Credit;
  readonly cacheBytes?: number;
  /** fromSource borrows by default. fromFile always owns its newly opened source. */
  readonly ownsSource?: boolean;
  /** Bounds queued tile work. Excess requests return undefined so Cesium can retry. */
  readonly maximumPendingTiles?: number;
}

/** Standard Cesium ImageryProvider; also accepted directly by ReconstructableTileLayer. */
export class RasterImageryProvider implements ImageryProvider {
  readonly source: RasterSource;
  readonly style: ResolvedRasterStyle;
  readonly rectangle: Rectangle;
  readonly tilingScheme: GeographicTilingScheme;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly minimumLevel = 0;
  readonly maximumLevel: number;
  /** Approximate level matching stored pixel dimensions; resampling history is separate. */
  readonly nativeMaximumLevel: number;
  readonly recommendedReconstructionLevel: number;
  readonly hasAlphaChannel = true;
  readonly tileDiscardPolicy = new NeverTileDiscardPolicy();
  readonly errorEvent = new Event();
  readonly credit: Credit;
  readonly proxy = { getURL: (resource: string) => resource };
  readonly ready = true;
  private readonly lifetime = new AbortController();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly pending = new Map<string, Promise<HTMLCanvasElement>>();
  private readonly maxCachedTiles: number;
  private readonly maxPendingTiles: number;
  private readonly ownsSource: boolean;

  private constructor(
    source: RasterSource,
    style: ResolvedRasterStyle,
    options: RasterImageryProviderOptions,
  ) {
    this.source = source;
    this.style = style;
    this.ownsSource = options.ownsSource ?? false;
    const levels = getRasterLevelInfo(source.metadata, options);
    const { tileSize } = levels;
    this.tileWidth = this.tileHeight = tileSize;
    this.nativeMaximumLevel = levels.nativeMaximumLevel;
    this.maximumLevel = levels.maximumLevel;
    this.recommendedReconstructionLevel = levels.recommendedReconstructionLevel;
    const cacheBytes = options.cacheBytes ?? 16 * 1024 * 1024;
    if (!Number.isSafeInteger(cacheBytes) || cacheBytes < 0)
      throw new RangeError("cacheBytes must be a non-negative integer.");
    this.maxCachedTiles = Math.floor(cacheBytes / (tileSize * tileSize * 4));
    this.maxPendingTiles = options.maximumPendingTiles ?? 8;
    if (!Number.isInteger(this.maxPendingTiles) || this.maxPendingTiles < 1)
      throw new RangeError("maximumPendingTiles must be a positive integer.");
    const { transform } = source.metadata;
    if (
      transform &&
      (transform[1] <= 0 || transform[5] >= 0 || transform[2] !== 0 || transform[4] !== 0)
    )
      throw new RasterError("unsupported-grid", "Display needs a north-up, axis-aligned grid.");
    const bounds = getGeographicBounds(source.metadata);
    if (
      !bounds.every(Number.isFinite) ||
      bounds[0] < -180 - 1e-8 ||
      bounds[2] - bounds[0] > 360 + 1e-8 ||
      bounds[1] < -90 - 1e-8 ||
      bounds[3] > 90 + 1e-8 ||
      bounds[0] >= bounds[2] ||
      bounds[1] >= bounds[3]
    )
      throw new RasterError(
        "unsupported-grid",
        "Display bounds must be a continuous rectangle within −180…180°, −90…90°. Normalize longitude first.",
      );
    this.rectangle = Rectangle.fromDegrees(
      bounds[0],
      bounds[1],
      bounds[2] > 180 ? bounds[2] - 360 : bounds[2],
      bounds[3],
    );
    // 输出纹理统一按经纬度排列；3857 数值投影始终使用 EPSG 的半径，独立于显示球体。
    this.tilingScheme = new RasterTilingScheme({
      rectangle: this.rectangle,
      ellipsoid: options.ellipsoid ?? Ellipsoid.default,
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
    });
    this.credit =
      typeof options.credit === "string"
        ? new Credit(options.credit)
        : (options.credit ?? new Credit("Local raster"));
  }

  /** Opens a local TIFF and owns its source, including cleanup when creation fails. */
  static async fromFile(
    file: Blob,
    options: RasterImageryProviderOptions = {},
  ): Promise<RasterImageryProvider> {
    const source = await openRasterSource(file, options);
    return this.fromSource(source, { ...options, ownsSource: true });
  }

  /** Creates imagery over an existing numeric source; borrowed unless ownsSource is explicit. */
  static async fromSource(
    source: RasterSource,
    options: RasterImageryProviderOptions = {},
  ): Promise<RasterImageryProvider> {
    try {
      if (source.closed) throw new RasterError("closed", "Raster source is closed.");
      if (options.signal?.aborted)
        throw new RasterError("aborted", "Provider creation was cancelled.");
      const style = await resolveStyle(
        source,
        options.style ?? { kind: "single-band", band: 0 },
        options.signal,
      );
      if (options.signal?.aborted)
        throw new RasterError("aborted", "Provider creation was cancelled.");
      return new RasterImageryProvider(source, style, options);
    } catch (error) {
      if (options.ownsSource) source.close();
      throw error;
    }
  }

  getTileCredits(_x: number, _y: number, _level: number): Credit[] {
    return [this.credit];
  }
  pickFeatures(
    _x: number,
    _y: number,
    _level: number,
    _longitude: number,
    _latitude: number,
  ): Promise<ImageryLayerFeatureInfo[]> | undefined {
    return undefined;
  }
  isDestroyed(): boolean {
    return this.lifetime.signal.aborted;
  }

  requestImage(
    x: number,
    y: number,
    level: number,
    request?: Request,
  ): Promise<HTMLCanvasElement> | undefined {
    if (this.isDestroyed())
      return Promise.reject(new RasterError("closed", "Raster provider is destroyed."));
    const count = 2 ** level;
    if (
      ![x, y, level].every(Number.isInteger) ||
      level < 0 ||
      level > this.maximumLevel ||
      x < 0 ||
      y < 0 ||
      x >= count ||
      y >= count
    )
      return Promise.reject(
        new RangeError("Tile is outside the provider's extent or level range."),
      );
    if (request?.state === RequestState.CANCELLED)
      return Promise.reject(new RasterError("aborted", "Tile request was cancelled."));
    const key = `${level}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    let task = this.pending.get(key);
    if (!task) {
      if (this.pending.size >= this.maxPendingTiles) return undefined;
      task = this.renderTile(x, y, level)
        .then((canvas) => {
          if (this.isDestroyed()) throw new RasterError("closed", "Raster provider is destroyed.");
          if (this.maxCachedTiles > 0) {
            this.cache.set(key, canvas);
            while (this.cache.size > this.maxCachedTiles)
              this.cache.delete(this.cache.keys().next().value!);
          }
          return canvas;
        })
        .catch((error: unknown) => {
          if (!this.isDestroyed() && !(error instanceof RasterError && error.code === "aborted")) {
            const reason = error instanceof Error ? error : new Error(String(error));
            this.errorEvent.raiseEvent(
              new TileProviderError(this, reason.message, x, y, level, 0, reason),
            );
          }
          throw error;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, task);
    }
    return task.then((canvas) => {
      if (request?.state === RequestState.CANCELLED)
        throw new RasterError("aborted", "Tile request was cancelled.");
      return canvas;
    });
  }

  private async renderTile(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const rectangle = this.tilingScheme.tileXYToRectangle(x, y, level);
    const { metadata } = this.source;
    const west = CesiumMath.toDegrees(rectangle.west);
    const east = CesiumMath.toDegrees(rectangle.east);
    const south = CesiumMath.toDegrees(rectangle.south);
    const north = CesiumMath.toDegrees(rectangle.north);
    const raster = await this.source.readWindow({
      ...planGeographicRead(metadata, [west, south, east, north], this.tileWidth, this.tileHeight),
      bands: this.style.bands,
      signal: this.lifetime.signal,
    });
    if (this.isDestroyed()) throw new RasterError("closed", "Raster provider is destroyed.");
    const canvas = document.createElement("canvas");
    canvas.width = this.tileWidth;
    canvas.height = this.tileHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A browser 2D canvas is required for raster imagery.");
    const image = context.createImageData(this.tileWidth, this.tileHeight);
    const values = new Array<number>(raster.bands.length);
    for (let row = 0; row < this.tileHeight; row++) {
      for (let column = 0; column < this.tileWidth; column++) {
        const index = row * raster.width + column;
        for (let band = 0; band < values.length; band++) {
          const raw = raster.bands[band][index];
          values[band] = this.style.additionalNoData?.includes(raw)
            ? NaN
            : toPhysicalValue(raw, metadata.bands[this.style.bands[band]]);
        }
        writeColor(values, this.style, image.data, 4 * (row * this.tileWidth + column));
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  /** Remove the provider from its imagery/reconstruction layer before destroying it. */
  destroy(): void {
    if (this.isDestroyed()) return;
    this.lifetime.abort();
    this.cache.clear();
    this.pending.clear();
    if (this.ownsSource) this.source.close();
  }
}

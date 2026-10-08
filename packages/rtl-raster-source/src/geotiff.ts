import type { GeoTIFF, GeoTIFFImage, Pool } from "geotiff";
import { abortable, combineSignals, RasterError, throwIfAborted } from "./errors.js";
import type {
  OpenRasterOptions,
  RasterArray,
  RasterBandMetadata,
  RasterMetadata,
  RasterReadOptions,
  RasterReadResult,
  RasterSource,
  RasterTransform,
} from "./types.js";
import { checkBudget, freezeMetadata, memoryBudget, validateRead } from "./validation.js";

function getTransform(image: GeoTIFFImage): RasterTransform {
  const directory = image.getFileDirectory();
  const matrix = directory.getValue("ModelTransformation");
  const scale = directory.getValue("ModelPixelScale");
  const tie = directory.getValue("ModelTiepoint");
  let transform: number[];
  if (matrix?.length === 16) {
    transform = [matrix[3], matrix[0], matrix[1], matrix[7], matrix[4], matrix[5]];
  } else if (scale && tie?.length === 6) {
    // Tiepoint 的像元坐标不一定为零，必须先还原整个栅格的原点。
    transform = [tie[3] - tie[0] * scale[0], scale[0], 0, tie[4] + tie[1] * scale[1], 0, -scale[1]];
  } else {
    throw new RasterError(
      "invalid-metadata",
      "GeoTIFF needs an affine transform and an EPSG code.",
    );
  }
  if (
    !transform.every(Number.isFinite) ||
    transform[1] <= 0 ||
    transform[5] >= 0 ||
    transform[2] !== 0 ||
    transform[4] !== 0
  ) {
    throw new RasterError(
      "unsupported-grid",
      "Only north-up, axis-aligned GeoTIFF grids are supported. Reproject this grid first.",
    );
  }
  // PixelIsPoint 的定位在像元中心；公开变换统一为像元外边缘，避免半像元偏移。
  if (image.getGeoKeys()?.GTRasterTypeGeoKey === 2) {
    transform[0] -= transform[1] / 2;
    transform[3] -= transform[5] / 2;
  }
  return transform as unknown as RasterTransform;
}

function numericAttribute(value: unknown, fallback: number) {
  const number = Number(value);
  return value != null && Number.isFinite(number) ? number : fallback;
}

async function getMetadata(
  image: GeoTIFFImage,
  file: Blob,
  overviews: GeoTIFFImage[],
): Promise<RasterMetadata> {
  const keys = image.getGeoKeys();
  const epsg = Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey);
  if (!Number.isInteger(epsg) || epsg <= 0 || epsg === 32767) {
    throw new RasterError("unsupported-crs", "GeoTIFF must declare a supported EPSG code.");
  }
  const directory = image.getFileDirectory();
  if (((await directory.loadValue("Orientation")) ?? 1) !== 1) {
    throw new RasterError("unsupported-grid", "TIFF orientation must be top-left.");
  }
  const width = image.getWidth();
  const height = image.getHeight();
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new RasterError("invalid-metadata", "GeoTIFF dimensions are invalid.");
  }
  const transform = getTransform(image);
  const noData = image.getGDALNoData();
  const photometric = directory.getValue("PhotometricInterpretation");
  if (photometric !== 1 && photometric !== 2) {
    throw new RasterError(
      "unsupported-format",
      "Only grayscale and RGB GeoTIFF samples are currently supported.",
    );
  }
  const bands: RasterBandMetadata[] = [];
  for (let index = 0; index < image.getSamplesPerPixel(); index++) {
    const attributes = await image.getGDALMetadata(index);
    const sampleFormat = image.getSampleFormat(index);
    const bits = image.getBitsPerSample(index);
    if (![1, 2, 3].includes(sampleFormat) || bits > 64 || (sampleFormat !== 3 && bits > 32)) {
      throw new RasterError(
        "unsupported-format",
        "Raster samples must be numeric values representable without integer precision loss.",
      );
    }
    bands.push({
      name: String(attributes?.DESCRIPTION ?? `Band ${index + 1}`),
      dataType: `${sampleFormat === 3 ? "float" : sampleFormat === 2 ? "int" : "uint"}${bits}`,
      noData: noData == null ? [] : [noData],
      scale: numericAttribute(attributes?.SCALE, 1),
      offset: numericAttribute(attributes?.OFFSET, 0),
      units: attributes?.UNITTYPE == null ? undefined : String(attributes.UNITTYPE),
      colorInterpretation:
        photometric === 2
          ? (["red", "green", "blue"] as const)[index]
          : index === 0
            ? "gray"
            : undefined,
    });
  }
  return freezeMetadata({
    format: "geotiff",
    name: "name" in file ? String(file.name) : undefined,
    width,
    height,
    crs: {
      epsg,
      verticalEpsg:
        keys?.VerticalCSTypeGeoKey == null ? undefined : Number(keys.VerticalCSTypeGeoKey),
    },
    transform,
    bounds: [
      transform[0],
      transform[3] + height * transform[5],
      transform[0] + width * transform[1],
      transform[3],
    ],
    pixelInterpretation: keys?.GTRasterTypeGeoKey === 2 ? "point" : "area",
    bands,
    overviews: overviews.map((overview) => ({
      width: overview.getWidth(),
      height: overview.getHeight(),
    })),
  });
}

class GeoTIFFSource implements RasterSource {
  readonly metadata: RasterMetadata;
  private readonly lifetime = new AbortController();
  private queue: Promise<unknown> = Promise.resolve();
  get closed() {
    return this.lifetime.signal.aborted;
  }

  constructor(
    private readonly tiff: GeoTIFF,
    private readonly images: GeoTIFFImage[],
    metadata: RasterMetadata,
    private readonly pool: Pool,
    private readonly budget: number,
  ) {
    this.metadata = metadata;
  }

  async readWindow(options: RasterReadOptions): Promise<RasterReadResult> {
    if (this.closed) throw new RasterError("closed", "Raster source is closed.");
    throwIfAborted(options.signal);
    const target = validateRead(this.metadata, options);
    const signals = combineSignals([options.signal, this.lifetime.signal]);
    // 串行解码使多瓦片并发请求共享同一工作内存预算；取消的排队任务不会触发 I/O。
    const operation = this.queue.then(async () => {
      throwIfAborted(signals.signal);
      const [left, top, right, bottom] = options.window;
      const desiredScale = Math.min(
        samplingStep(options.sampleColumns, (right - left) / target.width),
        samplingStep(options.sampleRows, (bottom - top) / target.height),
      );
      let image = this.images[0];
      for (const candidate of this.images.slice(1)) {
        if (
          this.metadata.width / candidate.getWidth() <= desiredScale &&
          candidate.getWidth() < image.getWidth()
        )
          image = candidate;
      }
      const sx = image.getWidth() / this.metadata.width;
      const sy = image.getHeight() / this.metadata.height;
      const blockWidth = image.getTileWidth();
      const blockHeight = image.getTileHeight();
      const outputBytes = target.width * target.height * target.bands.length * 8;
      const decodedBytes = blockWidth * blockHeight * image.getSamplesPerPixel() * 8;
      checkBudget(decodedBytes * 3 + outputBytes + (target.width + target.height) * 8, this.budget);
      const columns = sampleGroups(
        left,
        right,
        target.width,
        sx,
        blockWidth,
        image.getWidth(),
        options.sampleColumns,
      );
      const rows = sampleGroups(
        top,
        bottom,
        target.height,
        sy,
        blockHeight,
        image.getHeight(),
        options.sampleRows,
      );
      let bands: RasterArray[] | undefined;
      // 普通 TIFF 也按 block/strip 顺序读取，只解码预览真正采到的块；没有概览时仍不展开整图。
      for (const rowGroup of rows.groups) {
        for (const columnGroup of columns.groups) {
          throwIfAborted(signals.signal);
          const blockLeft = columnGroup.block * blockWidth;
          const blockTop = rowGroup.block * blockHeight;
          const blockRight = Math.min(image.getWidth(), blockLeft + blockWidth);
          const blockBottom = Math.min(image.getHeight(), blockTop + blockHeight);
          const decoded = await image.readRasters({
            window: [blockLeft, blockTop, blockRight, blockBottom],
            samples: target.bands,
            pool: this.pool,
            signal: signals.signal,
          });
          throwIfAborted(signals.signal);
          bands ??= decoded.map(
            (samples) =>
              new (samples.constructor as { new (length: number): RasterArray })(
                target.width * target.height,
              ),
          );
          for (let y = rowGroup.start; y < rowGroup.end; y++) {
            for (let x = columnGroup.start; x < columnGroup.end; x++) {
              const index =
                (rows.indices[y] - blockTop) * (blockRight - blockLeft) +
                columns.indices[x] -
                blockLeft;
              for (let band = 0; band < bands.length; band++)
                bands[band][y * target.width + x] = decoded[band][index];
            }
          }
        }
      }
      return { width: target.width, height: target.height, window: options.window, bands: bands! };
    });
    this.queue = operation.catch(() => undefined);
    try {
      return await abortable(operation, signals.signal);
    } finally {
      signals.dispose();
    }
  }

  close() {
    if (this.closed) return;
    this.lifetime.abort();
    this.pool.destroy();
    void Promise.resolve(this.tiff.close()).catch(() => undefined);
  }
}

function samplingStep(samples: readonly number[] | undefined, fallback: number): number {
  if (!samples || samples.length < 2) return samples ? 1 : fallback;
  let step = Infinity;
  for (let i = 1; i < samples.length; i++)
    step = Math.min(step, Math.abs(samples[i] - samples[i - 1]));
  return Math.max(1, step);
}

function sampleGroups(
  start: number,
  end: number,
  count: number,
  scale: number,
  blockSize: number,
  size: number,
  samples?: readonly number[],
) {
  const indices = new Uint32Array(count);
  const groups: { block: number; start: number; end: number }[] = [];
  for (let index = 0; index < count; index++) {
    indices[index] = Math.min(
      size - 1,
      Math.floor(
        (samples ? samples[index] + 0.5 : start + ((index + 0.5) * (end - start)) / count) * scale,
      ),
    );
    const block = Math.floor(indices[index] / blockSize);
    const previous = groups[groups.length - 1];
    if (previous?.block === block) previous.end = index + 1;
    else groups.push({ block, start: index, end: index + 1 });
  }
  return { indices, groups };
}

/** Opens a browser File/Blob without decoding the full raster or applying a color map. */
export async function openRasterSource(
  file: Blob,
  options: OpenRasterOptions = {},
): Promise<RasterSource> {
  throwIfAborted(options.signal);
  const budget = memoryBudget(options.memoryBudgetBytes);
  const workerCount = options.decoderWorkers ?? 2;
  if (!Number.isInteger(workerCount) || workerCount < 0 || workerCount > 8)
    throw new RangeError("decoderWorkers must be an integer from 0 to 8.");
  const header = new Uint8Array(await abortable(file.slice(0, 4).arrayBuffer(), options.signal));
  if (
    !(
      (header[0] === 73 &&
        header[1] === 73 &&
        (header[2] === 42 || header[2] === 43) &&
        header[3] === 0) ||
      (header[0] === 77 &&
        header[1] === 77 &&
        header[2] === 0 &&
        (header[3] === 42 || header[3] === 43))
    )
  ) {
    throw new RasterError(
      "unsupported-format",
      "Expected GeoTIFF/COG. Open NetCDF using rtl-raster-source/netcdf.",
    );
  }
  const engine = await import("geotiff");
  throwIfAborted(options.signal);
  const tiff = await engine.fromBlob(file, options.signal);
  let pool: Pool | undefined;
  try {
    const base = await tiff.getImage();
    const images = [base];
    let image = base;
    for (let index = 1; image.getFileDirectory().nextIFDByteOffset !== 0; index++) {
      if (index > 64)
        throw new RasterError("resource-limit", "TIFF contains too many image directories.");
      image = await tiff.getImage(index);
      if (
        (image.getFileDirectory().getValue("NewSubfileType") ?? 0) & 1 &&
        image.getWidth() < base.getWidth() &&
        image.getSamplesPerPixel() === base.getSamplesPerPixel()
      )
        images.push(image);
      throwIfAborted(options.signal);
    }
    const metadata = await getMetadata(base, file, images.slice(1));
    throwIfAborted(options.signal);
    pool = new engine.Pool(workerCount);
    return new GeoTIFFSource(tiff, images, metadata, pool, budget);
  } catch (error) {
    pool?.destroy();
    await tiff.close();
    throw error;
  }
}

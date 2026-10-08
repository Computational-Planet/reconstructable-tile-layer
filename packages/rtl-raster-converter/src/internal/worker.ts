import { RasterConversionError } from "../errors.js";
import { checkedSize } from "../validation.js";
import type { ConvertedRasterMetadata } from "../types.js";
import type { RasterTransform } from "rtl-raster-source";
import type { ConversionJob, WorkerReply } from "./protocol.js";

interface GDALInfo {
  size?: [number, number];
  coordinateSystem?: { wkt: string };
  geoTransform?: number[];
  bands?: {
    type: string;
    noDataValue?: number | string;
    unit?: string;
    scale?: number;
    offset?: number;
    overviews?: { size: [number, number] }[];
  }[];
  metadata?: Record<string, Record<string, string>>;
}
interface Dataset {
  readonly path: string;
  readonly pointer: number;
  readonly info: GDALInfo;
}
interface FilePath {
  readonly local: string;
}
interface Engine {
  readonly drivers: { readonly raster: Record<string, unknown> };
  open(files: readonly File[] | string): Promise<{ datasets: Dataset[]; errors: string[] }>;
  close(dataset: Dataset): Promise<void>;
  gdal_translate(dataset: Dataset, args: string[], name: string): Promise<FilePath>;
  gdalwarp(dataset: Dataset, args: string[], name: string): Promise<FilePath>;
  getFileBytes(path: FilePath): Promise<Uint8Array>;
}
const scope = globalThis as unknown as {
  importScripts(...urls: string[]): void;
  initGdalJs(config: object): Promise<Engine>;
  onmessage: (event: MessageEvent<ConversionJob>) => void;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
};
const progress = (
  stage: "loading-engine" | "opening" | "reprojecting" | "converting" | "reading-output",
) => scope.postMessage({ progress: { stage } });

function describe(info: GDALInfo): ConvertedRasterMetadata {
  if (
    !info.size ||
    !info.bands?.length ||
    !info.coordinateSystem?.wkt ||
    info.geoTransform?.length !== 6 ||
    !info.geoTransform.every(Number.isFinite)
  )
    throw new RasterConversionError(
      "invalid-input",
      "Raster needs a known CRS and affine georeference. Supply georeference for an unreferenced TIFF.",
    );
  return {
    width: info.size[0],
    height: info.size[1],
    projectionWkt: info.coordinateSystem.wkt,
    transform: info.geoTransform as unknown as RasterTransform,
    bands: info.bands.map((band) => ({
      dataType: band.type,
      noData: band.noDataValue,
      units: band.unit,
      scale: band.scale,
      offset: band.offset,
      overviews: (band.overviews ?? []).map((v) => ({ width: v.size[0], height: v.size[1] })),
    })),
    layout: info.metadata?.IMAGE_STRUCTURE?.LAYOUT,
  };
}

scope.onmessage = async ({ data: job }) => {
  const datasets: Dataset[] = [];
  const diagnostics: string[] = [];
  let engine: Engine | undefined;
  try {
    progress("loading-engine");
    scope.importScripts(job.assets.js);
    engine = await scope.initGdalJs({
      useWorker: false,
      paths: job.assets,
      logHandler: () => {},
      errorHandler: (message: string) => {
        if (diagnostics.length < 20) diagnostics.push(String(message).slice(0, 2000));
      },
    });
    if (!engine.drivers.raster.GTiff || !engine.drivers.raster.COG)
      throw new RasterConversionError(
        "engine-error",
        "The supplied GDAL build must provide GTiff and COG drivers.",
      );
    progress("opening");
    const opened = await engine.open(job.files);
    datasets.push(...opened.datasets);
    let source = opened.datasets[0];
    if (!source?.info.size || !source.info.bands?.length)
      throw new RasterConversionError(
        "unsupported-format",
        "GDAL could not open a numeric raster input.",
      );
    checkedSize(
      source.info.size[0],
      source.info.size[1],
      source.info.bands.length,
      job.memoryBudgetBytes,
    );
    if (job.georeference) {
      const t = job.georeference.transform;
      const [width, height] = source.info.size;
      const path = await engine.gdal_translate(
        source,
        [
          "-of",
          "VRT",
          "-a_srs",
          `EPSG:${job.georeference.epsg}`,
          "-a_ullr",
          String(t[0]),
          String(t[3]),
          String(t[0] + width * t[1]),
          String(t[3] + height * t[5]),
        ],
        "georeferenced",
      );
      const override = await engine.open(path.local);
      datasets.push(...override.datasets);
      source = override.datasets[0];
    }
    describe(source.info);
    const args = [
      "-of",
      "COG",
      "-co",
      `COMPRESS=${job.compression}`,
      "-co",
      `BLOCKSIZE=${job.blockSize}`,
      "-co",
      `RESAMPLING=${job.overviewResampling.toUpperCase()}`,
      "-co",
      "BIGTIFF=IF_SAFER",
      "--config",
      "GDAL_CACHEMAX",
      "32",
    ];
    let output: FilePath;
    if (job.reproject) {
      const target = job.reproject;
      checkedSize(target.width, target.height, source.info.bands!.length, job.memoryBudgetBytes);
      progress("reprojecting");
      output = await engine.gdalwarp(
        source,
        [
          ...args,
          "-t_srs",
          `EPSG:${target.epsg}`,
          "-te",
          ...target.bounds.map(String),
          "-ts",
          String(target.width),
          String(target.height),
          "-r",
          target.resampling,
          "-wm",
          "16",
        ],
        "converted",
      );
    } else {
      progress("converting");
      output = await engine.gdal_translate(source, args, "converted");
    }
    progress("reading-output");
    const reopened = await engine.open(output.local);
    datasets.push(...reopened.datasets);
    const metadata = describe(reopened.datasets[0].info);
    const bytes = await engine.getFileBytes(output);
    if (!bytes.length || bytes.length > job.memoryBudgetBytes)
      throw new RasterConversionError(
        "resource-limit",
        "COG output is empty or exceeds memoryBudgetBytes.",
      );
    scope.postMessage({ result: { bytes, metadata, diagnostics } }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error: {
        code: error instanceof RasterConversionError ? error.code : "engine-error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    // 正常完成释放 GDAL 句柄；取消由主线程终止整个 Worker，包括 WORKERFS/MEMFS。
    for (const dataset of datasets) await engine?.close(dataset);
  }
};

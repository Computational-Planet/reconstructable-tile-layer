import {
  getGeographicBounds,
  planGeographicRead,
  toPhysicalValue,
  type RasterSource,
  type RasterReadOptions,
  type RasterTransform,
} from "rtl-raster-source";
import { checkAbort, RasterConversionError } from "./errors.js";
import { checkedSize } from "./validation.js";
import type { ToCOGOptions } from "./types.js";

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Materialize only the selected two-dimensional source, in bounded row chunks. */
export async function prepareSource(
  source: RasterSource,
  options: ToCOGOptions,
  budget: number,
  signal: AbortSignal,
): Promise<File[]> {
  const metadata = source.metadata;
  if (source.closed)
    throw new RasterConversionError("closed", "The selected raster source is closed.");
  if (options.georeference)
    throw new RasterConversionError(
      "invalid-input",
      "georeference overrides apply to TIFF inputs, not an already georeferenced source.",
    );
  if (!options.grid && !metadata.transform)
    throw new RasterConversionError(
      "unsupported-grid",
      "Exporting a rectilinear source needs an explicit geographic grid; its native axes are retained in provenance.",
    );
  const bands = [...(options.bands ?? metadata.bands.map((_, i) => i))];
  if (
    !bands.length ||
    new Set(bands).size !== bands.length ||
    bands.some((i) => !Number.isInteger(i) || i < 0 || i >= metadata.bands.length)
  )
    throw new RasterConversionError(
      "invalid-input",
      "Select existing, unique, zero-based source bands.",
    );
  const width = options.grid?.width ?? metadata.width;
  const height = options.grid?.height ?? metadata.height;
  checkedSize(width, height, bands.length, budget);
  if (options.reproject)
    checkedSize(options.reproject.width, options.reproject.height, bands.length, budget);
  const grid = options.grid;
  const transform: RasterTransform = grid
    ? [
        grid.bounds[0],
        (grid.bounds[2] - grid.bounds[0]) / width,
        0,
        grid.bounds[3],
        0,
        (grid.bounds[1] - grid.bounds[3]) / height,
      ]
    : metadata.transform!;
  const projection = grid
    ? "EPSG:4326"
    : `EPSG:${metadata.crs.epsg}${metadata.crs.verticalEpsg ? `+${metadata.crs.verticalEpsg}` : ""}`;
  const plan = grid ? planGeographicRead(metadata, grid.bounds, width, height) : undefined;
  const coverage = grid ? getGeographicBounds(metadata) : undefined;
  const parts = bands.map(() => [] as BlobPart[]);
  const rowsPerChunk = Math.max(
    1,
    Math.min(64, Math.floor((1024 * 1024) / (width * bands.length * 8))),
  );
  for (let start = 0; start < height; start += rowsPerChunk) {
    checkAbort(signal);
    const end = Math.min(height, start + rowsPerChunk);
    const rows = plan?.sampleRows?.slice(start, end);
    const read: RasterReadOptions = plan
      ? {
          ...plan,
          window: [plan.window[0], Math.min(...rows!), plan.window[2], Math.max(...rows!) + 1],
          height: end - start,
          sampleRows: rows,
          bands,
          signal,
        }
      : { window: [0, start, width, end], bands, signal };
    const chunk = await source.readWindow(read);
    checkAbort(signal);
    for (let band = 0; band < bands.length; band++) {
      const raw = chunk.bands[band];
      const buffer = new ArrayBuffer(width * (end - start) * 8);
      const values = new DataView(buffer);
      for (let i = 0; i < raw.length; i++) {
        let value = toPhysicalValue(raw[i], metadata.bands[bands[band]]);
        if (grid && coverage) {
          const longitude = grid.bounds[0] + ((i % width) + 0.5) * transform[1];
          const latitude = grid.bounds[3] + (start + Math.floor(i / width) + 0.5) * transform[5];
          const shifted =
            longitude + 360 * Math.round(((coverage[0] + coverage[2]) / 2 - longitude) / 360);
          // 目标网格可大于原范围；范围外必须是 NoData，不能复制边缘像元。
          if (
            latitude < coverage[1] ||
            latitude > coverage[3] ||
            shifted < coverage[0] ||
            shifted > coverage[2]
          )
            value = NaN;
        }
        values.setFloat64(i * 8, value, true);
      }
      parts[band].push(buffer);
    }
    options.onProgress?.({ stage: "preparing", completed: end, total: height });
  }
  checkAbort(signal);
  const bandXml = bands
    .map((index, i) => {
      const band = metadata.bands[index];
      return `<VRTRasterBand dataType="Float64" band="${i + 1}" subClass="VRTRawRasterBand"><Description>${xml(band.name)}</Description><NoDataValue>nan</NoDataValue>${band.units ? `<UnitType>${xml(band.units)}</UnitType>` : ""}<SourceFilename relativeToVRT="1">slice.band${i}.bin</SourceFilename><ImageOffset>0</ImageOffset><PixelOffset>8</PixelOffset><LineOffset>${width * 8}</LineOffset><ByteOrder>LSB</ByteOrder></VRTRasterBand>`;
    })
    .join("");
  // 共用 slice 前缀使 gdal3.js 只打开 VRT，所有原始波段仍挂载在同一个 WORKERFS。
  const vrt = `<VRTDataset rasterXSize="${width}" rasterYSize="${height}"><SRS dataAxisToSRSAxisMapping="${grid || metadata.crs.epsg === 4326 ? "2,1" : "1,2"}">${projection}</SRS><GeoTransform>${transform.join(",")}</GeoTransform><Metadata><MDI key="AREA_OR_POINT">${grid || metadata.pixelInterpretation === "area" ? "Area" : "Point"}</MDI></Metadata>${bandXml}</VRTDataset>`;
  return [
    new File([vrt], "slice.vrt"),
    ...parts.map((chunks, i) => new File(chunks, `slice.band${i}.bin`)),
  ];
}

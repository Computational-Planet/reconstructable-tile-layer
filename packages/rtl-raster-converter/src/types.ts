import type { RasterBounds, RasterSource, RasterTransform } from "rtl-raster-source";

export type ProvenanceValue =
  | null
  | boolean
  | number
  | string
  | readonly ProvenanceValue[]
  | { readonly [key: string]: ProvenanceValue };

/** Static gdal3.js 2.8.1 assets, hosted by the application. No default CDN requests. */
export interface RasterConverterAssets {
  readonly js: string | URL;
  readonly wasm: string | URL;
  readonly data: string | URL;
}

export interface RasterConverterOptions {
  readonly assets: RasterConverterAssets;
  /** Override Worker creation for CSP or a custom static asset layout; use a classic Worker. */
  readonly workerFactory?: () => Worker;
  /** Bounds input/working-buffer estimates, not total WASM/GPU/browser memory. Default 256 MiB. */
  readonly memoryBudgetBytes?: number;
  /** Terminates a stalled Worker; excludes reading the selected source slice. Default 180000. */
  readonly workerTimeoutMs?: number;
}

/** Explicit regular geographic pixel-AREA grid for a scientific source. */
export interface GeographicExportGrid {
  readonly bounds: RasterBounds;
  readonly width: number;
  readonly height: number;
  readonly resampling: "nearest";
}

/** GDAL reprojection with an explicit target size so work can be budgeted before allocation. */
export interface RasterReprojection {
  readonly epsg: 4326 | 3857;
  /** Pixel-edge bounds in target CRS units; antimeridian crossing uses east > 180, not east < west. */
  readonly bounds: RasterBounds;
  readonly width: number;
  readonly height: number;
  readonly resampling: "nearest" | "bilinear" | "cubic";
}

export interface RasterConversionProgress {
  readonly stage:
    | "preparing"
    | "loading-engine"
    | "opening"
    | "reprojecting"
    | "converting"
    | "reading-output"
    | "done";
  /** Present only for work with a known row count, never a fabricated GDAL percentage. */
  readonly completed?: number;
  readonly total?: number;
}

export interface ToCOGOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RasterConversionProgress) => void;
  readonly filename?: string;
  readonly compression?: "DEFLATE" | "LZW" | "NONE";
  readonly overviewResampling?: "nearest" | "average" | "mode";
  readonly blockSize?: 128 | 256 | 512;
  /** Source input only. Select zero-based bands; raw values become Float64 physical values. */
  readonly bands?: readonly number[];
  /** Required when source.transform is null (including NetCDF rectilinear grids). */
  readonly grid?: GeographicExportGrid;
  readonly reproject?: RasterReprojection;
  /** Explicit TIFF georeference/override; north-up transform in pixel-corner convention. */
  readonly georeference?: { readonly epsg: number; readonly transform: RasterTransform };
  /** Application scientific context, e.g. coordinate epoch/model/experiment/source DOI. */
  readonly provenance?: { readonly [key: string]: ProvenanceValue };
}

export interface ConvertedRasterMetadata {
  readonly width: number;
  readonly height: number;
  readonly projectionWkt: string;
  readonly transform: RasterTransform;
  readonly bands: readonly {
    readonly dataType: string;
    readonly noData?: number | string;
    readonly units?: string;
    readonly scale?: number;
    readonly offset?: number;
    readonly overviews: readonly { readonly width: number; readonly height: number }[];
  }[];
  readonly layout?: string;
}

export interface RasterConversionResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly metadata: ConvertedRasterMetadata;
  /** Save alongside the COG: source metadata, selected slice, processing and supplied scientific context. */
  readonly provenanceBlob: Blob;
  readonly provenanceFilename: string;
  readonly diagnostics: readonly string[];
}

export interface RasterConverter {
  readonly disposed: boolean;
  readonly busy: boolean;
  /** One job at a time. Sources are borrowed and never closed by the converter. */
  toCOG(input: Blob | RasterSource, options?: ToCOGOptions): Promise<RasterConversionResult>;
  /** Idempotent; cancels the active job, terminates its Worker and releases its virtual filesystem. */
  dispose(): void;
}

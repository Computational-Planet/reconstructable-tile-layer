/** Numeric samples are kept separate from display colors. Band indices are zero based. */
export type RasterArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

/** GDAL order; maps pixel CORNERS to native coordinates. */
export type RasterTransform = readonly [number, number, number, number, number, number];
/** [west, south, east, north], in the declared CRS, not necessarily degrees. */
export type RasterBounds = readonly [number, number, number, number];
/** [left, top, right, bottom], integer pixel edges, exclusive right/bottom. */
export type RasterWindow = readonly [number, number, number, number];

export interface RasterBandMetadata {
  readonly name: string;
  readonly dataType: string;
  readonly noData: readonly number[];
  /** Physical value = raw sample * scale + offset; NoData is checked first. */
  readonly scale: number;
  readonly offset: number;
  /** Inclusive limits in stored units, applied before scale/offset. */
  readonly validRange?: readonly [number, number];
  readonly units?: string;
  readonly colorInterpretation?: "gray" | "red" | "green" | "blue" | "alpha";
}

export interface RasterMetadata {
  readonly format: "geotiff" | "netcdf3" | "netcdf4";
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly crs: { readonly epsg: number; readonly verticalEpsg?: number };
  /** Null for rectilinear scientific grids; use coordinates instead. */
  readonly transform: RasterTransform | null;
  /** Original sample centers and order, including nonuniform Gaussian latitude. */
  readonly coordinates?: {
    readonly x: readonly number[];
    readonly y: readonly number[];
    readonly periodicX: boolean;
  };
  readonly bounds: RasterBounds;
  readonly pixelInterpretation: "area" | "point";
  readonly bands: readonly RasterBandMetadata[];
  readonly overviews: readonly { readonly width: number; readonly height: number }[];
  readonly warnings?: readonly string[];
  readonly slice?: {
    readonly variable: string;
    readonly indices: Readonly<Record<string, number>>;
    readonly dimensions?: readonly string[];
    readonly attributes?: Readonly<Record<string, string | number | readonly (string | number)[]>>;
    /** Original global attributes, including dataset/model/experiment/history when supplied. */
    readonly datasetAttributes?: Readonly<
      Record<string, string | number | readonly (string | number)[]>
    >;
    /** Selected non-spatial coordinates; raw values, units/calendar remain separate from geological age. */
    readonly selections?: readonly {
      readonly dimension: string;
      readonly index: number;
      readonly coordinate?: {
        readonly name: string;
        readonly rawValue?: number;
        readonly attributes: Readonly<
          Record<string, string | number | readonly (string | number)[]>
        >;
      };
    }[];
  };
}

export interface RasterReadOptions {
  readonly window: RasterWindow;
  readonly bands?: readonly number[];
  /** Defaults to the window size. Smaller sizes permit use of overviews. */
  readonly width?: number;
  readonly height?: number;
  /** Absolute original-grid indices in output order; permits longitude wrapping. */
  readonly sampleColumns?: readonly number[];
  readonly sampleRows?: readonly number[];
  readonly signal?: AbortSignal;
}

export interface RasterReadResult {
  readonly width: number;
  readonly height: number;
  readonly window: RasterWindow;
  /** Independent, caller-owned arrays in the requested band order. Raw values, row major. */
  readonly bands: readonly RasterArray[];
}

export interface RasterSource {
  readonly metadata: RasterMetadata;
  readonly closed: boolean;
  readWindow(options: RasterReadOptions): Promise<RasterReadResult>;
  /** Idempotent. Aborts outstanding reads and releases decoder workers. */
  close(): void;
}

export interface OpenRasterOptions {
  readonly signal?: AbortSignal;
  /** Working-buffer estimate per serialized read, not a browser-wide memory guarantee. */
  readonly memoryBudgetBytes?: number;
  /** GeoTIFF decoding workers; 0 explicitly opts into decoding on the calling thread. */
  readonly decoderWorkers?: number;
}

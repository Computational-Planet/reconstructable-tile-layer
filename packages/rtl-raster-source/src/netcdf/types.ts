import type { OpenRasterOptions, RasterArray, RasterSource } from "../types.js";

export type NetCDFAttribute = string | number | readonly (string | number)[];
export type NetCDFAttributes = Readonly<Record<string, NetCDFAttribute>>;

export interface NetCDFVariable {
  /** Group-qualified name without a leading slash. */
  readonly name: string;
  readonly dimensions: readonly string[];
  readonly shape: readonly number[];
  readonly dataType: string;
  readonly attributes: NetCDFAttributes;
}

export interface NetCDFMetadata {
  readonly format: "netcdf3" | "netcdf4";
  readonly name?: string;
  readonly attributes: NetCDFAttributes;
  readonly variables: readonly NetCDFVariable[];
}

export interface NetCDFSliceOptions {
  readonly variable: string;
  /** Original zero-based indices of every non-spatial dimension; singletons default to 0. */
  readonly indices?: Readonly<Record<string, number>>;
  readonly signal?: AbortSignal;
}

/** CF axis relationships, without reading samples or inferring geological ages. */
export interface NetCDFSliceLayout {
  readonly variable: NetCDFVariable;
  readonly longitude: NetCDFVariable;
  readonly latitude: NetCDFVariable;
  readonly selectors: readonly {
    readonly dimension: string;
    readonly size: number;
    readonly coordinate?: NetCDFVariable;
  }[];
  readonly warnings: readonly string[];
}

export interface OpenNetCDFOptions extends Pick<OpenRasterOptions, "signal" | "memoryBudgetBytes"> {
  /** Override asset hosting, e.g. () => new Worker(new URL(...), {type: "module"}). */
  readonly workerFactory?: () => Worker;
}

export interface NetCDFDataset {
  readonly metadata: NetCDFMetadata;
  readonly closed: boolean;
  /** Discovers spatial axes and selectable time/depth/etc. dimensions using the same CF rules as selectSlice. */
  describeVariable(variable: string): NetCDFSliceLayout;
  /** A slice borrows the dataset. Closing it does not close other slices. */
  selectSlice(options: NetCDFSliceOptions): Promise<RasterSource>;
  /** Raw one-dimensional coordinates. Inspect units/calendar and apply CF scaling explicitly. */
  readCoordinate(
    variable: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<RasterArray>;
  /** Terminates the worker and invalidates every borrowed slice. Idempotent. */
  close(): void;
}

export interface SlabRequest {
  variable: string;
  starts: number[];
  counts: number[];
}

export interface GridReadRequest {
  variable: string;
  indices: number[];
  xDimension: number;
  yDimension: number;
  columns: number[];
  rows: number[];
}

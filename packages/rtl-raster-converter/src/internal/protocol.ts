import type {
  ConvertedRasterMetadata,
  RasterConversionProgress,
  RasterReprojection,
  ToCOGOptions,
} from "../types.js";
import type { RasterConversionErrorCode } from "../errors.js";

export interface ConversionJob {
  readonly files: readonly File[];
  readonly assets: { readonly js: string; readonly wasm: string; readonly data: string };
  readonly memoryBudgetBytes: number;
  readonly compression: string;
  readonly overviewResampling: string;
  readonly blockSize: number;
  readonly georeference?: ToCOGOptions["georeference"];
  readonly reproject?: RasterReprojection;
}

export type WorkerReply =
  | { readonly progress: RasterConversionProgress }
  | { readonly error: { readonly code: RasterConversionErrorCode; readonly message: string } }
  | {
      readonly result: {
        readonly bytes: Uint8Array;
        readonly metadata: ConvertedRasterMetadata;
        readonly diagnostics: readonly string[];
      };
    };

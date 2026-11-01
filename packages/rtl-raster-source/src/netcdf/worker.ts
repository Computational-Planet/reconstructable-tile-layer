import { RasterError } from "../errors.js";
import type { RasterArray } from "../types.js";
import { checkBudget } from "../validation.js";
import { openClassic } from "./classic.js";
import { arrayConstructor, unsignedType } from "./numeric.js";
import type { GridReadRequest, NetCDFMetadata, SlabRequest } from "./types.js";

type Engine = { metadata: NetCDFMetadata; read(request: SlabRequest): Promise<RasterArray> };
let engine: Engine | undefined;
let budget = 0;
let queue: Promise<unknown> = Promise.resolve();

function validateSlab(request: SlabRequest) {
  const variable = engine!.metadata.variables.find((v) => v.name === request.variable);
  if (
    !variable ||
    request.starts.length !== variable.shape.length ||
    request.counts.length !== variable.shape.length ||
    request.starts.some(
      (start, d) =>
        !Number.isSafeInteger(start) ||
        start < 0 ||
        !Number.isSafeInteger(request.counts[d]) ||
        request.counts[d] <= 0 ||
        start + request.counts[d] > variable.shape[d],
    )
  )
    throw new RasterError("invalid-metadata", "Invalid NetCDF hyperslab selection.");
}

async function readSlab(request: SlabRequest) {
  validateSlab(request);
  return engine!.read(request);
}

async function readGrid(request: GridReadRequest) {
  const variable = engine!.metadata.variables.find((v) => v.name === request.variable)!;
  const Constructor = arrayConstructor(unsignedType(variable));
  const output = new Constructor(request.rows.length * request.columns.length);
  let left = Infinity;
  let right = -Infinity;
  for (const column of request.columns) {
    left = Math.min(left, column);
    right = Math.max(right, column);
  }
  checkBudget(output.byteLength + (right - left + 1) * Constructor.BYTES_PER_ELEMENT * 3, budget);
  let previousRow = -1;
  let raw: RasterArray | undefined;
  // 只展开选定行，保持原始维度序；重复采样行复用工作缓冲区。
  for (let row = 0; row < request.rows.length; row++) {
    if (request.rows[row] !== previousRow) {
      const starts = [...request.indices];
      const counts = variable.shape.map(() => 1);
      starts[request.xDimension] = left;
      starts[request.yDimension] = request.rows[row];
      counts[request.xDimension] = right - left + 1;
      raw = await readSlab({ variable: variable.name, starts, counts });
      previousRow = request.rows[row];
    }
    for (let column = 0; column < request.columns.length; column++)
      output[row * request.columns.length + column] = raw![request.columns[column] - left];
  }
  return output;
}

globalThis.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      let result: NetCDFMetadata | RasterArray;
      if (data.kind === "open") {
        budget = data.budget;
        const file: Blob = data.file;
        const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (
          signature[0] === 67 &&
          signature[1] === 68 &&
          signature[2] === 70 &&
          [1, 2].includes(signature[3])
        )
          engine = await openClassic(file, budget);
        else if ([137, 72, 68, 70, 13, 10, 26, 10].every((value, i) => signature[i] === value))
          engine = await (await import("./hdf.js")).openHDF(file, budget);
        else
          throw new RasterError(
            "unsupported-format",
            "Expected NetCDF3 CDF-1/CDF-2 or NetCDF4/HDF5. CDF-5 is not supported.",
          );
        result = { ...engine.metadata, name: "name" in file ? String(file.name) : undefined };
      } else if (!engine) throw new RasterError("closed", "NetCDF dataset is not open.");
      else if (data.kind === "slab") result = await readSlab(data.request);
      else if (data.kind === "grid") result = await readGrid(data.request);
      else throw new RasterError("invalid-metadata", "Unknown NetCDF worker operation.");
      globalThis.postMessage(
        { id: data.id, result },
        { transfer: ArrayBuffer.isView(result) ? [result.buffer as ArrayBuffer] : [] },
      );
    } catch (error) {
      globalThis.postMessage({
        id: data.id,
        error: {
          code: error instanceof RasterError ? error.code : "invalid-metadata",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
};

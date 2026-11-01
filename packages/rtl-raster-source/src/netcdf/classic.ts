import { NetCDFReader } from "netcdfjs";
import { RasterError } from "../errors.js";
import { checkBudget } from "../validation.js";
import { arrayConstructor, normalizeAttributes } from "./numeric.js";
import type { NetCDFMetadata, SlabRequest } from "./types.js";

const typeNames: Record<string, string> = {
  byte: "int8",
  char: "char",
  short: "int16",
  int: "int32",
  float: "float32",
  double: "float64",
};

/** Parses only a bounded header; data are fetched from Blob ranges rather than a whole-file array. */
export async function openClassic(file: Blob, budget: number) {
  let reader: NetCDFReader | undefined;
  const limit = Math.min(file.size, budget / 4, 8 * 1024 * 1024);
  for (let length = Math.min(limit, 65536); ; ) {
    try {
      reader = new NetCDFReader(await file.slice(0, length).arrayBuffer());
      break;
    } catch (error) {
      if (error instanceof Error && error.message.includes("offsets larger than 4GB"))
        throw new RasterError(
          "unsupported-format",
          "This NetCDF3 reader supports CDF-2 only when variable offsets fit in 32 bits.",
        );
      if (length >= limit)
        throw new RasterError(
          "invalid-metadata",
          `Cannot parse NetCDF3 header within ${limit} bytes: ${String(error)}`,
        );
      length = Math.min(limit, length * 2);
    }
  }
  const parsed = reader;
  const metadata: NetCDFMetadata = {
    format: "netcdf3",
    attributes: normalizeAttributes(parsed.globalAttributes.map((a) => [a.name, a.value])),
    variables: parsed.variables.map((v) => ({
      name: v.name,
      dataType: typeNames[v.type] ?? v.type,
      dimensions: v.dimensions.map((d) => parsed.dimensions[d].name),
      shape: v.dimensions.map((d) =>
        d === parsed.recordDimension.id ? parsed.recordDimension.length : parsed.dimensions[d].size,
      ),
      attributes: normalizeAttributes(
        (v.attributes as { name: string; value: unknown }[]).map((a) => [a.name, a.value]),
      ),
    })),
  };
  const recordVariables = parsed.variables.filter((v) => v.record);
  const onlyRecord = recordVariables[0];
  const recordStride =
    recordVariables.length === 1
      ? metadata.variables
          .find((v) => v.name === onlyRecord.name)!
          .shape.slice(1)
          .reduce((a, b) => a * b, 1) *
        (onlyRecord.type === "char"
          ? 1
          : arrayConstructor(typeNames[onlyRecord.type]).BYTES_PER_ELEMENT)
      : (parsed.recordDimension.recordStep ?? 0);
  const blockSize = Math.max(8, Math.floor(Math.min(1024 * 1024, budget / 16) / 8) * 8);
  let cachedStart = -1;
  let cached = new DataView(new ArrayBuffer(0));
  async function sample(offset: number, type: string): Promise<number> {
    const size = arrayConstructor(type).BYTES_PER_ELEMENT;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + size > file.size)
      throw new RasterError("invalid-metadata", "NetCDF sample offset is outside the file.");
    if (offset < cachedStart || offset + size > cachedStart + cached.byteLength) {
      cachedStart = Math.floor(offset / blockSize) * blockSize;
      cached = new DataView(
        await file
          .slice(cachedStart, Math.min(file.size, cachedStart + blockSize + 8))
          .arrayBuffer(),
      );
    }
    const i = offset - cachedStart;
    switch (type) {
      case "int8":
        return cached.getInt8(i);
      case "int16":
        return cached.getInt16(i, false);
      case "int32":
        return cached.getInt32(i, false);
      case "float32":
        return cached.getFloat32(i, false);
      case "float64":
        return cached.getFloat64(i, false);
      default:
        throw new RasterError("unsupported-format", `Unsupported NetCDF3 type ${type}.`);
    }
  }
  return {
    metadata,
    async read(request: SlabRequest) {
      const position = metadata.variables.findIndex((v) => v.name === request.variable);
      const variable = metadata.variables[position];
      const entry = parsed.variables[position];
      if (!variable)
        throw new RasterError("invalid-metadata", `Unknown variable ${request.variable}.`);
      const Constructor = arrayConstructor(variable.dataType);
      const length = request.counts.reduce((a, b) => a * b, 1);
      checkBudget(length * Constructor.BYTES_PER_ELEMENT + blockSize + 8, budget);
      const output = new Constructor(length);
      const strides = variable.shape.map(
        (_, i) =>
          variable.shape.slice(i + 1).reduce((a, b) => a * b, 1) * Constructor.BYTES_PER_ELEMENT,
      );
      if (entry.record) strides[0] = recordStride;
      for (let index = 0; index < length; index++) {
        let remaining = index;
        let offset = entry.offset;
        for (let d = request.counts.length - 1; d >= 0; d--) {
          offset += (request.starts[d] + (remaining % request.counts[d])) * strides[d];
          remaining = Math.floor(remaining / request.counts[d]);
        }
        output[index] = await sample(offset, variable.dataType);
      }
      return output;
    },
  };
}

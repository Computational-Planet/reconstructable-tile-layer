import { RasterError } from "../errors.js";
import type { RasterArray, RasterBandMetadata } from "../types.js";
import type { NetCDFAttributes, NetCDFVariable } from "./types.js";

export const constructors = {
  int8: Int8Array,
  uint8: Uint8Array,
  int16: Int16Array,
  uint16: Uint16Array,
  int32: Int32Array,
  uint32: Uint32Array,
  float32: Float32Array,
  float64: Float64Array,
} as const;

export function arrayConstructor(dataType: string): {
  new (length: number): RasterArray;
  readonly BYTES_PER_ELEMENT: number;
} {
  const constructor = constructors[dataType as keyof typeof constructors];
  if (!constructor)
    throw new RasterError(
      "unsupported-format",
      `Unsupported numeric type ${dataType}; strings, compounds and 64-bit integers are not raster samples.`,
    );
  return constructor;
}

export function numbers(value: NetCDFAttributes[string] | undefined): number[] {
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(Number);
}

export function scalar(attributes: NetCDFAttributes, name: string, fallback: number): number {
  if (attributes[name] === undefined) return fallback;
  const values = numbers(attributes[name]);
  if (values.length !== 1 || !Number.isFinite(values[0]))
    throw new RasterError("invalid-metadata", `${name} must be one finite number.`);
  return values[0];
}

export function unsignedType(variable: NetCDFVariable): string {
  return String(variable.attributes._Unsigned).toLowerCase() === "true" &&
    /^int(8|16|32)$/.test(variable.dataType)
    ? `u${variable.dataType}`
    : variable.dataType;
}

export function bandMetadata(variable: NetCDFVariable): RasterBandMetadata {
  arrayConstructor(variable.dataType);
  const { attributes } = variable;
  const dataType = unsignedType(variable);
  const unsigned = (value: number) =>
    dataType !== variable.dataType && value < 0 ? value + 2 ** Number(dataType.slice(4)) : value;
  const defaultFill: Record<string, number> = {
    int8: -127,
    uint8: 255,
    int16: -32767,
    uint16: 65535,
    int32: -2147483647,
    uint32: 4294967295,
    float32: 9.969209968386869e36,
    float64: 9.969209968386869e36,
  };
  const noData = [
    ...numbers(attributes._FillValue ?? defaultFill[variable.dataType]),
    ...numbers(attributes.missing_value),
  ].map(unsigned);
  const range = numbers(attributes.valid_range).map(unsigned);
  const minimum =
    range[0] ??
    (attributes.valid_min === undefined
      ? -Infinity
      : unsigned(scalar(attributes, "valid_min", -Infinity)));
  const maximum =
    range[1] ??
    (attributes.valid_max === undefined
      ? Infinity
      : unsigned(scalar(attributes, "valid_max", Infinity)));
  if ((range.length !== 0 && range.length !== 2) || minimum > maximum)
    throw new RasterError("invalid-metadata", "Invalid CF valid_range.");
  return {
    name: variable.name,
    dataType,
    noData,
    scale: scalar(attributes, "scale_factor", 1),
    offset: scalar(attributes, "add_offset", 0),
    validRange: [minimum, maximum],
    units: attributes.units === undefined ? undefined : String(attributes.units),
  };
}

export function normalizeAttributes(entries: Iterable<[string, unknown]>): NetCDFAttributes {
  const result: Record<string, string | number | (string | number)[]> = Object.create(null);
  for (const [key, value] of entries) {
    if (typeof value === "number" || typeof value === "string") result[key] = value;
    else if (typeof value === "bigint") result[key] = String(value);
    else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const values = Array.from(value as ArrayLike<unknown>);
      if (values.every((item) => ["number", "string", "bigint"].includes(typeof item)))
        result[key] = values.map((item) =>
          typeof item === "bigint" ? String(item) : (item as number | string),
        );
    }
  }
  return result;
}

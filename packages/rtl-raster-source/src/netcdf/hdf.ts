import type { Dataset, Group } from "h5wasm";
import { RasterError } from "../errors.js";
import type { RasterArray } from "../types.js";
import { checkBudget } from "../validation.js";
import { arrayConstructor, normalizeAttributes } from "./numeric.js";
import type { NetCDFMetadata, NetCDFVariable, SlabRequest } from "./types.js";

/** This module (and its embedded WASM) is loaded only inside a NetCDF4 worker. */
export async function openHDF(file: Blob, budget: number) {
  const engine = await import("h5wasm");
  const { FS } = await engine.ready;
  FS.mkdir("/raster-input");
  // WORKERFS synchronously reads Blob slices; the original file is not copied into MEMFS.
  FS.mount(FS.filesystems.WORKERFS, { files: [new File([file], "input.nc")] }, "/raster-input");
  const handle = new engine.File("/raster-input/input.nc", "r");
  const datasets = new Map<string, Dataset>();
  const variables: NetCDFVariable[] = [];
  const skipped = new Set(["DIMENSION_LIST", "REFERENCE_LIST"]);
  let attributeBytes = 0;
  function attributes(entity: Group | Dataset) {
    const values: [string, unknown][] = [];
    for (const [key, attribute] of Object.entries(entity.attrs)) {
      if (skipped.has(key)) continue;
      const count = attribute.shape?.reduce((a, b) => a * b, 1) ?? 1;
      attributeBytes += count * 16;
      checkBudget(attributeBytes, Math.floor(budget / 4));
      values.push([key, attribute.value]);
    }
    return normalizeAttributes(values);
  }
  function visit(group: Group, prefix: string, depth: number) {
    if (depth > 32)
      throw new RasterError("resource-limit", "NetCDF group nesting exceeds 32 levels.");
    for (const key of group.keys()) {
      const name = prefix ? `${prefix}/${key}` : key;
      const entry = group.get(key);
      if (entry instanceof engine.Group) visit(entry, name, depth + 1);
      else if (entry instanceof engine.Dataset) {
        if (variables.length >= 4096)
          throw new RasterError("resource-limit", "NetCDF contains too many variables.");
        const shape = entry.shape ?? [];
        const storage = entry.metadata;
        const dataType =
          storage.type === 0
            ? `${storage.signed ? "int" : "uint"}${storage.size * 8}`
            : storage.type === 1
              ? `float${storage.size * 8}`
              : String(entry.dtype);
        const dimensions = shape.map((_, index) => {
          const scales = entry.get_attached_scales(index);
          if (scales.length > 1)
            throw new RasterError(
              "unsupported-grid",
              `${name} has multiple scales on dimension ${index}.`,
            );
          return scales.length
            ? scales[0].replace(/^\//, "")
            : shape.length === 1 && entry.get_scale_name() !== null
              ? name
              : `${name}:dim${index}`;
        });
        variables.push({ name, shape, dimensions, dataType, attributes: attributes(entry) });
        datasets.set(name, entry);
      }
    }
  }
  const globalAttributes = attributes(handle);
  visit(handle, "", 0);
  if (!variables.some((v) => v.dimensions.some((d) => !d.includes(":dim"))))
    throw new RasterError(
      "unsupported-format",
      "HDF5 input does not declare NetCDF dimension scales.",
    );
  const metadata: NetCDFMetadata = { format: "netcdf4", attributes: globalAttributes, variables };
  return {
    metadata,
    async read(request: SlabRequest): Promise<RasterArray> {
      const dataset = datasets.get(request.variable);
      const variable = variables.find((v) => v.name === request.variable);
      if (!dataset || !variable)
        throw new RasterError("invalid-metadata", `Unknown variable ${request.variable}.`);
      const Constructor = arrayConstructor(variable.dataType);
      const chunkBytes =
        (dataset.metadata.chunks?.reduce((a, b) => a * b, 1) ?? 0) * Constructor.BYTES_PER_ELEMENT;
      checkBudget(
        (request.counts.reduce((a, b) => a * b, 1) * Constructor.BYTES_PER_ELEMENT + chunkBytes) *
          3,
        budget,
      );
      const result = dataset.slice(
        request.starts.map((start, i) => [start, start + request.counts[i]]),
      );
      if (!(result instanceof Constructor))
        throw new RasterError(
          "unsupported-format",
          `Cannot read ${variable.name} as ${variable.dataType}.`,
        );
      return result;
    },
  };
}

import { RasterError } from "../errors.js";
import { toPhysicalValue } from "../spatial.js";
import type { RasterArray, RasterMetadata } from "../types.js";
import { freezeMetadata } from "../validation.js";
import { bandMetadata } from "./numeric.js";
import type {
  NetCDFMetadata,
  NetCDFSliceLayout,
  NetCDFSliceOptions,
  NetCDFVariable,
  SlabRequest,
} from "./types.js";

function axisKind(variable: NetCDFVariable): "x" | "y" | undefined {
  const name = String(variable.attributes.standard_name ?? "").toLowerCase();
  const units = String(variable.attributes.units ?? "")
    .toLowerCase()
    .replace(/[_\s]/g, "");
  if (name === "grid_longitude" || name === "grid_latitude")
    throw new RasterError("unsupported-grid", "Rotated-pole coordinates require reprojection.");
  if (/^degrees?e(ast)?$/.test(units) || (name === "longitude" && /^degrees?$/.test(units)))
    return "x";
  if (/^degrees?n(orth)?$/.test(units) || (name === "latitude" && /^degrees?$/.test(units)))
    return "y";
  return undefined;
}

function resolveReference(
  metadata: NetCDFMetadata,
  variable: NetCDFVariable,
  reference: string,
): NetCDFVariable | undefined {
  if (reference.startsWith("/"))
    return metadata.variables.find((v) => v.name === reference.slice(1));
  let path = variable.name.split("/").slice(0, -1);
  for (;;) {
    const candidate = [...path, reference].join("/");
    const found = metadata.variables.find((v) => v.name === candidate);
    if (found || !path.length) return found;
    path = path.slice(0, -1);
  }
}

export function describeVariable(metadata: NetCDFMetadata, name: string): NetCDFSliceLayout {
  const variable = metadata.variables.find((v) => v.name === name);
  if (!variable) throw new RasterError("invalid-metadata", `Unknown variable ${name}.`);
  const warnings: string[] = [];
  const referenced = String(variable.attributes.coordinates ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => {
      const coordinate = resolveReference(metadata, variable, name);
      if (!coordinate)
        warnings.push(
          `Referenced coordinate ${name} is absent. Spatial axes were resolved from existing coordinate variables.`,
        );
      return coordinate;
    })
    .filter((v): v is NetCDFVariable => !!v);
  const candidates = [
    ...new Set([
      ...referenced,
      ...variable.dimensions
        .map((d) => metadata.variables.find((v) => v.name === d))
        .filter((v): v is NetCDFVariable => !!v),
    ]),
  ];
  const axes: Partial<Record<"x" | "y", NetCDFVariable>> = {};
  for (const candidate of candidates) {
    const kind = axisKind(candidate);
    if (!kind) continue;
    if (candidate.dimensions.length !== 1 || !variable.dimensions.includes(candidate.dimensions[0]))
      throw new RasterError(
        "unsupported-grid",
        "Only one-dimensional longitude and latitude coordinates are supported; curvilinear and unstructured grids need regridding.",
      );
    if (axes[kind] && axes[kind] !== candidate)
      throw new RasterError("unsupported-grid", `Ambiguous ${kind} coordinate variables.`);
    axes[kind] = candidate;
  }
  if (!axes.x || !axes.y || axes.x.dimensions[0] === axes.y.dimensions[0])
    throw new RasterError(
      "unsupported-grid",
      "Cannot identify distinct CF/COARDS one-dimensional longitude and latitude axes from units and dimension relationships.",
    );
  if (variable.attributes.grid_mapping) {
    const mapping = resolveReference(metadata, variable, String(variable.attributes.grid_mapping));
    if (!mapping || mapping.attributes.grid_mapping_name !== "latitude_longitude")
      throw new RasterError("unsupported-crs", "This NetCDF grid mapping requires reprojection.");
  }
  return {
    variable,
    longitude: axes.x,
    latitude: axes.y,
    selectors: variable.dimensions.flatMap((dimension, index) =>
      dimension === axes.x!.dimensions[0] || dimension === axes.y!.dimensions[0]
        ? []
        : [
            {
              dimension,
              size: variable.shape[index],
              coordinate: candidates.find(
                (v) => v.dimensions.length === 1 && v.dimensions[0] === dimension,
              ),
            },
          ],
    ),
    warnings,
  };
}

export async function describeSlice(
  metadata: NetCDFMetadata,
  options: NetCDFSliceOptions,
  read: (request: SlabRequest) => Promise<RasterArray>,
) {
  const layout = describeVariable(metadata, options.variable);
  const { variable } = layout;
  const band = bandMetadata(variable);
  const warnings = [...layout.warnings];
  const axes = { x: layout.longitude, y: layout.latitude };
  const xDimension = variable.dimensions.indexOf(axes.x.dimensions[0]);
  const yDimension = variable.dimensions.indexOf(axes.y.dimensions[0]);
  const selected: Record<string, number> = Object.create(null);
  for (const dimension of Object.keys(options.indices ?? {})) {
    if (
      !variable.dimensions.includes(dimension) ||
      [axes.x.dimensions[0], axes.y.dimensions[0]].includes(dimension)
    )
      throw new RangeError(`Cannot select non-spatial dimension ${dimension}.`);
  }
  const indices = variable.shape.map((size, dimension) => {
    if (dimension === xDimension || dimension === yDimension) return 0;
    const name = variable.dimensions[dimension];
    const index = options.indices?.[name] ?? (size === 1 ? 0 : undefined);
    if (index === undefined || !Number.isSafeInteger(index) || index < 0 || index >= size)
      throw new RangeError(`Select an index for dimension ${name} (0–${size - 1}).`);
    selected[name] = index;
    return index;
  });
  async function coordinate(axis: NetCDFVariable) {
    const raw = await read({ variable: axis.name, starts: [0], counts: [axis.shape[0]] });
    const conversion = bandMetadata(axis);
    const values = Array.from(raw, (value) => toPhysicalValue(value, conversion));
    if (values.length < 2 || !values.every(Number.isFinite))
      throw new RasterError(
        "unsupported-grid",
        `${axis.name} must contain at least two finite coordinate centers.`,
      );
    const direction = Math.sign(values[1] - values[0]);
    if (
      direction === 0 ||
      values.some((value, i) => i > 0 && Math.sign(value - values[i - 1]) !== direction)
    )
      throw new RasterError(
        "unsupported-grid",
        `${axis.name} must be strictly monotonic; reorder wrapped or duplicate coordinates first.`,
      );
    let low = Math.min(
      values[0] - (values[1] - values[0]) / 2,
      values[values.length - 1] + (values[values.length - 1] - values[values.length - 2]) / 2,
    );
    let high = Math.max(
      values[0] - (values[1] - values[0]) / 2,
      values[values.length - 1] + (values[values.length - 1] - values[values.length - 2]) / 2,
    );
    if (axis.attributes.bounds) {
      const bounds = resolveReference(metadata, axis, String(axis.attributes.bounds));
      if (
        !bounds ||
        bounds.shape.length !== 2 ||
        bounds.shape[0] !== values.length ||
        bounds.shape[1] !== 2 ||
        bounds.dimensions[0] !== axis.dimensions[0]
      )
        throw new RasterError(
          "invalid-metadata",
          `${axis.name} has unsupported coordinate bounds.`,
        );
      const rawBounds = await read({
        variable: bounds.name,
        starts: [0, 0],
        counts: [...bounds.shape],
      });
      const boundsBand = bandMetadata(bounds);
      low = Infinity;
      high = -Infinity;
      for (let i = 0; i < values.length; i++) {
        const a = toPhysicalValue(rawBounds[2 * i], boundsBand);
        const b = toPhysicalValue(rawBounds[2 * i + 1], boundsBand);
        if (
          ![a, b].every(Number.isFinite) ||
          values[i] < Math.min(a, b) - 1e-6 ||
          values[i] > Math.max(a, b) + 1e-6
        )
          throw new RasterError(
            "invalid-metadata",
            `${axis.name} bounds do not contain their coordinate centers.`,
          );
        low = Math.min(low, a, b);
        high = Math.max(high, a, b);
      }
    }
    return { values, low, high };
  }
  const x = await coordinate(axes.x);
  const y = await coordinate(axes.y);
  const selections = [];
  for (const selector of layout.selectors) {
    const index = selected[selector.dimension];
    const axis = selector.coordinate;
    // 只读取所选坐标的一个标量；保留原单位/历法，不把模型时间解释为地质年龄。
    const raw =
      axis && !/char|string/i.test(axis.dataType)
        ? await read({ variable: axis.name, starts: [index], counts: [1] })
        : undefined;
    selections.push({
      dimension: selector.dimension,
      index,
      coordinate: axis
        ? { name: axis.name, rawValue: raw?.[0], attributes: axis.attributes }
        : undefined,
    });
  }
  if (
    y.values.some((v) => v < -90 - 1e-6 || v > 90 + 1e-6) ||
    x.high - x.low > 360 + Math.abs(x.values[1] - x.values[0]) + 1e-6
  )
    throw new RasterError(
      "unsupported-grid",
      "Coordinate extents do not describe a geographic rectilinear grid.",
    );
  // 元数据保留原始数组方向；显示边界可以裁到两极，但不能拉伸高斯纬度或改写原始像元索引。
  const rasterMetadata: RasterMetadata = freezeMetadata({
    format: metadata.format,
    name: metadata.name,
    width: x.values.length,
    height: y.values.length,
    crs: { epsg: 4326 },
    transform: null,
    bounds: [x.low, y.low, x.high, y.high],
    coordinates: { x: x.values, y: y.values, periodicX: x.high - x.low >= 360 - 1e-5 },
    pixelInterpretation: "point",
    bands: [band],
    overviews: [],
    warnings,
    slice: {
      variable: variable.name,
      indices: selected,
      dimensions: variable.dimensions,
      attributes: variable.attributes,
      datasetAttributes: metadata.attributes,
      selections,
    },
  });
  return { metadata: rasterMetadata, xDimension, yDimension, indices };
}

export type GeoJsonDocument = Record<string, unknown> & { type: string };
export interface GeoJsonSummary {
  features: number;
  geometries: number;
  positions: number;
  geometryTypes: string[];
}
export interface LocalGeoJsonDescriptor {
  schemaVersion: 1;
  file: { name: string; size: number; lastModified: number; requiresReselect: true };
  format: "geojson";
  coordinates: "WGS84-longitude-latitude";
  summary: GeoJsonSummary;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const geometryTypes = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
];

/** 在进入 Cesium 前校验文件；不推测投影，不把普通 JSON 或 TopoJSON 当作 GeoJSON。 */
export function parseGeoJson(text: string): { data: GeoJsonDocument; summary: GeoJsonSummary } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid JSON. Choose a GeoJSON file (.geojson or .json).");
  }
  const summary: GeoJsonSummary = { features: 0, geometries: 0, positions: 0, geometryTypes: [] };
  const types = new Set<string>();
  const invalid = (path: string, detail: string): never => {
    throw new Error(`${path}: ${detail}`);
  };
  const crs = (object: Record<string, unknown>, path: string) => {
    if (!("crs" in object)) return;
    const value = object.crs;
    const properties = record(value) && record(value.properties) ? value.properties : null;
    const supported =
      record(value) &&
      properties &&
      ((value.type === "name" &&
        ["EPSG:4326", "urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:EPSG::4326"].includes(
          String(properties.name),
        )) ||
        (value.type === "EPSG" && properties.code === 4326));
    if (!supported)
      invalid(path, "Use WGS84 longitude/latitude GeoJSON. Reproject the file before importing.");
  };
  const array = (value: unknown, path: string, min = 0): unknown[] => {
    if (!Array.isArray(value) || value.length < min)
      invalid(path, `Expected an array with at least ${min} entries.`);
    return value as unknown[];
  };
  const position = (value: unknown, path: string) => {
    const coordinates = array(value, path, 2);
    if (coordinates.length > 3 || !coordinates.every(finite))
      invalid(path, "Coordinates must be finite longitude, latitude, and optional height.");
    if (Math.abs(coordinates[1] as number) > 90)
      invalid(path, "Latitude must be between -90 and 90 degrees; use WGS84 longitude/latitude.");
    summary.positions++;
  };
  const line = (value: unknown, path: string, ring = false) => {
    const points = array(value, path, ring ? 4 : 2);
    points.forEach((point, index) => position(point, `${path}[${index}]`));
    if (ring) {
      const first = points[0] as number[],
        last = points[points.length - 1] as number[];
      if (first.length !== last.length || first.some((v, i) => v !== last[i]))
        invalid(path, "Polygon rings must be closed (first and last positions match).");
    }
  };
  const polygon = (value: unknown, path: string) =>
    array(value, path, 1).forEach((ring, i) => line(ring, `${path}[${i}]`, true));
  const geometry = (value: unknown, path: string) => {
    if (!record(value) || typeof value.type !== "string")
      invalid(path, "Expected a GeoJSON geometry.");
    const object = value as GeoJsonDocument;
    crs(object, path);
    if (!geometryTypes.includes(object.type)) invalid(path, "Unsupported GeoJSON geometry type.");
    types.add(object.type);
    const coordinates = object.coordinates;
    switch (object.type) {
      case "GeometryCollection":
        array(object.geometries, `${path}.geometries`).forEach((g, i) =>
          geometry(g, `${path}.geometries[${i}]`),
        );
        return;
      case "Point":
        position(coordinates, path);
        break;
      case "MultiPoint":
        array(coordinates, path, 1).forEach((p, i) => position(p, `${path}[${i}]`));
        break;
      case "LineString":
        line(coordinates, path);
        break;
      case "MultiLineString":
        array(coordinates, path, 1).forEach((l, i) => line(l, `${path}[${i}]`));
        break;
      case "Polygon":
        polygon(coordinates, path);
        break;
      case "MultiPolygon":
        array(coordinates, path, 1).forEach((p, i) => polygon(p, `${path}[${i}]`));
        break;
    }
    summary.geometries++;
  };
  const feature = (value: unknown, path: string) => {
    if (!record(value) || value.type !== "Feature") invalid(path, "Expected a GeoJSON Feature.");
    const object = value as GeoJsonDocument;
    crs(object, path);
    if (object.properties !== null && !record(object.properties))
      invalid(path, "Feature properties must be an object or null.");
    if (object.id !== undefined && typeof object.id !== "string" && !finite(object.id))
      invalid(path, "Feature id must be a string or finite number.");
    summary.features++;
    if (object.geometry !== null) geometry(object.geometry, `${path}.geometry`);
  };
  if (!record(data) || typeof data.type !== "string")
    invalid("GeoJSON", "Expected a FeatureCollection, Feature or geometry.");
  const document = data as GeoJsonDocument;
  crs(document, "GeoJSON");
  if (document.type === "FeatureCollection")
    array(document.features, "features").forEach((f, i) => feature(f, `features[${i}]`));
  else if (document.type === "Feature") feature(document, "feature");
  else geometry(document, "geometry");
  if (!summary.positions) invalid("GeoJSON", "The file contains no drawable geometry.");
  summary.geometryTypes = [...types];
  return { data: document, summary };
}

export function describeGeoJson(file: File, summary: GeoJsonSummary): LocalGeoJsonDescriptor {
  return {
    schemaVersion: 1,
    file: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      requiresReselect: true,
    },
    format: "geojson",
    coordinates: "WGS84-longitude-latitude",
    summary,
  };
}

export function parseGeoJsonDescriptor(value: unknown): LocalGeoJsonDescriptor {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.format !== "geojson" ||
    value.coordinates !== "WGS84-longitude-latitude" ||
    !record(value.file) ||
    typeof value.file.name !== "string" ||
    !value.file.name.trim() ||
    !finite(value.file.size) ||
    value.file.size < 0 ||
    !finite(value.file.lastModified) ||
    !record(value.summary) ||
    ![value.summary.features, value.summary.geometries, value.summary.positions].every(
      (v) => finite(v) && Number.isInteger(v) && v >= 0,
    ) ||
    !Array.isArray(value.summary.geometryTypes) ||
    !value.summary.geometryTypes.every((v) => geometryTypes.includes(String(v)))
  )
    throw new Error("Invalid local GeoJSON description in layer stack.");
  // 只恢复描述与显示设置；文件内容必须由用户重新提供，不能依赖旧的 blob URL。
  return {
    schemaVersion: 1,
    format: "geojson",
    coordinates: "WGS84-longitude-latitude",
    file: {
      name: value.file.name,
      size: value.file.size,
      lastModified: value.file.lastModified,
      requiresReselect: true,
    },
    summary: structuredClone(value.summary) as unknown as GeoJsonSummary,
  };
}

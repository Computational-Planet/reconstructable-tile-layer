import { describe, expect, it } from "vitest";
import { parseGeoJson, parseGeoJsonDescriptor } from "./geojson";
import { assertTiffSignature } from "../raster/tiffInput";
import { exportLayerDefinitions, parseLayerDefinitions } from "../layers/serialization";
import { parseImportedExperimentConfig } from "../experiment/importConfig";
import type { LayerDefinition } from "../layers/types";

const point = { type: "Point", coordinates: [120, 30, 10] };
const ring = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 0],
];
const parse = (value: unknown) => parseGeoJson(JSON.stringify(value));

describe("personal data formats", () => {
  it("recognizes classic and BigTIFF in both byte orders, rejecting NC/HDF5 and renamed JSON", () => {
    for (const bytes of [
      [73, 73, 42, 0],
      [77, 77, 0, 42],
      [73, 73, 43, 0],
      [77, 77, 0, 43],
    ])
      expect(() => assertTiffSignature(new Uint8Array(bytes))).not.toThrow();
    for (const bytes of [
      [],
      [67, 68, 70, 1],
      [137, 72, 68, 70],
      [123, 34, 116, 121],
      [73, 73, 0, 42],
    ])
      expect(() => assertTiffSignature(new Uint8Array(bytes))).toThrow(/TIFF/);
  });
  it("accepts mixed, multi and collection geometries without changing coordinates or properties", () => {
    const geometries = [
      point,
      {
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [180, 90],
        ],
      },
      {
        type: "LineString",
        coordinates: [
          [179, 0],
          [-179, 0],
        ],
      },
      {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [10, 10],
          ],
        ],
      },
      { type: "Polygon", coordinates: [ring] },
      { type: "MultiPolygon", coordinates: [[ring]] },
    ];
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { title: "测点", "fill-opacity": 0.2 },
          geometry: { type: "GeometryCollection", geometries },
        },
        { type: "Feature", properties: null, geometry: null },
      ],
    };
    const parsed = parse(data);
    expect(parsed.data).toEqual(data);
    expect(parsed.summary.features).toBe(2);
    expect(parsed.summary.geometries).toBe(6);
    expect(parsed.summary.geometryTypes).toHaveLength(7);
    expect(parseGeoJson("\uFEFF" + JSON.stringify(point)).summary.positions).toBe(1);
  });
  it.each([
    [{}, /Expected/],
    [{ type: "Topology", objects: {} }, /Unsupported/],
    [{ ...point, coordinates: [0, 200] }, /Latitude/],
    [{ ...point, coordinates: ["120", 30] }, /finite/],
    [{ ...point, coordinates: [0] }, /at least/],
    [{ type: "LineString", coordinates: [[0, 0]] }, /at least/],
    [
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 1],
          ],
        ],
      },
      /closed/,
    ],
    [{ type: "FeatureCollection", features: [] }, /no drawable/],
    [{ type: "FeatureCollection", features: [point] }, /Feature/],
    [{ type: "Feature", properties: [], geometry: point }, /properties/],
    [{ ...point, crs: { type: "name", properties: { name: "EPSG:3857" } } }, /Reproject/],
    [{ ...point, crs: null }, /Reproject/],
  ])("rejects malformed or unsupported input %#", (value, error) => {
    expect(() => parse(value)).toThrow(error as RegExp);
  });
  it("reports invalid JSON and accepts explicit WGS84 legacy CRS", () => {
    expect(() => parseGeoJson("{broken")).toThrow(/Invalid JSON/);
    expect(
      parse({ ...point, crs: { type: "name", properties: { name: "EPSG:4326" } } }).summary
        .positions,
    ).toBe(1);
  });
});

it("round trips GeoJSON metadata and layer settings without embedding the file", () => {
  const descriptor = parseGeoJsonDescriptor({
    schemaVersion: 1,
    file: { name: "sample.geojson", size: 300, lastModified: 5 },
    format: "geojson",
    coordinates: "WGS84-longitude-latitude",
    summary: parse(point).summary,
  });
  const layer: LayerDefinition = {
    id: "vector",
    name: "Samples",
    mode: "static",
    source: { kind: "geojson", descriptor },
    visible: false,
    opacity: 0.4,
    ageRange: { youngestMa: 100, oldestMa: 150 },
    loadMode: "level",
    level: 0,
  };
  const stack = JSON.parse(JSON.stringify(exportLayerDefinitions([layer])));
  expect(parseImportedExperimentConfig({ schemaVersion: 3, layerStack: stack }).layerStack).toEqual(
    [{ ...layer, modelRequiresReselect: false }],
  );
  expect(descriptor.file.requiresReselect).toBe(true);
  expect(JSON.stringify(stack)).not.toContain('"coordinates":[');
  expect(() => parseLayerDefinitions([{ ...layer, mode: "reconstructable" }])).toThrow(
    /fixed coordinates/,
  );
  expect(() =>
    parseGeoJsonDescriptor({ ...descriptor, summary: { ...descriptor.summary, positions: -1 } }),
  ).toThrow(/description/);
});

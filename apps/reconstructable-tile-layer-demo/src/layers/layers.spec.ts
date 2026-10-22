import { describe, expect, it, vi } from "vitest";
import { emptyTileServiceConfig } from "../cesium/tileServiceConfig";
import { parseImportedExperimentConfig } from "../experiment/importConfig";
import { retainResources } from "./resourceLeases";
import { exportLayerDefinitions, parseLayerDefinitions } from "./serialization";
import { isLayerVisible, validateAgeRange } from "./temporal";
import type { LayerDefinition } from "./types";
import {
  emptyRasterContext,
  makeScientificContext,
  type LocalRasterDescriptor,
} from "../raster/context";

describe("geological layer visibility", () => {
  it("includes range endpoints and preserves a user's hidden state", () => {
    const layer = { visible: true, ageRange: { youngestMa: 100, oldestMa: 150 } };
    expect([99, 100, 125, 150, 151].map((age) => isLayerVisible(layer, age))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(isLayerVisible({ ...layer, visible: false }, 125)).toBe(false);
    expect(isLayerVisible({ visible: true, ageRange: null }, 1200)).toBe(true);
    expect(validateAgeRange({ youngestMa: 200, oldestMa: 100 })).toBeTruthy();
    expect(validateAgeRange({ youngestMa: NaN, oldestMa: 100 })).toBeTruthy();
  });
});

it("keeps a shared TIFF source alive after the editor switches files", () => {
  const closed: string[] = [];
  const source = { close: vi.fn(() => closed.push("source")) };
  const editor = retainResources([source]);
  const firstLayer = retainResources([source]);
  const secondLayer = retainResources([source]);
  editor();
  firstLayer();
  expect(closed).toEqual([]);
  secondLayer();
  secondLayer();
  expect(closed).toEqual(["source"]);
  expect(source.close).toHaveBeenCalledTimes(1);
});

const layer: LayerDefinition = {
  id: "topography",
  name: "Topography",
  mode: "reconstructable",
  source: {
    kind: "service",
    config: { ...emptyTileServiceConfig(), url: "https://example.com/{z}/{x}/{y}.png" },
  },
  model: {
    name: "Local model",
    featureUrl: "blob:plates",
    featureLabel: "plates.gpml",
    rotationUrls: ["blob:rotations"],
    rotationLabels: ["model.rot"],
    anchorPlateId: "0",
  },
  visible: false,
  opacity: 0.4,
  ageRange: null,
  level: 2,
};
describe("layer configuration", () => {
  it("round trips order and display settings while marking local model files for reselection", () => {
    const staticLayer = {
      ...layer,
      id: "snapshot",
      mode: "static" as const,
      model: undefined,
      ageRange: { youngestMa: 90, oldestMa: 110 },
    };
    const exported = exportLayerDefinitions([layer, staticLayer]);
    expect(exported[0].model?.featureUrl).toBe("");
    expect(exported[0].modelRequiresReselect).toBe(true);
    expect(layer.model?.featureUrl).toBe("blob:plates");
    const restored = parseLayerDefinitions(JSON.parse(JSON.stringify(exported)));
    expect(restored.map((entry) => entry.id)).toEqual(["topography", "snapshot"]);
    expect(restored[0].visible).toBe(false);
    expect(restored[0].opacity).toBe(0.4);
    expect(restored[1].ageRange).toEqual({ youngestMa: 90, oldestMa: 110 });
  });
  it("rejects ambiguous layer IDs and malformed age ranges before import", () => {
    expect(() => parseLayerDefinitions([layer, layer])).toThrow();
    expect(() =>
      parseLayerDefinitions([{ ...layer, ageRange: { youngestMa: 150, oldestMa: 100 } }]),
    ).toThrow();
  });
  it("reads legacy experiment controls and version 2 stacks", () => {
    expect(parseImportedExperimentConfig({ schemaVersion: 1, timeMa: 80 }).age).toBe(80);
    const imported = parseImportedExperimentConfig({
      schemaVersion: 2,
      timeMa: 100,
      layerStack: exportLayerDefinitions([layer]),
    });
    expect(imported.layerStack?.[0].id).toBe(layer.id);
    expect(() => parseImportedExperimentConfig({ schemaVersion: 2 })).toThrow();
  });
  it("preserves a TIFF's exact palette and rejects old NetCDF configurations", () => {
    const descriptor: LocalRasterDescriptor = {
      schemaVersion: 1,
      file: { name: "temperature.tif", size: 1234, lastModified: 1, requiresReselect: true },
      source: {
        format: "geotiff",
        width: 360,
        height: 180,
        crs: { epsg: 4326 },
        bands: [],
      },
      context: makeScientificContext(emptyRasterContext, layer.model!),
      style: {
        kind: "single-band",
        band: 0,
        domain: [270, 310],
        colors: [
          [0, 0, 255, 255],
          [255, 0, 0, 255],
        ],
      },
      applied: true,
    };
    const local = {
      ...layer,
      mode: "static",
      model: undefined,
      source: { kind: "local", descriptor },
    };
    const restored = parseLayerDefinitions([local])[0];
    expect(restored.source).toEqual(local.source);
    expect(() =>
      parseLayerDefinitions([{ ...local, mode: "reconstructable", model: layer.model }]),
    ).toThrow(/coordinates/);
    expect(() =>
      parseLayerDefinitions([
        {
          ...local,
          source: {
            kind: "local",
            descriptor: {
              ...descriptor,
              source: { ...descriptor.source, format: "netcdf3" },
            },
          },
        },
      ]),
    ).toThrow(/Convert NetCDF/);
    expect(() =>
      parseImportedExperimentConfig({
        schemaVersion: 1,
        sources: {
          localRaster: { ...descriptor, source: { ...descriptor.source, format: "netcdf4" } },
        },
      }),
    ).toThrow(/Convert NetCDF/);
  });
});

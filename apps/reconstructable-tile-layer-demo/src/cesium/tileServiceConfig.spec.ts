import { describe, expect, it } from "vitest";
import { getServicePreset, PROVIDER_OPTIONS } from "./providers";
import {
  emptyTileServiceConfig,
  parseServiceParameters,
  parseTileServiceConfig,
  validateTileServiceConfig,
} from "./tileServiceConfig";
import { parseImportedExperimentConfig } from "../experiment/importConfig";

describe("editable service connections", () => {
  it.each(PROVIDER_OPTIONS.filter((item) => item.key !== "custom-url-template"))(
    "$label fills a complete portable form",
    ({ key }) => {
      const config = getServicePreset(key);
      expect(validateTileServiceConfig(config)).toEqual([]);
      const imported = parseImportedExperimentConfig({
        schemaVersion: 3,
        layerStack: [],
        sources: { providerKey: key, serviceConfig: JSON.parse(JSON.stringify(config)) },
      });
      expect(imported.serviceConfig).toEqual(config);
    },
  );
  it("restores a complete TMS connection and its level range", () => {
    const imported = parseImportedExperimentConfig({
      schemaVersion: 3,
      layerStack: [],
      sources: {
        providerKey: "custom-url-template",
        serviceConfig: {
          ...emptyTileServiceConfig(),
          url: "https://example.test/{z}/{x}/{reverseY}.png",
          tilingSchemeKey: "geographic",
          levelZeroTilesX: 2,
          minimumLevel: 0,
          maximumLevel: 5,
        },
      },
    });
    expect(imported.serviceConfig).toMatchObject({
      protocol: "url-template",
      levelZeroTilesX: 2,
      maximumLevel: 5,
      url: "https://example.test/{z}/{x}/{reverseY}.png",
    });
    expect(validateTileServiceConfig(imported.serviceConfig!)).toEqual([]);
  });
  it("restores explicit WMS parameters without aliasing preset fields", () => {
    const first = parseImportedExperimentConfig({
      schemaVersion: 3,
      layerStack: [],
      sources: {
        providerKey: "nasa-gibs-blue-marble-4326",
        serviceConfig: getServicePreset("nasa-gibs-blue-marble-4326"),
      },
    }).serviceConfig!;
    expect(first).toMatchObject({
      protocol: "wms",
      wms: { crs: "EPSG:4326", layers: "BlueMarble_ShadedRelief_Bathymetry" },
    });
    first.wms.layers = "edited";
    expect(getServicePreset("nasa-gibs-blue-marble-4326").wms.layers).toBe(
      "BlueMarble_ShadedRelief_Bathymetry",
    );
  });
  it("restores edited WMS fields instead of refilling the original preset", () => {
    const config = getServicePreset("nasa-gibs-blue-marble-4326");
    config.url = "https://my-data.example/wms";
    config.wms.layers = "temperature";
    config.parameters = "TIME=2001-01-01\nELEVATION=850";
    config.bounds = [-20, -30, 40, 60];
    expect(
      parseImportedExperimentConfig({
        schemaVersion: 3,
        layerStack: [],
        sources: { providerKey: "nasa-gibs-blue-marble-4326", serviceConfig: config },
      }).serviceConfig,
    ).toEqual(config);
  });
  it("rejects malformed imported forms before changing app state", () => {
    const config = getServicePreset("gplates-topography-4326");
    expect(() => parseTileServiceConfig({ ...config, tileWidth: "512" })).toThrow("tileWidth");
    expect(() =>
      parseImportedExperimentConfig({
        schemaVersion: 3,
        layerStack: [],
        sources: { serviceConfig: { ...config, maximumLevel: -1 } },
      }),
    ).toThrow("Maximum level");
    expect(() => parseTileServiceConfig({ ...config, wms: null })).toThrow("wms");
  });
  it("retains literal dates and equals signs while rejecting duplicate and managed parameters", () => {
    expect(parseServiceParameters("TIME=1950-01-01\nfilter=x=1")).toEqual({
      TIME: "1950-01-01",
      filter: "x=1",
    });
    expect(() => parseServiceParameters("TIME=1\ntime=2")).toThrow("Duplicate");
    const config = getServicePreset("nasa-gibs-blue-marble-4326");
    config.parameters = "BBOX=0,0,1,1";
    expect(validateTileServiceConfig(config).join(" ")).toContain("controlled by the form");
    expect(() => parseServiceParameters("__proto__=x")).toThrow("Unsupported");
    expect(() => parseServiceParameters("hasOwnProperty=x")).toThrow("Unsupported");
  });
  it("requires explicit matrix labels to cover every service level", () => {
    const config = getServicePreset("eox-terrain-4326");
    config.maximumLevel = 2;
    config.wmts.tileMatrixLabels = "EPSG:4326:0\nEPSG:4326:1";
    expect(validateTileServiceConfig(config).join(" ")).toContain("matrix label");
    config.wmts.tileMatrixLabels += "\nEPSG:4326:2";
    expect(validateTileServiceConfig(config)).toEqual([]);
    config.url += "?time={Time}";
    expect(validateTileServiceConfig(config).join(" ")).toContain("Time=value");
    config.wmts.dimensions = "Time=2025-01-01";
    expect(validateTileServiceConfig(config)).toEqual([]);
  });
  it("rejects incompatible CRS, coverage and unbounded reverse-level templates", () => {
    const config = getServicePreset("nasa-gibs-blue-marble-4326");
    config.wms.crs = "EPSG:3857";
    expect(validateTileServiceConfig(config).join(" ")).toContain("CRS must match");
    const template = emptyTileServiceConfig();
    template.url = "https://example.test/{reverseZ}/{x}/{reverseY}.png";
    template.maximumLevel = null;
    template.bounds = [-180, -90, 180, 90];
    expect(validateTileServiceConfig(template).join(" ")).toContain("explicit maximum");
    expect(validateTileServiceConfig(template).join(" ")).toContain("Web Mercator coverage");
  });
});

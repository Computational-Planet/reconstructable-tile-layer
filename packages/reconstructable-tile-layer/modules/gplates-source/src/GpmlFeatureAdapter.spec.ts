import { describe, expect, it } from "vitest";
import {
  loadFeaturePolygonDataWithDiagnostics,
  parsedGpmlFeaturesToPaleoData,
  type ParsedGpmlFeature,
} from "./index.js";

function feature(overrides: Partial<ParsedGpmlFeature> = {}): ParsedGpmlFeature {
  return {
    id: "plate-domain",
    featureMemberIndex: 0,
    featureType: "Basin",
    reconstructionPlateId: 101,
    attributes: { NAME: "板块域" },
    renderIntent: "area",
    geometries: [
      {
        propertyName: "boundary",
        geometryType: "Polygon",
        polygon: {
          exterior: [
            [0, 0],
            [20, 0],
            [0, 20],
            [0, 0],
          ],
          interiors: [
            [
              [1, 1],
              [2, 1],
              [1, 2],
              [1, 1],
            ],
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe("neutral polygon adapter", () => {
  it("retains multipart geometry, holes, metadata and geological ages", () => {
    const source = feature({ validTime: { begin: 200, end: 10 } });
    source.geometries.push({
      propertyName: "outlineOf",
      geometryType: "Polygon",
      polygon: {
        exterior: [
          [30, 0],
          [40, 0],
          [30, 10],
          [30, 0],
        ],
        interiors: [],
      },
    });
    const { items, diagnostics } = parsedGpmlFeaturesToPaleoData([source]);
    expect(items[0]).toMatchObject({
      plateId: "101",
      time: { begine: 200, end: 10 },
      lonlats: [0, 0, 20, 0, 0, 20, 0, 0],
      clipArea: {
        polygons: [
          { exterior: [0, 0, 20, 0, 0, 20, 0, 0], interiors: [[1, 1, 2, 1, 1, 2, 1, 1]] },
          { exterior: [30, 0, 40, 0, 30, 10, 30, 0], interiors: [] },
        ],
      },
      source: { attributes: { NAME: "板块域" }, propertyNames: ["boundary", "outlineOf"] },
    });
    expect(diagnostics).toMatchObject({
      polygonCount: 2,
      polygonsWithHoles: 1,
      interiorRingCount: 1,
      multiPolygonFeatureCount: 1,
    });
  });

  it("disambiguates duplicate members and reports features excluded from filled areas", () => {
    const result = parsedGpmlFeaturesToPaleoData([
      feature(),
      feature({ featureMemberIndex: 1, renderIntent: "line-like", featureType: "Coastline" }),
      feature({ id: "unassigned", reconstructionPlateId: undefined }),
      feature({ id: "no-geometry", geometries: [] }),
    ]);
    expect(result.items.map((item) => item.featureId)).toEqual([
      "plate-domain:member:0",
      "plate-domain:member:1",
    ]);
    expect(result.items[0].time).toEqual({ begine: 999999, end: -999 });
    expect(result.diagnostics).toMatchObject({
      totalFeatures: 4,
      totalImportedFeatures: 2,
      duplicateOriginalFeatureIdCount: 1,
      duplicateFeatureMemberCount: 1,
      renamedDuplicateFeatureIdCount: 2,
      skippedFromFillFeatureCount: 1,
      skippedPolygonFeatureTypes: { Coastline: 1 },
    });
  });

  it("keeps legacy JSON first-polygon semantics when loaded from a local Blob", async () => {
    const source = [
      {
        FeatureID: "legacy",
        PlateID: "101",
        ValidTime: { Begin: 150, End: 0 },
        Polygon: [
          {
            PosList: [
              { Longitude: 10, Latitude: 20 },
              { Longitude: 30, Latitude: 40 },
            ],
          },
          { PosList: [{ Longitude: 50, Latitude: 60 }] },
        ],
      },
    ];
    const { items } = await loadFeaturePolygonDataWithDiagnostics(
      new Blob([JSON.stringify(source)]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].clipArea.polygons).toEqual([{ exterior: [10, 20, 30, 40] }]);
    expect(items[0].time).toEqual({ begine: 150, end: 0 });
    await expect(
      loadFeaturePolygonDataWithDiagnostics(new Blob(["not a feature file"])),
    ).rejects.toThrow("Unsupported feature file content");
  });
});

import { describe, expect, it } from "vitest";
import { getGeographicBounds, planGeographicRead, WEB_MERCATOR_RADIUS } from "./spatial.js";
import type { RasterBounds, RasterMetadata } from "./types.js";

function metadata(bounds: RasterBounds, epsg = 4326): RasterMetadata {
  return {
    format: "geotiff",
    width: 1147,
    height: 571,
    crs: { epsg },
    transform: [-180, 0.31386224934612034, 0, 90, 0, -0.31523642732049034],
    bounds,
    pixelInterpretation: "area",
    bands: [],
    overviews: [],
  };
}

describe("geographic display bounds", () => {
  it("snaps the reported TIFF's polar roundoff without changing its source coordinates", () => {
    const south = 90 - 571 * 0.31523642732049034;
    const raster = metadata(Object.freeze([-180, south, 180, 90]));
    const original = structuredClone(raster);
    expect(south).toBe(-89.99999999999997);
    expect(getGeographicBounds(raster)).toEqual([-180, -90, 180, 90]);
    expect(raster).toEqual(original);
    const read = planGeographicRead(raster, getGeographicBounds(raster), 2, 2);
    expect(read.sampleColumns).toEqual([286, 860]);
    expect(read.sampleRows).toEqual([142, 428]);
  });

  it.each([-5e-9, 0, 5e-9])(
    "normalizes pole and global longitude endpoints with drift %s",
    (drift) => {
      expect(getGeographicBounds(metadata([-180 + drift, -90 + drift, 180, 90 + drift]))).toEqual([
        -180, -90, 180, 90,
      ]);
    },
  );

  it("preserves real polar gaps and continuous antimeridian coverage", () => {
    const bounds: RasterBounds = [170, -89.9999, 190, 89.9999];
    expect(getGeographicBounds(metadata(bounds))).toEqual(bounds);
    expect(getGeographicBounds(metadata([0, -90, 360, 90]))).toEqual([-180, -90, 180, 90]);
  });

  it("keeps normal Web Mercator latitude coverage below the poles", () => {
    const limit = Math.PI * WEB_MERCATOR_RADIUS;
    const bounds = getGeographicBounds(metadata([-limit, -limit, limit, limit], 3857));
    expect(bounds[0]).toBe(-180);
    expect(bounds[2]).toBe(180);
    expect(bounds[1]).toBeCloseTo(-85.0511287798066, 10);
    expect(bounds[3]).toBeCloseTo(85.0511287798066, 10);
  });

  it.each<RasterBounds>([
    [-180, 90 + 1e-10, 180, 95],
    [-180, -95, 180, -90 - 1e-10],
    [-180, -90 + 1e-10, 180, -90 + 2e-10],
  ])("rejects an empty latitude extent after boundary normalization: %j", (...bounds) => {
    expect(() => getGeographicBounds(metadata(bounds))).toThrow(/bounds/i);
  });
});

it("plans a wide export grid without spreading pixel indices onto the call stack", () => {
  const read = planGeographicRead(
    {
      format: "netcdf3",
      width: 2,
      height: 2,
      crs: { epsg: 4326 },
      transform: null,
      coordinates: { x: [0, 1], y: [0, 1], periodicX: false },
      bounds: [-0.5, -0.5, 1.5, 1.5],
      pixelInterpretation: "area",
      bands: [],
      overviews: [],
    },
    [0, 0, 1, 1],
    200000,
    1,
  );
  expect(read.window).toEqual([0, 0, 2, 1]);
  expect(read.sampleColumns?.[0]).toBe(0);
  expect(read.sampleColumns?.[199999]).toBe(1);
});

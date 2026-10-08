import { expect, it } from "vitest";
import { planGeographicRead } from "./spatial.js";

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

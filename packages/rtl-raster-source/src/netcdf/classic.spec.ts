import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { openClassic } from "./classic.js";
import { describeSlice, describeVariable } from "./cf.js";
import { bandMetadata } from "./numeric.js";
import { isNoData, planGeographicRead, toPhysicalValue } from "../spatial.js";

it("reads independent CDF-2 unpadded unlimited records with transposed spatial dimensions", async () => {
  const file = new Blob([
    await readFile(new URL("../../test/fixtures/packed-record.nc", import.meta.url)),
  ]);
  const engine = await openClassic(file, 1024 * 1024);
  const variable = engine.metadata.variables.find((v) => v.name === "packed")!;
  expect(variable.shape).toEqual([2, 3, 3]);
  const layout = describeVariable(engine.metadata, "packed");
  expect(layout.longitude.name).toBe("longitude");
  expect(layout.latitude.name).toBe("latitude");
  expect(layout.selectors.map(({ dimension, size }) => ({ dimension, size }))).toEqual([
    { dimension: "epoch", size: 2 },
  ]);
  const slab = await engine.read({ variable: "packed", starts: [1, 1, 0], counts: [1, 2, 3] });
  expect([...slab]).toEqual([110, 111, 112, 120, 121, 122]);
  const slice = await describeSlice(
    engine.metadata,
    { variable: "packed", indices: { epoch: 1 } },
    engine.read,
  );
  expect(slice.xDimension).toBe(1);
  expect(slice.yDimension).toBe(2);
  expect(slice.metadata.transform).toBeNull();
  expect(slice.metadata.coordinates).toEqual({
    x: [0, 120, 240],
    y: [-45, 0, 45],
    periodicX: true,
  });
  const plan = planGeographicRead(slice.metadata, [-180, -67.5, 180, 67.5], 6, 3);
  expect(plan.sampleColumns).toEqual([2, 2, 0, 0, 1, 1]);
  expect(plan.sampleRows).toEqual([2, 1, 0]);
  const band = bandMetadata(variable);
  expect(band.noData).toEqual([65535, 65534]);
  expect(band.validRange).toEqual([0, 65533]);
  expect(isNoData(65535, band)).toBe(true);
  expect(isNoData(65532, band)).toBe(false);
  expect(toPhysicalValue(121, band)).toBeCloseTo(333.65);
});

it("requires each non-spatial slice index and rejects curvilinear coordinate references", async () => {
  const file = new Blob([
    await readFile(new URL("../../test/fixtures/packed-record.nc", import.meta.url)),
  ]);
  const engine = await openClassic(file, 1024 * 1024);
  await expect(describeSlice(engine.metadata, { variable: "packed" }, engine.read)).rejects.toThrow(
    "epoch",
  );
  const curved = {
    ...engine.metadata,
    variables: engine.metadata.variables.map((v) =>
      v.name === "longitude" ? { ...v, shape: [3, 3], dimensions: ["column", "row"] } : v,
    ),
  };
  expect(() => describeVariable(curved, "packed")).toThrow("curvilinear");
  await expect(
    describeSlice(curved, { variable: "packed", indices: { epoch: 0 } }, engine.read),
  ).rejects.toMatchObject({ code: "unsupported-grid" });
});

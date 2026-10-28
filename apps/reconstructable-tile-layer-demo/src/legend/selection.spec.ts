import { Cartographic, Math as CesiumMath, Rectangle } from "cesium";
import { expect, it } from "vitest";
import { rectangleAroundPoint, rectangleFromSelectionRows } from "./selection";

const rows = (longitudes: number[]) =>
  [-10, 0, 10].map((lat) => longitudes.map((lon) => Cartographic.fromDegrees(lon, lat)));
it("keeps a small dateline selection small", () => {
  const rectangle = rectangleFromSelectionRows(rows([170, 175, 180, -175, -170]));
  expect(CesiumMath.toDegrees(rectangle.width)).toBeCloseTo(20);
  expect(rectangle.west).toBeGreaterThan(rectangle.east);
});
it("retains wide selections and full-world longitude coverage", () => {
  expect(
    CesiumMath.toDegrees(rectangleFromSelectionRows(rows([-150, -75, 0, 75, 150])).width),
  ).toBeCloseTo(300);
  expect(
    CesiumMath.toDegrees(rectangleFromSelectionRows(rows([0, 90, 180, -90, 0])).width),
  ).toBeCloseTo(360);
});
it("rejects a degenerate selection and includes all row latitude extents", () => {
  expect(() => rectangleFromSelectionRows([])).toThrow();
  expect(() => rectangleFromSelectionRows(rows([0, 0]))).toThrow();
  const rectangle = rectangleFromSelectionRows(rows([10, 15, 20]));
  expect(CesiumMath.toDegrees(rectangle.south)).toBeCloseTo(-10);
  expect(CesiumMath.toDegrees(rectangle.north)).toBeCloseTo(10);
});

it("queries a point through a small nonempty box centered on the selected coordinate", () => {
  const point = Cartographic.fromDegrees(-99, 43);
  const rectangle = rectangleAroundPoint(point);
  expect(Rectangle.center(rectangle).longitude).toBeCloseTo(point.longitude, 12);
  expect(Rectangle.center(rectangle).latitude).toBeCloseTo(point.latitude, 12);
  expect(CesiumMath.toDegrees(rectangle.width)).toBeCloseTo(0.0002, 10);
  expect(CesiumMath.toDegrees(rectangle.height)).toBeCloseTo(0.0002, 10);
});

it("keeps point bounds narrow across either side of the dateline", () => {
  for (const longitude of [-180, -179.99995, 179.99995, 180]) {
    const point = Cartographic.fromDegrees(longitude, 20);
    const rectangle = rectangleAroundPoint(point);
    expect(rectangle.west).toBeGreaterThan(rectangle.east);
    expect(Rectangle.contains(rectangle, point)).toBe(true);
    expect(CesiumMath.toDegrees(rectangle.width)).toBeCloseTo(0.0002, 10);
    expect(() => Rectangle.validate(rectangle)).not.toThrow();
  }
});

it("clamps point bounds at either pole while retaining nonzero area", () => {
  for (const latitude of [-90, -89.99995, 89.99995, 90]) {
    const point = Cartographic.fromDegrees(10, latitude);
    const rectangle = rectangleAroundPoint(point);
    expect(Rectangle.contains(rectangle, point)).toBe(true);
    expect(rectangle.width).toBeGreaterThan(0);
    expect(rectangle.height).toBeGreaterThan(0);
    expect(rectangle.south).toBeGreaterThanOrEqual(-Math.PI / 2);
    expect(rectangle.north).toBeLessThanOrEqual(Math.PI / 2);
  }
});

it("rejects nonfinite and out-of-range point coordinates", () => {
  for (const point of [
    new Cartographic(NaN, 0),
    new Cartographic(0, Infinity),
    Cartographic.fromDegrees(0, 91),
  ])
    expect(() => rectangleAroundPoint(point)).toThrow(RangeError);
});

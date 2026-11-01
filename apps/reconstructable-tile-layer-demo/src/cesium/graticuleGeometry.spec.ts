import { Cartesian3, Ellipsoid, Math as CesiumMath } from "cesium";
import { describe, expect, it } from "vitest";

import { createGraticuleLines, formatGraticuleLabel, getGraticuleHeight } from "./graticuleGeometry";

describe("graticule geometry", () => {
  it.each([6371009, 1])("uses the viewer's sphere and keeps segment midpoints above it (r=%s)", (r) => {
    const ellipsoid = new Ellipsoid(r, r, r);
    const lines = createGraticuleLines(ellipsoid);
    for (const line of lines) {
      for (let index = 0; index < line.positions.length; index++) {
        const position = line.positions[index];
        expect(Cartesian3.magnitude(position)).toBeCloseTo(r + getGraticuleHeight(ellipsoid), 8);
        const coordinate = ellipsoid.cartesianToCartographic(position);
        const degrees = CesiumMath.toDegrees(coordinate[line.axis]);
        expect(degrees).toBeCloseTo(line.degrees, 8);
        if (index > 0) {
          const midpoint = Cartesian3.midpoint(line.positions[index - 1], position, new Cartesian3());
          expect(Cartesian3.magnitude(midpoint)).toBeGreaterThan(r);
        }
      }
    }
  });

  it("closes parallels at the dateline and covers both poles without duplicate meridians", () => {
    const ellipsoid = new Ellipsoid(6371009, 6371009, 6371009);
    const lines = createGraticuleLines(ellipsoid);
    const meridians = lines.filter((line) => line.axis === "longitude");
    const parallels = lines.filter((line) => line.axis === "latitude");
    expect(meridians.map((line) => line.degrees)).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150,
    ]);
    expect(parallels.map((line) => line.degrees)).toEqual([-60, -30, 0, 30, 60]);
    expect(meridians.filter((line) => Math.abs(line.degrees) === 180)).toHaveLength(1);
    for (const line of meridians) {
      expect(ellipsoid.cartesianToCartographic(line.positions[0]).latitude).toBeCloseTo(-Math.PI / 2);
      expect(
        ellipsoid.cartesianToCartographic(line.positions[line.positions.length - 1]).latitude,
      ).toBeCloseTo(Math.PI / 2);
    }
    for (const line of parallels) {
      expect(
        Cartesian3.distance(line.positions[0], line.positions[line.positions.length - 1]),
      ).toBeLessThan(1e-8);
    }
  });

  it("formats hemispheres and avoids ambiguous direction suffixes at zero and the dateline", () => {
    expect(formatGraticuleLabel("longitude", -180)).toBe("180°");
    expect(formatGraticuleLabel("latitude", 0)).toBe("0°");
    expect(formatGraticuleLabel("longitude", -30)).toBe("30°W");
    expect(formatGraticuleLabel("longitude", 30)).toBe("30°E");
    expect(formatGraticuleLabel("latitude", -30)).toBe("30°S");
    expect(formatGraticuleLabel("latitude", 30)).toBe("30°N");
  });
});

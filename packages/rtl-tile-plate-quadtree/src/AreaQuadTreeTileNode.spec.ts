import { Rectangle } from "cesium";
import { describe, expect, it } from "vitest";

import { normalizeAreaToTileRectangle } from "./AreaQuadTreeTileNode";
import type { TileClipArea } from "./QuadTreeTileNode";

const EASTERN_HEMISPHERE = Rectangle.fromDegrees(0, -90, 180, 90);

function exteriorPoints(area: TileClipArea) {
  return area.polygons.flatMap((polygon) => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i + 1 < polygon.exterior.length; i += 2) {
      points.push([polygon.exterior[i], polygon.exterior[i + 1]]);
    }
    return points;
  });
}

function hasHorizontalBoundaryEdge(
  area: TileClipArea,
  y: number,
  minimumLength: number
) {
  return area.polygons.some((polygon) => {
    const ring = polygon.exterior;
    for (let i = 0; i + 3 < ring.length; i += 2) {
      const x0 = ring[i];
      const y0 = ring[i + 1];
      const x1 = ring[i + 2];
      const y1 = ring[i + 3];
      if (
        Math.abs(y0 - y) < 1e-9 &&
        Math.abs(y1 - y) < 1e-9 &&
        Math.abs(x1 - x0) > minimumLength
      ) {
        return true;
      }
    }
    return false;
  });
}

function hasConsecutiveDuplicatePoint(area: TileClipArea) {
  return area.polygons.some((polygon) => {
    const ring = polygon.exterior;
    for (let i = 2; i + 1 < ring.length - 2; i += 2) {
      if (
        Math.abs(ring[i] - ring[i - 2]) < 1e-9 &&
        Math.abs(ring[i + 1] - ring[i - 1]) < 1e-9
      ) {
        return true;
      }
    }
    return false;
  });
}

function coordinateBounds(points: Array<[number, number]>) {
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}

describe("normalizeAreaToTileRectangle", () => {
  it("expands south-pole vertices onto the tile boundary", () => {
    const eastAntarcticaHalf: TileClipArea = {
      polygons: [
        {
          exterior: [
            180, -72.530013727, 0, -90, 0, -90, 0.232859122,
            -69.720256694, 180, -72.530013727,
          ],
        },
      ],
    };

    const normalized = normalizeAreaToTileRectangle(
      eastAntarcticaHalf,
      EASTERN_HEMISPHERE
    );

    expect(normalized.polygons.length).toBeGreaterThan(0);
    expect(hasHorizontalBoundaryEdge(normalized, 0, 0.9)).toBe(true);
    expect(hasConsecutiveDuplicatePoint(normalized)).toBe(false);
  });

  it("expands north-pole vertices onto the tile boundary", () => {
    const arcticCap: TileClipArea = {
      polygons: [
        {
          exterior: [10, 80, 0, 90, 0, 90, 170, 80, 10, 80],
        },
      ],
    };

    const normalized = normalizeAreaToTileRectangle(
      arcticCap,
      EASTERN_HEMISPHERE
    );

    expect(normalized.polygons.length).toBeGreaterThan(0);
    expect(hasHorizontalBoundaryEdge(normalized, 1, 0.8)).toBe(true);
    expect(hasConsecutiveDuplicatePoint(normalized)).toBe(false);
  });

  it("keeps ordinary non-polar polygons in the same tile-local bounds", () => {
    const ordinaryArea: TileClipArea = {
      polygons: [
        {
          exterior: [10, 10, 20, 10, 20, 20, 10, 20, 10, 10],
        },
      ],
    };

    const normalized = normalizeAreaToTileRectangle(
      ordinaryArea,
      EASTERN_HEMISPHERE
    );
    const bounds = coordinateBounds(exteriorPoints(normalized));

    expect(bounds.minX).toBeCloseTo(10 / 180);
    expect(bounds.maxX).toBeCloseTo(20 / 180);
    expect(bounds.minY).toBeCloseTo(100 / 180);
    expect(bounds.maxY).toBeCloseTo(110 / 180);
  });

  it("collapses repeated polar vertices without zero-length interior edges", () => {
    const repeatedPolarRun: TileClipArea = {
      polygons: [
        {
          exterior: [
            180, -72.530013727, 0, -90, 0, -90, 0, -90, 0.232859122,
            -69.720256694, 180, -72.530013727,
          ],
        },
      ],
    };

    const normalized = normalizeAreaToTileRectangle(
      repeatedPolarRun,
      EASTERN_HEMISPHERE
    );

    expect(normalized.polygons.length).toBeGreaterThan(0);
    expect(hasHorizontalBoundaryEdge(normalized, 0, 0.9)).toBe(true);
    expect(hasConsecutiveDuplicatePoint(normalized)).toBe(false);
  });
});

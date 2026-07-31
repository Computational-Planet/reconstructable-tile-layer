import { Rectangle } from "cesium";
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";

import type {
  ClipPolygon,
  GeographicClipArea,
  NormalizedClipArea,
  TileClipArea,
} from "../types.js";

const EPSILON = 1e-9;
const MIN_RING_POINTS = 4;
const POLAR_LATITUDE_EPSILON = 1e-6;

type LonLatPoint = {
  lon: number;
  lat: number;
};

function isFinitePoint(x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y);
}

function closeFlatRing(ring: Array<number>) {
  if (ring.length < 4) {
    return ring;
  }

  const closed = [...ring];
  const firstX = closed[0];
  const firstY = closed[1];
  const lastX = closed[closed.length - 2];
  const lastY = closed[closed.length - 1];
  if (Math.abs(firstX - lastX) > EPSILON || Math.abs(firstY - lastY) > EPSILON) {
    closed.push(firstX, firstY);
  }
  return closed;
}

function sameFlatPoint(
  leftX: number | undefined,
  leftY: number | undefined,
  rightX: number,
  rightY: number,
) {
  return (
    leftX !== undefined &&
    leftY !== undefined &&
    Math.abs(leftX - rightX) <= EPSILON &&
    Math.abs(leftY - rightY) <= EPSILON
  );
}

function sameLonLatPoint(left: LonLatPoint, right: LonLatPoint) {
  return Math.abs(left.lon - right.lon) <= EPSILON && Math.abs(left.lat - right.lat) <= EPSILON;
}

function flatRingArea(ring: Array<number>) {
  let area = 0;
  for (let i = 0; i < ring.length - 2; i += 2) {
    area += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
  }
  return area / 2;
}

function flatRingToClippingRing(flatRing: Array<number>): Ring | null {
  const closed = closeFlatRing(flatRing);
  if (closed.length < MIN_RING_POINTS * 2 || Math.abs(flatRingArea(closed)) < EPSILON) {
    return null;
  }

  const ring: Ring = [];
  for (let i = 0; i < closed.length; i += 2) {
    const x = closed[i];
    const y = closed[i + 1];
    if (!isFinitePoint(x, y)) {
      return null;
    }
    ring.push([x, y]);
  }
  return ring;
}

function clippingRingToFlatRing(ring: Ring) {
  const flatRing: Array<number> = [];
  ring.forEach(([x, y]) => {
    flatRing.push(x, y);
  });
  return closeFlatRing(flatRing);
}

function tileClipAreaToMultiPolygon(area: TileClipArea): MultiPolygon {
  const multiPolygon: MultiPolygon = [];
  area.polygons.forEach((polygon) => {
    const exterior = flatRingToClippingRing(polygon.exterior);
    if (!exterior) {
      return;
    }

    const clippingPolygon: Polygon = [exterior];
    polygon.interiors?.forEach((interior) => {
      const ring = flatRingToClippingRing(interior);
      if (ring) {
        clippingPolygon.push(ring);
      }
    });
    multiPolygon.push(clippingPolygon);
  });
  return multiPolygon;
}

function multiPolygonToTileClipArea(multiPolygon: MultiPolygon): NormalizedClipArea {
  const polygons: ClipPolygon[] = [];
  multiPolygon.forEach((polygon) => {
    const [exterior, ...interiors] = polygon;
    if (!exterior) {
      return;
    }

    const flatExterior = clippingRingToFlatRing(exterior);
    if (flatExterior.length < MIN_RING_POINTS * 2) {
      return;
    }

    polygons.push({
      exterior: flatExterior,
      interiors: interiors
        .map(clippingRingToFlatRing)
        .filter((ring) => ring.length >= MIN_RING_POINTS * 2),
    });
  });
  return { polygons };
}

function rectanglePolygon(xMin: number, yMin: number, xMax: number, yMax: number): Polygon {
  return [
    [
      [xMin, yMin],
      [xMax, yMin],
      [xMax, yMax],
      [xMin, yMax],
      [xMin, yMin],
    ],
  ];
}

export function getAreaSplitRatio(split: number, min: number, max: number) {
  const span = max - min;
  if (!Number.isFinite(span) || Math.abs(span) < EPSILON) {
    return 0.5;
  }

  return Math.max(EPSILON, Math.min(1 - EPSILON, (split - min) / span));
}

export function clipAreaToRectangle(
  area: TileClipArea,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): NormalizedClipArea {
  const multiPolygon = tileClipAreaToMultiPolygon(area);
  if (multiPolygon.length === 0) {
    return { polygons: [] };
  }

  return multiPolygonToTileClipArea(
    polygonClipping.intersection(multiPolygon, rectanglePolygon(xMin, yMin, xMax, yMax)),
  );
}

export function areaCoversUnitTile(area: TileClipArea) {
  const multiPolygon = tileClipAreaToMultiPolygon(area);
  if (multiPolygon.length === 0) {
    return false;
  }

  return polygonClipping.difference(rectanglePolygon(0, 0, 1, 1), multiPolygon).length === 0;
}

export function transformArea(
  area: TileClipArea,
  transform: (x: number, y: number) => Pair,
): NormalizedClipArea {
  return {
    polygons: area.polygons.map((polygon) => ({
      exterior: transformFlatRing(polygon.exterior, transform),
      interiors: polygon.interiors?.map((ring) => transformFlatRing(ring, transform)),
    })),
  };
}

function transformFlatRing(ring: Array<number>, transform: (x: number, y: number) => Pair) {
  const transformed: Array<number> = [];
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y] = transform(ring[i], ring[i + 1]);
    transformed.push(x, y);
  }
  return closeFlatRing(transformed);
}

function flatRingToLonLatPoints(ring: Array<number>) {
  const points: LonLatPoint[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const lon = ring[i];
    const lat = ring[i + 1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }
    points.push({ lon, lat });
  }

  if (points.length > 1 && sameLonLatPoint(points[0], points[points.length - 1])) {
    points.pop();
  }
  return points;
}

function getPolarSign(latitude: number) {
  if (Math.abs(Math.abs(latitude) - 90) > POLAR_LATITUDE_EPSILON) {
    return 0;
  }
  return latitude >= 0 ? 1 : -1;
}

function isPolarLatitude(latitude: number) {
  return getPolarSign(latitude) !== 0;
}

function rotateRingToNonPolarStart(points: LonLatPoint[]) {
  const firstNonPolarIndex = points.findIndex((point) => !isPolarLatitude(point.lat));
  if (firstNonPolarIndex <= 0) {
    return points;
  }
  return [...points.slice(firstNonPolarIndex), ...points.slice(0, firstNonPolarIndex)];
}

function normalizeLonLatPoint(longitude: number, latitude: number, rectangle: Rectangle): Pair {
  const clampedLatitude = Math.max(-90, Math.min(90, latitude));
  return [
    ((longitude * Math.PI) / 180 - rectangle.west) / (rectangle.east - rectangle.west),
    ((clampedLatitude * Math.PI) / 180 - rectangle.south) / (rectangle.north - rectangle.south),
  ];
}

function findAdjacentNonPolarPoint(points: LonLatPoint[], startIndex: number, step: 1 | -1) {
  for (let offset = 1; offset < points.length; offset++) {
    const index = (startIndex + step * offset + points.length) % points.length;
    const point = points[index];
    if (!isPolarLatitude(point.lat)) {
      return point;
    }
  }
  return null;
}

function normalizePolarRun(
  points: LonLatPoint[],
  runStartIndex: number,
  runEndIndex: number,
  rectangle: Rectangle,
) {
  const polarSign = getPolarSign(points[runStartIndex].lat);
  const poleLatitude = polarSign > 0 ? 90 : -90;
  const previous = findAdjacentNonPolarPoint(points, runStartIndex, -1);
  const next = findAdjacentNonPolarPoint(points, runEndIndex, 1);
  if (!previous || !next) {
    return [];
  }

  // Longitude is only a topological marker at a pole. Project the adjoining
  // longitudes onto the pole edge so planar clipping preserves the polar cap.
  return [
    normalizeLonLatPoint(previous.lon, poleLatitude, rectangle),
    normalizeLonLatPoint(next.lon, poleLatitude, rectangle),
  ];
}

function pushNormalizedPoint(normalized: Array<number>, [x, y]: Pair) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  const previousX = normalized[normalized.length - 2];
  const previousY = normalized[normalized.length - 1];
  if (sameFlatPoint(previousX, previousY, x, y)) {
    return;
  }
  normalized.push(x, y);
}

function normalizeLongitudeLatitudeRing(ring: Array<number>, rectangle: Rectangle) {
  const normalized: Array<number> = [];
  const points = flatRingToLonLatPoints(ring);
  if (!points || points.length === 0) {
    return normalized;
  }

  const rotatedPoints = rotateRingToNonPolarStart(points);
  if (rotatedPoints.every((point) => isPolarLatitude(point.lat))) {
    return normalized;
  }

  for (let i = 0; i < rotatedPoints.length; i++) {
    const point = rotatedPoints[i];
    const polarSign = getPolarSign(point.lat);
    if (polarSign === 0) {
      pushNormalizedPoint(normalized, normalizeLonLatPoint(point.lon, point.lat, rectangle));
      continue;
    }

    let runEndIndex = i;
    while (
      runEndIndex + 1 < rotatedPoints.length &&
      getPolarSign(rotatedPoints[runEndIndex + 1].lat) === polarSign
    ) {
      runEndIndex++;
    }

    normalizePolarRun(rotatedPoints, i, runEndIndex, rectangle).forEach((normalizedPoint) =>
      pushNormalizedPoint(normalized, normalizedPoint),
    );
    i = runEndIndex;
  }

  return closeFlatRing(normalized);
}

/**
 * Converts a geographic clipping area to tile-local coordinates and clips it
 * to the supplied Cesium tile rectangle.
 */
export function normalizeAreaToTileRectangle(
  area: GeographicClipArea,
  rectangle: Rectangle,
): NormalizedClipArea {
  const normalizedArea: NormalizedClipArea = {
    polygons: area.polygons.map((polygon) => ({
      exterior: normalizeLongitudeLatitudeRing(polygon.exterior, rectangle),
      interiors: polygon.interiors?.map((ring) => normalizeLongitudeLatitudeRing(ring, rectangle)),
    })),
  };

  return clipAreaToRectangle(normalizedArea, 0, 0, 1, 1);
}

/** Creates a normalized clipping area from one flat, tile-local ring. */
export function createTileClipAreaFromFlatPolygon(polygon: Array<number>): NormalizedClipArea {
  return {
    polygons: [
      {
        exterior: closeFlatRing(polygon),
      },
    ],
  };
}

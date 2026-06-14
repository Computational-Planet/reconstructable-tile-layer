import { BoundingSphere, Rectangle, TilingScheme } from "cesium";
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";
import {
  boundingSpheresIntersect,
  TileClipMode,
} from "./QuadTreeTileNode";
import type {
  ClipPolygon,
  NodeInfo,
  TileClipArea,
  TileXYL,
} from "./QuadTreeTileNode";

const EPSILON = 1e-9;
const MIN_RING_POINTS = 4;
const POLAR_LATITUDE_EPSILON = 1e-6;

type LonLatPoint = {
  lon: number;
  lat: number;
};

export interface AreaNodeChild {
  lb: AreaQuadTreeTileNode;
  lt: AreaQuadTreeTileNode;
  rb: AreaQuadTreeTileNode;
  rt: AreaQuadTreeTileNode;
}

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
  rightY: number
) {
  return (
    leftX !== undefined &&
    leftY !== undefined &&
    Math.abs(leftX - rightX) <= EPSILON &&
    Math.abs(leftY - rightY) <= EPSILON
  );
}

function sameLonLatPoint(left: LonLatPoint, right: LonLatPoint) {
  return (
    Math.abs(left.lon - right.lon) <= EPSILON &&
    Math.abs(left.lat - right.lat) <= EPSILON
  );
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

function multiPolygonToTileClipArea(multiPolygon: MultiPolygon): TileClipArea {
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

function getSplitRatio(split: number, min: number, max: number) {
  const span = max - min;
  if (!Number.isFinite(span) || Math.abs(span) < EPSILON) {
    return 0.5;
  }

  return Math.max(EPSILON, Math.min(1 - EPSILON, (split - min) / span));
}

function clipAreaToRectangle(
  area: TileClipArea,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
) {
  const multiPolygon = tileClipAreaToMultiPolygon(area);
  if (multiPolygon.length === 0) {
    return { polygons: [] };
  }

  return multiPolygonToTileClipArea(
    polygonClipping.intersection(
      multiPolygon,
      rectanglePolygon(xMin, yMin, xMax, yMax)
    )
  );
}

function areaCoversUnitTile(area: TileClipArea) {
  const multiPolygon = tileClipAreaToMultiPolygon(area);
  if (multiPolygon.length === 0) {
    return false;
  }

  return polygonClipping.difference(rectanglePolygon(0, 0, 1, 1), multiPolygon).length === 0;
}

function transformArea(
  area: TileClipArea,
  transform: (x: number, y: number) => Pair
): TileClipArea {
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
  const firstNonPolarIndex = points.findIndex(
    (point) => !isPolarLatitude(point.lat)
  );
  if (firstNonPolarIndex <= 0) {
    return points;
  }
  return [
    ...points.slice(firstNonPolarIndex),
    ...points.slice(0, firstNonPolarIndex),
  ];
}

function normalizeLonLatPoint(
  longitude: number,
  latitude: number,
  rectangle: Rectangle
): Pair {
  const clampedLatitude = Math.max(-90, Math.min(90, latitude));
  return [
    ((longitude * Math.PI) / 180 - rectangle.west) /
      (rectangle.east - rectangle.west),
    ((clampedLatitude * Math.PI) / 180 - rectangle.south) /
      (rectangle.north - rectangle.south),
  ];
}

function findAdjacentNonPolarPoint(
  points: LonLatPoint[],
  startIndex: number,
  step: 1 | -1
) {
  for (let offset = 1; offset < points.length; offset++) {
    const index =
      (startIndex + step * offset + points.length) % points.length;
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
  rectangle: Rectangle
) {
  const polarSign = getPolarSign(points[runStartIndex].lat);
  const poleLatitude = polarSign > 0 ? 90 : -90;
  const previous = findAdjacentNonPolarPoint(points, runStartIndex, -1);
  const next = findAdjacentNonPolarPoint(points, runEndIndex, 1);
  if (!previous || !next) {
    return [];
  }

  // At the pole longitude is only a topological marker. Project the adjoining
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

function normalizeLongitudeLatitudeRing(
  ring: Array<number>,
  rectangle: Rectangle
) {
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
      pushNormalizedPoint(
        normalized,
        normalizeLonLatPoint(point.lon, point.lat, rectangle)
      );
      continue;
    }

    let runEndIndex = i;
    while (
      runEndIndex + 1 < rotatedPoints.length &&
      getPolarSign(rotatedPoints[runEndIndex + 1].lat) === polarSign
    ) {
      runEndIndex++;
    }

    normalizePolarRun(rotatedPoints, i, runEndIndex, rectangle).forEach(
      (normalizedPoint) => pushNormalizedPoint(normalized, normalizedPoint)
    );
    i = runEndIndex;
  }

  return closeFlatRing(normalized);
}

export function normalizeAreaToTileRectangle(
  area: TileClipArea,
  rectangle: Rectangle
) {
  const normalizedArea: TileClipArea = {
    polygons: area.polygons.map((polygon) => ({
      exterior: normalizeLongitudeLatitudeRing(polygon.exterior, rectangle),
      interiors: polygon.interiors?.map((ring) =>
        normalizeLongitudeLatitudeRing(ring, rectangle)
      ),
    })),
  };

  return clipAreaToRectangle(normalizedArea, 0, 0, 1, 1);
}

export function createTileClipAreaFromFlatPolygon(polygon: Array<number>): TileClipArea {
  return {
    polygons: [
      {
        exterior: closeFlatRing(polygon),
      },
    ],
  };
}

export class AreaQuadTreeTileNode {
  private _rectangle: Rectangle;
  private _tilingScheme: TilingScheme;
  private _tileXYL: TileXYL;
  private _boundingSphere: BoundingSphere;
  private _clipArea: TileClipArea | null = null;
  private _status: TileClipMode;
  private _child: AreaNodeChild | null = null;

  constructor(x: number, y: number, l: number, rec: Rectangle, tilingScheme: TilingScheme);
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    clipArea: TileClipArea
  );
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    clipArea?: TileClipArea
  ) {
    this._tileXYL = { x, y, l };
    this._rectangle = rec;
    this._tilingScheme = tilingScheme;
    this._boundingSphere = BoundingSphere.fromRectangle3D(
      rec,
      tilingScheme.ellipsoid
    );

    if (!clipArea) {
      this._status = TileClipMode.FULL_DISPLAY;
      return;
    }

    const clippedArea = clipAreaToRectangle(clipArea, 0, 0, 1, 1);
    if (clippedArea.polygons.length === 0) {
      this._status = TileClipMode.NONE_DISPLAY;
      return;
    }

    if (areaCoversUnitTile(clippedArea)) {
      this._status = TileClipMode.FULL_DISPLAY;
      return;
    }

    this._clipArea = clippedArea;
    this._status = TileClipMode.NEED_CLIP;
  }

  splitNodeIfNeeded() {
    if (this._child || this._status === TileClipMode.NONE_DISPLAY) {
      return;
    }

    const x0 = this._tileXYL.x;
    const y0 = this._tileXYL.y;
    const l0 = this._tileXYL.l;
    const childLevel = l0 + 1;
    const west0 = this._rectangle.west;
    const east0 = this._rectangle.east;
    const north0 = this._rectangle.north;
    const south0 = this._rectangle.south;
    const lbX = 2 * x0;
    const ltX = 2 * x0;
    const rbX = 2 * x0 + 1;
    const rtX = 2 * x0 + 1;
    const lbY = 2 * y0 + 1;
    const ltY = 2 * y0;
    const rbY = 2 * y0 + 1;
    const rtY = 2 * y0;
    const recLB = this._tilingScheme.tileXYToRectangle(lbX, lbY, childLevel);
    const recLT = this._tilingScheme.tileXYToRectangle(ltX, ltY, childLevel);
    const recRB = this._tilingScheme.tileXYToRectangle(rbX, rbY, childLevel);
    const recRT = this._tilingScheme.tileXYToRectangle(rtX, rtY, childLevel);
    // WebMercator 的上下子瓦片纬度分界不是父瓦片纬度的算术中点，必须用真实 tile rectangle 反算局部比例。
    const splitX = getSplitRatio(recRB.west, west0, east0);
    const splitY = getSplitRatio(recLB.north, south0, north0);

    if (this._status === TileClipMode.FULL_DISPLAY) {
      this._child = {
        lb: new AreaQuadTreeTileNode(
          lbX,
          lbY,
          childLevel,
          recLB,
          this._tilingScheme
        ),
        lt: new AreaQuadTreeTileNode(
          ltX,
          ltY,
          childLevel,
          recLT,
          this._tilingScheme
        ),
        rb: new AreaQuadTreeTileNode(
          rbX,
          rbY,
          childLevel,
          recRB,
          this._tilingScheme
        ),
        rt: new AreaQuadTreeTileNode(
          rtX,
          rtY,
          childLevel,
          recRT,
          this._tilingScheme
        ),
      };
      return;
    }

    const area = this._clipArea!;
    const areaLB = transformArea(clipAreaToRectangle(area, 0, 0, splitX, splitY), (x, y) => [
      x / splitX,
      y / splitY,
    ]);
    const areaLT = transformArea(clipAreaToRectangle(area, 0, splitY, splitX, 1), (x, y) => [
      x / splitX,
      (y - splitY) / (1 - splitY),
    ]);
    const areaRB = transformArea(clipAreaToRectangle(area, splitX, 0, 1, splitY), (x, y) => [
      (x - splitX) / (1 - splitX),
      y / splitY,
    ]);
    const areaRT = transformArea(clipAreaToRectangle(area, splitX, splitY, 1, 1), (x, y) => [
      (x - splitX) / (1 - splitX),
      (y - splitY) / (1 - splitY),
    ]);

    this._child = {
      lb: new AreaQuadTreeTileNode(
        lbX,
        lbY,
        childLevel,
        recLB,
        this._tilingScheme,
        areaLB
      ),
      lt: new AreaQuadTreeTileNode(
        ltX,
        ltY,
        childLevel,
        recLT,
        this._tilingScheme,
        areaLT
      ),
      rb: new AreaQuadTreeTileNode(
        rbX,
        rbY,
        childLevel,
        recRB,
        this._tilingScheme,
        areaRB
      ),
      rt: new AreaQuadTreeTileNode(
        rtX,
        rtY,
        childLevel,
        recRT,
        this._tilingScheme,
        areaRT
      ),
    };
  }

  getTileInfoByLevelInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo>
  ) {
    if (
      this._status === TileClipMode.NONE_DISPLAY ||
      !boundingSpheresIntersect(this._boundingSphere, boundingSphere)
    ) {
      return result;
    }

    if (this._tileXYL.l < level) {
      this.splitNodeIfNeeded();
      if (this._child) {
        this._child.lb.getTileInfoByLevelInBoundingSphere(
          level,
          boundingSphere,
          result
        );
        this._child.lt.getTileInfoByLevelInBoundingSphere(
          level,
          boundingSphere,
          result
        );
        this._child.rb.getTileInfoByLevelInBoundingSphere(
          level,
          boundingSphere,
          result
        );
        this._child.rt.getTileInfoByLevelInBoundingSphere(
          level,
          boundingSphere,
          result
        );
      }
      return result;
    }

    if (this._tileXYL.l === level) {
      result.push({
        tileXYL: this._tileXYL,
        polygon: this._clipArea?.polygons[0]?.exterior ?? null,
        clipArea: this._clipArea,
      });
    }

    return result;
  }

  getTileInfoByLevel(level: number, result: Array<NodeInfo>) {
    if (this._tileXYL.l < level) {
      this.splitNodeIfNeeded();
      if (this._child) {
        this._child.lb.getTileInfoByLevel(level, result);
        this._child.lt.getTileInfoByLevel(level, result);
        this._child.rb.getTileInfoByLevel(level, result);
        this._child.rt.getTileInfoByLevel(level, result);
      }
      return;
    }

    if (this._tileXYL.l === level && this._status !== TileClipMode.NONE_DISPLAY) {
      result.push({
        tileXYL: this._tileXYL,
        polygon: this._clipArea?.polygons[0]?.exterior ?? null,
        clipArea: this._clipArea,
      });
    }
  }

  get child() {
    return this._child;
  }

  get rectangle() {
    return this._rectangle;
  }

  get boundingSphere() {
    return this._boundingSphere;
  }

  get tileXYZ() {
    return this._tileXYL;
  }

  get status() {
    return this._status;
  }
}

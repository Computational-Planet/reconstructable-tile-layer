import { Rectangle, TilingScheme } from "cesium";
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";
import {
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

function normalizeLongitudeLatitudeRing(
  ring: Array<number>,
  rectangle: Rectangle
) {
  const normalized: Array<number> = [];
  const west = rectangle.west;
  const east = rectangle.east;
  const south = rectangle.south;
  const north = rectangle.north;

  for (let i = 0; i < ring.length; i += 2) {
    const longitude = ring[i];
    const latitude = Math.max(-89.5, Math.min(89.5, ring[i + 1]));
    const x = ((longitude * Math.PI) / 180 - west) / (east - west);
    const y = ((latitude * Math.PI) / 180 - south) / (north - south);
    normalized.push(x, y);
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

  get tileXYZ() {
    return this._tileXYL;
  }

  get status() {
    return this._status;
  }
}

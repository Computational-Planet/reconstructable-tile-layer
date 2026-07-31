import { BoundingSphere, Rectangle, TilingScheme } from "cesium";

import { boundingSpheresIntersect } from "./boundingVolumes.js";
import {
  areaCoversUnitTile,
  clipAreaToRectangle,
  getAreaSplitRatio,
  transformArea,
} from "./utils/areaGeometry.js";
import { TileClipMode, type NodeInfo, type NormalizedClipArea, type TileXYL } from "./types.js";

export {
  createTileClipAreaFromFlatPolygon,
  normalizeAreaToTileRectangle,
} from "./utils/areaGeometry.js";

/** The four children of an area-aware quadtree node. */
export interface AreaNodeChild {
  /** Lower-left child tile. */
  lb: AreaQuadTreeTileNode;
  /** Upper-left child tile. */
  lt: AreaQuadTreeTileNode;
  /** Lower-right child tile. */
  rb: AreaQuadTreeTileNode;
  /** Upper-right child tile. */
  rt: AreaQuadTreeTileNode;
}

/**
 * A quadtree node that preserves multipolygons and interior rings while
 * clipping geometry into tile-local coordinates.
 */
export class AreaQuadTreeTileNode {
  private _rectangle: Rectangle;
  private _tilingScheme: TilingScheme;
  private _tileXYL: TileXYL;
  private _boundingSphere: BoundingSphere;
  private _clipArea: NormalizedClipArea | null = null;
  private _status: TileClipMode;
  private _child: AreaNodeChild | null = null;

  /**
   * Creates a tile node that is fully visible unless a normalized clipping
   * area is supplied.
   */
  constructor(x: number, y: number, l: number, rec: Rectangle, tilingScheme: TilingScheme);
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    clipArea: NormalizedClipArea,
  );
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    clipArea?: NormalizedClipArea,
  ) {
    this._tileXYL = { x, y, l };
    this._rectangle = rec;
    this._tilingScheme = tilingScheme;
    this._boundingSphere = BoundingSphere.fromRectangle3D(rec, tilingScheme.ellipsoid);

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

  /** Creates child nodes once, unless this node is completely hidden. */
  splitNodeIfNeeded() {
    if (this._child || this._status === TileClipMode.NONE_DISPLAY) {
      return;
    }

    const x0 = this._tileXYL.x;
    const y0 = this._tileXYL.y;
    const childLevel = this._tileXYL.l + 1;
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

    // Web Mercator does not split latitude at the arithmetic midpoint, so use
    // the child rectangles to recover the exact tile-local split ratios.
    const splitX = getAreaSplitRatio(recRB.west, west0, east0);
    const splitY = getAreaSplitRatio(recLB.north, south0, north0);

    if (this._status === TileClipMode.FULL_DISPLAY) {
      this._child = {
        lb: new AreaQuadTreeTileNode(lbX, lbY, childLevel, recLB, this._tilingScheme),
        lt: new AreaQuadTreeTileNode(ltX, ltY, childLevel, recLT, this._tilingScheme),
        rb: new AreaQuadTreeTileNode(rbX, rbY, childLevel, recRB, this._tilingScheme),
        rt: new AreaQuadTreeTileNode(rtX, rtY, childLevel, recRT, this._tilingScheme),
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
      lb: new AreaQuadTreeTileNode(lbX, lbY, childLevel, recLB, this._tilingScheme, areaLB),
      lt: new AreaQuadTreeTileNode(ltX, ltY, childLevel, recLT, this._tilingScheme, areaLT),
      rb: new AreaQuadTreeTileNode(rbX, rbY, childLevel, recRB, this._tilingScheme, areaRB),
      rt: new AreaQuadTreeTileNode(rtX, rtY, childLevel, recRT, this._tilingScheme, areaRT),
    };
  }

  /** Appends visible tiles at `level` that intersect `boundingSphere`. */
  getTileInfoByLevelInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo>,
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
        this._child.lb.getTileInfoByLevelInBoundingSphere(level, boundingSphere, result);
        this._child.lt.getTileInfoByLevelInBoundingSphere(level, boundingSphere, result);
        this._child.rb.getTileInfoByLevelInBoundingSphere(level, boundingSphere, result);
        this._child.rt.getTileInfoByLevelInBoundingSphere(level, boundingSphere, result);
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

  /** Appends every visible tile at `level` to `result`. */
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

  /** Materialized child nodes, or `null` before splitting. */
  get child() {
    return this._child;
  }

  /** Geographic rectangle represented by this node. */
  get rectangle() {
    return this._rectangle;
  }

  /** Model-space bounding sphere for this node. */
  get boundingSphere() {
    return this._boundingSphere;
  }

  /** Tile coordinates represented by this node. */
  get tileXYZ() {
    return this._tileXYL;
  }

  /** Current relationship between the tile and clipping area. */
  get status() {
    return this._status;
  }
}

import { BoundingSphere, Rectangle, TilingScheme } from "cesium";

import { boundingSpheresIntersect } from "./boundingVolumes.js";
import { TileClipMode, type NodeInfo, type TileXYL } from "./types.js";
import { checkClipMode, clipPolygonByQuadTreeNodes } from "./utils/geometry.js";

export { boundingSpheresIntersect } from "./boundingVolumes.js";
export { TileClipMode } from "./types.js";
export type {
  ClipPolygon,
  GeographicClipArea,
  NodeInfo,
  NormalizedClipArea,
  TileClipArea,
  TileXYL,
} from "./types.js";

/** The four children of a legacy flat-polygon quadtree node. */
export interface NodeChild {
  /** Lower-left child tile. */
  lb: QuadTreeTileNode;
  /** Upper-left child tile. */
  lt: QuadTreeTileNode;
  /** Lower-right child tile. */
  rb: QuadTreeTileNode;
  /** Upper-right child tile. */
  rt: QuadTreeTileNode;
}

/** A quadtree node for one normalized, flat clipping polygon. */
export class QuadTreeTileNode {
  private _rectangle: Rectangle;
  private _tilingScheme: TilingScheme;
  private _tileXYL: TileXYL;
  private _boundingSphere: BoundingSphere;
  private _polygon: Array<number> | null = null;
  private _status: TileClipMode;
  private _child: NodeChild | null = null;

  /**
   * Creates a tile node that is fully visible unless a normalized clipping
   * polygon is supplied.
   */
  constructor(x: number, y: number, l: number, rec: Rectangle, tilingScheme: TilingScheme);
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    polygon: Array<number>,
  );
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    polygon?: Array<number>,
  ) {
    this._tileXYL = { x, y, l };
    this._rectangle = rec;
    this._tilingScheme = tilingScheme;
    this._boundingSphere = BoundingSphere.fromRectangle3D(rec, tilingScheme.ellipsoid);
    if (!polygon) {
      this._status = TileClipMode.FULL_DISPLAY;
    } else {
      this._polygon = polygon;
      this._status = checkClipMode(polygon);
      if (this._status === TileClipMode.NONE_DISPLAY) {
        this._polygon = null;
        this._child = null;
      } else if (this._status === TileClipMode.FULL_DISPLAY) {
        this._polygon = null;
      }
    }
  }

  /** Creates child nodes once, unless this node is completely hidden. */
  splitNodeIfNeeded() {
    if (this._child || this._status === TileClipMode.NONE_DISPLAY) {
      return;
    }

    const x0 = this._tileXYL.x;
    const y0 = this._tileXYL.y;
    const l0 = this._tileXYL.l;
    const west0 = this._rectangle.west;
    const east0 = this._rectangle.east;
    const north0 = this._rectangle.north;
    const south0 = this._rectangle.south;
    const centerWE = (west0 + east0) / 2;
    const centerNS = (south0 + north0) / 2;

    if (this._status === TileClipMode.FULL_DISPLAY) {
      this._child = {
        lb: new QuadTreeTileNode(
          2 * x0,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(west0, south0, centerWE, centerNS),
          this._tilingScheme,
        ),
        lt: new QuadTreeTileNode(
          2 * x0,
          2 * y0,
          l0 + 1,
          new Rectangle(west0, centerNS, centerWE, north0),
          this._tilingScheme,
        ),
        rb: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(centerWE, south0, east0, centerNS),
          this._tilingScheme,
        ),
        rt: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0,
          l0 + 1,
          new Rectangle(centerWE, centerNS, east0, north0),
          this._tilingScheme,
        ),
      };
      return;
    }

    // Web Mercator requires the actual child rectangles to recover the
    // vertical split ratio in tile-local coordinates.
    const recLB = this._tilingScheme.tileXYToRectangle(2 * x0, 2 * y0 + 1, l0 + 1);
    const recLT = this._tilingScheme.tileXYToRectangle(2 * x0, 2 * y0, l0 + 1);
    const ratio = (recLB.north - recLB.south) / (recLT.north - recLB.south);
    const { polygonLB, polygonLT, polygonRB, polygonRT } = clipPolygonByQuadTreeNodes(
      this._polygon!,
      ratio,
    );

    this._child = {
      lb: new QuadTreeTileNode(
        2 * x0,
        2 * y0 + 1,
        l0 + 1,
        new Rectangle(west0, south0, centerWE, centerNS),
        this._tilingScheme,
        polygonLB,
      ),
      lt: new QuadTreeTileNode(
        2 * x0,
        2 * y0,
        l0 + 1,
        new Rectangle(west0, centerNS, centerWE, north0),
        this._tilingScheme,
        polygonLT,
      ),
      rb: new QuadTreeTileNode(
        2 * x0 + 1,
        2 * y0 + 1,
        l0 + 1,
        new Rectangle(centerWE, south0, east0, centerNS),
        this._tilingScheme,
        polygonRB,
      ),
      rt: new QuadTreeTileNode(
        2 * x0 + 1,
        2 * y0,
        l0 + 1,
        new Rectangle(centerWE, centerNS, east0, north0),
        this._tilingScheme,
        polygonRT,
      ),
    };
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
    } else if (this._tileXYL.l === level) {
      if (this._status !== TileClipMode.NONE_DISPLAY) {
        result.push({ tileXYL: this._tileXYL, polygon: this._polygon });
      }
      return;
    }
    return;
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
    } else if (this._tileXYL.l === level) {
      result.push({ tileXYL: this._tileXYL, polygon: this._polygon });
    }

    return result;
  }

  /** Recursively discards all currently materialized child nodes. */
  destroyAllChild() {
    if (this._child) {
      this._child.lb.destroyAllChild();
      this._child.lt.destroyAllChild();
      this._child.rb.destroyAllChild();
      this._child.rt.destroyAllChild();
      this._child = null;
    }
  }

  /** Normalized clipping polygon, or `null` for a full or hidden tile. */
  get polygon() {
    return this._polygon;
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

  /** Current relationship between the tile and clipping polygon. */
  get status() {
    return this._status;
  }
}

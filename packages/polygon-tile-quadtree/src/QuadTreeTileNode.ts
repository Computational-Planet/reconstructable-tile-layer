import { BoundingSphere, Cartesian3, Rectangle, TilingScheme } from "cesium";
import { checkClipMode, clipPolygonByQuadTreeNodes } from "./utils/geometry";

export enum TileClipMode {
  NONE_DISPLAY,
  FULL_DISPLAY,
  NEED_CLIP,
}

export interface TileXYL {
  x: number;
  y: number;
  l: number;
}

export interface ClipPolygon {
  exterior: Array<number>;
  interiors?: Array<Array<number>>;
}

export interface TileClipArea {
  polygons: ClipPolygon[];
}

export interface NodeChild {
  lb: QuadTreeTileNode;
  lt: QuadTreeTileNode;
  rb: QuadTreeTileNode;
  rt: QuadTreeTileNode;
}

export interface NodeInfo {
  tileXYL: TileXYL;
  polygon: Array<number> | null;
  clipArea?: TileClipArea | null;
}

export function boundingSpheresIntersect(
  left: BoundingSphere,
  right: BoundingSphere
) {
  const radiusSum = left.radius + right.radius;
  return (
    Cartesian3.distanceSquared(left.center, right.center) <=
    radiusSum * radiusSum
  );
}

export class QuadTreeTileNode {
  private _rectangle: Rectangle;
  private _tilingScheme: TilingScheme;
  private _tileXYL: TileXYL;
  private _boundingSphere: BoundingSphere;
  private _polygon: Array<number> | null = null;
  private _status: TileClipMode;
  private _child: NodeChild | null = null;

  // 设置两种构造函数。如果不提供多边形则说明完全显示，不需要裁剪
  constructor(x: number, y: number, l: number, rec: Rectangle, tilingScheme: TilingScheme);
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    polygon: Array<number>
  );
  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    tilingScheme: TilingScheme,
    polygon?: Array<number>
  ) {
    this._tileXYL = { x: x, y: y, l: l };
    this._rectangle = rec;
    this._tilingScheme = tilingScheme;
    this._boundingSphere = BoundingSphere.fromRectangle3D(
      rec,
      tilingScheme.ellipsoid
    );
    if (!polygon) {
      this._status = TileClipMode.FULL_DISPLAY;
    } else {
      this._polygon = polygon;
      this._status = checkClipMode(polygon);
      if (this._status === TileClipMode.NONE_DISPLAY) {
        // 如果整个瓦片不显示，则不需要再记录polygon，将子节点置为null（之后将没有子节点了）
        this._polygon = null;
        this._child = null;
      } else if (this._status === TileClipMode.FULL_DISPLAY) {
        // 如果整个瓦片都显示，则之后不需要再记录polygon，直接显示整个瓦片。
        this._polygon = null;
      }
    }
  }

  // 分裂子节点
  splitNodeIfNeeded() {
    if (this._child || this._status === TileClipMode.NONE_DISPLAY) {
      return; //如果瓦片已经生成，或者整个瓦片不显示，则直接退出
    }
    // 获得瓦片xyl
    const x0 = this._tileXYL.x;
    const y0 = this._tileXYL.y;
    const l0 = this._tileXYL.l;
    // 获得矩形四至，以及中心点位置
    const west0 = this._rectangle.west;
    const east0 = this._rectangle.east;
    const north0 = this._rectangle.north;
    const south0 = this._rectangle.south;
    const centerWE = (west0 + east0) / 2;
    const centerNS = (south0 + north0) / 2;
    if (this._status === TileClipMode.FULL_DISPLAY) {
      //如果当前瓦片已经完全显示，则按简化方法拓展节点
      // 创建子节点
      this._child = {
        lb: new QuadTreeTileNode(
          2 * x0,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(west0, south0, centerWE, centerNS),
          this._tilingScheme
        ),
        lt: new QuadTreeTileNode(
          2 * x0,
          2 * y0,
          l0 + 1,
          new Rectangle(west0, centerNS, centerWE, north0),
          this._tilingScheme
        ),
        rb: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(centerWE, south0, east0, centerNS),
          this._tilingScheme
        ),
        rt: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0,
          l0 + 1,
          new Rectangle(centerWE, centerNS, east0, north0),
          this._tilingScheme
        ),
      };
      return;
    }

    // 在接下来的情况下，瓦片状态一定为待裁剪，且此时多边形一定存在。
    // 需要计算切分时y的值：由于3857中上下的瓦片纬度跨度不一样，所以需要具体计算。
    const recLB = this._tilingScheme.tileXYToRectangle(2 * x0, 2 * y0 + 1, l0 + 1);
    const recLT = this._tilingScheme.tileXYToRectangle(2 * x0, 2 * y0, l0 + 1);
    const ratio = (recLB.north - recLB.south) / (recLT.north - recLB.south);
    // 获得裁剪出的子节点多边形
    const { polygonLB, polygonLT, polygonRB, polygonRT } =
      clipPolygonByQuadTreeNodes(this._polygon!, ratio);

    // 创建子节点
    this._child = {
      lb: new QuadTreeTileNode(
        2 * x0,
        2 * y0 + 1,
        l0 + 1,
        new Rectangle(west0, south0, centerWE, centerNS),
        this._tilingScheme,
        polygonLB
      ),
      lt: new QuadTreeTileNode(
        2 * x0,
        2 * y0,
        l0 + 1,
        new Rectangle(west0, centerNS, centerWE, north0),
        this._tilingScheme,
        polygonLT
      ),
      rb: new QuadTreeTileNode(
        2 * x0 + 1,
        2 * y0 + 1,
        l0 + 1,
        new Rectangle(centerWE, south0, east0, centerNS),
        this._tilingScheme,
        polygonRB
      ),
      rt: new QuadTreeTileNode(
        2 * x0 + 1,
        2 * y0,
        l0 + 1,
        new Rectangle(centerWE, centerNS, east0, north0),
        this._tilingScheme,
        polygonRT
      ),
    };
  }

  // 递归拓展树，直到找到所有指定层级的子节点
  getTileInfoByLevel(level: number, result: Array<NodeInfo>) {
    if (this._tileXYL.l < level) {
      // 如果当前四叉树等级还不到要求的等级，则继续分裂并搜索节点
      this.splitNodeIfNeeded(); // 注意：是否需要分裂节点由分裂节点函数自己考虑，不需要在这里判断。
      if (this._child) {
        this._child.lb.getTileInfoByLevel(level, result);
        this._child.lt.getTileInfoByLevel(level, result);
        this._child.rb.getTileInfoByLevel(level, result);
        this._child.rt.getTileInfoByLevel(level, result);
      }
    } else if (this._tileXYL.l === level) {
      // 当前层级正确时，如果当前瓦片并非完全不可见，则将瓦片信息推入结果
      if (this._status !== TileClipMode.NONE_DISPLAY) {
        result.push({ tileXYL: this._tileXYL, polygon: this._polygon });
        // 注意：这里返回的多边形可能是null，当返回值为null时，则意思是当前瓦片完全可见，不需要裁剪。
      }
      return;
    }
    // 如果不是上述情况，则返回。
    return;
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
    } else if (this._tileXYL.l === level) {
      result.push({ tileXYL: this._tileXYL, polygon: this._polygon });
    }

    return result;
  }

  // 递归删除所有的子节点
  destroyAllChild() {
    if (this._child) {
      this._child.lb.destroyAllChild();
      this._child.lt.destroyAllChild();
      this._child.rb.destroyAllChild();
      this._child.rt.destroyAllChild();
      this._child = null;
    }
  }

  get polygon() {
    return this._polygon;
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

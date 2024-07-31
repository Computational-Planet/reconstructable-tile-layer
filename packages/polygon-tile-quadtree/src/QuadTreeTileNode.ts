import { Rectangle } from "cesium";
import { clipPolygonByQuadTreeNodes } from "./utils/geometry";

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

export interface NodeChild {
  lb: QuadTreeTileNode;
  lt: QuadTreeTileNode;
  rb: QuadTreeTileNode;
  rt: QuadTreeTileNode;
}

export interface NodeInfo {
  tileXYL: TileXYL;
  polygon: Array<number>;
}

export class QuadTreeTileNode {
  private _rectangle: Rectangle;
  private _tileXYL: TileXYL;
  private _polygon: Array<number>;
  private _status: TileClipMode;
  private _child: NodeChild | null = null;

  constructor(
    x: number,
    y: number,
    l: number,
    rec: Rectangle,
    polygon: Array<number>
  ) {
    this._tileXYL = { x: x, y: y, l: l };
    this._rectangle = rec;
    this._polygon = polygon;
    if (polygon.length === 0) {
      this._status = TileClipMode.NONE_DISPLAY;
      this._child = null;
    } else {
      this._status = TileClipMode.NEED_CLIP;
    }
  }

  // 分裂子节点
  splitNode() {
    // 如果当前状态健康，且还没有生成子节点，则创建子节点
    if (this._status !== TileClipMode.NONE_DISPLAY && !this._child) {
      // 获得裁剪出的子节点多边形
      const { polygonLB, polygonLT, polygonRB, polygonRT } =
        clipPolygonByQuadTreeNodes(this._polygon);
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
      // 创建子节点
      this._child = {
        lb: new QuadTreeTileNode(
          2 * x0,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(west0, south0, centerWE, centerNS),
          polygonLB
        ),
        lt: new QuadTreeTileNode(
          2 * x0,
          2 * y0,
          l0 + 1,
          new Rectangle(west0, centerNS, centerWE, north0),
          polygonLT
        ),
        rb: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0 + 1,
          l0 + 1,
          new Rectangle(centerWE, south0, east0, centerNS),
          polygonRB
        ),
        rt: new QuadTreeTileNode(
          2 * x0 + 1,
          2 * y0,
          l0 + 1,
          new Rectangle(centerWE, centerNS, east0, north0),
          polygonRT
        ),
      };
    } else this._child = null; //如果整个瓦片都不显示，则不生成子节点
  }

  // 递归拓展树，直到找到所有指定层级的子节点
  getTileInfoByLevel(level: number, result: Array<NodeInfo>) {
    if (this._tileXYL.l < level) {
      // 如果当前四叉树等级还不到要求的等级，则继续分裂并搜索节点
      this.splitNode(); // 注意：是否需要分裂节点由分裂节点函数自己考虑，不需要在这里判断。
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
      }
      return;
    }
    // 如果不是上述情况，则返回。
    return;
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
}

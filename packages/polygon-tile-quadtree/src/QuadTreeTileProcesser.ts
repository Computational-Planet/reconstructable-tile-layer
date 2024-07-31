import { ImageryProvider, Rectangle } from "cesium";
import { NodeInfo, QuadTreeTileNode, TileXYL } from "./QuadTreeTileNode";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { PI_10 } from "./constants";

export class QuadTreeTileProcesser {
  private _imageryProvider: ImageryProvider;
  private _tileProcesser: CesiumTileProcesser;
  private _rectangle: Rectangle | undefined;
  private _rootNum: 1 | 2 = 1; // 根节点数目，1个或2个
  private _rootXYL: TileXYL | null = null;
  private _root: QuadTreeTileNode | null = null; // 当为一个节点时，仅启用根节点
  private _rootRXYL: TileXYL | null = null;
  private _rootR: QuadTreeTileNode | null = null; // 当为两个节点时，启用右侧的根节点

  constructor(
    provider: ImageryProvider, // Cesium影像提供器
    processer: CesiumTileProcesser, // 瓦片处理器
    polygon: Array<number>, // 多边形
    rootXYL: TileXYL // 根节点XYL
  );
  constructor(
    provider: ImageryProvider, // Cesium影像提供器
    processer: CesiumTileProcesser, // 瓦片处理器
    polygon: Array<number>, // 多边形
    rootXYL: TileXYL, // 根节点XYL
    rootRXYL: TileXYL // 右侧根节点XYL
  );
  constructor(
    provider: ImageryProvider, // Cesium影像提供器
    processer: CesiumTileProcesser, // 瓦片处理器
    polygon: Array<number>, // 多边形
    rootXYL: TileXYL, // 根节点XYL
    rootRXYL?: TileXYL // 右侧根节点XYL
  ) {
    this._imageryProvider = provider;
    this._tileProcesser = processer;
    this._rootXYL = rootXYL;
    this._rectangle = provider.tilingScheme.tileXYToRectangle(
      rootXYL.x,
      rootXYL.y,
      rootXYL.l
    );
    // 注，之后还需要考虑多边形的分割问题（如果是分左右的节点则需要分割后再赋值）
    //先将多边形处理为[0,1]
    const west = this._rectangle.west;
    const east = this._rectangle.east;
    const north = this._rectangle.north;
    const south = this._rectangle.south;
    const clipPolygon: Array<number> = [];
    for (let i = 0; i < polygon.length; i = i + 2) {
      clipPolygon.push(
        1.0 - (east - polygon[i] * (PI_10 / 180.0)) / (east - west)
      );
      clipPolygon.push(
        1.0 - (north - polygon[i + 1] * (PI_10 / 180.0)) / (north - south)
      );
    }
    clipPolygon[clipPolygon.length - 2] = clipPolygon[0];
    clipPolygon[clipPolygon.length - 1] = clipPolygon[1];
    //然后构造根节点
    this._root = new QuadTreeTileNode(
      rootXYL.x,
      rootXYL.y,
      rootXYL.l,
      this._rectangle.clone(), // 这里需要克隆，因为Rectangle之后可能还会变化的
      clipPolygon
    );

    // rootNum>2的情况还在施工中
    if (rootRXYL !== undefined) {
      this._rootNum = 2;
      this._rootRXYL == rootRXYL;
      const RectangleR = provider.tilingScheme.tileXYToRectangle(
        rootRXYL.x,
        rootRXYL.y,
        rootRXYL.l
      );

      this._rectangle = Rectangle.simpleIntersection(
        this._rectangle,
        RectangleR
      );
      if (!this._rectangle) {
        throw new Error("未能获得瓦片四叉树矩形区域!");
      }
    }
  }

  findTilesByLevel(level: number, result: Array<NodeInfo>) {
    if (level < this._rootXYL!.l) {
      return [];
    }
    if (this._root) this._root.getTileInfoByLevel(level, result);
    if (this._rootR) this._rootR.getTileInfoByLevel(level, result);
    return result;
  }

  get imageryProvider() {
    return this._imageryProvider;
  }
  get tileProcesser() {
    return this._tileProcesser;
  }
  get rootNum() {
    return this._rootNum;
  }
  get root() {
    return this._root;
  }
  get rootR() {
    return this._rootR;
  }
}

import { ImageryProvider, Rectangle, Math as CesiumMath } from "cesium";
import { NodeInfo, QuadTreeTileNode, TileXYL } from "./QuadTreeTileNode";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { PI_10 } from "./constants";
import { clipToLR } from "./utils/geometry";

// 下一步修改想法：
// 树内记录一个完整的多边形，可以有多个根节点（使用180°经线切分成n块（最多三块？），同时需要处理跨越极点的多边形）。
// 根节点干脆直接设成0，0，0瓦片（4326还需要再看看怎么分配，如果刚好和180°经线一样顺便就切掉了）
// 最后要记录多边形实际的包围盒，用于计算是否在视野范围内。
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
    const rectangleL = provider.tilingScheme.tileXYToRectangle(
      rootXYL.x,
      rootXYL.y,
      rootXYL.l
    );
    this._rectangle = provider.tilingScheme.tileXYToRectangle(
      rootXYL.x,
      rootXYL.y,
      rootXYL.l
    );
    if (rootRXYL) {
      // rootNum>2的情况还在施工中
      this._rootNum = 2;
      this._rootRXYL = rootRXYL;
      const rectangleR = provider.tilingScheme.tileXYToRectangle(
        rootRXYL.x,
        rootRXYL.y,
        rootRXYL.l
      );
      // 最后合并两个矩形范围，作为最终的四叉树多边形范围
      this._rectangle = Rectangle.union(rectangleL, rectangleR);
      if (!this._rectangle) {
        throw new Error("未能获得瓦片四叉树矩形区域!");
      }
    }

    // 先将多边形处理为[0,1]
    // 这里也要做一次坐标变换!
    /* const west = this._rectangle.west;
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
    clipPolygon[clipPolygon.length - 1] = clipPolygon[1]; */
    const west = this._rectangle.west;
    const east = this._rectangle.east;
    const north = this._rectangle.north;
    const south = this._rectangle.south;
    const clipPolygon: Array<number> = [];
    let sinLatitudeSouth = Math.sin(this._rectangle.south);
    const southMercatorY =
      0.5 * Math.log((1 + sinLatitudeSouth) / (1 - sinLatitudeSouth));
    let sinLatitudeNorth = Math.sin(this._rectangle.north);
    const northMercatorY =
      0.5 * Math.log((1 + sinLatitudeNorth) / (1 - sinLatitudeNorth));
    const oneOverMercatorHeight = 1.0 / (northMercatorY - southMercatorY);
    //let outputIndex = 0;
    for (let i = 0; i < polygon.length; i = i + 2) {
      const fraction = 1.0 - (north - polygon[i + 1] * (PI_10 / 180.0)) / (north - south);
      const latitude = CesiumMath.lerp(south, north, fraction);
      let sinLatitude = Math.sin(latitude);
      const mercatorY =
        0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
      const mercatorFraction =
        (mercatorY - southMercatorY) * oneOverMercatorHeight;

      clipPolygon.push(1.0 - (east - polygon[i] * (PI_10 / 180.0)) / (east - west));
      clipPolygon.push(mercatorFraction);
    }
    clipPolygon[clipPolygon.length - 2] = clipPolygon[0];
    clipPolygon[clipPolygon.length - 1] = clipPolygon[1];

    if (!rootRXYL) {
      //然后构造根节点
      this._root = new QuadTreeTileNode(
        rootXYL.x,
        rootXYL.y,
        rootXYL.l,
        rectangleL, // 这里需要克隆，因为这个Rectangle之后可能会变化的
        clipPolygon
      );
    } else {
      const rectangleR = provider.tilingScheme.tileXYToRectangle(
        rootRXYL.x,
        rootRXYL.y,
        rootRXYL.l
      );
      // 将多边形进行裁剪（要求：瓦片四叉树范围一定完全包含多边形）
      const { polygonL, polygonR } = clipToLR(clipPolygon, 0.5);
      // 将左右根节点的坐标恢复到[0,1]的状态
      for (let i = 0; i < polygonL.length; i = i + 2) {
        polygonL[i] = polygonL[i] * 2;
      }
      for (let i = 0; i < polygonR.length; i = i + 2) {
        polygonR[i] = (polygonR[i] - 0.5) * 2;
      }

      // 此时再创建两个根节点
      //然后构造根节点
      this._root = new QuadTreeTileNode(
        rootXYL.x,
        rootXYL.y,
        rootXYL.l,
        this._rectangle.clone(), // 这里需要克隆，因为这个Rectangle之后可能会变化的
        polygonL
      );
      //然后构造右边的根节点
      this._rootR = new QuadTreeTileNode(
        rootRXYL.x,
        rootRXYL.y,
        rootRXYL.l,
        rectangleR.clone(), // 这里需要克隆，因为这个Rectangle之后可能会变化的
        polygonR
      );
    }
  }

  findTilesByLevel(level: number, result: Array<NodeInfo>) {
    if (level < this._rootXYL!.l) {
      console.log("level<");
      return [];
    }
    if (this._root) {
      this._root.getTileInfoByLevel(level, result);
    }
    if (this._rootR) {
      this._rootR.getTileInfoByLevel(level, result);
    }
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
  get rootXYL() {
    return this._rootXYL;
  }
  get root() {
    return this._root;
  }
  get rootR() {
    return this._rootR;
  }
  get rootRXYL() {
    return this._rootRXYL;
  }
}

export { NodeInfo }

import {
  BoundingSphere,
  ImageryProvider,
  Matrix4,
  Rectangle,
  TilingScheme,
  WebMercatorTilingScheme,
} from "cesium";
import {
  boundingSpheresIntersect,
  QuadTreeTileNode,
  TileClipMode,
} from "./QuadTreeTileNode";
import type { ClipPolygon, NodeInfo, TileClipArea, TileXYL } from "./QuadTreeTileNode";
import { ANGLE_ACCURATE, DEFAULT_ACCURATE, PI_10 } from "./constants";
import { calIntersectionWithX, clipToLR, Point } from "./utils/geometry";
import { AreaQuadTreeTileNode, normalizeAreaToTileRectangle } from "./AreaQuadTreeTileNode";


type CrossInfo = {
  index: number; // 在多边形中的索引
  magnify: boolean; // 是否是在经度增加的过程中跨越边界
}

function isTileClipArea(value: Array<number> | TileClipArea): value is TileClipArea {
  return !Array.isArray(value) && Array.isArray(value.polygons);
}
// 下一步修改想法：
// 树内记录一个完整的多边形，可以有多个根节点（使用180°经线切分成n块（最多三块？），同时需要处理跨越极点的多边形）。
// 根节点初始直接设成0，0，0瓦片（4326还需要再看看怎么分配，如果刚好和180°经线一样顺便就切掉了），之后在裁剪的时候分出去。可以多加一个函数，用于重新计算根节点，可以递归拓展根节点，直到根节点的子节点不再是只有唯一一个子节点。（至少有两个子节点多边形不为空）
// 最后要记录多边形实际的包围盒，用于计算是否在视野范围内。
export class QuadTreeTileProcesser {
  private _tilingScheme: TilingScheme = new WebMercatorTilingScheme();
  private _rectangle: Array<Rectangle> = []; //记录多边形的包围盒，用作视野估算
  private _boundingSpheres: Array<BoundingSphere> = []; // 现代坐标系下的包围球
  private _currentBoundingSpheres: Array<BoundingSphere> = []; // 按当前板块旋转后的包围球
  private _polygon: Array<number> = []; // 原始多边形数据
  private _sourceGeometry: Array<number> | TileClipArea = [];
  private _rootNum: number = 0; // 根节点数目，1个或2个
  private _rootXYLs: Array<TileXYL> = []; //根节点的XYL
  private _realRootLevel: Array<number> = []; // 真正的根节点层级
  private _roots: Array<QuadTreeTileNode> = []; // 根节点数组
  private _areaMode = false;
  private _areaRoots: Array<AreaQuadTreeTileNode> = [];

  // 要求：多边形首尾相同
  constructor(
    tilingScheme: TilingScheme, // 需要事先知道切片方案
    polygon: Array<number> | TileClipArea, // 多边形，或带洞的 MultiPolygon 面域
  ) {
    this.init(tilingScheme, polygon);
  }

  private init(tilingScheme: TilingScheme, polygon: Array<number> | TileClipArea) {
    this._tilingScheme = tilingScheme;
    this._sourceGeometry = polygon;
    if (isTileClipArea(polygon)) {
      this.initArea(tilingScheme, polygon);
      return;
    }

    this._polygon = polygon;
    this._rootNum = 0;
    this._rootXYLs = [];
    this._realRootLevel = [];
    this._roots = [];
    this._areaRoots = [];
    this._boundingSpheres = [];
    this._currentBoundingSpheres = [];
    this._areaMode = false;

    for (let i = 0; i < this._polygon.length; i = i + 2) {
      if (this._polygon[i + 1] > 89.5) {
        this._polygon[i + 1] = 89.5;
      }
      if (this._polygon[i + 1] < -89.5) {
        this._polygon[i + 1] = -89.5;
      }
    }

    const normalizedPolygon: Array<number> = []; // 归一化的多边形

    // 归一化顶点
    // 在归一化的同时计算：累计角度（用于判断是否跨越极点）、跨越180°经线次数、顶点在左右半球的分布情况（用于4326裁剪）

    const oriRectangle = tilingScheme.tileXYToRectangle(0, 0, 0);

    const west = oriRectangle.west;
    const east = oriRectangle.east;
    const north = oriRectangle.north;
    const south = oriRectangle.south;

    let angleSum = 0; // 角度和，用于记录是否跨越极点
    let avgLat = 0; // 纬度平均值，用于判断在南北半球。（极点用）
    const crossIndex: Array<CrossInfo> = [] //记录所有穿越记录

    let hasL = false; // 是否具有经度为-180~0的点（用于4326裁剪）
    let hasR = false; // 是否具有经度为0~180的点（用于4326裁剪）
    for (let i = 0; i < this._polygon.length; i = i + 2) {
      if (i !== 0) {
        //计算经度之差
        let angleDif = this._polygon[i] - this._polygon[i - 2];
        //当相邻两点经度之差超过180°，判断为跨越了180°经线。
        if (Math.abs(this._polygon[i]) > 120 && Math.abs(this._polygon[i - 2]) > 120 && Math.abs(angleDif) > 180) {

          if (angleDif < 0) {
            angleDif = 360 + angleDif;// 计算正确的角度差
            crossIndex.push({ index: i - 2, magnify: true }); //记录上一个顶点的index（i指向经度,180~-180）
          }
          else {
            angleDif = angleDif - 360;
            crossIndex.push({ index: i - 2, magnify: false }); //记录上一个顶点的index（i指向经度,-180~180）
          }
        }
        angleSum += angleDif;
      }
      // 判断顶点在左右半球的分布情况
      if (!hasL || !hasR) {
        if (this._polygon[i] < 0) hasL = true;
        if (this._polygon[i] > 0) hasR = true;
      }
      // 多边形数据首尾顶点一致，不必重复计算
      if (i != this._polygon.length - 2) {
        avgLat += this._polygon[i + 1] / this._polygon.length; // 累加纬度均值
      }

      //做好归一化
      normalizedPolygon.push(1.0 - (east - this._polygon[i] * (PI_10 / 180.0)) / (east - west));
      normalizedPolygon.push(1.0 - (north - this._polygon[i + 1] * (PI_10 / 180.0)) / (north - south));
    }// 至此，初步归一化已完成，接下来需要按顺序完成其他处理。

    //首先计算几条跨越的边和180°经线的交点(若无这步自动跳过)
    const intersectionPoint: Array<Point> = [];
    for (let i = 0; i < crossIndex.length; i++) {
      const x1 = this._polygon[crossIndex[i].index];
      const y1 = this._polygon[crossIndex[i].index + 1];
      if (crossIndex[i].magnify) {
        const x2 = this._polygon[crossIndex[i].index + 2] + 360;
        const y2 = this._polygon[crossIndex[i].index + 3];
        intersectionPoint.push(calIntersectionWithX({ x: x1, y: y1 }, { x: x2, y: y2 }, 180));
      }
      else {
        const x2 = this._polygon[crossIndex[i].index + 2] - 360;
        const y2 = this._polygon[crossIndex[i].index + 3];
        console.log("x1:" + x1, "y1" + y1 + "x2" + x2 + "y2" + y2);
        intersectionPoint.push(calIntersectionWithX({ x: x1, y: y1 }, { x: x2, y: y2 }, -180));
      }
    }
    /*     console.log("穿越点个数" + crossIndex.length); */

    //若经度差之和与360°之差达到精度要求，则说明是跨越极点的多边形。
    if (Math.abs(Math.abs(angleSum) - 360) < ANGLE_ACCURATE) {
      /*       console.log("处理极点");
            console.log(this._polygon);
            console.log(crossIndex[0].index); */
      if (crossIndex.length === 0) {
        throw Error("四叉树构建出错：多边形包含极点，但却没有跨越180°经线");
      }
      // 被选中用于插入衔接点的穿越边
      let selectedCrossIndex: number = 0;
      // 4个插入点中的中间两个（全由-180，80，180，90四个值组成）
      let point1: Point;
      let point2: Point;
      if (avgLat >= 0) {
        //北半球:找到交点中纬度最高的，从该点处开始插入交点和极点上的顶点(90)
        for (let i = 1; i < crossIndex.length; i++) {
          if (intersectionPoint[i].y > intersectionPoint[selectedCrossIndex].y) selectedCrossIndex = i;
        }

        if (crossIndex[selectedCrossIndex].magnify) {
          //向右，则依次插入（180，交点y）(180,90),(-180,90)（-180,交点y）
          point1 = { x: 180, y: 89.5 }
          point2 = { x: -180, y: 89.5 }
        }
        else {
          //向左，则依次插入（-180，交点y）(-180,90),(180,90)（180，交点y）
          point1 = { x: -180, y: 89.5 }
          point2 = { x: 180, y: 89.5 }
        }
      }
      else {
        //南半球:找到交点中纬度最低的，从该点处开始插入交点和极点上的顶点(-90)
        for (let i = 1; i < crossIndex.length; i++) {
          if (intersectionPoint[i].y < intersectionPoint[selectedCrossIndex].y) selectedCrossIndex = i;
        }
        if (crossIndex[selectedCrossIndex].magnify) {
          //向右，则依次插入（180，交点y）(180,-90),(-180,-90)（-180,交点y）
          point1 = { x: 180, y: -89.5 }
          point2 = { x: -180, y: -89.5 }
        }
        else {
          //向左，则依次插入（-180，交点y）(-180,-90),(180,-90)（180，交点y）
          point1 = { x: -180, y: -89.5 }
          point2 = { x: 180, y: -89.5 }
        }
      }
      //从第二个点的位置开始插入（共插入四个点，即8个数字）
      console.log(point1);
      console.log(point2);
      normalizedPolygon.splice(crossIndex[selectedCrossIndex].index + 2, 0, ...[
        1.0 - (east - point1.x * (PI_10 / 180.0)) / (east - west),
        1.0 - (north - intersectionPoint[selectedCrossIndex].y * (PI_10 / 180.0)) / (north - south),
        1.0 - (east - point1.x * (PI_10 / 180.0)) / (east - west),
        1.0 - (north - point1.y * (PI_10 / 180.0)) / (north - south),
        1.0 - (east - point2.x * (PI_10 / 180.0)) / (east - west),
        1.0 - (north - point2.y * (PI_10 / 180.0)) / (north - south),
        1.0 - (east - point2.x * (PI_10 / 180.0)) / (east - west),
        1.0 - (north - intersectionPoint[selectedCrossIndex].y * (PI_10 / 180.0)) / (north - south)
      ]);
      // 这里其实还有点问题，没有处理残余的跨越180°经线的顶点，还需要实践看看影响大不大。（就怕那些在180°经线上反复横跳的变态多边形。。）
      // 但改这个有点难，因为插入点的原因导致原index被打乱了。
      // 重新校准crossIndex.首先删除使用过的这个交点，然后将插入点后面的index加8
      const standardIndex = crossIndex[selectedCrossIndex].index; // 记录插入位置index
      crossIndex.splice(selectedCrossIndex, 1); // 删除使用过的穿越点
      intersectionPoint.splice(selectedCrossIndex, 1); // 删除使用过的交点
      for (let i = 0; i < crossIndex.length; i++) {
        if (crossIndex[i].index > standardIndex) crossIndex[i].index = crossIndex[i].index + 8;
      }
      console.log(normalizedPolygon)
    }
    // 极点处理完毕，现在已均处理成不跨越极点的多边形。接下来继续处理其他的跨越180°经线的边。拆分成多个多边形。

    //首先要确保穿越点成对，否则说明数据有问题。（直接存入算了）
    //将多边形顶点分成两部分，一对穿越点之间的顶点归类到第二部分，其他归类到第一部分。
    //先分成多个多边形存一次，然后以0°裁剪的时候就不用存了，直接生成根节点即可。
    const polygons: Array<Array<number>> = [];
    if (crossIndex.length % 2 !== 0) {
      polygons.push(normalizedPolygon);
      console.warn("穿越点数为奇数，数据处理异常。")
      console.warn(crossIndex);
    }
    else if (crossIndex.length === 0) {
      polygons.push(normalizedPolygon);
    }
    else {
      console.log(intersectionPoint);
      let flag = -1;
      const oriPolygon: Array<number> = [];
      const clipPolygon: Array<number> = [];
      for (let i = 0; i < normalizedPolygon.length; i = i + 2) {
        //注：crossIndex一定是从小到大排列的
        //当遍历到下一个穿越点时，需要存入顶点并切换状态
        if (flag + 1 < crossIndex.length && i - 2 === crossIndex[flag + 1].index) {

          if (flag % 2 !== 0) {
            oriPolygon.push(...[
              1.0 - (east - intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
              1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south)
            ]);
            clipPolygon.push(...[
              1.0 - (east - (-intersectionPoint[flag + 1].x) * (PI_10 / 180.0)) / (east - west),
              1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south)
            ]);
          }
          else {
            clipPolygon.push(...[
              1.0 - (east - intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
              1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south)
            ]);
            oriPolygon.push(...[
              1.0 - (east - (-intersectionPoint[flag + 1].x) * (PI_10 / 180.0)) / (east - west),
              1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south)
            ]);
          }
          flag++
        }
        if (flag % 2 !== 0) {
          oriPolygon.push(...[normalizedPolygon[i], normalizedPolygon[i + 1]]);
        }
        else {
          clipPolygon.push(...[normalizedPolygon[i], normalizedPolygon[i + 1]]);
        }
      }
      //接下来要补齐两个多边形的最后一点，如果和第一个点不同则要补上：
      if (
        oriPolygon.length !== 0 &&
        (Math.abs(oriPolygon[0] - oriPolygon[oriPolygon.length - 2]) > DEFAULT_ACCURATE ||
          Math.abs(oriPolygon[1] - oriPolygon[oriPolygon.length - 1]) > DEFAULT_ACCURATE)
      ) {
        oriPolygon.push(oriPolygon[0]);
        oriPolygon.push(oriPolygon[1]);
      }
      if (
        clipPolygon.length !== 0 &&
        (Math.abs(clipPolygon[0] - clipPolygon[clipPolygon.length - 2]) > DEFAULT_ACCURATE ||
          Math.abs(clipPolygon[1] - clipPolygon[clipPolygon.length - 1]) > DEFAULT_ACCURATE)
      ) {
        clipPolygon.push(clipPolygon[0]);
        clipPolygon.push(clipPolygon[1]);
      }
      polygons.push(oriPolygon);
      polygons.push(clipPolygon);
      console.log(polygons)
    }
    /* console.log("polygons-length: " + polygons.length) */

    // 最后，根据投影进行分别处理。如果是3857，则需要重投影；4326则需要以0°经线裁剪。

    if (tilingScheme instanceof WebMercatorTilingScheme) {
      for (let i = 0; i < polygons.length; i++) {
        this._rootNum++;
        this._rootXYLs.push({ x: 0, y: 0, l: 0 })
        this._roots.push(
          new QuadTreeTileNode(
            0,
            0,
            0,
            this._tilingScheme.tileXYToRectangle(0, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
            this._tilingScheme,
            polygons[i]
          ));
        /* const reprojPolygon: Array<number> = [];
        let sinLatitudeSouth = Math.sin(south);
        const southMercatorY =
          0.5 * Math.log((1 + sinLatitudeSouth) / (1 - sinLatitudeSouth));
        let sinLatitudeNorth = Math.sin(north);
        const northMercatorY =
          0.5 * Math.log((1 + sinLatitudeNorth) / (1 - sinLatitudeNorth));
        const oneOverMercatorHeight = 1.0 / (northMercatorY - southMercatorY);
        //let outputIndex = 0;
        for (let j = 0; j < polygons[i].length; j = j + 2) {
          const fraction = polygons[i][j + 1];
          const latitude = CesiumMath.lerp(south, north, fraction);
          let sinLatitude = Math.sin(latitude);
          const mercatorY =
            0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
          const mercatorFraction =
            (mercatorY - southMercatorY) * oneOverMercatorHeight;
          reprojPolygon.push(...[polygons[i][j], mercatorFraction]);
        }
        this._rootNum++;
        this._rootXYLs.push({ x: 0, y: 0, l: 0 })
        this._roots.push(
          new QuadTreeTileNode(
            0,
            0,
            0,
            this._tilingScheme.tileXYToRectangle(0, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
            this._tilingScheme,
            reprojPolygon
          )); */
      }
    }
    else {
      for (let i = 0; i < polygons.length; i++) {
        if (hasL && hasR) {
          // 左右都有
          // 以x=1裁剪
          const { polygonL, polygonR } = clipToLR(polygons[i], 1);
          /*           console.log("to LR");
                    console.log(polygons[i]);
                    console.log(polygonL);
                    console.log(polygonR); */
          // 校准右边的多边形
          for (let j = 0; j < polygonR.length; j = j + 2) {
            polygonR[j] = polygonR[j] - 1;
          }
          this._rootNum = this._rootNum + 2;
          this._rootXYLs.push(...[{ x: 0, y: 0, l: 0 }, { x: 1, y: 0, l: 0 }])
          this._roots.push(
            ...[new QuadTreeTileNode(
              0,
              0,
              0,
              this._tilingScheme.tileXYToRectangle(0, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
              this._tilingScheme,
              polygonL
            ), new QuadTreeTileNode(
              1,
              0,
              0,
              this._tilingScheme.tileXYToRectangle(1, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
              this._tilingScheme,
              polygonR
            )]);
        }
        else if (hasL) {
          // 仅有左边
          this._rootNum++;
          this._rootXYLs.push({ x: 0, y: 0, l: 0 })
          this._roots.push(
            new QuadTreeTileNode(
              0,
              0,
              0,
              this._tilingScheme.tileXYToRectangle(0, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
              this._tilingScheme,
              polygons[i]
            ));
        }
        else {
          // 仅有右边
          for (let j = 0; j < polygons[i].length; j = j + 2) {
            polygons[i][j] = polygons[i][j] - 1;
          }
          this._rootNum++;
          this._rootXYLs.push({ x: 1, y: 0, l: 0 })
          this._roots.push(
            new QuadTreeTileNode(
              1,
              0,
              0,
              this._tilingScheme.tileXYToRectangle(1, 0, 0), // 这里需要克隆，因为这个Rectangle之后可能会变化的
              this._tilingScheme,
              polygons[i]
            ));
        }
      }
    }
    this.calBoundingBox();
  }

  private initArea(tilingScheme: TilingScheme, area: TileClipArea) {
    this._tilingScheme = tilingScheme;
    this._polygon = [];
    this._rootNum = 0;
    this._rootXYLs = [];
    this._realRootLevel = [];
    this._roots = [];
    this._areaRoots = [];
    this._boundingSpheres = [];
    this._currentBoundingSpheres = [];
    this._areaMode = true;

    const rootXCount = tilingScheme.getNumberOfXTilesAtLevel(0);
    const rootYCount = tilingScheme.getNumberOfYTilesAtLevel(0);
    for (let y = 0; y < rootYCount; y++) {
      for (let x = 0; x < rootXCount; x++) {
        const rectangle = tilingScheme.tileXYToRectangle(x, y, 0);
        const localArea = normalizeAreaToTileRectangle(area, rectangle);
        const node = new AreaQuadTreeTileNode(
          x,
          y,
          0,
          rectangle,
          tilingScheme,
          localArea
        );
        if (node.status === TileClipMode.NONE_DISPLAY) {
          continue;
        }

        this._rootNum++;
        this._rootXYLs.push({ x, y, l: 0 });
        this._areaRoots.push(node);
      }
    }

    this.calAreaBoundingBox();
  }

  findTilesByLevel(level: number, result: Array<NodeInfo>) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        this._areaRoots[i].getTileInfoByLevel(level, subResult);
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      this._roots[i].getTileInfoByLevel(level, subResult);
      result.push(...subResult);
    }
    /* if (this.rootNum > 1) {
      console.log("result:" + result);
    } */
    return result;
  }

  findTilesByLevelInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo>
  ) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        this._areaRoots[i].getTileInfoByLevelInBoundingSphere(
          level,
          boundingSphere,
          subResult
        );
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      this._roots[i].getTileInfoByLevelInBoundingSphere(
        level,
        boundingSphere,
        subResult
      );
      result.push(...subResult);
    }
    return result;
  }

  findTilesAtRoot(result: Array<NodeInfo>) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        const level = this._realRootLevel[i] > 3 ? this._realRootLevel[i] : 3;
        this._areaRoots[i].getTileInfoByLevel(level, subResult);
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      const level = this._realRootLevel[i] > 3 ? this._realRootLevel[i] : 3;
      this._roots[i].getTileInfoByLevel(level, subResult);
      result.push(...subResult);
      console.log("level" + this._realRootLevel[i])
    }
    /* if (this.rootNum > 1) {
      console.log("result:" + result);
    } */
    return result;
  }

  // 重新计算包围盒范围（根据实际的根节点）
  calBoundingBox() {
    this._rectangle = [];
    this._realRootLevel = [];
    for (let i = 0; i < this.rootNum; i++) {
      let currentNode = this._roots[i];
      while (true) {
        let count = 0;
        currentNode.splitNodeIfNeeded();
        // 统计节点数
        if (currentNode.child?.lb.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.lt.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.rb.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.rt.status !== TileClipMode.NONE_DISPLAY) count++;
        // 如果当前节点拥有超过一个子节点，当前节点为新的根节点（只记录包围和）
        /* console.log("count:" + count); */
        if (count > 1) {
          this._rectangle.push(currentNode.rectangle);
          this._realRootLevel.push(currentNode.tileXYZ.l);
          break;
        }
        // 如果没有子节点，则报错并返回。
        if (count === 0) { console.error("No Child Node"); return; }

        // 若只有一个子节点则继续向下拓展
        if (currentNode.child && currentNode.child?.lb.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.lb;
        if (currentNode.child && currentNode.child?.lt.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.lt;
        if (currentNode.child && currentNode.child?.rb.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.rb;
        if (currentNode.child && currentNode.child?.rt.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.rt;
      }
    }
    this.rebuildBoundingSpheres();
    //console.log(this._rectangle)
  }

  private calAreaBoundingBox() {
    this._rectangle = [];
    this._realRootLevel = [];
    for (let i = 0; i < this.rootNum; i++) {
      let currentNode = this._areaRoots[i];
      while (true) {
        let count = 0;
        currentNode.splitNodeIfNeeded();
        if (currentNode.child?.lb.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.lt.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.rb.status !== TileClipMode.NONE_DISPLAY) count++;
        if (currentNode.child?.rt.status !== TileClipMode.NONE_DISPLAY) count++;

        if (count > 1 || currentNode.status === TileClipMode.FULL_DISPLAY) {
          this._rectangle.push(currentNode.rectangle);
          this._realRootLevel.push(currentNode.tileXYZ.l);
          break;
        }

        if (count === 0 || !currentNode.child) {
          this.rebuildBoundingSpheres();
          return;
        }

        if (currentNode.child.lb.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.lb;
        else if (currentNode.child.lt.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.lt;
        else if (currentNode.child.rb.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.rb;
        else if (currentNode.child.rt.status !== TileClipMode.NONE_DISPLAY) currentNode = currentNode.child.rt;
      }
    }
    this.rebuildBoundingSpheres();
  }

  private rebuildBoundingSpheres() {
    this._boundingSpheres = this._rectangle.map((rectangle) =>
      BoundingSphere.fromRectangle3D(rectangle, this._tilingScheme.ellipsoid)
    );
    this.updateBoundingSpheres(Matrix4.IDENTITY);
  }

  updateBoundingSpheres(modelMatrix: Matrix4 = Matrix4.IDENTITY) {
    this._currentBoundingSpheres = this._boundingSpheres.map((sphere) =>
      BoundingSphere.transformWithoutScale(
        sphere,
        modelMatrix,
        new BoundingSphere()
      )
    );
    return this._currentBoundingSpheres;
  }

  intersectsCurrentBoundingSphere(boundingSphere: BoundingSphere) {
    return this._currentBoundingSpheres.some((currentSphere) =>
      boundingSpheresIntersect(currentSphere, boundingSphere)
    );
  }

  // 当图层更新时判断是否要重新构建树
  updateProvider(provider: ImageryProvider) {
    if ((provider.tilingScheme instanceof this._tilingScheme.constructor)) {
      return;
    }
    else {
      this.init(provider.tilingScheme, this._sourceGeometry);
    }
  }
  //根据新多边形重新建立树
  updatePolygon(polygon: Array<number> | TileClipArea) {
    this.init(this._tilingScheme, polygon);
  }


  get tilingScheme() {
    return this._tilingScheme;
  }
  get rootNum() {
    return this._rootNum;
  }
  get rootXYLs() {
    return this._rootXYLs;
  }
  get roots() {
    return this._roots;
  }

  get polygon() {
    return this._polygon;
  }

  get rectangle() {
    return this._rectangle;
  }

  get boundingSpheres() {
    return this._boundingSpheres;
  }

  get currentBoundingSpheres() {
    return this._currentBoundingSpheres;
  }
}

export type { ClipPolygon, NodeInfo, TileClipArea }

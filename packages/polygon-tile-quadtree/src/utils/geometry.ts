// 使用基于四叉树优化的SutherlandHodgmanClip多边形裁剪算法裁剪多边形
// 算法说明：根据中间的十字，分两步裁剪。首先将多边形裁剪成左右两边，然后再根据多边形
// 初始状态下，多边形的坐标都是相对于[0,1]的区间的，即父组件区间。
// 因此，初始瓦片范围也是[0,1]

import { DEFAULT_ACCURATE } from "src/constants";
import { TileClipMode } from "src/QuadTreeTileNode";

// 在计算完成后需要遍历所有的子多边形，将他们的坐标恢复到[0, 1]的状态。
export function clipPolygonByQuadTreeNodes(polygon: Array<number>) {
  // 切分出左右多边形，由x=0.5进行切割
  const { polygonL, polygonR } = clipToLR(polygon, 0.5);
  // console.log({ polygonL, polygonR });
  // 初始化四角多边形
  // 由polygonL切分，由y=0.5
  const { polygonB: polygonLB, polygonT: polygonLT } = clipToBT(polygonL, 0.5);
  // 将由polygonR生成
  const { polygonB: polygonRB, polygonT: polygonRT } = clipToBT(polygonR, 0.5);
  // 接下来需要分别校准四个多边形的坐标，使之回到[0,1]
  for (let i = 0; i < polygonLB.length; i = i + 2) {
    polygonLB[i] = polygonLB[i] * 2;
    polygonLB[i + 1] = polygonLB[i + 1] * 2;
  }
  for (let i = 0; i < polygonLT.length; i = i + 2) {
    polygonLT[i] = polygonLT[i] * 2;
    polygonLT[i + 1] = (polygonLT[i + 1] - 0.5) * 2;
  }
  for (let i = 0; i < polygonRB.length; i = i + 2) {
    polygonRB[i] = (polygonRB[i] - 0.5) * 2;
    polygonRB[i + 1] = polygonRB[i + 1] * 2;
  }
  for (let i = 0; i < polygonRT.length; i = i + 2) {
    polygonRT[i] = (polygonRT[i] - 0.5) * 2;
    polygonRT[i + 1] = (polygonRT[i + 1] - 0.5) * 2;
  }
  // 返回四个多边形(有可能是空的，但是不影响之前的运算，在建树时判断吧)
  return { polygonLB, polygonLT, polygonRB, polygonRT };
}
enum LPStatus { // 前一点的状态
  INITIAL,
  LEFT,
  RIGHT,
  BOTTOM,
  TOP,
  //MIDDLE, // 注，MIDDLE状态下则在分界线上
}
// 裁剪为左右
export function clipToLR(polygon: Array<number>, xi: number) {
  let polygonL: Array<number> = [];
  let polygonR: Array<number> = [];
  let lastP: LPStatus = LPStatus.INITIAL;
  for (let i = 0; i < polygon.length - 1; i = i + 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    // 现实中估计是不存在边界情况的，姑且都以左边取等号
    if (x <= xi) {
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.LEFT) {
        // 当为初始状态或上一点也在左边时，只用把这点加到左边即可
        polygonL.push(x);
        polygonL.push(y);
      } else if (lastP === LPStatus.RIGHT) {
        // 当上一点在右边时，需要计算交点
        const x0 = polygonR[polygonR.length - 2];
        const y0 = polygonR[polygonR.length - 1];
        // 解算方程
        // 注：不可能发生k不存在的情况，因为两边的x严格没有交集
        const k = (y - y0) / (x - x0);
        const b = y - k * x;
        // 计算交点处yi
        const yi = k * xi + b;
        // 左边多边形压入交点和当前点
        polygonL.push(xi);
        polygonL.push(yi);
        polygonL.push(x);
        polygonL.push(y);
        // 右边多边形压入交点
        polygonR.push(xi);
        polygonR.push(yi);
      }
      // 标识上一点状态为左边
      lastP = LPStatus.LEFT;
    } else if (x > xi) {
      // 当点在右边时反过来处理
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.RIGHT) {
        // 当为初始状态或上一点也在右边时，只用把这点加到右边即可
        polygonR.push(x);
        polygonR.push(y);
      } else if (lastP === LPStatus.LEFT) {
        // 当上一点在左边时，需要计算交点
        const x0 = polygonL[polygonL.length - 2];
        const y0 = polygonL[polygonL.length - 1];
        // 解算方程
        // 注：不可能发生k不存在的情况，因为两边的x严格没有交集
        const k = (y - y0) / (x - x0);
        const b = y - k * x;
        // 计算交点处yi
        const yi = k * xi + b;
        // 右边多边形压入交点和当前点
        polygonR.push(xi);
        polygonR.push(yi);
        polygonR.push(x);
        polygonR.push(y);
        // 左边多边形压入交点
        polygonL.push(xi);
        polygonL.push(yi);
      }
      // 标识上一点状态为右边
      lastP = LPStatus.RIGHT;
    }
  }
  //补齐L与R的首个点
  if (
    polygonL.length !== 0 &&
    (Math.abs(polygonL[0] - polygonL[polygonL.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonL[1] - polygonL[polygonL.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonL.push(polygonL[0]);
    polygonL.push(polygonL[1]);
  }
  if (
    polygonR.length !== 0 &&
    (Math.abs(polygonR[0] - polygonR[polygonR.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonR[1] - polygonR[polygonR.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonR.push(polygonR[0]);
    polygonR.push(polygonR[1]);
  }
  return { polygonL, polygonR };
}

// 裁剪为上下
export function clipToBT(polygon: Array<number>, yi: number) {
  let polygonB: Array<number> = [];
  let polygonT: Array<number> = [];
  let lastP: LPStatus = LPStatus.INITIAL;
  for (let i = 0; i < polygon.length - 1; i = i + 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    // 现实中估计是不存在边界情况的，姑且都以小于号取等号
    if (y <= yi) {
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.BOTTOM) {
        polygonB.push(x);
        polygonB.push(y);
      } else if (lastP === LPStatus.TOP) {
        // 当上一点在右边时，需要计算交点
        const x0 = polygonT[polygonT.length - 2];
        const y0 = polygonT[polygonT.length - 1];
        // 解算方程
        let k, xi, b;
        if (x - x0 === 0) {
          //需要考虑k不存在情况
          xi = x;
        } else {
          k = (y - y0) / (x - x0);
          b = y - k * x;
          // 计算交点处yi
          xi = (yi - b) / k;
        }

        // 左边多边形压入交点和当前点
        polygonB.push(xi);
        polygonB.push(yi);
        polygonB.push(x);
        polygonB.push(y);
        // 右边多边形压入交点
        polygonT.push(xi);
        polygonT.push(yi);
      }
      // 标识上一点状态为左边
      lastP = LPStatus.BOTTOM;
    } else if (y > yi) {
      // 当点在右边时反过来处理
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.TOP) {
        // 当为初始状态或上一点也在右边时，只用把这点加到右边即可
        polygonT.push(x);
        polygonT.push(y);
      } else if (lastP === LPStatus.BOTTOM) {
        // 当上一点在左边时，需要计算交点
        const x0 = polygonB[polygonB.length - 2];
        const y0 = polygonB[polygonB.length - 1];
        // 解算方程
        let k, xi, b;
        if (x - x0 === 0) {
          //需要考虑k不存在情况
          xi = x;
        } else {
          k = (y - y0) / (x - x0);
          b = y - k * x;
          // 计算交点处yi
          xi = (yi - b) / k;
        }
        // 右边多边形压入交点和当前点
        polygonT.push(xi);
        polygonT.push(yi);
        polygonT.push(x);
        polygonT.push(y);
        // 左边多边形压入交点
        polygonB.push(xi);
        polygonB.push(yi);
      }
      // 标识上一点状态为右边
      lastP = LPStatus.TOP;
    }
  }
  //如果多边形末尾缺少首个点，则补齐（需要考虑精度）
  if (
    polygonB.length !== 0 &&
    (Math.abs(polygonB[0] - polygonB[polygonB.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonB[1] - polygonB[polygonB.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonB.push(polygonB[0]);
    polygonB.push(polygonB[1]);
  }
  if (
    polygonT.length !== 0 &&
    (Math.abs(polygonT[0] - polygonT[polygonT.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonT[1] - polygonT[polygonT.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonT.push(polygonT[0]);
    polygonT.push(polygonT[1]);
  }
  return { polygonB, polygonT };
}

// 判断节点多边形是否占满裁剪窗口的算法：
// 可以应对有重叠边的情况
//将遍历顶点的步骤划分为四个状态
// 这里用数字标识状态方便计算
function checkPointState(x: number, y: number) {
  if (y === 0 && x < 1) return 0; // 对应(0,0)到(1,0),不包括(1,0)
  else if (x === 1 && y < 1) return 1; // 对应(1,0)到(1,1),不包括(1,1)
  else if (y === 1 && x > 0) return 2; // 对应(1,1)到(0,1),不包括(0,1)
  else if (x === 0 && y > 0) return 3; // 对应(0,1)到(0,0),不包括(0,0)
  else return null; // 不在边界上（即肯定需要裁剪）
}

// 切换状态时如果当前点不在当前状态的起点，则说明有裁剪，直接停止
export function checkClipMode(polygon: Array<number>) {
  if (polygon.length < 6) return TileClipMode.NONE_DISPLAY; // 至少三点才能形成多边形，如果少于3个点则无法形成多边形，设置为完全不显示。
  let oriState = checkPointState(polygon[0], polygon[1]);
  if (oriState === null) return TileClipMode.NEED_CLIP;
  let lastState = oriState;
  // 我们需要判断，初始状态出发后，最终又回到初始状态时是否是从同一边回来的
  // 所以记录首次触发的下一个状态，以及最后回到原状态前最后的状态
  let oriOut: number = -1;
  let lastIn: number = -1;

  for (let i = 2; i < polygon.length; i = i + 2) {
    // 记录当前顶点的x，y坐标
    const x = polygon[i];
    const y = polygon[i + 1];
    let currentState = checkPointState(x, y);

    if (currentState === null) return TileClipMode.NEED_CLIP; // 如果当前点不在多边形边界，则说明多边形需要裁剪
    if (currentState === lastState) continue; // 如果状态未变化，则直接进入下一个循环
    if (currentState !== lastState) {
      if (
        currentState !== (lastState + 4 + 1) % 4 &&
        currentState !== (lastState + 4 - 1) % 4
      ) {
        /* console.log(
          `${lastState},${currentState};${(lastState + 4 + 1) % 4},${
            (lastState + 4 - 1) % 4
          }`
        );
        console.log(polygon); */
        return TileClipMode.NEED_CLIP; // 如果状态变化不是按顺序进行的，则需要裁剪(跳过一个状态则会出现裁剪边)
      }

      // 计算各种情况下的合法点
      // 获取上个点
      const x0 = polygon[i - 2];
      const y0 = polygon[i - 1];
      let needClip = true;
      switch (currentState) {
        case 0:
          if (lastState === 3) {
            // 3———>0，正向，用当前点判断
            if (x === 0 && y === 0) needClip = false;
          } else {
            // 1———>0，反向，用上个点判断
            if (x0 === 1 && y0 === 0) needClip = false;
          }
          break;
        case 1:
          if (lastState === 0) {
            // 0———>1，正向，用当前点判断
            if (x === 1 && y === 0) needClip = false;
          } else {
            // 2———>1，反向，用上个点判断
            if (x0 === 1 && y0 === 1) needClip = false;
          }
          break;
        case 2:
          if (lastState === 1) {
            // 1———>2，正向，用当前点判断
            if (x === 1 && y === 1) needClip = false;
          } else {
            // 3———>2，反向，用上个点判断
            if (x0 === 0 && y0 === 1) needClip = false;
          }
          break;
        case 3:
          if (lastState === 2) {
            // 2———>3，正向，用当前点判断
            if (x === 0 && y === 1) needClip = false;
          } else {
            // 0———>3，反向，用上个点判断
            if (x0 === 0 && y0 === 0) needClip = false;
          }
          break;
        default:
      }
      if (needClip) {
        //console.log(polygon);
        return TileClipMode.NEED_CLIP; // 如果该边并非到矩形顶点后转折，则需要裁剪
      }
      // 经过了上面的判断，之后的情况一定是：点发生了合法的边的转换。
      // 所以我们需要记录一下是否发生了关于初始状态的状态变化
      if (oriOut === -1 && lastState === oriState) {
        oriOut = currentState; // 记录首次离开初始状态的值
      }
      if (currentState === oriState) {
        lastIn = lastState; // 不断更新最后回到初始状态前的状态值
      }
      // 都完成以后，将当前状态赋值给上个状态，进入下一轮循环
      lastState = currentState;
    }
  }
  // 如果最终活着走出了这个循环，则说明这个多边形要么就是完整的正方形，要么就是面积为0的边的残留。
  if (oriOut === lastIn) {
    return TileClipMode.NONE_DISPLAY; //如果出入一致，说明没包裹成形状，全空
  } else return TileClipMode.FULL_DISPLAY; // 如果不一致，说明进行了一个完整的轮回，全满。
}

// 使用基于四叉树优化的SutherlandHodgmanClip多边形裁剪算法裁剪多边形
// 算法说明：根据中间的十字，分两步裁剪。首先将多边形裁剪成左右两边，然后再根据多边形
// 初始状态下，多边形的坐标都是相对于[0,1]的区间的，即父组件区间。
// 因此，初始瓦片范围也是[0,1]

import { DEFAULT_ACCURATE } from "src/constants";

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

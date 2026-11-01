# rtl-tile-plate-quadtree

[项目主页](../../../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的**瓦片-板块四叉树索引**阶段。每个
`PlateDomainTileQuadtree` 将现代地理参考系中的一个多边形板块域要素映射到影像
提供器所使用的准确瓦片方案中的源瓦片。

本软件包通过 `TileClipArea` 保留 MultiPolygon 的各个部分和内环。节点区分 NONE、FULL
和 NEED_CLIP；查询跳过 NONE，只返回完整覆盖或需要 WebGL 掩膜的部分覆盖瓦片。

## 功能特性

- 使用影像提供器准确的 Cesium 瓦片方案和椭球。
- 在瓦片局部裁剪区域中保留 MultiPolygon 分量和内环。
- 区分无覆盖、完整覆盖和部分覆盖的源瓦片。
- 支持明确层级查询和保守的视图感知查询。

## 使用统一 RTL 入口

本模块的唯一源码位于 RTL 的 `modules/tile-plate-quadtree`。已安装 RTL 时直接使用：

```ts
import { PlateDomainTileQuadtree } from "reconstructable-tile-layer/quadtree";
```

无需额外安装本独立包。独立使用时，下面的安装命令和示例仍然有效；在仓库根目录运行
`pnpm --filter rtl-tile-plate-quadtree build` 可生成独立的 ESM、CommonJS 和类型声明。
两种发行方式共享源码，构建产物与类身份分别独立。

## 安装

```sh
pnpm add rtl-tile-plate-quadtree cesium
```

## 用法

```ts
import { GeographicTilingScheme } from "cesium";
import { PlateDomainTileQuadtree, type PlateDomainGeometry } from "rtl-tile-plate-quadtree";

const plateDomain: PlateDomainGeometry = {
  polygons: [
    {
      exterior: [10, 10, 30, 10, 30, 30, 10, 30, 10, 10],
      interiors: [[15, 15, 20, 15, 20, 20, 15, 20, 15, 15]],
    },
  ],
};

const tilePlateIndex = new PlateDomainTileQuadtree(new GeographicTilingScheme(), plateDomain);

const entries = tilePlateIndex.queryTilesAtLevel(5);
```

输入坐标为经纬度，单位是度。每个环都应在末尾重复第一个坐标对。返回的
`TilePlateIndexEntry` 包含 `tileXYL`；对于部分覆盖的情况，还包含一个瓦片局部
`clipArea`，其坐标轴范围通常是 `[0, 1]`。

## 视图感知查询

```ts
const candidates = tilePlateIndex.queryTilesInBoundingSphere(level, modernViewSphere);
```

瓦片遍历接收**现代源参考系**的包围球。重建视图的包围球需先按板块矩阵逆旋转，再传入此方法。
`updateBoundingSpheres(modelMatrix)` 更新的是板块域包围球，供前置的
`intersectsCurrentBoundingSphere` 候选测试使用，不会变换瓦片节点。
RTL 的 `refineTilesForView` 和 `querySourceRegions` 负责串联这两个步骤。

NONE 节点在细分前直接剪枝；指定层级只返回与包围球相交的 FULL / NEED_CLIP 节点。
包围球相交仍是保守筛选，不是与板块裁剪轮廓的精确求交。

每次调用 `updateProvider(provider)` 都会使用原始几何和 provider 的瓦片方案重建索引，
包括覆盖范围、根网格布局，以及同类自定义瓦片方案的参数变化。

## 几何行为

- 地理坐标和 WebMercator 的零级布局来自 Cesium 瓦片方案。
- 子节点使用准确的 `tileXYToRectangle` 边界。
- 部分相交区域会重新归一化到各个子瓦片的 `[0, 1]^2` 域。
- 一般的跨反子午线环必须以在日期变更线处分离的多边形分量提供。

这些规则对应论文方法部分的“瓦片-板块四叉树索引与重建任务生成”小节。

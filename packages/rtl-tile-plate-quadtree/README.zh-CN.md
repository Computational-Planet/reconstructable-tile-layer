# rtl-tile-plate-quadtree

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的**瓦片-板块四叉树索引**阶段。每个
`PlateDomainTileQuadtree` 将现代地理参考系中的一个多边形板块域要素映射到影像
提供器所使用的准确瓦片方案中的源瓦片。

本软件包通过 `TileClipArea` 保留 MultiPolygon 的各个部分和内环。选出的条目表示
无覆盖、完整覆盖，或者必须由 WebGL 处理器进行掩膜的部分覆盖。

## 功能特性

- 使用影像提供器准确的 Cesium 瓦片方案和椭球。
- 在瓦片局部裁剪区域中保留 MultiPolygon 分量和内环。
- 区分无覆盖、完整覆盖和部分覆盖的源瓦片。
- 支持明确层级查询和保守的视图感知查询。

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
`clipArea`，其坐标轴范围通常是 `[0, 1]`。旧版 `polygon` 值为 null 表示完整
瓦片覆盖。

## 视图感知查询

```ts
const candidates = tilePlateIndex.queryTilesInBoundingSphere(level, reconstructedViewSphere);
```

在重建参考系的包围球查询之前，请调用 `updateBoundingSpheres(modelMatrix)`。
该测试采用保守策略：即使某些候选项旋转后的准确覆盖区位于视图之外，也可能保留
这些候选项。

当瓦片方案类或椭球发生变化时，`updateProvider(provider)` 会重新构建索引。如果
自定义瓦片方案的其他布局属性发生变化，应创建新的索引。

## 几何行为

- 地理坐标和 WebMercator 的零级布局来自 Cesium 瓦片方案。
- 子节点使用准确的 `tileXYToRectangle` 边界。
- 部分相交区域会重新归一化到各个子瓦片的 `[0, 1]^2` 域。
- 一般的跨反子午线环必须以在日期变更线处分离的多边形分量提供。

这些规则对应论文方法部分的“瓦片-板块四叉树索引与重建任务生成”小节。

## 兼容性

`QuadTreeTileProcessor` 和历史名称 `QuadTreeTileProcesser` 仍是
`PlateDomainTileQuadtree` 的别名。现有遍历方法（`getTilesByLevel`、
`getTilesInBoundingSphere`、`getRootTiles` 以及累加器形式的 `find*` 方法）
保持不变。

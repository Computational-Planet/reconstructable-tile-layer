# 可重建瓦片图层（RTL）

[English](README.md) | 简体中文

[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)
[![pnpm 9.0.5](https://img.shields.io/badge/pnpm-9.0.5-F69220?logo=pnpm&logoColor=white)](package.json)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

在 Cesium 中对已发布 Web 瓦片服务进行浏览器端古地理重建。

本仓库包含论文 _Reconstructable Tile Layers for Geological-Time-Driven Digital
Earth: Browser-side Paleogeographic Reconstruction of Published Web Tile
Services without Republication_ 配套的 TypeScript 参考实现。

RTL 将地质年代和选定的刚性板块模型作为可执行的图层状态。它保留兼容的已发布
Web 瓦片服务作为影像源，将瓦片内容分配给多边形板块域，应用从 ROT 数据导出的
有限旋转，在 WebGL 中对边界瓦片进行掩膜，并在 Cesium 中渲染处理后的片段。
本实现重建的是已发布的可视图层，不会恢复源属性、拓扑、要素标识或数值栅格值。

## Demo

**在线演示：** [打开可重建瓦片图层 Demo](https://computational-earth.github.io/reconstructable-tile-layer/)。

[`apps/reconstructable-tile-layer-demo`](apps/reconstructable-tile-layer-demo)
中的应用就是 `pnpm dev` 启动的项目 Demo。它：

- 基于 React、Vite、Cesium 和四个 RTL 工作区库；
- 通过 Turbo 启动全部库的 Rollup 监听构建；
- 支持替换影像服务、板块域数据和 ROT 模型；
- 复现论文中的年代切换、源层级加载、视图感知细化、参考图层叠加和结果导出流程。

工作区依赖已经安装时，在仓库根目录启动 Demo：

```sh
pnpm dev
```

首次克隆仓库，或者 `package.json`、`pnpm-lock.yaml` 发生变化后，先安装一次锁定
依赖再启动：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite 会在终端输出本地地址。命令运行期间，任意库的代码变更都会自动重新构建并提供
给 Demo 使用。

![可重建瓦片图层 Demo 展示 120 Ma 古地理重建](images/rtl_demo_preview.png)

有关操作流程、导出行为和基准测试控制器，请参阅 Demo 的
[English README](apps/reconstructable-tile-layer-demo/README.md)
或[中文 README](apps/reconstructable-tile-layer-demo/README.zh-CN.md)。

可直接加载的案例配置：[English](case_configs/README.md) ·
[简体中文](case_configs/README.zh-CN.md)。

环境要求：Node.js 18 或更高版本、pnpm 9.0.5，以及支持 WebGL 的浏览器。

## 功能特性

- 在不重新发布源服务的情况下，重建兼容的 WMS、WMTS、XYZ 和 URL 模板影像。
- 导入 GPML、GPMLZ、XML、旧版 JSON 板块域和 GPlates ROT 模型。
- 插值有限旋转并组合参考板块链。
- 使用惰性瓦片-板块四叉树索引板块域覆盖范围。
- 在 WebGL 中对边界瓦片进行掩膜，同时保留 MultiPolygon 分量和内环。
- 在年代变化时复用已处理影像，并根据当前 Cesium 视图细化源瓦片。
- 在提供与论文一致的名称时，继续兼容历史 API。

## 工作区

| 工作区                            | 源代码                                       | README                                                                                                                       | 在 RTL 中的作用                                             |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `rtl-finite-rotation`             | [目录](packages/rtl-finite-rotation)         | [English](packages/rtl-finite-rotation/README.md) · [简体中文](packages/rtl-finite-rotation/README.zh-CN.md)                 | 解析 ROT 记录、插值单位四元数并组合板块参考链。             |
| `rtl-tile-plate-quadtree`         | [目录](packages/rtl-tile-plate-quadtree)     | [English](packages/rtl-tile-plate-quadtree/README.md) · [简体中文](packages/rtl-tile-plate-quadtree/README.zh-CN.md)         | 构建惰性板块域瓦片索引，并生成完整或经过裁剪的源瓦片条目。  |
| `rtl-webgl-tile-processor`        | [目录](packages/rtl-webgl-tile-processor)    | [English](packages/rtl-webgl-tile-processor/README.md) · [简体中文](packages/rtl-webgl-tile-processor/README.zh-CN.md)       | 请求源影像、重映射 WebMercator 纹理并生成 GPU 掩膜图像。    |
| `reconstructable-tile-layer`      | [目录](packages/reconstructable-tile-layer)  | [English](packages/reconstructable-tile-layer/README.md) · [简体中文](packages/reconstructable-tile-layer/README.zh-CN.md)   | 实现 RTL 对象、任务调度、保留记录、年代更新和 Cesium 图元。 |
| `reconstructable-tile-layer-demo` | [目录](apps/reconstructable-tile-layer-demo) | [English](apps/reconstructable-tile-layer-demo/README.md) · [简体中文](apps/reconstructable-tile-layer-demo/README.zh-CN.md) | 使用可替换的服务、模型、年代和视图演示论文工作流。          |

每个工作区的 README 都说明了其方法作用、输入约定、用法和保留资源的生命周期。

## 方法与代码映射

| 论文术语或阶段  | 推荐代码 API                                    | 软件包                                                |
| --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| 可重建瓦片图层  | `ReconstructableTileLayer`                      | `reconstructable-tile-layer`                          |
| 服务注册        | `provider`、`setImageryProvider`                | `reconstructable-tile-layer`                          |
| 板块域要素      | `PlateDomainFeature`、`PlateDomainSourceConfig` | `reconstructable-tile-layer`                          |
| `TileClipArea`  | 地理坐标和瓦片局部坐标下的多边形掩膜            | `rtl-tile-plate-quadtree`、`rtl-webgl-tile-processor` |
| 有限旋转插值器  | `FiniteRotationInterpolator`                    | `rtl-finite-rotation`                                 |
| 瓦片-板块四叉树 | `PlateDomainTileQuadtree`                       | `rtl-tile-plate-quadtree`                             |
| 复合瓦片任务    | `CompositeTileTask`                             | `reconstructable-tile-layer`                          |
| 已处理瓦片记录  | `ProcessedTileRecord`                           | `reconstructable-tile-layer`                          |
| WebGL 处理器    | `WebGLTileProcessor`                            | `rtl-webgl-tile-processor`                            |
| 年代感知更新    | `setReconstructionAge`                          | `reconstructable-tile-layer`                          |
| 视图感知细化    | `refineTilesForView`                            | `reconstructable-tile-layer`                          |

这些名称对应论文方法部分的各个阶段：服务注册；板块域与旋转准备；瓦片-板块索引与
任务调度；以及 GPU 掩膜和 Cesium 渲染。

## 最小 RTL 工作流

```ts
import { ReconstructableTileLayer } from "reconstructable-tile-layer";
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

const webglProcessor = new WebGLTileProcessor({
  outputType: "canvas",
  slotCount: 4,
});

const rtl = await ReconstructableTileLayer.create({
  provider: imageryProvider,
  processor: webglProcessor,
  featureSource: {
    url: "/models/static-polygons.gpmlz",
    polygonRenderIntent: "all-polygons-area",
  },
  rotationSources: ["/models/rotations.rot"],
  initialAge: 0,
  anchorPlateId: "0",
});

rtl.bindSceneModeSync(viewer);
await rtl.loadSourceTilesAtLevel(viewer, 4);
await rtl.setReconstructionAge(120);
await rtl.refineTilesForView(viewer);

rtl.destroy(viewer);
webglProcessor.destroy();
```

影像提供器、WebGL 处理器和 Cesium viewer 均由调用方所有。应先销毁 RTL，再销毁
这些依赖。

## 输入与方法范围

RTL 接受使用地理坐标 EPSG:4326 或 WebMercator 瓦片方案的 Cesium 影像提供器。
板块域数据源可以是 GPML、GPMLZ、XML、仓库的旧版 JSON 结构或浏览器上传 URL。
有限旋转从 GPlates ROT 文本中读取。

本实现在 `TileClipArea` 中保留 MultiPolygon 的各个部分和内环。一般的跨反子午线
环必须预先编码为在日期变更线处分离的多边形分量，这与论文所述的当前方法限制一致。

## 开发命令

| 命令                  | 用途                                   |
| --------------------- | -------------------------------------- |
| `pnpm dev`            | 启动全部库的监听构建和 Vite demo。     |
| `pnpm build`          | 构建全部库，然后生成 demo 的生产构建。 |
| `pnpm build:packages` | 仅构建四个可发布库。                   |
| `pnpm check`          | 运行格式、lint、构建、类型检查和测试。 |
| `pnpm test`           | 运行瓦片-板块四叉树测试。              |
| `pnpm clean`          | 删除工作区构建输出和 Turbo 缓存。      |

共享 Rollup 配置会为全部四个库生成 ESM、CommonJS 和 TypeScript 声明输出。
Cesium 保持为对等依赖，不会打包进这些软件包。

如果只需启动 demo，请先确保各个库已经构建，再执行：

```sh
pnpm --filter reconstructable-tile-layer-demo dev
```

## 兼容性

推荐使用与论文一致的 API 名称。拉取软件包名称迁移后，需要重新安装工作区依赖。
历史符号导出仍然可用，包括 `RotationOperator`、`QuadTreeTileProcesser`、
`QuadTreeTileProcessor`、`CesiumTileProcesser`、`CesiumTileProcessor`、
`SimpleGeoReconstructManager` 及其现有方法和选项名称。这些别名不会改变任何重建
算法或运行结果。

## 验证

```sh
pnpm check
```

该命令会运行格式检查、lint、软件包和演示程序构建、TypeScript 检查，以及仓库
原有的四叉树测试。

## 引用

在研究中使用本实现时，请引用上述论文。作者、期刊或会议、DOI 和最终书目信息应以
论文正式发表版本为准。

## 许可证

源代码采用 ISC 许可证。仓库内附的地质和影像资源继续适用其原始提供方注明的引用
和使用条款。

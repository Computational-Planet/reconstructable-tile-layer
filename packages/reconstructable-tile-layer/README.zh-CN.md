# reconstructable-tile-layer

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的浏览器端**可重建瓦片图层（Reconstructable Tile Layer，
RTL）**对象。它将已发布的影像提供器与多边形板块域要素、ROT 有限旋转、
瓦片-板块索引、复合任务调度、WebGL 处理图像和 Cesium 图元连接起来。

推荐使用的公共类是 `ReconstructableTileLayer`。现有名称
`SimpleGeoReconstructManager` 仍作为同一类的别名保留。

## 功能特性

- 注册已发布的影像服务，无需重新发布其瓦片。
- 在一个可执行的年代感知图层中组合板块域要素、有限旋转和瓦片处理。
- 调度前台与后台复合任务，同时保留可复用的已处理图像。
- 支持自适应根节点加载、明确源层级和视图感知细化。
- 同步 Cesium 场景模式并提供运行时诊断。

## 安装

```sh
pnpm add reconstructable-tile-layer rtl-webgl-tile-processor cesium
```

本软件包仅用于浏览器。它需要 `fetch`、DOM、WebGL 和 Cesium viewer。viewer、
影像提供器和 WebGL 处理器均由调用方所有。

## 用法

```ts
import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider, Viewer } from "cesium";
import { ReconstructableTileLayer } from "reconstructable-tile-layer";
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

const ellipsoid = Ellipsoid.WGS84;
const viewer = new Viewer("cesiumContainer", {
  baseLayer: false,
  ellipsoid,
  requestRenderMode: true,
});

const imageryProvider = new UrlTemplateImageryProvider({
  url: "/tiles/topography/{z}/{x}/{y}.png",
  tilingScheme: new GeographicTilingScheme({ ellipsoid }),
  minimumLevel: 0,
  maximumLevel: 8,
});

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
  primitiveTransformMode: "dynamic3D",
  referenceEllipsoid: ellipsoid,
});

rtl.bindSceneModeSync(viewer);
await rtl.loadRootTiles(viewer);
await rtl.loadSourceTilesAtLevel(viewer, 4);
await rtl.setReconstructionAge(120);

const refinement = await rtl.refineTilesForView(viewer, {
  minLevel: 2,
  maxLevel: 8,
  targetTileScreenSize: 256,
  maxRawViewTileCount: 128,
});

console.log(refinement, rtl.getRuntimeStats());

rtl.destroy(viewer);
webglProcessor.destroy();
viewer.destroy();
```

如果希望显式控制准备阶段，可以先调用 `new ReconstructableTileLayer(options)`，
再调用 `await rtl.initialize()`。

## RTL 输入

### 已发布影像服务

`provider` 提供源瓦片坐标、瓦片方案、图像请求和服务访问行为。支持地理坐标
EPSG:4326 和 WebMercator 瓦片方案。使用 `setImageryProvider(viewer, provider)`
替换数据源后，RTL 会清除该提供器对应的已准备状态，必须重新加载。

### 板块域要素

`featureSource` 接受 GPML、GPMLZ、XML、仓库的旧版 JSON 要素数组或上传的
`blob:` URL。面要素提供板块标识、有效时间区间和 `TileClipArea`。解析得到的
线状和未分类要素仍会出现在导入诊断中，但不会创建重建单元。

`polygonRenderIntent: "classified"` 填充已分类的面要素；
`"all-polygons-area"` 将每个解析出的多边形几何都视为面。

### 有限旋转模型

`rotationSources` 包含一个或多个 GPlates ROT URL。`anchorPlateId` 默认为
`"0"`；传入 `null` 可以在不强制使用恒等锚定板块的情况下递归。年代单位为
百万年前（Ma）。

## 加载和可执行年代状态

- `loadRootTiles(viewer)` 创建自适应的初始表示。
- `loadSourceTilesAtLevel(viewer, level)` 加载一个明确层级上的所有相关源瓦片。
- `refineTilesForView(viewer, options)` 根据当前重建视图选择源层级。
- `refineTilesForView(viewer, level, options)` 使用显式限制后的层级，同时保留视图过滤。
- `setReconstructionAge(age)` 更改可见性和板块变换，同时复用保留的已处理图像。

细化结果包含选定的 `level`、`loadedCount` 和 `taskCount`。如果因缺少视图状态、
输入尚未准备或年代请求已经过期而未执行操作，`skippedReason` 会说明原因。

## 复合任务与保留状态

各个要素的贡献会按照板块标识、有效时间区间和源瓦片坐标合并到
`CompositeTileTask` 对象中。当前年代的前台任务优先完成；其他有效模型状态可以
在后台准备。每个成功的任务都会生成一条 `ProcessedTileRecord`，其中包含保留的
图像、任务元数据以及零个或多个 Cesium 图元。

`dynamic3D` 会保留图元，并更改可见性和 `Primitive.modelMatrix`。
`bakedInstance` 会保留已处理图像，但使用几何实例上的变换重新构建当前年代可见的
图元。`bindSceneModeSync(viewer)` 会在 Cesium 场景模式变化时选择适当的模式。

## 生命周期与诊断

`clear(viewer)` 会移除图层所有的图元和已处理瓦片状态，同时保留已导入的板块域和
有限旋转数据，以便再次使用。`destroy(viewer)` 还会移除监听器并释放图层所有的
图像引用，但不会销毁调用方所有的 WebGL 处理器或 viewer。

`getRuntimeStats()` 报告任务数量、保留的记录和图像、图元数量、纹理载荷估算以及
导入诊断。`getLastReconstructionTaskReport()` 报告最新一代任务的前台和后台
完成情况。

## 方法限制

RTL 重建服务交付的可视图层，不会恢复源属性、拓扑、要素标识或数值栅格值。
一般的跨反子午线环必须以在日期变更线处分离的多边形分量提供。服务访问、CORS、
许可、支持的瓦片组织方式、模型覆盖范围和浏览器资源仍然是应用层面的约束。

## 兼容性

原有的 `SimpleGeoReconstructManager`、`provider`、`processor`、
`featureSource`、`rotationSources`、`initialAge`、`setAge`、`setProvider`、
`loadTilesOnLevel`、`loadFineTilesInView`、`loadTilesAtRoot`、`getStats` 和
`getLastGenerationReport` 接口继续可用。历史拼写 `processer` 和
`PaleoData.time.begine` 也会为现有使用方保留。

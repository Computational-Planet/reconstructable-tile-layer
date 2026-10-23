# reconstructable-tile-layer

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的浏览器端**可重建瓦片图层（Reconstructable Tile Layer，
RTL）**对象。它将已发布的影像提供器与多边形板块域要素、ROT 有限旋转、
瓦片-板块索引、复合任务调度、WebGL 处理图像和 Cesium 图元连接起来。

推荐使用的公共类是 `ReconstructableTileLayer`。现有名称
`SimpleGeoReconstructManager` 仍作为同一类的别名保留。

## 功能特性

GPlates 读取、旋转计算、瓦片索引和 WebGL 处理由 `modules/` 下的四个源码模块负责。
RTL 构建时包含这些实现及类型声明，使用者无需额外安装四个独立模块包。
原有读取方法继续作为兼容导出提供。文件选择和 object URL 生命周期仍由 Demo 管理。

- 注册已发布的影像服务，无需重新发布其瓦片。
- 在一个可执行的年代感知图层中组合板块域要素、有限旋转和瓦片处理。
- 调度前台与后台复合任务，同时保留可复用的已处理图像。
- 支持自适应根节点加载、明确源层级和视图感知细化。
- 同步 Cesium 场景模式并提供运行时诊断。

## 安装

```sh
pnpm add reconstructable-tile-layer cesium
```

渲染需要浏览器 DOM、WebGL 和 Cesium viewer。viewer、影像提供器和 WebGL 处理器
均由调用方所有，导入入口不会自动创建这些资源。`/gplates` 入口不加载 Cesium；
GPML 解析仍需要 `DOMParser`，URL 读取需要 `fetch`。

## 公共入口与模块边界

| 入口                                   | 职责                                   | 可选独立发行包                                                           |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `reconstructable-tile-layer`           | 图层、调度、保留记录、处理器及兼容导出 | 默认安装入口                                                             |
| `reconstructable-tile-layer/gplates`   | ROT/GPML/GPMLZ 读取、要素记录与诊断    | [rtl-gplates-source](modules/gplates-source/README.zh-CN.md)             |
| `reconstructable-tile-layer/rotation`  | 有限旋转与参考板块链                   | [rtl-finite-rotation](modules/finite-rotation/README.zh-CN.md)           |
| `reconstructable-tile-layer/quadtree`  | 瓦片–板块索引和裁剪区域                | [rtl-tile-plate-quadtree](modules/tile-plate-quadtree/README.zh-CN.md)   |
| `reconstructable-tile-layer/processor` | 源影像请求、重投影和 WebGL 掩膜        | [rtl-webgl-tile-processor](modules/webgl-tile-processor/README.zh-CN.md) |

各入口均提供 ESM、CommonJS 与 TypeScript 声明。同一模块格式下，根入口与子入口
共享实现：从根入口和 `/processor` 导入的 `WebGLTileProcessor` 是同一个构造函数。
请使用公共入口，不要深层导入 `src`、`dist` 或 `modules`。

四个模块保留独立的清单、构建、测试和发行包名，RTL 直接编译模块源码，不将其作为
外部运行时依赖。开发依赖中的 workspace 关系仅用于构建顺序与缓存失效。
模块源码更新后，需要重新构建并发布 RTL；只发布独立模块不会更新已安装的 RTL。

独立发行包拥有独立的类身份。RTL 的 `TileProcessor` 使用公共结构契约，允许注入
兼容的独立处理器，不受类私有字段的类型限制。一个应用优先选择同一种发行方式，
混用可能造成代码和缓存重复。Cesium 保持共享的对等依赖。处理器仍由调用方创建、
销毁，也可以由多个图层共享。

GPlates 模块以普通数据结构传递记录；旋转模块负责数学计算，四叉树模块负责索引，
处理器负责影像处理，均不反向依赖 RTL manager。旋转模块独立构建时会包含所需的
读取代码，无需再安装 `rtl-gplates-source`。

Raster source、imagery-provider 和 converter 继续作为可选扩展。后续矢量重建应通过
公共契约接入扩展；此次包结构调整不增加 GeoJSON 重建链路。

## 用法

```ts
import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider, Viewer } from "cesium";
import { ReconstructableTileLayer, WebGLTileProcessor } from "reconstructable-tile-layer";

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

### 可选的本地科学栅格

主包继续使用 `ImageryProvider` 接口，不依赖栅格、NetCDF、HDF5 或 GDAL 引擎。
需要本地数据时安装 `rtl-raster-source` 与 `rtl-raster-imagery-provider`：

```ts
import { openRasterSource } from "rtl-raster-source";
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

const source = await openRasterSource(file);
const localProvider = await RasterImageryProvider.fromSource(source, {
  ellipsoid: viewer.scene.globe.ellipsoid,
  style: { kind: "single-band", band: 0, domain: [-8000, 4000] },
});
// 数据必须处于所选板块模型的现代参考位置。
await rtl.setImageryProvider(viewer, localProvider);
await rtl.loadRootTiles(viewer);
await rtl.setReconstructionAge(100);

rtl.destroy(viewer); // 先解除场景与异步任务引用
localProvider.destroy();
source.close();
```

NetCDF 使用显式子入口 `rtl-raster-source/netcdf`；通过 `describeVariable` 查看 CF
空间轴与选片维度，选出二维切片后交给同一适配器。dataset 拥有切片，其关闭顺序为
provider、slice、dataset。可选 `rtl-raster-converter` 配合应用托管的 GDAL 资源导出
数值 COG；直接显示不要求先转换。各包 README 提供独立使用与 Worker 托管示例。

PaleoDEM 等已经位于古坐标的快照，使用普通 Cesium 图层按显式年龄显示，不再旋转。
模型日历时间不作为地质年龄。现代地形的刚性板块搬移也不等于古地形预测。
此接入不实现点查询或逆向数值采样。

换源会清除相关瓦片覆盖缓存并使旧年代/图元任务与旧图像交付失效；`clear()` 保留
manager 的可复用性，`destroy()` 同时阻止尚未完成的初始化重新变为就绪。调用方再
关闭自己拥有的源。换源中断的视图细化返回 `stale-source`。

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

多个独立 RTL 可以共用处理器。将各层的 `primitiveCollection` 指向调用方持有的
独立容器，并设置 `orderedRendering: true`、`clearProcessorOnReset: false`。
通过容器顺序管理重叠栅格，使用 `rtl.show` 与 `rtl.opacity` 控制整层显示；
这些设置在年代更新、清空和重新加载后保持。调用方拥有父容器，RTL 只销毁自己的子集合。
`createTileSurfaceAppearance(image, { ordered: true, opacity })` 为其他固定坐标表面提供相同的混合规则。
有序模式用于同一椭球面上的栅格叠放，不是通用三维透明体渲染。
透明度按表面应用；应用切换瓦片层级时应替换旧 LOD 覆盖，避免重叠层级重复混合。

共享模式下，清空某个 RTL 不会清空其他来源缓存。删除来源时，先销毁所有引用它的图层，
再调用 `processor.clearProvider(provider)`，最后关闭 provider；整个共享运行时结束时销毁处理器。
图层列表、时间范围表单与文件资源管理由应用实现。

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

迁移 RTL 应用时，将独立处理器导入改为 `reconstructable-tile-layer` 或
`reconstructable-tile-layer/processor`，然后移除不再使用的独立包依赖。
`processor`/`processer` 属性和选项现在使用结构类型 `TileProcessor`；若调用代码
显式将这些值标注为具体处理器类，请改用 `TileProcessor`。公共处理器成员和资源
所有权保持不变。

原有的 `SimpleGeoReconstructManager`、`provider`、`processor`、
`featureSource`、`rotationSources`、`initialAge`、`setAge`、`setProvider`、
`loadTilesOnLevel`、`loadFineTilesInView`、`loadTilesAtRoot`、`getStats` 和
`getLastGenerationReport` 接口继续可用。历史拼写 `processer` 和
`PaleoData.time.begine` 也会为现有使用方保留。

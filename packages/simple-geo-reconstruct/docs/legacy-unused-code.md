# 未使用与历史残留代码说明

本文集中记录当前古地理重建主流程中未直接使用、仅兼容保留或疑似历史残留的代码路径。这里的“未使用”不是删除建议，只说明当前 `simple-geo-reconstruct` 包主流程如何绕过这些路径，以及它们可能仍被外部调用或 demo 代码使用。

## 判定范围

判定以 `packages/simple-geo-reconstruct/src/SimpleGeoReconstructManager.ts` 当前主流程为中心，尤其是 [`init`](../src/SimpleGeoReconstructManager.ts#L346)、[`collectTileTasks`](../src/SimpleGeoReconstructManager.ts#L704)、[`getReprojectedTileImageAsset`](../src/SimpleGeoReconstructManager.ts#L996) 和 [`createTilePrimitive`](../src/SimpleGeoReconstructManager.ts#L1082)。不把 `apps/tile-processer-demo/src/utils` 中的复制版本作为主判断依据。

## 1. 旧 JSON 类型接口

[`PaleoItem`](../src/SimpleGeoReconstructManager.ts#L113)、`Polygon`、`PosList`、`ValidTime` 定义在 `SimpleGeoReconstructManager.ts` 中，但当前管理器主流程不直接使用这些类型。实际导入结果使用的是 [`PaleoData`](../src/SimpleGeoReconstructManager.ts#L140)，并由 `loadFeaturePolygonDataWithDiagnostics` 返回。

这些接口看起来来自早期自定义 JSON 数据结构：

- `FeatureType`
- `FeatureID`
- `PlateID`
- `ValidTime`
- `Polygon.PosList`

当前 JSON 兼容读取逻辑在 [`loadCustomJsonPaleoData`](../src/gplates/paleoDataLoader.ts#L63) 中另行定义了 `CustomPaleoItem`，并直接转换成 `FeaturePolygonData`。因此 `SimpleGeoReconstructManager.ts` 顶部的 `PaleoItem` 系列类型更像是过去版本残留或对旧数据格式的文档式遗留。

另一个明显信号是这些注释出现了乱码，例如 `瑕佺礌ID`。如果后续要整理代码，可以考虑把旧 JSON 类型集中到 loader 侧，或者删除管理器内未被引用的类型声明。

## 2. `PolygonQuadTreeRecord.primitives`

[`PolygonQuadTreeRecord`](../src/SimpleGeoReconstructManager.ts#L174) 中包含：

```ts
primitives: Record<string, TilePrimitiveRecord>;
```

当前主流程会在 [`init`](../src/SimpleGeoReconstructManager.ts#L377) 中把它初始化成 `{}`，也会在 [`removeAllPrimitives`](../src/SimpleGeoReconstructManager.ts#L1619) 和 [`releaseAllTileAssets`](../src/SimpleGeoReconstructManager.ts#L1638) 中清空。

但是实际加载后的瓦片记录由管理器级别的 [`_compositeTileRecords`](../src/SimpleGeoReconstructManager.ts#L291) 维护。`executeTileGeneration` 在 [`_compositeTileRecords.set`](../src/SimpleGeoReconstructManager.ts#L901) 中记录 composite tile，而不是写入某个 feature 的 `polygonItem.primitives`。

这说明 `polygonItem.primitives` 可能来自旧设计：每个 feature 自己管理自己的瓦片 Primitive。现在的设计已经改成 composite tile：多个 feature 可以合并到同一个 `CompositeTileTask`，最终由 `_compositeTileRecords` 统一持有图像资源和 Primitive。

## 3. `lonlats` 字段仍保留但不是当前裁剪主输入

[`PaleoData.lonlats`](../src/SimpleGeoReconstructManager.ts#L142) 仍然存在，`GpmlFeatureAdapter` 也会在 [`parsedGpmlFeaturesToPaleoData`](../src/gplates/GpmlFeatureAdapter.ts#L131) 中把第一个外环写入 `lonlats`。

不过当前四叉树构建使用的是 [`item.clipArea`](../src/SimpleGeoReconstructManager.ts#L379)：

```ts
new QuadTreeTileProcesser(this._provider.tilingScheme, item.clipArea)
```

因此对于 GPML 主流程，真正参与 CPU 四叉树裁剪和 GPU stencil mask 的数据是 `TileClipArea`，不是 `lonlats`。`lonlats` 目前更像兼容字段，可能用于旧 UI、调试、外部读取或仍依赖单 polygon 外环的历史调用。

需要注意：`lonlats` 只保存第一个 polygon 的外环，不能完整表达 MultiPolygon 和 interior ring。如果下游想准确处理当前 GPML 面域，应优先使用 `clipArea`。

## 4. 旧 flat-polygon 四叉树路径

[`QuadTreeTileProcesser`](../../polygon-tile-quadtree/src/QuadTreeTileProcesser.ts#L47) 同时支持两种输入：

- `Array<number>`：旧的扁平 polygon 外环。
- `TileClipArea`：当前主流程使用的 MultiPolygon / 带洞面域。

当输入是 `TileClipArea` 时，代码会通过 [`isTileClipArea`](../../polygon-tile-quadtree/src/QuadTreeTileProcesser.ts#L25) 进入 [`initArea`](../../polygon-tile-quadtree/src/QuadTreeTileProcesser.ts#L413)，并使用 [`AreaQuadTreeTileNode`](../../polygon-tile-quadtree/src/AreaQuadTreeTileNode.ts#L244) 与 `polygon-clipping` 做裁剪。

文件前半部分仍保留旧 flat-polygon 初始化逻辑，包括：

- 经纬度归一化。
- 跨越 180 度经线的处理。
- 极点附近 polygon 的补点处理。
- 4326 tiling scheme 下按左右半球拆分。
- [`QuadTreeTileNode`](../../polygon-tile-quadtree/src/QuadTreeTileNode.ts#L49) 的单 polygon 裁剪递归。

这些逻辑当前不会被 `SimpleGeoReconstructManager.init` 的 GPML 主流程触发，因为管理器传入的是 `item.clipArea`。但它仍可能被外部包或旧接口用 `Array<number>` 直接构造 `QuadTreeTileProcesser` 时使用，所以更准确地说它是“当前主流程未使用的兼容路径”，不是绝对死代码。

## 5. 旧 WebGL flat-polygon 裁剪接口

`tile-processer-webgl` 仍保留多个旧接口：

- [`reprojectClippedTile`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1191)：返回旧版 data URL 字符串。
- [`reprojectClippedTileImage`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1226)：输入单个 flat polygon，返回 `TileImageAsset`。
- [`reprojectMultiClippedTileImage`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1244)：输入多个 flat polygon，内部转换成 `TileClipArea[]`。

这些接口最终会通过 [`createTileClipAreaFromFlatPolygon`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1525) 转成 `TileClipArea`，再进入当前主裁剪实现 [`reprojectMultiClippedTileAreaImage`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1262)。

当前 `SimpleGeoReconstructManager` 的主流程不会调用这些 flat-polygon 入口，而是在 [`getReprojectedTileImageAsset`](../src/SimpleGeoReconstructManager.ts#L996) 中直接调用 `reprojectMultiClippedTileAreaImage`。

## 6. `clipFS` 与 `drawSceneClipped`

[`defaultShaders.ts`](../../tile-processer-webgl/src/shader/defaultShaders.ts#L48) 中仍有 `clipFS`，这是旧的片元着色器裁剪方案：它把 polygon 顶点作为 uniform 传入，并在片元着色器里用射线法判断当前点是否在 polygon 内。

对应的绘制函数是 [`drawSceneClipped`](../../tile-processer-webgl/src/glInitFunc.ts#L499)，它会设置：

- `polygonVerticesCount`
- `polygonVertices`
- `TRIANGLE_STRIP` 全瓦片绘制
- 片元 shader 内部 `discard`

当前主流程不走这条路径。`CesiumTileProcesser` 在 `reprojectMultiClippedTileAreaImage` 中会生成 `clipMaskVertices`，所以渲染时进入 [`drawSceneMasked`](../../tile-processer-webgl/src/glInitFunc.ts#L423)，使用 stencil mask 裁剪。

`drawSceneClipped` 仍可能被旧的 `polygonVerticesList` 参数触发。这个参数只会从 `reprojectInternal` 的兼容调用进入，当前管理器不传。

## 7. 旧版多 Canvas / 多 WebGL Context 渲染池

`tile-processer-webgl` 默认使用 [`SingleContextTileRenderer`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L543)，也就是一个 WebGL context 配多个 texture/FBO slot。这个默认路径在 [`CesiumTileProcesser` 构造函数](../../tile-processer-webgl/src/cesium-tile-processer.ts#L795) 中选择：

```ts
resolvedOptions.legacyCanvasPool === true
  ? new LegacyCanvasRendererPool(...)
  : new SingleContextTileRenderer(...)
```

因此 [`LegacyCanvasTileRenderer`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L252) 和 [`LegacyCanvasRendererPool`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L429) 是显式兼容模式。只有传入 `legacyCanvasPool: true` 时才使用旧版多 canvas / 多 WebGL context 行为。

`poolSize` 也带有兼容含义：在默认单 context 模式下，它只是 `slotCount` 的兼容别名；在 legacy 模式下，它表示 canvas/context 数量。这个说明也写在 [`CesiumTileProcesserOptions`](../../tile-processer-webgl/src/cesium-tile-processer.ts#L1894)。

## 8. `allPaleoData` 与非 area 要素

[`allPaleoData`](../src/SimpleGeoReconstructManager.ts#L281) 保存导入的全部要素，但 [`paleoData`](../src/SimpleGeoReconstructManager.ts#L280) 会筛选 `renderIntent === "area"`。四叉树只基于 `paleoData` 构建。

这意味着 `line-like` 和 `unknown` 要素当前不会进入填色瓦片生产流程。它们仍保存在 `allPaleoData` 和导入诊断里，适合用于调试、统计或未来的线状渲染扩展。

这不是严格意义的残留代码，但在阅读主流程时容易误会：GPML parser 会解析线状/未知 feature，adapter 也会生成对应数据；只是管理器当前只渲染面状 feature。

## 9. 建议的后续整理方向

如果后续要做代码清理，可以按风险从低到高处理：

1. 先修复乱码注释，尤其是 `PaleoItem` 附近的历史中文注释。
2. 给 `lonlats`、`allPaleoData`、flat-polygon API 补充 deprecation 或兼容说明，避免调用者误用。
3. 如果确认没有外部包依赖 `polygonItem.primitives`，可删除该字段并同步清理初始化/清空逻辑。
4. 对 `clipFS` / `drawSceneClipped` / flat-polygon API 做显式兼容测试或标记为 legacy。
5. 最后再评估是否移除 `LegacyCanvasRendererPool`，因为它涉及运行时选项和 WebGL 兼容性，删除风险最高。

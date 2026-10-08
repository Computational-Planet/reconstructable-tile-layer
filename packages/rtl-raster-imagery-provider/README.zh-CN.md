# rtl-raster-imagery-provider

两种样式均可传入 `additionalNoData: [-9999]`，将额外的**原始存储值**仅在显示时
设为透明；它先于 scale/offset 和预览色标估计生效，不改变源元数据、数值读取或
COG 导出。保存图像时应同时保存实际样式。

数据用途由坐标参考年代决定：0 Ma 栅格（包括 PaleoDEM 的 0 Ma 文件）可作为 RTL
瓦片源随板块重建；已处于非零古年代坐标的数据可作为对应年龄的普通 Cesium 快照显示。
应用负责确认源的现代坐标与板块域及参考框架相容。NetCDF 的
模型日历时间与地质实验年龄分别保留，详见[真实数据验证](../../scripts/raster/README.md)。

把浏览器本地数值栅格作为标准 Cesium `ImageryProvider`，既能单独用于 Cesium，也能通过现有 provider 接口接入古地理重建。Cesium 是 peer dependency；安装适配包会自动带入数据源包，不依赖 React、重建主包或 GDAL。

```sh
npm install cesium rtl-raster-imagery-provider
```

```ts
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

const provider = await RasterImageryProvider.fromFile(file, {
  ellipsoid: viewer.scene.globe.ellipsoid,
  style: { kind: "single-band", band: 0, domain: [-8000, 4000] },
});
const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
viewer.camera.flyTo({ destination: provider.rectangle });
```

使用者的应用负责 Cesium 资源和 Viewer。重建时，把同一对象传给 `ReconstructableTileLayer.create({ provider, ... })`，或者调用 `layer.setImageryProvider(viewer, provider)`。随后调用 `layer.loadSourceTilesAtLevel(viewer, provider.recommendedReconstructionLevel)`。重建主包无需增加任何栅格依赖。

NetCDF 先选择二维切片，再创建相同的 Provider；TIFF/COG 使用上面的 `fromFile`。
以下假定应用已准备 Viewer、processor、板块域和旋转文件，且源坐标为 0 Ma：

```ts
import { openNetCDFSource } from "rtl-raster-source/netcdf";
import { ReconstructableTileLayer } from "reconstructable-tile-layer";

const dataset = await openNetCDFSource(file);
const source = await dataset.selectSlice({ variable: "z", indices: {} });
const provider = await RasterImageryProvider.fromSource(source, {
  ellipsoid: viewer.scene.globe.ellipsoid,
  style: { kind: "single-band", band: 0, domain: [-8000, 6000] },
});
const layer = await ReconstructableTileLayer.create({
  provider,
  processor,
  featureSource,
  rotationSources,
  initialAge: 0,
  referenceEllipsoid: viewer.scene.globe.ellipsoid,
});
layer.bindSceneModeSync(viewer);
await layer.loadSourceTilesAtLevel(viewer, provider.recommendedReconstructionLevel);
// 时间轴更新目标年代；Provider 始终提供现代坐标中的原始瓦片。
await layer.setReconstructionAge(100);
```

结束使用时依次调用 `layer.destroy(viewer)`、`provider.destroy()`、`source.close()`、
`dataset.close()`。COG 转换是可选优化，不是 NetCDF 参与重建的前置步骤。

`fromFile` 拥有新建的数据源，销毁 Provider 时一起关闭。`fromSource(source)` 默认借用数据源，需要显式 `ownsSource: true` 才转移所有权。样式在 Provider 生命周期内固定；共享数据换色带时，应用自己持有 source，创建借用它的新 Provider，完成换源后销毁旧 Provider，最后再关闭 source。

单波段支持物理量 `domain` 和 RGBA `colors` 色带，RGB 支持三个波段及各自的 `domains`。未指定范围时从 128×128 有界预览估算，不代表全局极值。NoData 输出透明，不进入色标统计。

支持北向 EPSG:4326/3857 栅格，输出经纬度瓦片。3857 数值投影与显示球体半径独立。

每份文件的覆盖范围使用 1×1 根布局：L2 是 4×4 个源瓦片，L3 是 8×8；
区域文件的同一层级不代表与全球 XYZ 服务相同的地面分辨率。默认瓦片为 256×256。
`nativeMaximumLevel = max(0, ceil(log2(max(width, height) / tileSize)))`（上限 24）
只估计当前文件的存储像元尺度；转换时上采样得到的像元不代表新增科学细节。
默认 `maximumLevel = max(2, nativeMaximumLevel)`，`recommendedReconstructionLevel = min(3, maximumLevel)`：
低分辨率数据至少可细分到 L2，较细数据从 L3 开始；更高层级建议按当前视野加载。
细分使用现有数值最近邻采样，不提升原始精度。显式 `maximumLevel` 可覆盖默认值（0–24），
超出声明范围的请求会报错。`getRasterLevelInfo(metadata, options)` 可在创建 Provider 前取得同样的层级信息。

COG 内部概览由 `source.metadata.overviews` 单独描述，用于降低解码成本；其数量不等于地图最高层级。
例如 361×181 的 PaleoDEM NC 默认可请求到 L2，从它重采样得到的 720×360 COG 也默认到 L2；
3600×3600 的 ETOPO 默认到 L4、建议从 L3 加载。COG 转换继续用于分块读取和概览优化。

默认显示缓存 16 MiB、最多 8 个待处理瓦片。达到并发上限时返回 `undefined`，由 Cesium 或 RTL processor 稍后重试。源解码预算另行控制。先移除影像层或销毁重建层，再调用 `provider.destroy()`；它可以重复调用。地图点查询尚未实现，公开 `source` 保留原始数值入口。

另见[英文说明](./README.md)与[第三方声明](./THIRD_PARTY_NOTICES.md)。

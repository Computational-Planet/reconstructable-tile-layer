# rtl-raster-source

纯浏览器栅格数据源，不依赖 Cesium 或 React。本地文件留在浏览器内，根入口导入不会启动 Worker、加载 WASM 或创建 Canvas。发布形式为 ESM 和 TypeScript 类型。

```sh
npm install rtl-raster-source
```

```ts
import { openRasterSource, toPhysicalValue } from "rtl-raster-source";

const source = await openRasterSource(file);
try {
  const result = await source.readWindow({
    window: [100, 200, 116, 216],
    bands: [0],
    signal: controller.signal,
  });
  const value = toPhysicalValue(result.bands[0][0], source.metadata.bands[0]);
} finally {
  source.close();
}
```

窗口按 `[左, 上, 右, 下]` 像元边缘指定，右、下不包含在内，波段下标从 0 开始。返回独立的原始 typed array，按行排列；缩放和缺失值信息保存在波段元数据中，先判断缺失再换算物理量。指定较小的输出宽高时使用最近邻采样和可用概览。

`metadata.transform` 使用 GDAL 六参数顺序，映射像元边缘；采样中心是 `(列 + 0.5, 行 + 0.5)`。PixelIsPoint 与非零像元 tiepoint 已作位置处理。`bounds` 的单位由 CRS 决定。EPSG:3857 的投影计算固定使用 6378137 m，不随古地理重建球体半径变化。

目前 GeoTIFF 路径支持北向、轴对齐的数值灰度/RGB、本地 TIFF/BigTIFF/COG、条带、分块和概览。旋转网格、缺少 EPSG、尚不支持的调色板/CMYK 等返回明确错误。窗口数值与显示色带分离，不从 RGBA 反推科学数值。

默认工作预算为 64 MiB，每次按块读取，任务串行。该值是解码缓冲与结果的估算上限，不是浏览器总内存承诺。单一巨大压缩条带仍须整条解码；超限返回 `resource-limit`，可改用带概览的 COG。不会为了小预览无条件展开整幅栅格。

通过 `AbortSignal` 取消读取；取消后仍可再次读取。`close()` 可重复调用，会取消任务并释放解码池。GeoTIFF Worker 由底层库加载，应用 CSP 需要允许其资源加载方式（使用 blob Worker 时包括 `blob:`）。

真实学科数据来源和独立读取基准见[参考数据工具](../../scripts/raster/README.md)。另见[英文说明](./README.md)和[第三方声明](./THIRD_PARTY_NOTICES.md)。

## NetCDF 学科数据

`describeVariable(name)` 返回 CF 经纬度轴及非空间维度的名称、长度和坐标变量，界面
可直接据此创建选择器。它与 `selectSlice` 共用网格识别规则，无需猜测维度名。
`slice.metadata.slice.selections` 保存所选非空间坐标的下标、原始标量（支持的数值轴）、
单位/日历等原属性；`datasetAttributes` 保留全局来源属性。这些信息随切片元数据
保留，不因关闭原 dataset 而丢失。

```ts
import { openNetCDFSource } from "rtl-raster-source/netcdf";

const dataset = await openNetCDFSource(file);
const layout = dataset.describeVariable("tos"); // CF 空间轴及非空间维度选择器
const time = await dataset.readCoordinate("time"); // 原始数值，连同 units/calendar 使用
const slice = await dataset.selectSlice({ variable: "tos", indices: { time: 12 } });
// 可直接交给 RasterImageryProvider.fromSource(slice)。
try {
  const raw = await slice.readWindow({ window: [90, 85, 91, 86] });
} finally {
  slice.close(); // 不影响其他切片
  dataset.close(); // 终止 Worker，使全部借用的切片失效
}
```

支持 CF/COARDS 的一维经纬度坐标，包含升/降纬度、不同维度顺序、0–360 经度、高斯等不等距纬度。变量与维度名称包含所属 group 路径；为每个长度大于 1 的非空间维度提供原数组下标。原始全局及变量属性保留在 `dataset.metadata`，切片也保留原变量属性与维度名称。时间的 `360_day`、`noleap` 和零年起点不强转为 JavaScript Date，展示和传递时保留原值、单位、历法。

NetCDF 切片的 `metadata.transform` 为 `null`，`coordinates.x/y` 保留物理坐标中心和原始数组方向。`planGeographicRead` 生成 `sampleColumns/sampleRows`，按地理输出像元中心对应原数组下标，支持经度接缝，不把高斯网格假装成等距矩形。优先采用 CF bounds；仅显示边界裁到两极，原始采样坐标保持完整。

切片数值保留打包形式；`_Unsigned` 解释为相应无符号整数。先在存储值上处理 `_FillValue`、`missing_value`、`valid_range/min/max`，再应用 `scale_factor/add_offset`。`slice.metadata.warnings` 提供元数据诊断，例如数据声明的辅助坐标缺失。二维曲线坐标、旋转和非结构网格、CDF-5、不支持的数值类型、变量偏移超过 4 GiB 的 CDF-2 均明确报错。没有 NetCDF 维度尺度的普通 HDF5 不直接当作 NetCDF。

每个数据集一个模块 Worker。NetCDF3 读取有界文件头及 Blob 范围；NetCDF4 通过 WORKERFS 挂载 File，再按 hyperslab 读取。仅 NetCDF4 加载 HDF5/WASM。Vite 配置需添加 `worker: { format: "es" }`，以支持 Worker 分包。自行托管时把 `dist/workers` 整个目录连同许可证复制到静态资源路径，并可传入 `workerFactory: () => new Worker("/raster-workers/netcdf.js", { type: "module" })`。CSP 需允许模块 Worker 与 WASM 编译。子入口导入本身不启动 Worker。取消会立即返回，正在进行的有界引擎解码完成后才开始下一个读取；`dataset.close()` 则立即终止 Worker，释放挂载文件和 WASM 内存。

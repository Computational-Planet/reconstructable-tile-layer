# rtl-raster-converter

在浏览器 Worker 中将本地 TIFF 或选定的二维科学数值切片转换为 COG。
用户文件不上传；应用只需托管静态资源。包不依赖 Cesium、React 或 RTL 主包。
静态 import 和 createRasterConverter 都不启动 GDAL/Worker，实际转换时才初始化。

## 安装与静态资源

```sh
pnpm add rtl-raster-converter gdal3.js@2.8.1
```

Vite 示例：

```ts
import { createRasterConverter } from "rtl-raster-converter";
import js from "gdal3.js/dist/package/gdal3.js?url";
import wasm from "gdal3.js/dist/package/gdal3WebAssembly.wasm?url";
import data from "gdal3.js/dist/package/gdal3WebAssembly.data?url";

const converter = await createRasterConverter({ assets: { js, wasm, data } });
const controller = new AbortController();
const result = await converter.toCOG(file, {
  signal: controller.signal,
  compression: "DEFLATE",
  overviewResampling: "nearest",
  onProgress: ({ stage, completed, total }) => updateProgress(stage, completed, total),
});
// 下载 result.blob/result.filename，以及 result.provenanceBlob/provenanceFilename。
// result.blob 也可交给 openRasterSource 或 RasterImageryProvider.fromFile。
converter.dispose();
```

其他打包器可把 gdal3.js/dist/package 下这三个文件复制到静态目录，再传入明确 URL。
若打包器不处理默认 Worker URL，再托管本包 dist/worker.js：

```ts
const converter = await createRasterConverter({
  assets: {
    js: "/gdal/gdal3.js",
    wasm: "/gdal/gdal3WebAssembly.wasm",
    data: "/gdal/gdal3WebAssembly.data",
  },
  workerFactory: () => new Worker("/raster-converter/worker.js"),
});
```

必须使用 classic Worker，不设置 type: "module"，因为引擎依赖 importScripts。
本包 ./worker 导出供资源定位，不应在主线程 import 执行。WASM 使用 application/wasm
响应类型，资源与 Worker 需符合应用 CSP。不会自动请求任何 CDN；已自行托管引擎时可省略
可选的 gdal3.js peer 安装。GDAL 引擎及其原生组件采用各自许可证，见第三方声明。

## NetCDF 切片导出

当前 gdal3.js 构建有 GTiff/COG，没有 NetCDF/HDF5 驱动。NC 文件先由读取包解析：

```ts
import { openNetCDFSource } from "rtl-raster-source/netcdf";

const dataset = await openNetCDFSource(file);
const slice = await dataset.selectSlice({ variable: "tas", indices: { time: 0 } });
try {
  const result = await converter.toCOG(slice, {
    grid: {
      bounds: [-180, -90, 180, 90],
      width: 720,
      height: 360,
      resampling: "nearest",
    },
    provenance: { dataset: dataset.metadata.attributes, originalFilename: file.name },
  });
  // 结果是物理数值 COG，不是色带着色后的 RGBA。
} finally {
  slice.close();
  dataset.close();
}
```

示例显式选择 0.5° 输出网格。所有 transform=null 的源（包括规则 NC 轴、Gaussian 纬度）
都必须提供目标 grid。原网格不会被暗中伪装成仿射网格。当前科学网格采用最近邻采样；
bounds 是像元边缘经纬度，按西、南、东、北排列，纬度在 ±90° 内。
跨日期变更线区域用大于 180° 的东边界表达，不使用 east < west。原范围外输出 NoData。

源路径先在存储值域判断缺失值和 valid range，再执行 raw \* scale + offset，写为 Float64；
缺失值写 NaN，单位保留。伴随 JSON 保存原属性/原轴、变量、选片下标、采样选择和调用方
提供的科学上下文；非有限元数据数值用 "NaN" 等字符串表示。需要可追溯性时保存 COG 和 JSON。
文件中没有的单位、地质年龄不会自动补造。

直接传入 TIFF 时保留 GDAL 原样本类型和波段元数据。grid/bands 仅适用于 RasterSource，
需要选波段时先打开源。转换器借用源，不会关闭源或 NetCDF dataset。

## 地理参考与重投影

无地理参考的 TIFF 会明确拒绝；可用 georeference 提供已知 EPSG 和北向像元角点变换：

```ts
await converter.toCOG(file, {
  georeference: { epsg: 4326, transform: [-2, 1, 0, 2, 0, -1] },
});
```

重投影参数为 reproject: { epsg, bounds, width, height, resampling }，目标 EPSG 为
4326 或 3857，bounds 使用目标 CRS 单位。必须明确输出大小，便于转换前预算检查。
重投影可选 nearest/bilinear/cubic；概览重采样另选 nearest/average/mode。
分类数据使用 nearest。GDAL 保留 TIFF 输出类型时，整数栅格的插值结果可能取整。

## 生命周期、资源与边界

同一转换器串行处理任务，并发调用返回 busy。signal 取消会终止 Worker，下一次可重新转换。
dispose 幂等，取消准备/读取和当前 Worker，永久停止该实例。每个任务独占并释放虚拟文件系统。

默认 memoryBudgetBytes 为 256 MiB，约束输入、输出和两份 Float64 网格的估计缓冲量；
不代表 WASM、浏览器或 GPU 总内存上限。源按有限行块读取，GDAL 的输出和临时数据仍占内存，
不承诺任意多 GB 文件。可缩小目标网格或配置预算。

默认 Worker 超时 180 秒，可配置；不包含读取源切片的时间。进度仅报告真实阶段，准备切片时
有明确行数，GDAL 内部没有准确百分比时不伪造。关闭后读源错误与用户回调错误会传播。

二维曲线网格、旋转网格与非结构 NC 网格仍不支持。转换不会改变坐标所代表的年代，也不执行
板块旋转。PaleoDEM 等已有古地理快照应保留其年龄/模型信息，不能因为转换为 COG 就重复重建。

RasterConversionError.code 包括 aborted、closed、busy、invalid-input、unsupported-format、
unsupported-grid、resource-limit、engine-error；原 source 的读取错误也会传回调用方。

仓库 scripts/raster/run-reference-browser.mjs --converter 通过生产构建和真实浏览器验证
转换、读回、取消、恢复与销毁；仅启动自动关闭的静态测试服务，不启动开发服务器。
实际兼容案例见 scripts/raster/README.md。英文完整说明见 [README.md](README.md)，
许可证边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

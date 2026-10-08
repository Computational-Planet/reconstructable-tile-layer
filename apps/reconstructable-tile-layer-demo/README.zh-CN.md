# 可重建瓦片图层演示程序

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

这个 Cesium 应用演示了配套论文所述的浏览器端可重建瓦片图层（Reconstructable
Tile Layer，RTL）。它使用与论文一致的 `ReconstructableTileLayer` 和
`WebGLTileProcessor` API，支持在线瓦片与本地科学栅格、板块模型、参考多边形叠加层、
导出模式和渲染行为。

## 快速开始

工作区依赖已经安装时，在仓库根目录执行：

```sh
pnpm dev
```

首次克隆或依赖发生变化后，先安装一次再启动：

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm dev
```

Turbo 会同时启动四个核心库的监听构建和 Vite demo。三个可选栅格库由
`pnpm build:packages` 构建，修改源码或 Worker 后重新运行该命令。

## 面板操作顺序

1. **Plate model**：选择板块域和 ROT；URL、anchor 和多边形模式在 **Model settings** 中配置。
2. **Imagery data source**：在 **Source type** 选择 **Tile map service** 或 **Local TIFF / NetCDF**，
   在线服务使用常驻连接表单，本地文件展开 **Source settings** 配置，共用 **Apply source** 按钮。
   在线服务首次应用会同时初始化模型。**Current source** 显示实际生效来源；切换来源或修改表单不会立即替换地图。
3. **Reconstruction**：应用成功后加载瓦片，再调整紧邻的年代轴。模型配置改变后需重新应用。

本地文件应用成功后自动收起配置；在线连接表单保持可见。空间属性、数据引用、配色和数值 COG 导出按需展开；
GPlates 参考叠加层、视图与渲染设置、实验导入导出和统计位于三个主步骤之后。
快照和参考模式直接显示影像，第 3 步会说明为何无需加载重建瓦片。

## 相机与快捷视角

**Camera & Output → Scene mode** 提供 **2D rectangular**、**3D (perspective)**
和 **3D (orthographic)**。正射模式保留三维球体和重建图层，使用平行投影。
**Quick view** 可将反经线（±180°）、南极或北极置于画面中心，并按窗口比例完整显示球体。
快捷视角保留当前三维投影；在二维模式使用时恢复上次选择的三维投影。
**Detailed** 中仍可手动设置目标经纬度、距离、姿态和输出尺寸。

实验 JSON 区分透视与正射：正射使用 `viewMode: "3D_ORTHOGRAPHIC"` 和
`projection: "OrthographicGlobe"`，透视保留 `viewMode: "3D_GLOBE"` 并使用
`projection: "PerspectiveGlobe"`。旧配置中的 `3D_GLOBE` 加 `camera3D.orthographic: true`
会自动迁移为正射模式；读取投影枚举的外部脚本需支持上述取值。

## 连接在线影像数据

**Tile map service** 是连接用户服务的工具。**Fill from example** 只把示例的全部连接参数填入表单，
原有引用按钮保留；也可选择 **Your connection (blank form)** 从空表单开始。修改后显示
**Example settings edited**，**Reset example** 可恢复原示例。正式使用的 Provider 完全由表单构造。

- **XYZ / TMS URL template**：填写 URL；`{z}` 是层级，`{x}` 是列，`{y}` 从北向南计数，
  `{reverseY}` 从南向北计数。支持 `{s}` 子域名。
- **WMS**：填写服务端点、图层、版本、请求 CRS、样式、图片格式和透明背景。
  表单和瓦片网格生成 GetMap 参数；端点查询串中旧的 `LAYERS`、`BBOX`、`REQUEST` 等受控参数会被替换。
  WMS 1.3.0 的 EPSG:4326 使用纬度、经度顺序，CRS:84 和 WMS 1.1.1 使用经度、纬度顺序。
- **WMTS**：支持 KVP 端点或 REST 模板；填写图层、样式、图片格式和矩阵集 ID。
  REST 可使用 `{Layer}`、`{style}`、`{TileMatrixSet}`、`{TileMatrix}`、`{TileRow}`、`{TileCol}`。
  高级选项可按 L0 起逐行填写矩阵标签，及 `Time=...` 等维度。

GPlates 的两个示例仍使用 Demo 托管的瓦片，地址明确显示为 `/tiles/.../{z}/{x}/{y}.png`。
这个相对地址使用当前站点，与外部在线服务经过同一构造路径，可替换成用户自己的地址。

**Projection / tiling scheme** 与服务的真实网格必须一致。高级选项补充 L0 行列数、瓦片像素尺寸、
覆盖范围、子域名、附加请求参数、连接名称和署名。默认 Geographic 为全球 2×1 根网格，
Web Mercator 为 1×1；覆盖范围只裁剪全球网格，不修改其原点。当前表单不支持非全球原点、
任意投影、跨日期变更线的单个覆盖框或不逐级二分的矩阵集，需要另外实现 tiling scheme。
服务 min/max 是可请求范围，第 3 步单独选择重建加载层级。WMTS 的最小层级覆盖不得超过四个瓦片，
通常保留 min=0，在第 3 步加载 L2/L3。附加参数按每行 `name=value` 填写，不能覆盖已有的协议字段。
WMS 的 `TIME` 或 WMTS 时间维度保持固定，与地质年代轴分别管理。

先点击 **Test tile connection**，读取覆盖中心的一张样例瓦片并显示预览，再点击 **Apply source**，
到第 3 步加载重建瓦片。连接测试使用同一 Provider 构造路径并检查图片解码与 Canvas 读取，
不会替换已应用来源；它只验证一个位置和层级，不保证所有瓦片可用。服务器仍须允许浏览器跨域读取（CORS）。

实验 JSON 将完整连接写入 `sources.serviceConfig`，保留示例标识和编辑后的字段。
已有服务生效时，导出记录实际应用配置，未应用的表单修改不混入结果。旧版服务选项和四字段
`customProviderConfig` 会迁移；重新导入恢复表单，仍需点击 **Apply source**。
未完成且未应用的在线表单不导出。旧版 Demo 不认识新增的 `serviceConfig`，编辑后的 WMS/WMTS 连接需用新版恢复。

协议参数对应 Cesium 的 [URL template](https://cesium.com/learn/cesiumjs/ref-doc/UrlTemplateImageryProvider.html)、
[WMS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapServiceImageryProvider.html) 和
[WMTS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapTileServiceImageryProvider.html) Provider。

## 本地科学栅格

1. 在 **Imagery data source → Local TIFF / NetCDF → Source settings** 选择本地 TIFF/COG 或 NetCDF；文件不上传到服务器。
   NetCDF 保留原变量名、维度和单位，选择时间/深度等下标后点击 **Read selected slice**。
2. 要让用户的 0 Ma 数据随时间轴重建，选择 **Reconstruct from 0 Ma (follows timeline)**，
   确认现代坐标框架，点击 **Apply source**，再使用 **Load Tiles By Level**。
   应用自动设置建议层级：低分辨率从 L2 开始，较细数据从 L3 开始；更高层级建议使用视野加载。
   本地 `RasterImageryProvider` 直接向 RTL 提供瓦片，复用上方所选板块域、ROT 与 anchor；
   改变时间轴更新板块旋转，不按源文件的 0 Ma 年龄隐藏图层。
   **Paleo snapshot (visible at one age)** 才是按指定年龄显隐的快照；参考/未知模式按原坐标显示。
3. 展开 **Display style**，可选择单波段/RGB、预览抽样或手动物理值范围、色带。文件声明的缺测值保持透明；
   额外的原始值缺测选项仅影响显示，不改科学元数据或数值导出。再次应用替换样式。
   修改板块模型会使现代源重建失效，需要重新确认并应用。
4. 展开 **Numeric COG export (optional)**，点击 **Create numeric COG** 按需加载 GDAL。TIFF 导出存储数值波段，NetCDF 仅导出已选
   二维切片的物理数值；必须明确确认规则经纬目标网格，高斯纬度同样需要重采样。
   转换显示真实阶段并支持取消。
5. 同时下载 COG 和溯源 JSON。**Load converted COG** 重新读取结果，再点击
   **Apply source** 进入已选显示/重建路径。移除/换文件先解除场景引用，再关闭旧
   provider、source、dataset 和 Worker。

可直接用 `tmp/paleo-domain-review/Map01_PALEOMAP_1deg_Holocene_0Ma.nc` 测试重建：
选择 `z` 并读取切片，在上方同时选择 Seton 2012 static polygons 与 Seton 2012 ROT，
选择 **Reconstruct from 0 Ma** 并确认，应用并加载建议的 L2 瓦片后切换 0、50、100 Ma。
此时源数据仍是 0 Ma，时间轴表示重建的目标年代。`Map23_…100Ma.nc` 已描述 100 Ma
地理状态，使用快照模式查看；应用不会仅凭文件名或 NetCDF 格式自动决定用途。

读取后面板会分别列出存储尺寸/COG 概览、可请求的地图层级和建议起始层级。
地图层级在文件覆盖范围上细分，L2 为 4×4、L3 为 8×8 个源瓦片；它们不是 COG 概览编号。
PaleoDEM 361×181 原 NC 及其 720×360 转换 COG 默认最高均为 L2，ETOPO 3600×3600 为 L4。
增加切分层级或重采样尺寸不会增加数据精度。超出声明范围会提示，不会静默降级。
层级设计和可显式覆盖的库参数见 [Provider 说明](../../packages/rtl-raster-imagery-provider/README.zh-CN.md)。

PaleoDEM 可由不同年龄的独立文件组成序列，不要求自带 `time`。DeepMIP 的模型日历
（如以 1950 为起点的 `365_day`）与始新世实验分开记录。原属性和缺失单位不擅自
补写。二维曲线、旋转及非结构网格明确拒绝，包括实际测试的 DeepMIP 海洋 `tos`；
一个 `tas` 通过不代表全部模型兼容。搬移现代 ETOPO 数值演示几何传输，不是古地形预测。

配置导出新增 `sources.localRaster`，包含文件名、原切片、实际样式、科学上下文及
`requiresReselect: true`；不嵌入文件或短期 blob URL。本地上传的板块域和 ROT 也保留
文件描述；导入时清空对应地址，初始化模型前需要重新选择文件。重新导入要求选择原文件并应用，
不会从描述凭空恢复数据。NaN 等非有限科学元数据以文本序列化，避免静默变为 null。

运行要求 WebGL、Canvas、File/Blob、模块 Worker 和 WASM。Vite 已配置
`worker.format = "es"`，通过 `?url` 托管的 GDAL JS/WASM/data 仅在转换时加载。
自定义部署与 CSP 见[各包文档](../../README.zh-CN.md#工作区)，具体数据兼容范围见
[真实样本矩阵](../../scripts/raster/README.md#production-demo-and-scientific-meaning)。
本轮不包含后端、地图点查询或区域统计。

## 论文工作流

演示程序支持论文案例研究所使用的相同操作：

- 注册 WMS、WMTS、XYZ、URL 模板或自定义的兼容影像源；
- 加载 GPML、GPMLZ、XML、旧版 JSON、上传的板块域数据和 ROT 文件；
- 切换重建年代、刚性板块模型和 Cesium 变换模式；
- 加载固定的源瓦片层级，或针对当前视图细化瓦片；
- 叠加现有的 GPlates 参考多边形；
- 导入可复现配置，并导出带运行时元数据的截图。

源服务提供影像和样式。RTL 提供板块域分配、有限旋转、瓦片局部掩膜、年代感知
定位和视图感知的源瓦片选择。

## 运行数据

应用要求打包资源位于 `public/` 目录。在线提供器仍受其可用性、访问策略、CORS
配置和署名要求约束。

如果只需启动 demo，请先确保工作区内的库已经构建，再执行：

```sh
pnpm --filter reconstructable-tile-layer-demo dev
```

## 基本操作顺序

1. 导入实验 JSON，或保留默认配置。
2. 选择要素数据源、ROT 模型和影像提供器。
3. 配置场景、输出、多边形意图和变换模式。
4. 点击 **Apply source** 应用数据源并初始化图层。
5. 设置 `Age Ma`，然后加载根瓦片、明确层级或当前视图。
6. 按需导出运行信息或截图。

导入的 `schemaVersion: 1` 实验文件会恢复控件值和相机状态，但不会自动初始化或
加载图层。

## 导出兼容性

截图导出与既有 JSON 字段保持兼容。JSON 继续使用现有的 `schemaVersion: 1`、
`geoTileStats` 和 `tileProcesserStats` 字段名，因此以前的实验配置和分析脚本仍然
兼容。

本地上传的模型文件导入后需要重新选择，见前述说明；旧配置中失效的 `blob:` 地址也会被清空。

压缩 NetCDF 的直接采样可能较慢：实测 3600×3600 的 ETOPO 文件生成第 0 层重建瓦片约需
90 秒，同区转换后的 COG 加载明显更快。[浏览器验收说明](../../scripts/raster/README.md)
列出操作耗时、样本尺寸、版本与限制；格式验证通过不代表任意数据集都能流畅交互。

截图直接从 Cesium canvas 获取，不包含控制面板。跨源影像必须允许读取 canvas。

## 可选基准测试控制器

在初始化交互式图层之前，可以从控制台调用现有的浏览器基准测试：

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

保留该控制器是为了复现论文中的浏览器测量，正常使用演示程序时不需要它。执行一次
独占基准测试后，应刷新页面再返回交互式工作流。

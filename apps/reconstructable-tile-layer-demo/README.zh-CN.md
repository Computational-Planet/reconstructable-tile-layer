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

Turbo 会同时启动 RTL、内嵌模块的监听构建和 Vite demo。三个可选栅格库由
`pnpm build:packages` 构建，修改源码或 Worker 后重新运行该命令。

## 包的接入方式

Demo 从 `reconstructable-tile-layer` 导入 `ReconstructableTileLayer` 和
`WebGLTileProcessor`；处理器专用类型使用 `/processor` 公共入口。核心模块由 RTL 从
`packages/reconstructable-tile-layer/modules` 统一打包，Demo 通过 RTL 的公共入口使用它们。

`src/layers`、本地文件控件、object URL 生命周期、时间轴协调及普通 GeoJSON 属于
Demo。数值 TIFF、对应 Cesium provider 和可选 COG 转换使用三个独立 Raster 扩展。
普通影像和矢量使用Cesium原生显示组件。

## 面板操作顺序

1. **Plate model**：选择板块域和 ROT；URL、anchor 和多边形模式在 **Model settings** 中配置。
2. **Layer data source**：在 **Source type** 选择 **Tile map service**、**Local TIFF / GeoTIFF** 或 **Local GeoJSON**，
   在线服务使用常驻连接表单，本地文件展开 **Source settings** 配置，共用 **Add layer** 按钮。
   每次添加保留已有图层。在线服务可选择重建或固定坐标；**Selected** 显示右侧当前选中的图层。
3. **Timeline & tiles**：瓦片加载和清空作用于选中的重建图层，年代轴统一更新全部重建图层。

本地文件应用成功后自动收起配置；在线连接表单保持可见。空间属性、数据引用、配色和数值 COG 导出按需展开；
GPlates 参考叠加层、视图与渲染设置、实验导入导出和统计位于三个主步骤之后。
点击字段旁的小 **?** 可阅读说明，点击外部或按 Escape 关闭。错误、加载进度和当前图层状态保持可见。
较短的控件并排排列；**Experiment** 将 **Import**、**Export info** 和 **Screenshot** 集中在一行。
普通栅格图层（包括快照和参考模式）使用 Cesium 原生 `ImageryLayer`，添加后随视野自动加载。

## Reference & Legend

**Reference & Legend**、其中的 **GPlates reference** 和 **Macrostrat legend** 默认全部折叠。
GPlates 参考线提供来源和颜色选项。

在 **Macrostrat legend** 设置 **Zoom (z)**（默认 **4**，应与源瓦片层级一致），
通过并列的 **Select area** / **Select point** 选择区域或点。**Select area** 在球面上拖动框选，
整个框应落在地球上，必要时放大或切换为 2D。**Select point** 点击球面上的一个位置，并显示橙色点标记。
点会转换为经纬度各向外 **0.0001°** 的小四至（通常宽、高均为 0.0002°），在两极截断纬度，
在反经线处环绕经度。两种选择方式共用模型选择、缓存与图例展示。
Escape 或 **Cancel** 取消选择并恢复相机操作；**Query again** 复用已选点或区域，
**Clear** 清除选择及标记。展开 **Query point** / **Query area** 可查看所选坐标和现代查询四至。

**0 Ma** 直接查询所选点或区域对应的经纬度四至。非零年代需选择 Macrostrat Carto 重建图层，
使用该图层已绑定的板块模型、全局年代及 RTL 的视野包围球逆旋转路径，再按 Legend 的 **z**
层级遍历四叉树（须在图层 provider 的支持范围内）。NONE 节点直接剪枝，只保留与球相交的
FULL / NEED_CLIP 瓦片。区域框选先逐板块拼合，再跨板块去重与合并，不填平空隙或孔洞。
不连续的覆盖可以产生多个查询矩形。
点选启用 RTL 的 `clipToView`：将每个板块的选中覆盖与逆旋转后的小查询四至求交，再汇总去重。
最终请求保持微小范围，不扩展到 z 层级的整张瓦片；z 仍控制四叉树覆盖筛选与 Macrostrat 图例级别。
导入后尚未加载瓦片的图层也可先准备模型完成查询，不会加载或清空瓦片。
跨反经线的范围分开查询。返回范围是保守四至，可能包含附近单元，
并非旋转后影像的逐像素精确图例。

查询前先删除重复四至及被其他四至完全包含的范围。每个范围完成后立即按 `legend_id`
**合并去重（并集）** 并显示，不必等待所有请求。失败或超时的范围会跳过，界面标明失败数量和结果不完整；
**Query again** 重试失败范围并复用成功缓存，**Cancel** 停止剩余请求且保留已收到的条目。
展示时再按规范化后的颜色合并，每种颜色一个条目。名称和年代相同时使用共同标题，不同时显示多个单元／年代，
展开后保留每个原始 ID 对应的名称、年代、岩性、描述、来源 ID 和数值年代范围。共同属性只显示一次，
属性组合完全相同的记录合列 ID；同色不表示地图某个位置对应其中某一种岩石。
**Limit (colors)** 默认 **1000**，可设为 1–1000，按合并后的颜色条目数计算，不按原始记录数计算；
超出上限时隐藏全部颜色条目并提示缩小范围。缺失或无效颜色的记录保持独立，不合并成灰色地质类别。
状态同时显示颜色条目数和原始记录数。
年代、模型、图层、层级、上限或视图模式变化后，旧结果失效，进行中的查询会取消。

demo 的 `src/legend` 管理框选、请求、取消和五分钟缓存（最多 64 个范围，总计最多 50,000 条原始记录），
`entries.ts` 管理属性与颜色规范化、分组，`MacrostratLegendSection` 和 `LegendGroupItem` 管理界面。
原始记录详情仅在展开颜色条目后渲染。接口为
`https://macrostrat.org/api/v3/map/carto/legend?bounds=W,S,E,N&zoom=z`，最多并发三个请求，单次超时 25 秒；
部分结果会明确标识，全部请求失败也不会误报为没有图例。接口说明见
[Macrostrat data services](https://macrostrat.org/docs/data-services)。图例设置、框选和查询结果为会话工具，
不写入实验 JSON。

## 右侧图层面板

**Layers** 面板可以收起，再通过右上角的按钮打开。标题、全局年代和 **Add layer** 保持可见，图层列表在面板内部独立滚动；
滚动到列表边缘不会继续滚动外层页面。小 **?** 提供图层顺序、来源、模型替换、年代范围和瓦片加载说明。
Escape 优先关闭已打开的说明，再次按下才关闭面板；图层状态和错误保持可见。
面板分为重建图层、普通影像与普通矢量三组。矢量列表不表示几何绘制顺序；影像
组内越靠上越晚绘制，使用箭头在同组内换位；重建图层绘制在原生影像之上。
每层支持显隐、名称、透明度和删除；仅重建图层提供手动瓦片加载。较窄窗口使用右侧浮动面板。

固定坐标图层可选择 **All ages** 或闭区间 **Youngest / Oldest (Ma)**。
例如 100–150 Ma 包含两个端点；超出范围自动隐藏，手动关闭的图层不会被时间轴重新开启。
快照初始范围等于其科学年代，可在面板修改显示范围，坐标始终保持不变。
添加快照不移动全局年代。经纬网与参考线仍属于辅助叠加。

左侧模型和来源是下一次添加的配置，改变它们不会清除已有图层。
左侧 **Load view** 和右侧 **Current view → Load tiles** 保留已有瓦片并追加当前视野的覆盖，
自动或锁定的视野层级变化时也不清空；重复加载会跳过已有任务。使用 **Clear** / **Clear tiles**
清理累积覆盖。保留的不同层级可能重叠并叠加透明度，需要全新视野覆盖时可先手动清空。
全域 **Specified level** 加载在从视野模式或其他层级切换时替换覆盖。
普通图层的 LOD、视野请求、缓存和纹理释放由 Cesium 原生管理，不经过 RTL 处理器或 demo 的手动瓦片加载。
要让某个重建层采用新的模型，在右侧模型旁点击 **Use current** 后重新加载瓦片。
**Clear prepared file** 仅清理本地文件编辑器；已添加图层继续持有自己的文件引用。
删除最后一个使用该文件的图层并清理编辑器后，相关栅格 source 与 Worker 才会关闭。

模块边界：`src/layers` 管理 demo 的状态、时间、原生影像接入、资源引用和序列化；
`src/components/layers` 与 `src/styles/layers.css` 管理右侧界面。
RTL 包仅提供通用图层容器、显隐、透明度和有序表面材质；处理器按 provider 隔离清理。
普通影像使用 Cesium 的 `ImageryLayerCollection`，重建图层使用独立的 Primitive 容器。

**Rendering → Show graticule** 可开关带坐标标签的 30° 经纬网，默认开启，不依赖影像
是否加载，也不随重建年代旋转。经纬网使用 demo 的球体，支持二维和三维视图，并随截图导出；
实验 JSON 通过已有的 `layers.graticule` 字段保存和恢复开关状态。

## 相机与快捷视角

**Camera & Output → Scene mode** 提供 **2D rectangular**、**3D (perspective)**
和 **3D (orthographic)**，默认使用三维正射投影。正射模式保留三维球体和重建图层，使用平行投影。
**Quick view** 可将本初子午线与赤道交点（经度 0°、纬度 0°）、反经线（±180°）、南极或北极置于画面中心，
并按窗口比例完整显示球体。
快捷视角保留当前三维投影；在二维模式使用时恢复上次选择的三维投影。
**Detailed** 中仍可手动设置目标经纬度、距离、姿态和输出尺寸。

实验 JSON 区分透视与正射：正射使用 `viewMode: "3D_ORTHOGRAPHIC"` 和
`projection: "OrthographicGlobe"`，透视保留 `viewMode: "3D_GLOBE"` 并使用
`projection: "PerspectiveGlobe"`。导入时由明确的 `viewMode` 决定相机投影。

## 连接在线影像数据

**Tile map service** 是连接用户服务的工具。**Fill from example** 只把示例的全部连接参数填入表单，
引用按钮可查看来源文献；也可选择 **Your connection (blank form)** 从空表单开始。修改后显示
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

先点击 **Test tile connection**，读取覆盖中心的一张样例瓦片并显示预览，再点击 **Add layer**，
到第 3 步加载重建瓦片。连接测试使用同一 Provider 构造路径并检查图片解码与 Canvas 读取，
不会替换已应用来源；它只验证一个位置和层级，不保证所有瓦片可用。服务器仍须允许浏览器跨域读取（CORS）。

实验 JSON 将每个图层的完整连接写入 `layerStack[].source.config`，保留编辑后的参数。
`source.exampleKey` 标识服务示例，请求以已保存的连接为准。`sources.serviceConfig` 恢复来源编辑器；
选中服务时，导出记录其实际应用配置，未应用的表单修改不混入结果。未完成且未应用的在线表单不导出。
导入恢复图层列表，重建层通过 **Load tiles** 加载；**Add layer** 用于添加另一个图层。

协议参数对应 Cesium 的 [URL template](https://cesium.com/learn/cesiumjs/ref-doc/UrlTemplateImageryProvider.html)、
[WMS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapServiceImageryProvider.html) 和
[WMTS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapTileServiceImageryProvider.html) Provider。

## 本地科学栅格

1. 在 **Layer data source → Local TIFF / GeoTIFF → Source settings** 选择带地理配准的 TIFF、BigTIFF 或 COG，文件在浏览器内处理。NetCDF 数据请先在外部转换为 GeoTIFF。
2. 现代数据需要随时间轴重建时，选择 **Reconstruct from 0 Ma (follows timeline)**，确认板块模型坐标框架，点击 **Add layer** 后加载瓦片。**Paleo snapshot** 初始仅在指定年代显示，**Reference / unknown** 按文件坐标显示；固定坐标图层的可见年代范围在 Layers 中修改。
3. **Display style** 支持单波段/RGB、抽样或手动数值范围、色带与额外原始 NoData 排除值。配色不改存储数值或数值导出；再次添加生成独立图层。
4. **Numeric COG export (optional) → Create numeric COG** 按需加载 GDAL，导出 TIFF 的原始数值波段，支持取消。请同时下载 COG 与溯源 JSON；**Load converted COG** 可重新读取结果，再添加为普通或重建图层。

面板分别列出存储尺寸/COG 概览和地图瓦片层级。L2 在文件覆盖范围内细分为 4×4 个源瓦片，L3 为 8×8；提高切分层级或重采样尺寸不会增加原始细节。支持的投影及库级覆盖参数见 [Provider 说明](../../packages/rtl-raster-imagery-provider/README.zh-CN.md)。TIFF 必须包含可用的地理配准，普通无配准图片不能直接加载。

栅格配置保留文件名、实际样式、科学上下文和 `requiresReselect: true`，不嵌入文件内容或会话 blob URL。本地板块域与 ROT 同样需要在导入后重选。缺失单位不擅自补写，NaN 等非有限科学元数据以文本保留。将现代标量数据随板块搬移演示的是几何传输，不是古地形预测。

运行需要 WebGL、Canvas、File/Blob、模块 Worker 与 WASM，GDAL 资源仅在可选转换时加载。公共栅格库保留其独立格式能力；demo 只调用 TIFF 路径。

## 本地 GeoJSON 矢量

选择 **Layer data source → Local GeoJSON**，打开 `.geojson` 或内容为 GeoJSON 的 `.json` 文件，点击 **Add layer**。支持 FeatureCollection、单个 Feature、点线面、Multi 系列与 GeometryCollection。坐标使用 WGS84 经度/纬度，可附带高度；其他投影请先转换。没有可绘制几何的空文件、未闭合环、非有限坐标以及 TopoJSON 等其他格式会明确报错。

矢量通过 Cesium 原生 [GeoJsonDataSource](https://cesium.com/learn/cesiumjs/ref-doc/GeoJsonDataSource.html) 显示，保留其支持的 simplestyle 属性与实体几何。在右侧 **Ordinary vectors** 中可改名、显隐、调整透明度、设置闭区间年代范围、缩放定位和删除。整层透明度乘以各要素原来的 alpha；时间轴只控制显示，不改变坐标。矢量显示不经过重建、裁剪、栅格化或 RTL。

矢量遮挡遵循原生几何深度与透明度规则，不提供矢量上下换位或跨影像/RTL 的统一叠放顺序。格式校验与原生生命周期位于 `src/vector`，文件编辑器独立于栅格控制和 RTL 库。实验配置不内嵌 GeoJSON 内容，导入后用 **Prepare local file** 重选文件，再 **Restore selected layer**。

## 论文工作流

演示程序支持论文案例研究所使用的相同操作：

- 注册 WMS、WMTS、XYZ、URL 模板或自定义的兼容影像源；
- 加载 GPML、GPMLZ、XML、兼容 JSON、上传的板块域数据和 ROT 文件；
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

1. 从 [paper_configs](../../paper_configs/README.zh-CN.md) 导入配置，或选择板块模型和数据源后点击 **Add layer** 创建图层。
2. 在 **Layers** 选中重建层，将 **Tile loading** 设为 **Specified level**（指定层级）或
   **Current view**（当前视图），点击 **Load tiles**。当前视图模式下，不勾选 **Lock view level** 时自动选级；
   勾选后输入固定层级，支持 L0。
3. 调整全局年代、相机和输出。左侧 **Timeline & tiles** 的明确层级／视图操作完成后，也会更新该图层保存的加载方式。
4. 按需导出运行信息或截图。

左侧 **Timeline & tiles** 的 **Load view** 旁也提供 **Lock view level**。
两侧编辑当前图层的同一份设置，与全域加载的 **Tile level** 独立。输入范围来自数据源，
包括本地 TIFF 准备后的实际范围。固定层级仍按当前视图筛选瓦片，但不会自动降低层级；完成后显示实际使用的层级。

## 实验配置

实验 JSON 使用 `schemaVersion: 3`，必填的 `layerStack` 保存全部图层的来源、显示设置、时间范围、
模型和加载方式。`loadMode: "level"` 使用指定的 `level`；`loadMode: "view"` 使用可选的 `viewLevel`
锁定层级，缺省时根据当前相机和 Provider 范围自动选级。`viewLevel: 0` 表示固定 L0。
全局年代、视图、输出和参考多边形设置与图层一起恢复。

导入先校验配置，再替换图层列表，并自动激活普通在线影像。重建层点击 **Load tiles** 执行保存的加载方式。
本地 TIFF 或 GeoJSON 点击 **Prepare local file** 重选文件，再 **Restore selected layer**。
本地模型需重选后对对应图层使用 **Use current**。文件内容和会话 `blob:` URL 不持久化。

案例文件只保存输入参数。运行导出另附当前选中重建层的 `geoTileStats`、共享处理器的 `tileProcesserStats`，
以及相机和设备测量信息；运行统计不参与之后的配置恢复。

截图直接从 Cesium canvas 获取，不包含控制面板。跨源影像必须允许读取 canvas。

## 可选基准测试控制器

在初始化交互式图层之前，可以从控制台调用现有的浏览器基准测试：

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

该控制器用于复现论文中的浏览器测量，正常使用演示程序时不需要它。执行一次
独占基准测试后，应刷新页面再返回交互式工作流。

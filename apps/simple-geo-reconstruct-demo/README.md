# Simple Geo Reconstruct Demo

这个 demo 用于在 Cesium Viewer 中加载板块多边形、旋转文件和瓦片影像，并支持为对照实验导出截图和系统信息。

## 基本流程

1. 在 `Experiment Import` 中导入已有实验 JSON，或从默认配置开始。
2. 在 `Data Sources` 中选择 Feature 数据和 ROT 旋转文件，也可以上传本地 GPML、GPMLZ、JSON、XML、ROT 或 TXT 文件。
3. 在 `Rendering` 中选择影像 provider、polygon mode、transform mode、地球背景色和 debug 开关。
4. 在 `Camera & Output` 中设置 Scene mode、实验视图、相机姿态和 Viewer 的 CSS 输出尺寸。
5. 在 `Manager` 中初始化 manager，或应用 provider / transform mode 变更。
6. 在 `Time & Tiles` 中设置 `Age Ma` 与 `Level`，再加载 root、指定 level 或当前视图范围内的瓦片。
7. 在 `Experiment Export` 中导出信息 JSON，或下载截图与同名 JSON。

## 导入实验配置

`Import config JSON` 支持导入本 demo 导出的 `schemaVersion: 1` JSON 文件。导入后会恢复控制面板中的主要配置：

- Feature preset、Feature URL、ROT preset、ROT URLs
- Provider、自定义 provider 配置、polygon mode、transform mode
- Age、Level、debug 开关、地球背景色
- Case ID、Model name、Scene mode、extent、3D camera、output CSS viewport

导入会回填控制面板、恢复输出尺寸，并根据 `viewMode` 立即切换 Viewer 的 2D/3D 模式和对应视野。导入不会自动初始化 manager，也不会自动加载瓦片。导入后请根据需要手动点击 `Init manager`、`Load level` 或 `Load view`。

## Camera & Output

- `Scene mode` 由 demo 自己管理，只支持 `2D rectangular` 与 `3D globe`。Cesium 自带的 SceneMode 切换按钮已关闭，导入 JSON 时也会按 `viewMode` 自动切换。
- `Extent` 使用经纬度四至控制视图范围，单位为度。点击 `Apply extent` 后，Viewer 会切到 2D rectangular 并应用该矩形范围。
- `3D pose` 使用目标点和姿态控制相机。点击 `Apply pose` 后，Viewer 会切到 3D globe。`Target lon` / `Target lat` 是观察目标点，`Range meters` 是相机到目标点的距离，`Heading deg`、`Pitch deg`、`Roll deg` 为角度值。
- `Orthographic 3D camera` 会切换到正交 3D 相机。
- `Output CSS viewport` 控制 Cesium Viewer 容器在页面中的 CSS 尺寸。`Pixel ratio` 会应用到 Cesium `resolutionScale`。

## 截图与信息导出

- `Export info` 会下载当前系统信息 JSON。
- `Screenshot` 会先渲染当前 Viewer canvas，再下载同名 `.png` 和 `.json` 文件。
- 截图直接来自 `viewer.scene.canvas`，不会包含左侧控制面板或右侧网格背景。
- 文件名格式为 `<caseId>_<age>Ma_<timestamp>.png/json`。

如果影像源不允许浏览器读取 canvas，截图导出可能失败。此时需要换用允许跨域读取的瓦片服务，或在本地服务中配置 CORS。

## JSON 字段说明

导出的 JSON 使用 `schemaVersion: 1`。核心字段如下：

- `exportedAt`：导出发生的 ISO 时间。
- `exportBaseName`：本次导出的基础文件名，截图和 JSON 共用。
- `caseId` / `modelName`：实验标识和模型名称。
- `rotationFile` / `rotationFiles`：当前 ROT 文件，`rotationFile` 是第一项，`rotationFiles` 是完整列表。
- `platePolygonFile`：当前 Feature URL 或上传文件生成的 object URL。
- `timeMa`：当前重建年龄，单位 Ma。
- `viewMode`：当前实验视图模式，取值为 `2D_RECTANGULAR` 或 `3D_GLOBE`，可用于导入后复现视图。
- `projection`：根据当前视图模式和 provider 映射得到的投影标记。
- `centralMeridian`：当前视图范围东西边界的中心经度。
- `extent`：当前相机可见范围四至，单位为度。
- `camera3D`：3D 场景下的相机控制参数和当前姿态角。
- `output`：Viewer 输出信息，包括 CSS 尺寸、canvas 像素尺寸、设备像素比和 Cesium 渲染倍率。
- `layers`：当前图层相关设置，包括影像层名称、背景色、透明度和暂未启用的控制点/经纬网标记。
- `sources`：当前数据源、ROT、provider 和自定义 provider 配置。
- `render`：当前初始化状态、加载层级、polygon mode、transform mode、debug 状态和状态文本。
- `cesium`：Cesium scene mode、map projection 名称和当前相机经纬高、姿态角、frustum 类型。
- `stats`：`SimpleGeoReconstructManager` 和 `CesiumTileProcesser` 的运行统计，用于对照瓦片数量、缓存、耗时等指标。

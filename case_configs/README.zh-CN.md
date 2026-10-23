# 案例配置

[English](README.md) | 简体中文

本目录位于仓库根目录的 `case_configs/`，保存 Reconstructable Tile Layer demo
所使用的案例 JSON 配置。各子目录对应不同的案例。

## 使用方法

1. 在 **Experiment Import** 中选择 **Custom / uploaded config**，点击 **Upload**，并从本目录中选择一个 JSON 文件。
2. 导入会恢复全局地质年代、视图与输出设置、参考叠加层，以及右侧 **Layers** 中的重建图层。
3. 选中恢复的图层，点击 **Load tiles**。图层的 **Tile loading** 决定使用 **Specified level**
   （指定层级）还是 **Current view · automatic level**（当前视图自动选级）。导入本身不请求重建瓦片，无需再次 **Add layer**。
4. 按需调整全局年代或视图。按视图加载时，移动相机后再次加载以更新覆盖范围。通过 **Experiment Export**
   保存配置及本次实际运行的测量结果。

## 配置内容

文件使用 `schemaVersion: 3` 和明确的 `layerStack`。每个重建图层保存完整服务连接、板块域与 ROT 模型、
锚定板块、显隐、透明度、`loadMode` 和 `level`。请求由 `source.config` 决定；`source.exampleKey`
标识服务示例，不覆盖已保存的连接参数。

- `loadMode: "level"`：按 `level` 指定的源瓦片层级加载。
- `loadMode: "view"`：根据当前相机视图和 Provider 范围自动选择层级；`level` 仅保留为之后按层级加载时的设置。
- `timeMa`、视图、输出尺寸和参考多边形设置作用于整个场景。
- `sources` 同时初始化来源编辑器；每个图层由自己的 `source` 和 `model` 决定，之后修改编辑器不会改动已有图层。

`case3/Case3_120Ma_Load_by_View.json` 使用当前视图自动选级，其余案例使用各自指定的层级。
case1 为重建对比，case2A 切换瓦片服务，case2B 切换板块模型，case3 为 Macrostrat 应用示例。

这些文件只保存复现所需的输入参数。运行状态、耗时、缓存数量和设备测量信息由 Demo 的导出操作产生。
模型和参考文件路径对应 Demo 的 `public/`，随 Demo 提供的 GPlates 地形瓦片位于 `/tiles/`。
外部在线服务需要网络访问及浏览器 CORS 支持。

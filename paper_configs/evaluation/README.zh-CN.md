# 评估图件配置

[English](README.md) | 简体中文

本目录保存正式正文4.1节图像对照的六份RTL配置，对应图8(a—e)中的RTL画面和图9(b)。4.2节的性能测试不属于这些场景配置。

## 配置与图件

所有配置均为 **120 Ma、anchor 0、`all-polygons-area`**，开启经纬网，背景色为 `#2f343b`。

| 配置文件                                                                                   | 正文位置与视角      | 图源及加载方式        | 输出设置（宽 × 高；pixelRatio） |
| ------------------------------------------------------------------------------------------ | ------------------- | --------------------- | ------------------------------- |
| [Figure_8a_RTL_Global2D_120Ma.json](Figure_8a_RTL_Global2D_120Ma.json)                     | 图8(a)，全球矩形 2D | 地形瓦片服务；指定 L4 | 1800 × 900；2                   |
| [Figure_8b_RTL_Orthographic_0_0_120Ma.json](Figure_8b_RTL_Orthographic_0_0_120Ma.json)     | 图8(b)，0°/0°正射   | 同上                  | 1000 × 1000；2                  |
| [Figure_8c_RTL_Orthographic_180_0_120Ma.json](Figure_8c_RTL_Orthographic_180_0_120Ma.json) | 图8(c)，180°/0°正射 | 同上                  | 1000 × 1000；2                  |
| [Figure_8d_RTL_NorthPole_120Ma.json](Figure_8d_RTL_NorthPole_120Ma.json)                   | 图8(d)，北极正射    | 同上                  | 1000 × 1000；2                  |
| [Figure_8e_RTL_SouthPole_120Ma.json](Figure_8e_RTL_SouthPole_120Ma.json)                   | 图8(e)，南极正射    | 同上                  | 1000 × 1000；2                  |
| [Figure_9b_RTL_Overlap2D_120Ma.json](Figure_9b_RTL_Overlap2D_120Ma.json)                   | 图9(b)，局部重叠 2D | 地形瓦片服务；指定 L4 | 900 × 600；2                    |

全球 2D 范围为西 −180°、南 −90°、东 180°、北 90°。局部 2D 范围为西 −4.012552°、南 9.5°、东 14.012552°、北 21.5°，中心约为 5°E、15.5°N，均为重建后的视图坐标。

四幅正射图的相机距离均为 `14016219.8`，pitch 为 −90°、roll 为 0°；南极 heading 为 180°，其余为 360°。完整相机参数已写入各文件的 `camera3D`。

## 导入与加载

1. 在 Demo 的 **Experiment → Import** 中选择一个 JSON。导入会恢复年代、视图、输出设置和图层列表，不自动加载瓦片。
2. 对图8，选中 **Layers** 中恢复的在线图层，确认 **Specified level / L4** 后点击 **Load tiles**。配置包含两个可见的地形图层，按列表顺序加载两层即可，无需再次 **Add layer**。
3. 对图9(b)，选中 **Layers** 中恢复的在线图层，确认 **Specified level / L4** 后点击 **Load tiles**。
4. 待图像准备及显示完成后，使用 **Experiment → Screenshot** 下载地图PNG和同次运行的JSON；**Export info** 仅下载JSON。

导入会替换原有图层及其已加载结果。四至、姿态和输出字段位于 **Camera & Output → Detailed**，
编辑后需点击对应的 **Apply** 按钮。配置已经保存对照视角，使用 **Quick view** 会替换原有构图。

## 输入来源与保存方式

- 板块域：`/features/Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz`。
- 旋转模型：`/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot`。
- 瓦片服务：`/tiles/Gplates_Topography/{z}/{x}/{y}.png`，EPSG:4326、256 × 256 像素、根网格 2 × 1，最高 L4。

以上路径相对于 Demo 的公共资源目录。文件采用 `schemaVersion: 3` 和显式 `layerStack`。图层自己的 `source.config`、`model` 和加载设置决定重建输入；顶层 `sources` 同时恢复来源编辑器。

输出宽高为CSS像素，实际导出尺寸还受浏览器缩放和设备像素比影响；以运行JSON中的
`output.canvasWidth`、`output.canvasHeight` 为实际PNG尺寸。地图PNG包含已渲染的经纬网和参考轮廓，
不包含面板或工作区标注。

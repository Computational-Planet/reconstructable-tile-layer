# 论文图件配置

[English](README.md) | 简体中文

本目录提供论文案例与视觉评估图件对应的RTL Demo可导入配置。文件名使用图号和分图字母，JSON中的 `caseId` 与文件名保持一致。`case/` 对应图5—7，`evaluation/` 对应图8—9。

| 正文图件            | 内容                                                 | 配置数量            |
| ------------------- | ---------------------------------------------------- | ------------------- |
| 图5(a—d)            | Macrostrat时间序列，0／132／120／100 Ma，L4          | 4                   |
| 图6(a—d)            | 局部L4／L8对照、加载覆盖与操作界面                   | 3 + 1份加载辅助配置 |
| 图7(a—b)            | Zahirovic等（2022）与Seton等（2012）模型对照，120 Ma | 2                   |
| 图8(a—e)中的RTL画面 | 全球2D与四个正射视角的显示对照，120 Ma               | 5                   |
| 图9(b)              | RTL局部2D重叠对照，120 Ma                            | 1                   |

共 **15份地图配置和1份加载辅助配置**。[案例说明](case/README.zh-CN.md)对应图5—7，[评估说明](evaluation/README.zh-CN.md)对应图8—9。图6(d)是图6(b)加载操作的控件和完成状态截图，无需独立配置。评估配置只恢复RTL画面，不包含GPlates会话或性能测试脚本。

## 在Demo中使用

通过 **Experiment → Import** 导入JSON，在右侧 **Layers** 选择恢复的图层，再按对应说明点击 **Load tiles**。无需再次 **Add layer** 或单独初始化。模型与内置地图资源使用Demo的相对资源地址，Macrostrat图像从其在线服务获取。

导入恢复设置，并替换现有图层，不恢复已加载图像或操作历史。图6(b)需在同一图层先加载L4，再追加局部L8；图6(c)需使用 `case/steps/Figure_6c_Load_Local_First.json` 先加载小视域，再缩小视野。

全部文件采用 `schemaVersion: 3` 和显式 `layerStack`。**Specified level** 使用 `level`；
**Current view** 在提供 `viewLevel` 时固定层级，否则自动选级。按视域加载保留已有瓦片；
需要保留累积覆盖的连续操作之间不要重新导入配置。

**Experiment → Screenshot** 下载地图 PNG 和配套运行 JSON，不包含控制面板、图例列表或工作区标注。
图6(d)等操作界面图需使用浏览器／系统截图。Macrostrat 图例的选择与结果不写入配置，需另行查询。

# 案例图件配置

[English](README.md) | 简体中文

本目录包含论文图5—7对应的9份地图配置和1份加载辅助配置。文件名与 `caseId` 标识对应图号和分图。

## 文件与图件对应

主配置位于当前目录，加载辅助配置位于 `steps/`。Zahirovic和Seton分别指Zahirovic et al. (2022)及Seton et al. (2012)。

| 正文分图    | 配置文件                                 | 配置用途                                                  |
| ----------- | ---------------------------------------- | --------------------------------------------------------- |
| 图5(a)      | `Figure_5a_0Ma_L4.json`                  | Zahirovic，0 Ma，区域L4                                   |
| 图5(b)      | `Figure_5b_132Ma_L4.json`                | Zahirovic，132 Ma，同一区域L4                             |
| 图5(c)      | `Figure_5c_120Ma_L4.json`                | Zahirovic，120 Ma，同一区域L4                             |
| 图5(d)      | `Figure_5d_100Ma_L4.json`                | Zahirovic，100 Ma，同一区域L4                             |
| 图6(a)      | `Figure_6a_120Ma_Local_L4.json`          | Zahirovic，120 Ma，南美局部视图，L4                       |
| 图6(b)、(d) | `Figure_6b_120Ma_Local_View_L8.json`     | 同一局部，按当前视域固定L8；(d)为这次加载完成后的界面截图 |
| 图6(c)      | `Figure_6c_120Ma_Coverage_Overview.json` | 加载后缩小视野的最终构图；含地形背景和灰色参考轮廓        |
| 图7(a)      | `Figure_7a_120Ma_Zahirovic2022_L4.json`  | Zahirovic，120 Ma，模型比较视图，L4                       |
| 图7(b)      | `Figure_7b_120Ma_Seton2012_L4.json`      | 同一视图，Seton层可见，Zahirovic层隐藏，L4                |

`steps/Figure_6c_Load_Local_First.json`用于先在小视域加载L8，再形成图6(c)总览。它由总览图层配置和图6(a)的局部视图组合得到，用于先加载局部视图，再构建覆盖总览。

## 导入与加载

1. 在Demo的 **Experiment → Import** 中选择JSON。
2. 导入恢复年代、视图、输出设置、参考轮廓及 **Layers** 中的图层，无需再次 **Add layer**。
3. 选中图层，在 **Tile loading** 中核对模式后点击 **Load tiles**。`level`模式按指定层级加载；`view`模式按当前视域加载。本版所有按视域加载均锁定 **L8**。

**导入配置会替换现有图层并释放已加载结果。JSON保存设置，不保存瓦片图像、已加载范围或操作历史。** 因此，下列连续步骤之间不要重新Import，否则不能保留前一步的L4或L8覆盖。

### 图5：时间序列

可分别导入四份配置并加载L4。也可只导入0 Ma配置、完成L4加载，然后依次调整全局年代到132、120、100 Ma并导出。四份配置使用相同视图。

### 图6(a)、(b)、(d)：L4背景上的局部L8

1. 导入 `Figure_6a_120Ma_Local_L4.json`，以 **Specified level = 4** 加载Macrostrat层，导出(a)。
2. 保持图层、120 Ma和相机不变，改为 **Current view**，勾选 **Lock view level** 并设为 **8**，再点击 **Load tiles**。按视域加载会追加L8并保留已有L4。
3. 导出(b)，随后截取显示固定L8及加载完成状态的真实界面作为(d)。

(b)的独立配置记录最终设置。若从该文件开始，需先将模式改为 **Specified level = 4** 并加载，再切回 **Current view / fixed L8** 加载，才能获得“L8叠加保留的L4”。仅导入并按L8加载，不会自动生成L4背景。

### 图6(c)：局部L8覆盖总览

1. 导入 `steps/Figure_6c_Load_Local_First.json`。该文件已设置120 Ma、原局部视图、900 × 600输出及两层的叠放顺序。
2. 分别加载 **GPlates Topography** 层（Specified level，L4，透明度0.5）和 **Macrostrat Carto** 层（Current view，固定L8）。该图用于突出L8覆盖，不给Macrostrat层添加全域L4。
3. 加载完成后，在 **Camera & output** 中将输出设为 **600 × 600，pixel ratio 2**，点击 **Apply output size**；再输入下表总览范围并点击 **Apply extent**。
4. 保留已加载瓦片，直接导出总览。此时不再按更大的视域加载L8，也不要导入总览JSON。总览JSON保存最终视图，供核对或重新建立设置；它本身不能恢复此前的小视域加载历史。

| 视图        |       West |      South |      East |      North | 配置输出尺寸       |
| ----------- | ---------: | ---------: | --------: | ---------: | ------------------ |
| 图5区域     | −81.379468 | −72.768463 | 55.921051 |  18.663286 | 900 × 600，ratio 2 |
| 图6局部加载 | −13.677141 | −28.353388 | −9.212057 | −25.379980 | 900 × 600，ratio 2 |
| 图6(c)总览  | −56.899985 | −66.188197 | 13.685864 |   4.397653 | 600 × 600，ratio 2 |
| 图7模型比较 | −81.389933 | −72.768463 | 55.931516 |  18.663286 | 900 × 600，ratio 2 |

范围均为120 Ma重建视图坐标，图5的范围适用于其四个年代。输出值为Demo的输出设置；实际导出像素尺寸还受设备像素比影响。

### 图7：两模型比较

可分别导入(a)、(b)的配置，加载可见图层的L4后导出。也可从(b)的双图层配置开始，分别加载两层的L4，在同一120 Ma视图中交替显示、分别导出。两层的模型绑定独立；隐藏层不必加载，除非需要切换显示。两份配置共用同一模型比较视图。

## 数据与字段

- Macrostrat Carto使用 `https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png`，Web Mercator源网格；场景使用 `2D_RECTANGULAR`地理坐标显示。
- Zahirovic配置配对 `Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz` 与 `Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot`。
- Seton配置配对 `Seton_etal_ESR2012_StaticPolygons.1.gpmlz` 与 `Seton_etal_ESR2012_2012.1.rot`。两模型均保留anchor 0及 `all-polygons-area`。
- 总览背景使用 `/tiles/Gplates_Topography/{z}/{x}/{y}.png`，灰色参考轮廓使用 `/gplates_ref/geojson/reconstructed_120.00Ma.geojson`。它们使用Demo配套的公共资源。
- 文件沿用 `schemaVersion: 3` 和完整 `layerStack`。每层的 `source`、`model` 决定实际输入；`sources`初始化左侧来源编辑器。
- `viewLevel: 8`才是按视域加载的固定层级；其中的 `level`是切回指定层级模式时的设置，不代表已经加载的全部层级。
- 图中分图字母、定位框、部分图例及UI裁切属于论文图件编辑，不是Demo配置字段。

模型、地形和参考轮廓需在配置指定的Demo资源地址可用；Macrostrat图像需要网络访问及CORS支持。

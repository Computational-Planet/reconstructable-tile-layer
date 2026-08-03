# 可重建瓦片图层演示程序

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

这个 Cesium 应用演示了配套论文所述的浏览器端可重建瓦片图层（Reconstructable
Tile Layer，RTL）。它使用与论文一致的 `ReconstructableTileLayer` 和
`WebGLTileProcessor` API，同时保留原有界面、控件、数据集、参考多边形叠加层、
导出模式和渲染行为。

## 快速开始

工作区依赖已经安装时，在仓库根目录执行：

```sh
pnpm dev
```

首次克隆或依赖发生变化后，先安装一次再启动：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Turbo 会同时启动四个库的监听构建和 Vite demo。请使用 Vite 在终端输出的本地地址。

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
4. 初始化图层。
5. 设置 `Age Ma`，然后加载根瓦片、明确层级或当前视图。
6. 按需导出运行信息或截图。

导入的 `schemaVersion: 1` 实验文件会恢复控件值和相机状态，但不会自动初始化或
加载图层。

## 导出兼容性

截图和 JSON 导出行为保持不变。JSON 继续使用现有的 `schemaVersion: 1`、
`geoTileStats` 和 `tileProcesserStats` 字段名，因此以前的实验配置和分析脚本仍然
兼容。

截图直接从 Cesium canvas 获取，不包含控制面板。跨源影像必须允许读取 canvas。

## 可选基准测试控制器

在初始化交互式图层之前，可以从控制台调用现有的浏览器基准测试：

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

保留该控制器是为了复现论文中的浏览器测量，正常使用演示程序时不需要它。执行一次
独占基准测试后，应刷新页面再返回交互式工作流。

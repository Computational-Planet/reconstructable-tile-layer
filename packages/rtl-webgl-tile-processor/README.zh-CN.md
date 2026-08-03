# rtl-webgl-tile-processor

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的 **WebGL 处理器**。它请求服务交付的源瓦片，在需要时重映射
WebMercator 纹理坐标，对瓦片局部的 `TileClipArea` 掩膜进行三角剖分，并为
Cesium 材质导出具有透明区域的已处理瓦片图像。

推荐使用与论文一致的类名 `WebGLTileProcessor`。现有名称
`CesiumTileProcessor` 和历史名称 `CesiumTileProcesser` 仍作为同一实现的
别名保留。

## 功能特性

- 请求并重映射地理坐标和 WebMercator 瓦片的源影像。
- 对板块域掩膜进行三角剖分，并使用模板缓冲区裁剪边界瓦片。
- 提供有界渲染并发、结果缓存和运行时计数器。
- 导出具有明确所有权的 canvas、blob URL 或 data URL 图像。

## 安装

```sh
pnpm add rtl-webgl-tile-processor cesium
```

用于掩膜三角剖分的 `earcut` 已打包进软件包，其许可证记录在
`THIRD_PARTY_NOTICES.md` 中。

## 创建处理器

```ts
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

const webglProcessor = new WebGLTileProcessor({
  width: 256,
  height: 256,
  outputType: "canvas",
  slotCount: 4,
});
```

本软件包需要浏览器 DOM、`HTMLCanvasElement`、带深度和模板缓冲区的 WebGL 1，
以及 Cesium `ImageryProvider`。跨源影像必须允许在 canvas 中使用。

## 完整源瓦片

```ts
const processedImage = await webglProcessor.processSourceTileImage(x, y, level, imageryProvider);
```

## 使用板块域掩膜的源瓦片

```ts
const clipAreas = [
  {
    polygons: [
      {
        exterior: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
        interiors: [[0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75, 0.25, 0.25]],
      },
    ],
  },
];

const processedImage = await webglProcessor.processMaskedSourceTileImage(
  x,
  y,
  level,
  clipAreas,
  imageryProvider,
);
```

坐标位于瓦片局部坐标系中，通常处于 `[0, 1]` 范围。返回 null 表示任务已取消，
或无法生成可用的已处理图像。

## 已处理图像的所有权

每个非 null 的 `ProcessedTileImage` 都会为调用方保留。对于每个返回的引用，
包括缓存命中，都必须且只能调用一次 `release()`。根据 `outputType`，`source`
可以是 blob URL、data URL 或 canvas。

`clearBuffer()` 会释放缓存结果并取消排队的任务，同时保持处理器可用。
`destroy()` 会永久释放其 WebGL 上下文、渲染槽、纹理、程序、缓冲区、canvas 和缓存。

使用 `getRuntimeStats()` 获取缓存、队列、提供器、掩膜、渲染和导出计数器。

## 与 RTL 方法的关系

完整瓦片会绕过裁剪掩膜。边界瓦片使用其瓦片局部板块域区域的并集作为模板掩膜，
然后仅在模板生效的位置绘制源纹理。这对应论文方法部分“GPU 瓦片掩膜、渲染和
年代感知复用”小节中描述的实现。

## 兼容性

之前的所有 `reproject*` 方法、`getPoolStats()`、`clearBuffer()` 以及现有类名和
类型名继续可用。与论文一致的方法只是轻量别名，不会改变缓存、掩膜或输出行为。

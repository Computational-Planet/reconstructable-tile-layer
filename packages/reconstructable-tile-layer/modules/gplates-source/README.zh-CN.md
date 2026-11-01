# rtl-gplates-source

[项目主页](../../../../README.zh-CN.md) · [English](README.md) | 简体中文

本包集中提供 GPlates 文件读取能力，连接模型文件、有限旋转计算和 RTL。
它负责 URL/本地文件读取、gzip/ZIP 解压、ROT 解析、GPML 多边形解析，以及板块域数据适配。
运行时仅依赖 `fflate`，不依赖 Cesium、React 或其他 RTL 包。

## 使用统一 RTL 入口

本模块的唯一源码位于 RTL 的 `modules/gplates-source`。已安装 RTL 时直接使用：

```ts
import { loadFiniteRotationRecords } from "reconstructable-tile-layer/gplates";
```

无需额外安装本独立包。独立使用时，下面的安装命令和示例仍然有效；在仓库根目录运行
`pnpm --filter rtl-gplates-source build` 可生成独立的 ESM、CommonJS 和类型声明。
两种发行方式共享源码，构建产物与类身份分别独立。

## 安装与使用

```sh
pnpm add rtl-gplates-source
```

```ts
import {
  loadFeaturePolygonDataWithDiagnostics,
  loadFiniteRotationRecords,
} from "rtl-gplates-source";

const { items, diagnostics } = await loadFeaturePolygonDataWithDiagnostics(
  "/models/static-polygons.gpmlz",
  { polygonRenderIntent: "all-polygons-area" },
);
const rotations = await loadFiniteRotationRecords(["/models/rotations.rot"]);
```

加载方法接受 URL 字符串、`URL`、`File`/`Blob`、`ArrayBuffer` 和 `Uint8Array`。
字符串始终作为 URL；已有文本应交给 `parseGpmlText` 或 `parseFiniteRotationText`。
本地文件可直接读取，无需先创建 object URL：

```ts
async function readUploadedModel(plates: File, rotationFiles: File[]) {
  const polygons = await loadFeaturePolygonDataWithDiagnostics(plates, {
    polygonRenderIntent: "all-polygons-area",
  });
  const rotations = await loadFiniteRotationRecords(rotationFiles);
  return { polygons, rotations };
}
```

`signal` 用于取消网络请求，并阻止继续处理已取消的本地读取。
`sourceName` 可指定用于诊断和分类推断的原始文件名；未指定时使用 URL 或 `File.name`，
匿名 Blob/缓冲区使用 `"unknown"`。文件名包含 `static_polygons` 或 `static_plate`
时沿用全部多边形填充的推断规则；显式 `polygonRenderIntent` 的优先级更高。

## 包之间的职责

| 层次                         | 职责                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `rtl-gplates-source`         | 解码和解析文件，输出几何、板块 ID、有效年代、ROT 记录和导入诊断。            |
| `rtl-finite-rotation`        | 将记录转为四元数，进行年代插值并组合板块参考链。                             |
| `reconstructable-tile-layer` | 建立板块域索引、调度瓦片裁剪并渲染重建影像。                                 |
| Demo                         | 文件选择、继续使用 RTL 的 URL 配置时管理 object URL 生命周期，以及显示结果。 |

`FeaturePolygonData.clipArea` 是纯坐标结构，与 RTL 四叉树输入兼容，但不依赖四叉树包。
`ParsedGpmlFeature` 保留适配前的源元数据和多边形部件。读取函数不创建 Cesium 对象、
Worker、object URL 或 UI 资源。

已解析的旋转记录可以直接交给旋转包：

```ts
import { FiniteRotationInterpolator } from "rtl-finite-rotation";

const interpolator = new FiniteRotationInterpolator({ anchorPlateId: "0" });
await interpolator.initializeFromRecords(rotations);
const matrix = await interpolator.getPlateRotationMatrix("101", 100);
```

## 主要接口与支持范围

| 接口                                                      | 输出                                                  |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `readGplatesText(source, options?)`                       | 按字节识别压缩格式并解码文本。                        |
| `decodeGplatesArrayBuffer(bytes, sourceName?)`            | 同步解码 UTF-8、gzip 或 ZIP。                         |
| `parseFiniteRotationText(text)`                           | 按移动板块 ID 分组的 ROT 记录。                       |
| `loadFiniteRotationRecords(sources, options?)`            | 按输入顺序读取多个源，合并文本后解析。                |
| `parseGpmlText(text, options?)`                           | 带元数据和多边形几何的 GPML 要素。                    |
| `parsedGpmlFeaturesToPaleoData(features, options?)`       | RTL 可用的板块域记录和诊断。                          |
| `loadFeaturePolygonDataWithDiagnostics(source, options?)` | 解码、解析并适配 GPML/GPMLZ/XML 或自定义多边形 JSON。 |
| `loadFeaturePolygonData(source, options?)`                | 仅返回板块域记录。                                    |
| `readGplatesXmlFromUrl(url, options?)`                    | 从 URL 读取 GPML/XML。                                |

GPML 解析需要 `DOMParser` 和 DOM 节点类型。包导入、字节读取和 ROT 解析也可用于
Node.js 18+；在 Node 中解析 GPML 需要提供 DOM 实现。仅导入包不会访问 DOM 或发起请求。

ZIP 优先选择首个 GPML/XML 文件，其次 ROT 文件，最后为首个非目录文件；不合并压缩包
内的多个模型文件。GPML 的几何支持多边形，包含孔洞和多个部件，不支持点线解析、
动态拓扑求解或矢量重建。自定义 JSON 不是 GeoJSON，仅使用每个要素的首个多边形。

ROT 保留文件顺序，忽略 `!` 注释和不完整记录；连续同龄且参考板块相同的记录去重，
同龄但参考板块变化时，将前一条记录年龄减去 0.01 Ma。

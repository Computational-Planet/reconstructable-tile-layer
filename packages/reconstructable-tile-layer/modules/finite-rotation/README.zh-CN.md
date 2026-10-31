# rtl-finite-rotation

[项目主页](../../../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的**有限旋转插值器**。它解析 GPlates ROT 记录，将有限欧拉旋转
转换为单位四元数，使用 Cesium `QuaternionSpline` 对控制年代进行插值，并以递归
方式将参考板块链组合到锚定板块。

公共类为 `FiniteRotationInterpolator`。

## 功能特性

文件读取、解压和 ROT 解析已委托给
[`rtl-gplates-source`](../gplates-source/README.zh-CN.md)。本包负责旋转计算。
`init(sources, options?)` 也接受本地文件和字节缓冲区，
支持可选的 `signal`；已解析的记录可通过 `initializeFromRecords(records)` 初始化。

- 从 URL 或内存解析标准 GPlates ROT 文本。
- 将有限欧拉旋转插值为单位四元数。
- 将移动/固定板块链组合到可配置的锚定板块。
- 在不创建场景资源的情况下返回 Cesium 正向和逆向旋转矩阵。

## 使用统一 RTL 入口

本模块的唯一源码位于 RTL 的 `modules/finite-rotation`。已安装 RTL 时直接使用：

```ts
import { FiniteRotationInterpolator } from "reconstructable-tile-layer/rotation";
```

无需额外安装本独立包。独立使用时，下面的安装命令和示例仍然有效；在仓库根目录运行
`pnpm --filter rtl-finite-rotation build` 可生成独立的 ESM、CommonJS 和类型声明。
两种发行方式共享源码，构建产物与类身份分别独立。

独立构建包含所需的 GPlates 读取代码，无需将读取包作为运行时依赖。

## 安装

```sh
pnpm add rtl-finite-rotation cesium
```

## 用法

```ts
import { FiniteRotationInterpolator } from "rtl-finite-rotation";

const finiteRotations = new FiniteRotationInterpolator({
  anchorPlateId: "0",
});

await finiteRotations.initializeFromText(`
1 0   0  0  0  0
1 100 10 20 30 0
`);

const plateMatrix = await finiteRotations.getPlateRotationMatrix("1", 50);
const inverseMatrix = await finiteRotations.getInversePlateRotationMatrix("1", 50);
```

使用 `init(urls)` 获取一个或多个 ROT 数据源；使用 `initializeFromText(text)`
处理内存中的数据源。只有初始化完成后，`ready` 才会变为 true。

## ROT 记录模型

每个非注释行包含六个由空白字符分隔的字段：

```text
movingPlateId age poleLatitude poleLongitude angle fixedPlateId
```

`!` 后的文本会被忽略。解析器按照文件顺序读取记录。插值器使用上方包围记录的
参考标识，将超出控制范围的年代限制在边界，并在 `anchorPlateId` 处终止递归组合。
默认锚定板块为 `"0"`；如果不应强制使用恒等锚定板块，请传入 `null`。

与论文命名一致的导出类型和辅助函数包括：

- `FiniteRotationRecord`
- `FiniteRotationSeries`
- `FiniteRotationInterpolatorOptions`
- `parseFiniteRotationText`
- `interpolateFiniteRotationAtAge`
- `getPlateRotationMatrixAtAge`

## 资源所有权与运行环境

本软件包不会创建浏览器资源或 Cesium 场景资源。如果欧拉极轴不应使用
`Ellipsoid.default`，可以提供自定义的 `referenceEllipsoid`。

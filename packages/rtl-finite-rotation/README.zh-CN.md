# rtl-finite-rotation

[项目主页](../../README.zh-CN.md) · [English](README.md) | 简体中文

本软件包实现论文中的**有限旋转插值器**。它解析 GPlates ROT 记录，将有限欧拉旋转
转换为单位四元数，使用 Cesium `QuaternionSpline` 对控制年代进行插值，并以递归
方式将参考板块链组合到锚定板块。

推荐使用与论文一致的类名 `FiniteRotationInterpolator`。现有名称
`RotationOperator` 仍作为同一类保留。

## 功能特性

- 从 URL 或内存解析标准 GPlates ROT 文本。
- 将有限欧拉旋转插值为单位四元数。
- 将移动/固定板块链组合到可配置的锚定板块。
- 在不创建场景资源的情况下返回 Cesium 正向和逆向旋转矩阵。

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

## 兼容性

`RotationOperator`、`RotItem`、`RotSplineItem`、
`convertFileContentToJson`、`getQuaternionAtAge`、`getRotateMatrix` 以及之前的
所有辅助函数导出继续受到支持。`getRotateMatirxAtAge` 和
`rotateCartensianPoint` 等历史拼写也予以保留。

# Cesium 二维三维 Primitive 切换方案

## 1. 问题背景

当前古地理重建路径使用 `RectangleGeometry + EllipsoidSurfaceAppearance + Image Material` 表达重投影后的瓦片，并在 age 更新时通过板块旋转矩阵驱动显示位置变化。

原 3D 实现将板块旋转矩阵写在 `Primitive.modelMatrix` 上。这条路径在 3D 下更新成本低，适合频繁拖动 age；但 Cesium 原生限制 `Primitive.modelMatrix` 只支持 3D 模式，进入 2D、Columbus View 或 MORPHING 阶段时可能抛出 `Primitive.modelMatrix is only supported in 3D mode`。

因此本次只调整 Cesium Primitive 的矩阵挂载位置和生命周期，不改变以下主技术路线：

- 多边形数据加载
- 四叉树瓦片裁剪
- 影像瓦片请求
- WebGL 重投影与裁剪
- Cesium Primitive 贴图显示
- 板块旋转矩阵计算

## 2. 双模式表达

新增两种内部 primitive transform mode。

`dynamic3D` 是 3D 快速路径：

- `GeometryInstance.modelMatrix = Matrix4.IDENTITY`
- `Primitive.modelMatrix = plateMatrix`
- age 更新时只批量修改已加载 primitive 的 `modelMatrix` 和 `show`
- 不重建瓦片 primitive，保持 3D 交互性能

`bakedInstance` 是 2D / Columbus / MORPHING 兼容路径：

- `GeometryInstance.modelMatrix = plateMatrix`
- `Primitive.modelMatrix = Matrix4.IDENTITY`
- Cesium 可以在几何处理阶段把变换烘焙进顶点，并继续生成 2D/CV 需要的投影属性
- age 更新时需要 remove + recreate 已加载 primitive

## 3. 切换时机

场景模式同步由 `SimpleGeoReconstructManager.bindSceneModeSync(viewer)` 负责。

3D 切换到 2D 或 Columbus View：

- 在 `scene.morphStart` 中判断目标模式。
- 如果目标不是 `SceneMode.SCENE3D`，立即切换到 `bakedInstance`。
- 切换开始时先同步移除旧 primitive，避免 MORPHING 帧检查到非 identity 的 `Primitive.modelMatrix`。
- 随后异步读取当前 age 的板块矩阵，并按批次重建 primitive。

2D 或 Columbus View 切回 3D：

- MORPHING 阶段继续保持 `bakedInstance`。
- 等 `scene.morphComplete` 确认目标是 `SceneMode.SCENE3D` 后，再重建回 `dynamic3D`。
- 后续 age 更新重新使用 `Primitive.modelMatrix` 快速路径。

## 4. Primitive 重建策略

每个已加载瓦片记录重建所需元数据：

- `tileId`
- `imageURL`
- `tileXYL`
- `polygon`
- 当前 `primitive`

2D/CV 模式下重建 primitive 时复用 `imageURL`，因此不会重新请求影像瓦片，也不会重新触发 WebGL 重投影或裁剪。重建只发生在 Cesium primitive 表达层。

重建仍按每 32 个 primitive 一批加入场景，并在批次后触发 `viewer.scene.requestRender()`，避免一次性加入大量 primitive 时阻塞渲染刷新。

## 5. Age 更新策略

`updateAge(age)` 对外调用方式保持不变。

在 `dynamic3D` 下：

- 先并行获取各板块在当前 age 的旋转矩阵。
- 使用 latest-wins token 丢弃过期 age 结果。
- 批量更新 `primitive.modelMatrix`。
- 根据多边形有效时间更新 `primitive.show`。

在 `bakedInstance` 下：

- 同样使用 latest-wins token。
- 获取当前 age 的板块矩阵后，按批次移除并重建已加载 primitive。
- 新 primitive 创建时把矩阵写入 `GeometryInstance.modelMatrix`。
- `Primitive.modelMatrix` 始终保持 identity。

## 6. 生命周期与清理

Deep Time 面板初始化 manager 后调用 `bindSceneModeSync(viewer)` 绑定场景模式事件。

面板卸载时执行：

- 移除 Cesium `morphStart` / `morphComplete` 监听。
- 清空已加载 primitive。
- 清理 manager 引用，避免重复挂载后出现多组监听。

`clearAllTiles`、provider 投影类型变化和模式切换都会同步清理旧 primitive 引用，防止记录中保留已移除的 Cesium 对象。

## 7. 验证重点

功能验证：

- 3D 下 Level N / Root 加载结果保持一致。
- 3D 下拖动 age 仍能快速更新。
- 从 3D 切换到 2D / Columbus View 不再抛出 `Primitive.modelMatrix is only supported in 3D mode`。
- 2D 下拖动 age 后，最终只显示最后一次 age 对应的板块位置和可见性。
- 从 2D / Columbus View 切回 3D 后，age 更新恢复 `Primitive.modelMatrix` 快速路径。

资源验证：

- 连续 3D/2D 来回切换不产生重复 primitive。
- 切换过程中不丢贴图，不重复请求影像瓦片。
- provider 切换和清空后旧 primitive 引用不会持续增长。

构建验证：

- `pnpm --filter tile-processer-demo build`

## 8. 不纳入本次修改

本次没有引入或改造以下内容：

- WebGPU
- 服务端预处理
- Web Worker / OffscreenCanvas
- 新空间索引
- 新的板块旋转算法
- 瓦片裁剪算法替换
- WebGL 重投影链路替换

本次修改只解决 Cesium 2D/3D 场景模式下 `Primitive.modelMatrix` 的兼容问题，并尽量保留 3D 模式下的运行时更新性能。

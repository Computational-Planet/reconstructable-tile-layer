# R2 性能测试问题分析与实施方案

## Material Passport

- Origin Skill: academic-research-suite / experiment-agent
- Origin Mode: plan
- Origin Date: 2026-07-22
- Verification Status: ANALYZED（现有代码、原始结果与外部规范已核查；建议实验尚未执行）
- Version Label: r2_performance_plan_v1

## 1. 结论摘要

审稿人的批评成立，而且现有原始数据已经能把 L0/L1 异常定位到比论文当前解释更具体的位置：异常主要发生在 Cesium 首帧的同步几何初始化和呈现阶段，而不是瓦片裁剪阶段。

- L0 的 `returnMs` 中位数约为 0.590 s，但 `presentMs` 中位数为 65.667 s；L4 分别为 3.144 s 和 3.210 s。L0 的约 65 s 延迟发生在公共加载 Promise 返回之后的首批 Cesium 帧中。
- 当前 `RectangleGeometry` 没有显式传入 `granularity`，因此使用 Cesium 默认的 1° 粒度。Cesium 1.119 的网格尺寸公式是 `ceil(经度跨度 / 粒度) + 1` 乘以 `ceil(纬度跨度 / 粒度) + 1`。L0 的 180°×180° 根瓦片约为 181×181，L4 的 11.25°×11.25° 瓦片约为 13×13。
- 当前 Primitive 设置了 `asynchronous: false`。Cesium 的 `Primitive.update` 会先执行 `loadSynchronous`，再检查 `show`，所以当首帧开始时已经加入场景的隐藏预热 Primitive 也会同步创建几何和顶点数组。
- 按 `atPresent` 时已经 ready 的 Primitive 数量估算，L0 首批确认帧处理约 4326 万个矩形几何顶点，L4 仅约 27 万至 29 万个。该变量相差约 150 倍，而现有的 composite 数量和 mask triangle 数量都没有记录它。
- 年代切换的“零 provider call / 零 masking job”是缓存复用验证。其代价是 `_compositeTileRecords` 在 L4 持有 4,852 个 `TileImageAsset`；`dynamic3D` 还持有 4,852 个 Primitive。4,852 张 256×256 RGBA 图像的未压缩等价数据量为 1,213 MiB（约 1.184 GiB），尚未计入几何、浏览器对象、原始影像缓存和可能的 GPU 纹理副本。
- 处理器内部确有 256 项原图 LRU 和 512 项结果 LRU，但 manager 对每个 composite 另持有一个引用。因此结果 LRU 的淘汰不会限制 manager 的总驻留量；当前实际策略是“保留到 `clearAllTiles` / `destroy`”，没有 manager 级内存预算或淘汰策略。
- 当前瓦片 URL 是同源的 `/tiles/...`，且正式测量不清理浏览器 HTTP 缓存；这确实是 transport-steady 的本地最佳情形。内部的 `totalRequests` 和 `imageRequestAttempts` 不能证明发生了多少物理传输。

因此，论文需要新增的不是一组笼统的 CPU/GPU 利用率，而是四类互相分离的证据：

1. 矩形角跨度、网格顶点/索引量、同步几何初始化时间和主场景 GPU 时间；
2. JS heap、页面/进程内存、保留图像等价字节数、几何资源量和释放后残留；
3. 真实传输请求、传输字节、缓存命中、延迟/吞吐和冷/热缓存条件；
4. 至少三个硬件层级上的同协议复测。

## 2. 现有结果的重新核算

下表来自现有 [`rtl-performance-benchmark-2026-07-13T20-25-36-087Z.json`](./rtl-performance-benchmark-2026-07-13T20-25-36-087Z.json) 的 50 个正式重复；全部正式记录的 assertion 失败数为 0。时间为中位数；mask triangles 和 composite 数量在重复间固定。几何顶点是依据 Cesium 1.119 默认 1° 粒度、`atPresent.readyPrimitiveCount` 中位数计算的范围；L0 和 L1 可按极区收敛规则得到确定的下界值，L2-L4 的精确值还需要记录 tile y 分布。

| Level | `returnMs` | `presentMs` | Composites | Mask triangles | `atPresent` ready Primitives | 单 Primitive 网格上界 | 首批几何顶点估算 |
|---|---:|---:|---:|---:|---:|---:|---:|
| L0 | 0.590 s | 65.667 s | 1,335 | 122,712 | 1,335 | 181×181 | 43.26M-43.74M |
| L1 | 6.007 s | 21.167 s | 1,557 | 123,219 | 1,557 | 91×91 | 12.75M-12.89M |
| L2 | 1.924 s | 6.206 s | 1,980 | 124,191 | 1,953 | 46×46 | 4.04M-4.13M |
| L3 | 1.736 s | 1.880 s | 2,873 | 126,227 | 1,060 | 24×24 | 0.59M-0.61M |
| L4 | 3.144 s | 3.210 s | 4,852 | 130,505 | 1,715 | 13×13 | 0.27M-0.29M |

这组数据否定了“composite 数量或 mask triangle 总量足以解释 L0/L1”的说法，同时给出了一个可检验的新假设：**默认 1° 的 `RectangleGeometry` 曲面细分量是 L0/L1 首帧异常的主要原因，近全球半透明矩形的材质上传和过绘是可能的附加原因。**

还需避免误读现有处理器计时：

- `CesiumTileProcesser.textureUploadMs` 测的是离屏瓦片处理 WebGL context 的源图上传，不是 Cesium 主场景的 Material 纹理上传。
- `drawMs` 只是 `performance.now()` 包围 `gl.draw*` 的 CPU 提交时间；WebGL 命令是异步执行的，它不是 GPU 执行时间。
- `imageRequestMs` 是并发请求等待时间的累计和，不是网络阶段的墙钟时间。
- `materialApplyMs` 当前没有调用点，现有 JSON 中为 0，不能用于解释主场景材质成本。

## 3. 代码路径与缺口

### 3.1 首帧异常路径

1. 基准在 manager 初始化后开始计时，等待加载 Promise、两个显式请求帧、后台空闲和最终帧，见 [`performanceBenchmark.ts`](../../../apps/simple-geo-reconstruct-demo/src/benchmark/performanceBenchmark.ts#L276)。
2. manager 对当前年代任务创建 Primitive，然后在后台为其他年代预热，见 [`SimpleGeoReconstructManager.ts`](../src/SimpleGeoReconstructManager.ts#L1200)。
3. 每个 composite 都创建独立的 `RectangleGeometry`、Material 和 Primitive；未指定 `granularity`，并设置 `asynchronous: false`，见 [`SimpleGeoReconstructManager.ts`](../src/SimpleGeoReconstructManager.ts#L1500)。
4. Cesium 1.119 的默认粒度为 1°；宽高公式直接随矩形角跨度增长。Cesium 的同步加载还发生在 `show` 检查之前，因此隐藏预热几何同样可能阻塞首帧。

### 3.2 内存保留路径

- `TileImageAsset` 明确保留宽、高、输出类型和引用计数；Canvas 只有在最终引用释放时才被设为 0×0，见 [`cesiumTIleProcesser.ts`](../../tile-processer-webgl/src/cesiumTIleProcesser.ts#L118)。
- `_compositeTileRecords` 同时保存 `imageAsset` 和 `primitive`，而 `getGeoTileStats` 只报告对象数量，不报告字节数，见 [`SimpleGeoReconstructManager.ts`](../src/SimpleGeoReconstructManager.ts#L421)。
- `updateAge` 在 `dynamic3D` 中只更新 `show` 和 `modelMatrix`，不会重新请求或重新裁剪，见 [`SimpleGeoReconstructManager.ts`](../src/SimpleGeoReconstructManager.ts#L627)。
- 处理器 LRU 会释放自己的引用，见 [`cesiumTIleProcesser.ts`](../../tile-processer-webgl/src/cesiumTIleProcesser.ts#L940)；manager 的引用仍然存在。
- manager 只在清空或销毁时释放所有图像和 Primitive，见 [`SimpleGeoReconstructManager.ts`](../src/SimpleGeoReconstructManager.ts#L2176)。

### 3.3 网络与设备记录缺口

- 本地 provider 使用 `/tiles/Gplates_Topography/{z}/{x}/{y}.png`，见 [`providers.ts`](../../../apps/simple-geo-reconstruct-demo/src/cesium/providers.ts#L38)。
- 基准环境只记录 UA、平台、逻辑线程数、标称内存、viewport、DPR 和 WebGL renderer，见 [`performanceBenchmark.ts`](../../../apps/simple-geo-reconstruct-demo/src/benchmark/performanceBenchmark.ts#L669)。它没有 CPU 型号、操作系统版本、浏览器精确构建、功耗状态、物理画布像素、GPU 驱动或内存压力信息。
- `navigator.deviceMemory` 是设备容量提示，不是使用量；当前 schema 没有任何运行时内存字段。

## 4. 决定性 L0/L1 控制实验

### 4.1 研究问题与假设

- RQ1：在 composite 数量和 mask triangle 数量之外，矩形角跨度导致的 Cesium 曲面细分能否解释 L0/L1 首帧延迟？
- RQ2：在几何初始化成本固定后，半透明近全球矩形的叠加和像素覆盖是否产生显著的 GPU/呈现增量？
- H1：默认粒度下，几何初始化时间与预测/实测顶点数近似单调增长；把所有 level 固定为相同网格规模后，L0/L1 异常大幅收敛。
- H2：在预先生成同一几何后，显示组相对隐藏组的 GPU 时间差随叠加数、画布像素数和 DPR 增长。

### 4.2 三阶段实验

**E1-A：纯几何微基准**

- 从实际任务清单记录每个 `tileXYL` 对应矩形，不加载图像、不创建 Material、不加入 Scene。
- 对每个矩形显式调用 `RectangleGeometry.createGeometry`，分别测试：当前默认 1° 粒度；固定最多 13×13 网格的自适应粒度。
- 记录单矩形和总计的角宽/角高、网格宽/高、positions 数、indices 数、创建耗时和异常值。
- 该阶段直接检验 tessellation，不受网络、mask、纹理或 overdraw 干扰。

**E1-B：几何/呈现 2×2 控制**

| 因子 | 水平 1 | 水平 2 |
|---|---|---|
| Tessellation | Cesium 默认 1° | 固定最多 13×13 网格 |
| Presentation | `show=false` | `show=true` |

- 使用相同的矩形清单、相同 256×256 图像、相同相机和相同 Primitive 数量。
- `show=false` 仍触发同步几何初始化，但不会进入材质更新和绘制命令，可近似隔离“几何创建与顶点上传”。
- `show=true - show=false` 的差值包含主场景纹理创建、命令生成和绘制；同时用 GPU timer query 测整个 Cesium 帧。
- 在 1×、2× DPR 或等价物理像素数下重复。如果 wall time 与 GPU time 随像素数和叠加数增长，才把该部分归因于 fill-rate/overdraw。

**E1-C：主流程消融复测**

- 在完整 manager 路径中增加仅用于 benchmark 的 geometry strategy，重跑 L0-L4：`default-1deg` 与 `fixed-grid-13`。
- 再增加 `current-age-only` 与 `eager-prewarm-all` 条件，检验隐藏预热 Primitive 对首帧的贡献。
- 不改变 tile processor、mask 输入、任务顺序、相机、图像、并发数和 Primitive batch size。

### 4.3 判定规则

- 若 L0 在 `show=false/default-1deg` 下仍远慢于 L4，而 `fixed-grid-13` 使 L0 大幅下降，则 H1 得到支持。
- 若固定几何后 `show=true - show=false` 仍很大，并随物理像素数或叠加数增长，则 H2 得到支持。
- 若两者均成立，论文应分别报告“同步几何初始化”为首要机制、“材质/过绘”为附加机制，不能再用 composite 或 mask triangle 代替它们。
- 报告中位数、IQR、P95、相对倍数和 bootstrap 95% CI；不要只报告均值或单次 trace。

## 5. 内存指标与实验

### 5.1 必须分层记录的指标

| 层级 | 指标 | 采集方式 | 边界 |
|---|---|---|---|
| 应用确定性统计 | retained asset 数、像素数、`width×height×4` RGBA 等价字节、Primitive 数、预测/实测 vertices/indices | manager/processor 只读 diagnostics | 是资源量估算，不是实际进程/GPU 内存 |
| JS heap | used/total heap、embedder heap、backing storage | CDP `Runtime.getHeapUsage` | 不包含大部分 Canvas backing 和 GPU 资源 |
| 页面/agent cluster | `measureUserAgentSpecificMemory().bytes` 及 breakdown | Chromium、cross-origin isolated benchmark 页面 | 实验性 API；不应称为可移植 GPU 内存 |
| 浏览器进程 | renderer/browser/GPU process private bytes 或 private working set，及进程树峰值 | 隔离浏览器实例 + OS sampler/Perfetto memory trace | GPU process 仍可能含浏览器共享开销 |
| GPU 工作量代理 | 主场景纹理等价字节、几何顶点/索引量、GPU frame time | 应用统计 + timer query | WebGL 没有可移植的精确“本页显存”API |

`measureUserAgentSpecificMemory` 需要 cross-origin isolation。当前 Vite 配置没有 COOP/COEP header，因此实施时应为专用 benchmark route 增加 header，并确认远程 provider 的 CORS/CORP 兼容性；不能悄悄改变普通 demo 的网络行为。

### 5.2 采样检查点

每个 level 和 age 条件至少记录：

1. 新浏览器上下文中的空 Viewer 基线；
2. manager `init` 完成、尚未加载瓦片；
3. `atReturn`；
4. `atPresent`；
5. `atIdle`；
6. 每次 age transition 后；
7. `destroy` 后自然等待两个任务周期；
8. 专用 retained-memory 运行中执行一次显式 GC 后的 `afterDestroyGc`。

主结果同时报告自然峰值和 idle 驻留值。显式 GC 只能用于“仍被引用的保留量/泄漏”诊断，不能代替正常运行峰值。

### 5.3 当前 L4 的明确含义

- 4,852×256×256×4 = 1,271,922,688 bytes = 1,213 MiB = 1.184 GiB RGBA 等价数据。
- 现有结果中 L4 的 processor `resultEvictions` 为 4,340，最终 result LRU 只有 512 项，但 manager 仍有 4,852 个 loaded records。这直接证明 processor LRU 不是全局内存上限。
- `dynamic3D` 的 250 次正式 age transitions 中，provider 和 masking 增量均为 0；其 `presentMs` 中位数约 15.05 ms。但这必须与 L4 预加载约 7.80 s 的中位数和上述驻留成本一起报告。
- 如果论文不实现 manager 级淘汰，应明确写成“当前策略为全驻留，直到 clear/destroy”，并把适用规模限定在实测 level。若要声称内存有界，则需要另行实现 manager 级 LRU/预算，并增加容量扫描与 age cache-miss 测试；processor 的 512 项 LRU 不足以支持该声称。

## 6. 网络指标与实验

### 6.1 三层采集

1. **页面 Resource Timing**：在 manager 初始化后、tile load 之前执行 `performance.clearResourceTimings()`，扩大 resource buffer，并按 `/tiles/` URL 前缀收集 `duration`、`transferSize`、`encodedBodySize`、`decodedBodySize`、`responseStatus` 和 protocol。
2. **Chromium CDP**：外部 harness 收集 `requestWillBeSent`、`responseReceived`、`loadingFinished.encodedDataLength`、`requestServedFromCache`、`fromDiskCache`、`fromServiceWorker` 和失败事件；用 `setCacheDisabled` 明确定义冷缓存。
3. **服务器日志**：记录实际响应次数、状态、响应字节和服务时间，作为物理传输的最终核对。远程跨域资源若使用 Resource Timing，服务端需正确返回 `Timing-Allow-Origin`。

输出至少包含：物理传输请求数、缓存命中数/比例、传输字节、编码/解码体积、请求 P50/P95、网络阶段墙钟时间、有效吞吐、失败/重试/取消数，以及 provider 等待时间。`totalRequests` 继续保留为应用任务指标，但不能改名为 HTTP requests。

### 6.2 条件矩阵

网络实验应与几何异常实验分开，优先选择网络量最大的 global L4 和典型视域 W1-L4：

| 条件 | HTTP cache | 延迟 | 下行 | 用途 |
|---|---|---:|---:|---|
| N0 local-steady | warm | 实际本地 | 不限速 | 与现有结果衔接 |
| N1 cold-unthrottled | disabled/cleared | 实际本地 | 不限速 | 分离浏览器 cache 影响 |
| N2 20ms-50Mbps | disabled | 20 ms | 50 Mbps | 受控低延迟网络 |
| N3 80ms-10Mbps | disabled | 80 ms | 10 Mbps | 受控中等网络 |
| N4 150ms-2Mbps | disabled | 150 ms | 2 Mbps | 受控弱网络压力测试，可选 |

条件名使用实际参数，不使用含糊的“Wi-Fi/4G”标签。CDP 当前推荐 `emulateNetworkConditionsByRule`；原始 JSON 必须保存浏览器版本、采用的 CDP 方法和完整参数。

初始化阶段的 GPML/ROT 获取应单独形成 network phase，不能混入 tile load。热缓存组先执行不计入结果的预取；冷缓存组每个 replicate 使用新的 browser context 或显式禁用 cache。两组都保持 RTL manager/processor 缓存为空，避免把 HTTP cache 与应用 cache 混为一谈。

## 7. 设备泛化方案

最低可接受矩阵是三个硬件层级，而不是 Edge 与 Chrome 两个品牌名；两者使用同一 Chromium/Blink/V8 路径，不能单独证明设备泛化。

| 层级 | 建议设备 | 主要目的 |
|---|---|---|
| D1 高端独显 | 当前 32 GiB / RTX 4080 Laptop GPU | 保留论文原基线 |
| D2 主流集显 | 16 GiB、近年 Intel/AMD 集显的普通办公笔记本 | 检验内存与几何初始化在常见设备上的可用性 |
| D3 低功耗或另一 GPU/OS 栈 | 8-16 GiB 低功耗设备，或 Apple Silicon 笔记本 | 检验较低资源和不同驱动后端下的稳健性 |

主设备实验应尽量使用同一 Chromium 主版本、硬件加速开启、接通电源、固定功耗模式和固定物理画布像素数。另在每台设备记录原生 viewport/DPR 作为补充条件。Firefox/WebKit 可作为浏览器引擎敏感性实验，但不能替代 D2/D3。

每台设备至少运行 L0-L4、W1-L4、`age-dynamic-3d`；网络限速矩阵只需在一个参考设备上运行，以免把设备和网络做成不必要的全因子组合。结果按设备分别报告中位数、IQR、P95 和相对 D1 的倍率，不把三个固定测试机合并为一个“总体平均”。

环境 schema 还应增加：CPU 型号、GPU/驱动或渲染后端、物理 RAM、OS 版本、浏览器完整版本、WebGL1/2、关键扩展支持、CSS 与 drawing-buffer 尺寸、DPR、是否接电、功耗模式、硬件加速状态和测试时温度/降频备注。

## 8. 建议的未来代码落点

本轮不修改实现。后续实施时建议保持现有边界，避免把 Chromium 专用逻辑塞进核心 manager：

| 文件/模块 | 建议改动 |
|---|---|
| `performanceBenchmarkTypes.ts` | schema 升级到 v2；增加 `memorySnapshots`、`networkSummary`、`geometryWorkload`、`frameTiming`、cache/network profile 和更完整环境字段 |
| `performanceBenchmarkConfig.ts` | 增加 geometry strategy、prewarm strategy、memory checkpoints、物理画布设置和实验 profile；网络 CDP 参数由外部 harness 注入 |
| `performanceBenchmark.ts` | 在现有 before/return/present/idle 边界调用采集器；每次 tile phase 前清空 Resource Timing；保存 CPU frame wall time 和 GPU query 结果 |
| 新建 `benchmark/geometryDiagnostics.ts` | 计算默认网格尺寸与预测 vertices/indices；实现显式 `createGeometry` 微基准；不在普通运行中重复 tessellate |
| 新建 `benchmark/memoryDiagnostics.ts` | 采集可用的页面内存 API、JS heap fallback 和应用资源估算；明确每个字段是 measured 还是 estimated |
| 新建 `benchmark/networkDiagnostics.ts` | 汇总 Resource Timing；按 URL scope 区分 feature、rotation 和 tile |
| `SimpleGeoReconstructManager.ts` | 暴露只读 retained asset/像素数与 rectangle workload diagnostics；增加 benchmark-only geometry/prewarm strategy，默认行为不变 |
| `cesiumTIleProcesser.ts` | 增加唯一 asset 像素量和 cache 字节估算；现有 LRU hit/eviction 计数继续保留 |
| 新建外部 Playwright/CDP harness | 接收已启动页面 URL，不擅自启动开发服务器；控制 cache/网络、采集 CDP heap 与网络事件、保存 trace 和 JSON |
| `vite.config.ts` 或专用 benchmark server | 仅 benchmark 环境配置 COOP/COEP、Cache-Control、Timing-Allow-Origin；普通 demo 配置不应被隐式改变 |

主场景 GPU 时间需要同时支持当前 WebGL1 的 `EXT_disjoint_timer_query` 和 WebGL2 的 `EXT_disjoint_timer_query_webgl2`：异步轮询结果、检查 `GPU_DISJOINT_EXT`、丢弃 disjoint 样本，不调用 `gl.finish()`。Spector.js/Perfetto 用于少量代表性帧的 draw-call 和跨进程诊断，不作为 20-50 次重复的主统计来源。

## 9. 推荐执行顺序与样本量

1. **P0：E1 L0/L1 控制实验**。先确认几何细分与过绘的效应，防止论文继续使用错误解释。每条件预热 3 次、正式 20 次；保留现有随机区组顺序。
2. **P0：M1 内存驻留/释放实验**。L0-L4 每个条件使用 10 个全新 browser contexts；报告自然峰值、idle、post-destroy 和 post-GC。
3. **P0：N1 网络实验**。global L4 与 W1-L4 × N0-N3，每条件 10 次；N4 作为压力测试。
4. **P0：D1 设备复测**。三设备执行 L0-L4、W1 和 dynamic3D age，每条件至少 20 次；耗时允许时保留原 50 次以便直接比较。
5. **P1：容量扫描**。只有在实现 manager 级预算后才运行 512/1024/2048/unbounded 的 age transition 命中率、重建延迟和峰值内存实验。

所有正式 replicate 继续沿用现有 assertion gate；任何 context loss、任务失败、网络失败、GPU disjoint 或内存采样失败都写入原始 JSON 并标记为无效，而不是静默丢弃。原始 JSON 是统计来源，trace/Spector capture 只负责解释代表性异常。

## 10. 论文表述边界

实验完成前，安全的表述应是：

- “现有 workload 指标不能解释 L0/L1；源码与重新核算显示默认 RectangleGeometry tessellation 是强候选机制，需由受控消融确认。”
- “年代切换不产生新的 provider/masking 工作，但依赖预先保留全部 processed assets；该设计交换了交互延迟和内存。”
- “现有结果是本地、transport-steady、单高端设备基线，不代表网络部署或通用设备性能。”

实验完成并支持 H1/H2 后，才能把第一句改为诊断性结论，并同时给出 effect ratio、几何顶点量、CPU 首帧时间和 GPU frame time。不得把离屏 `drawMs` 称为 GPU 时间，不得把 `navigator.deviceMemory` 称为内存使用量，也不得把 `totalRequests` 称为物理网络请求。

## 11. 已核查资料

- [Cesium RectangleGeometry 文档](https://cesium.com/learn/cesiumjs/ref-doc/RectangleGeometry.html)：默认 `granularity` 为 1°（`CesiumMath.RADIANS_PER_DEGREE`），并决定 position buffer 数量。
- [Cesium 1.119 RectangleGeometryLibrary 源码](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Core/RectangleGeometryLibrary.js#L152-L187)：网格宽高的确切计算公式。
- [Cesium 1.119 Primitive 源码](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Scene/Primitive.js#L2090-L2150)：同步 load 位于 `show` 检查之前。
- [Khronos WebGL1 timer query 规范](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/) 与 [WebGL2 规范](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)：异步 GPU 计时和 disjoint 处理要求。
- [W3C Resource Timing](https://www.w3.org/TR/resource-timing/)：资源阶段、transfer/encoded/decoded size 及 Timing-Allow-Origin 语义。
- [Chrome DevTools Protocol Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage) 与 [Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)：JS heap、cache 控制、网络事件和限速接口。
- [WICG performance.measureUserAgentSpecificMemory](https://wicg.github.io/performance-measure-memory/)：页面及其 iframe/worker 的估算内存和 cross-origin isolation 前提。
- [Perfetto Chrome tracing](https://perfetto.dev/docs/getting-started/chrome-tracing)：Chrome 跨进程 trace 与内存/调度诊断入口。
- [Auer 与 Zipf 2018](https://doi.org/10.3390/ijgi7070279)：浏览器 3D WebGIS 性能实验的计时与进程内存先例。
- [Potree 学位论文与材料](https://www.cg.tuwien.ac.at/research/publications/2016/SCHUETZ-2016-POT/)：浏览器大型 WebGL 场景的 GPU 计时和规模压力测试先例。

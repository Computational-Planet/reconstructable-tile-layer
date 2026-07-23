# R2 性能问题分析与测量边界

> 本文解释为什么要测这些指标、每项指标能够证明什么，以及如何避免 CPU/GPU 监控扩大论文主结果。具体实现见
> [`performance-benchmark-development-plan.md`](./performance-benchmark-development-plan.md)。

## 1. 修订策略

审稿人 Action 2/3 只要求五阶段计时、一个 L0/L1 控制实验、JS heap/texture estimate、Macrostrat cold/warm 和一台集显设备。仅完成这些项目能够满足最低交付，但如果完全不测 CPU/GPU/进程内存，L0/L1 即使发生变化，也可能仍然只能写成“同步几何或呈现路径”的组合解释。

因此采用两层结果：

1. **论文层**：严格保持 Action 2/3 的主图、两列 Table 5 和短段落，不新增 CPU/GPU 表格；
2. **诊断层**：同一条命令在独立 Edge 进程中采集 CPU time、GPU elapsed/utilization 和进程/GPU memory，用来决定 Discussion 的机制分支。

两层使用相同配置和 seeded block schedule，但不合并 replicates。OS sampler 和外部 checkpoint 只在 diagnostic profile 开启，避免它们改变 Figure 8 的正式 timing。

## 2. L0/L1 异常为何尚未被解释

现有正式结果来自
[`rtl-performance-benchmark-2026-07-13T20-25-36-087Z.json`](./rtl-performance-benchmark-2026-07-13T20-25-36-087Z.json)，每个 level 有 10 个 measured blocks：

| Level | `returnMs` | `presentMs` | Composites | Mask triangles | `atPresent` ready Primitives |
|---|---:|---:|---:|---:|---:|
| L0 | 0.590 s | 65.667 s | 1,335 | 122,712 | 1,335 |
| L1 | 6.007 s | 21.167 s | 1,557 | 123,219 | 1,557 |
| L2 | 1.924 s | 6.206 s | 1,980 | 124,191 | 1,953 |
| L3 | 1.736 s | 1.880 s | 2,873 | 126,227 | 1,060 |
| L4 | 3.144 s | 3.210 s | 4,852 | 130,505 | 1,715 |

L0 的 composite 数比 L4 少，mask triangles 近似相同，但 confirmed-frame 时间约为 L4 的 20 倍。现有两个 workload 指标不能解释该结果。

代码路径给出三个候选证据：

- [`createTilePrimitive`](../src/SimpleGeoReconstructManager.ts) 未传 `RectangleGeometry.granularity`，Cesium 1.119 使用默认 1°；网格宽高随 angular extent 增长。
- Primitive 使用 `asynchronous: false`；Cesium 在检查 `show` 前运行同步 geometry creation 和 vertex-array 创建，隐藏 prewarm primitives 也可能阻塞帧。
- 当前 `presentMs` 计到两个 `postRender`，没有把同步 geometry CPU、WebGL GPU commands 和浏览器等待分开。

所以实验前只能写：**大跨度 RectangleGeometry 的同步创建及 extent-sensitive rendering 是强候选，composite/mask 指标不足以解释异常。**

## 3. CPU、GPU、内存到底如何测

### 3.1 指标分层

| 问题 | 测量 | 能回答什么 | 不能回答什么 |
|---|---|---|---|
| JS 在做多少工作 | CDP `TaskDuration`/`ScriptDuration` delta | renderer task/script CPU time | 不能代表 GPU 或网络等待 |
| 整个 Edge 用多少 CPU | CDP process `cpuTime` + Windows process samples | browser/renderer/GPU/utility CPU seconds 与 utilization | 不能精确分配到单个 JS 函数 |
| Cesium 第一帧 GPU 是否很重 | WebGL disjoint timer query | 同一 WebGL context 的 GPU elapsed time | 不包括 browser compositor |
| GPU 是否持续忙碌 | Windows `GPU Engine` counters | 3D/Copy engine mean/peak utilization | 不是某个 Primitive 的 GPU time |
| JS heap 多大 | `performance.memory.usedJSHeapSize` | 审稿人要求的 Chromium JS heap | 不含大部分 Canvas/GPU resource |
| 浏览器实际内存多大 | process private bytes/working set | native、Canvas 等进程资源代理 | working set 可能包含共享页 |
| GPU 资源驻留多大 | `GPU Process Memory` dedicated/shared | 独显/集显的进程级 GPU memory | 不能精确到单个 texture |
| tile texture 理论规模 | retained image `width*height*4` | 可复核 RGBA8 等价量 | 不是驱动显存实测 |

这些量不能相加为“总内存”。JS heap、process private bytes、GPU memory 和 texture estimate 覆盖范围不同，部分还会重叠。

### 3.2 采样边界

页面主计时记录：task-gen、provider、masking、geometry-creation、first-frame。diagnostic profile 另外在 before、atReturn、afterFirstFrame、atPresent、atIdle 和 afterDestroySettled 读取 CDP/OS 资源。

外部 checkpoint 会在页面先记录时间边界后执行，但仍可能暂停后续任务。因此这些资源 checkpoint 不进入 `paper` profile；正式 `presentMs` 只来自没有外部 sampler/checkpoint wait 的隔离运行。

### 3.3 判断规则

- geometry CPU time 很高而 GPU elapsed 不高：同步 Cesium geometry creation/内部合批主导；
- geometry CPU time近似不变，但 split 后 GPU elapsed/utilization 和 first-frame 明显下降：culling、command submission 或 overdraw 路径主导；
- JS heap 较小，但 renderer private bytes、GPU memory 或 texture estimate 很高：`performance.memory` 隐藏了 Canvas/native/GPU 代价；
- split 后 CPU/GPU/confirmed-frame 均不下降：angular extent 不是异常的充分主因，只能 decisively bound。

CPU/GPU 数值原则上只作为 Discussion 的诊断证据，不新增 Table 5 主列。

## 4. 一键代码实现是可行的

当前 Windows 环境已经验证：

- Edge 150 已安装；
- `GPU Engine`、`GPU Process Memory` 和 `Process` counter sets 存在；
- CDP 提供 Performance metrics、process ids/types 和累计 `cpuTime`；
- Playwright 可以启动系统 Edge、取得 browser process PID 并创建 CDP session；
- WebGL2 timer-query 规范提供异步结果和 disjoint 状态。

所以代码可以自动：build、启动临时静态 server、启动隔离 Edge、执行 profiles、采样、清 cache、输出 JSON/CSV、关闭所有子进程。用户不需要手动打开 DevTools。该静态 server 服务 build 后的文件，不是 development server。

仍有三个必须显式处理的 capability 边界：

1. timer-query extension 不可用或 disjoint 时记录 `unsupported/invalid`，不得填 0；
2. Windows GPU counters 不可用时 diagnostic profile fail-fast，paper profile 仍可运行；
3. 精确到单个 WebGL texture 的显存没有公开 API，只能同时报告进程级 GPU memory 和 texture estimate。

## 5. extent-split 对照的语义

审稿人要求限制 per-Primitive angular extent，不是改 `granularity`：

| 输入矩形 | 子矩形布局 | 子 Primitive 数/composite |
|---|---:|---:|
| L0，180° x 180° | 4 x 4 | 16 |
| L1，90° x 90° | 2 x 2 | 4 |
| L2，45° x 45° | 1 x 1 | 1 |

对照必须保持：

- tile tasks、clip areas、mask triangles 和 processed image 不重算；
- 每个 composite 仍只有一个 manager record 和 `TileImageAsset`；
- 子 Primitives 共享同一 Appearance/Material，防止重复纹理上传；
- 子矩形 `st` 映射回父 image UV；
- provider、masking、retained image 和 texture estimate 相等；
- Primitive 数按 16x/4x 如实报告。

Cesium 1.119 静态实测表明：

| Level | 原 vertices | split vertices | 原 triangles | split triangles |
|---|---:|---:|---:|---:|
| L0 | 32,401 | 33,496 | 64,440 | 64,440 |
| L1 | 8,191 | 8,374 | 16,110 | 16,110 |
| L2 | 2,071 | 2,071 | 4,005 | 4,005 |

split 不减少总 triangles，还略增边界 vertices。因此如果性能下降，只能结合 CPU/GPU 指标解释为大跨度 geometry 或 extent-sensitive rendering，不能声称“总 tessellation 变少”。

## 6. 内存与 retention

L4 纹理估算：

```text
4,852 * 256 * 256 * 4
= 1,271,922,688 bytes
= 1,213 MiB
= 1.184 GiB（约 1.2 GiB）
```

Table 5 把它和 endpoint JS heap 并列。diagnostic artifact 再提供 renderer/browser/GPU process memory，用来说明 JS heap 与真实进程占用为何不同，但不增加主表列。

当前 policy 可准确表述为：**manager 保留所有 processed tile images 及其 Primitives，直到 `clearAllTiles()` 或 `destroy()`；processor 的 256-entry raw-image LRU 和 512-entry result LRU 不会淘汰 manager 仍持有的 assets。**

本轮报告策略，不实现 manager eviction 或泄漏循环。

## 7. 网络与设备边界

[`providers.ts`](../../../apps/simple-geo-reconstruct-demo/src/cesium/providers.ts) 已有 Macrostrat。由于当前 tile response 缺少 WebGL/cold-warm 所需的 CORS 与明确 browser cache header，一键静态 server 提供 benchmark-only relay。cold 完整访问真实 Macrostrat；warm 必须由 CDP cache flag 证明为 browser HTTP cache hit，不能用 processor LRU 或上游 `X-Cache` 代替。

Macrostrat W1 L4 使用 10 个配对 blocks，并平衡 cold-first/warm-first 顺序。九个核心条件在一台中端集显笔记本各运行 10 blocks。两台设备分开报告，不合并平均，也不声称普遍性。

## 8. 论文修订边界

1. Figure 8(a)：original L0-L4 + split L0/L1，log/broken axis，标注 coarse-tile pathological regime。
2. Caption：定义 `⁽²⁾`，说明相同 image/mask/composite 和变化后的 Primitive count。
3. Table 5：W1 改为 `lon [-50°, 20°], lat [-25°, 10°]`；只新增 `JS heap at endpoint` 与 `Estimated texture`。
4. Discussion：结合 stage、CPU/GPU 和 split 结果选择机制或 bounded 分支。
5. Resource paragraph：endpoint heap、约 1.2 GiB estimate、Primitive 和 retention policy。
6. Generalization：四句覆盖 Macrostrat、集显设备、观察方向和非普遍性声明。
7. 全文核对 `Section 3.4`、Figure 8、Table 5 和 `⁽²⁾`。

仓库和附件仍没有论文 PDF/LaTeX/Word 源文件，因此实际版式修改需稿件源文件到位后执行。

## 9. 依据

- [Cesium RectangleGeometry](https://cesium.com/learn/cesiumjs/ref-doc/RectangleGeometry.html)
- [Cesium 1.119 RectangleGeometryLibrary](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Core/RectangleGeometryLibrary.js#L152-L187)
- [Cesium 1.119 Primitive](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Scene/Primitive.js#L1319-L1350)
- [Chrome DevTools Protocol Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
- [Chrome DevTools Protocol SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/)
- [Khronos WebGL2 timer query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype) 与 [BrowserServer](https://playwright.dev/docs/api/class-browserserver)
- [Microsoft Get-Counter](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-counter)
- [MDN Performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)

# R2 性能基准实施与一键采集方案

## 1. 目标与方案边界

本方案同时满足两个目标：

1. 严格完成审稿人 Action 2/3，不扩张论文的主结果结构；
2. 用纯代码自动采集 CPU、GPU 和真实进程内存，回答 L0/L1 时间究竟消耗在哪里。

为避免监控工具改变 Figure 8 的主计时，同一条命令顺序运行两个隔离 profile：

| Profile | 用途 | 采集内容 | 是否进入论文主表/主图 |
|---|---|---|---|
| `paper` | 生成正式论文数据 | 五阶段 marks、`return/present/idle`、JS heap、texture estimate、Primitive、网络/设备条件 | 是 |
| `diagnostic` | 解释 CPU/GPU/进程资源 | GPU timer query、CDP CPU time、Windows CPU/GPU/memory time series、释放检查点 | 默认只进入原始 artifact 和 Discussion 证据 |

`paper` profile 不运行 OS 高频 sampler，也不等待外部 checkpoint callback。`diagnostic` profile 使用新的独立 Edge 进程和相同的 seeded block schedule；其 timing 不与 `paper` profile 混合。这样既能一键获得完整资源数据，也不会为获得“占用率”而污染原来的 confirmed-frame 结果。

论文交付仍限定为：

- 一个 L0/L1 extent-split 子实验；
- revised Figure 8(a) 与 Discussion；
- Table 5 只新增两列；
- 一个 resource-footprint 段落；
- Macrostrat cold/warm 与一台集显设备形成四句 generalization 段落。

本轮仍不实现 draw-call profiler、网络限速矩阵、manager eviction、泄漏循环、DPR/fill-rate 扫描、跨浏览器或三设备矩阵。精确到单个 WebGL texture 的真实显存没有公开浏览器 API，不作为可实现承诺。

## 2. 一键运行结果

### 2.1 用户命令

主机执行：

```powershell
pnpm --filter simple-geo-reconstruct-demo benchmark:r2 -- --device-label rtx4080
```

中端集显笔记本执行同一个命令，仅改变设备标签：

```powershell
pnpm --filter simple-geo-reconstruct-demo benchmark:r2 -- --device-label integrated-laptop --skip-network
```

一条命令只能控制当前机器；第二台物理设备必须在该设备上执行同一命令。脚本不要求用户手动打开 DevTools、清缓存或下载 JSON。

### 2.2 自动流程

```text
build production assets
        |
start temporary static benchmark server + Macrostrat relay
        |
preflight Edge / CDP / performance counters
        |
launch isolated Edge profile (--enable-precise-memory-info)
        |
run paper profile -> fresh Edge -> run diagnostic profile
        |
run paired Macrostrat cold/warm profile when enabled
        |
write raw JSON / summaries / table and figure inputs
        |
close Edge, sampler and temporary server in finally
```

这里启动的是脚本拥有的临时静态 benchmark server，不是 Vite development server。它只服务已经 build 的 `dist`，同时为 Macrostrat 提供 benchmark-only relay；进程必须在正常结束、失败或 Ctrl+C 时关闭。

### 2.3 输出目录

```text
output/benchmark/r2/<timestamp>-<device-label>/
  manifest.json
  paper.json
  diagnostic.json
  network.json
  host.json
  summary.csv
  table5-input.csv
  figure8-input.csv
  assertions.json
  run.log
```

所有 artifact 使用 UTF-8。`manifest.json` 保存 git commit/dirty state、配置、seed、浏览器、设备、profile 顺序和文件哈希，保证结果可以追溯。

## 3. 当前实现基础

- 页面已有 `window.__rtlPerformanceBenchmark` controller，可由自动化脚本直接调用。
- 九个核心条件已经定义：initialization、L0-L4、W1 L4、dynamic3D age、baked2D age。
- `runLoadCondition()` 已记录 `returnMs`、两个确认帧后的 `presentMs` 和 `idleMs`，但没有单独的 first-frame 边界。
- manager 已有 composite、mask、Primitive、ready Primitive 等统计，并在 `_compositeTileRecords` 中保留每个 `TileImageAsset` 和 Primitive。
- processor 已有 provider、mask、WebGL job 和 cache 计数；provider/masking 是并发流水线，累计 operation time 不能冒充墙钟阶段。
- `macrostrat-carto` provider 已存在，但 benchmark 的 `providerKey` 仍被固定为本地 GPlates provider。
- W1 已固定为 `west=-50, south=-25, east=20, north=10`。

当前机器的可行性预检结果（2026-07-23）：

- Microsoft Edge `150.0.4078.83` 已安装；
- Windows `GPU Engine`、`GPU Process Memory` 和 `Process` counter sets 可读取；
- CDP `Performance.getMetrics` 和 `SystemInfo.getProcessInfo` 可用，后者提供 process id、type 和累计 `cpuTime`；
- Playwright 支持 `msedge` channel、`launchServer()`、`BrowserServer.process()` 和 Chromium CDP session；
- WebGL2 `EXT_disjoint_timer_query_webgl2` 规范提供 GPU elapsed query 与 `GPU_DISJOINT_EXT` 校验。

这些能力仍须在每台实测设备上运行 preflight，不能根据主机成功推定集显笔记本也支持。

## 4. 指标与论文边界

### 4.1 完整采集矩阵

| 层级 | 指标 | 采集方式 | 主要解释 | 论文位置 |
|---|---|---|---|---|
| 应用墙钟 | task-gen / provider / masking / geometry-creation / first-frame | 页面 `performance.mark/measure` | L0/L1 延迟阶段 | Figure 8 / Discussion |
| JS CPU | `TaskDuration`、`ScriptDuration` delta | CDP `Performance.getMetrics` | renderer 主线程 CPU 活跃时间 | diagnostic sidecar |
| 进程 CPU | browser/renderer/GPU process `cpuTime` delta | CDP `SystemInfo.getProcessInfo` | 跨进程 CPU 秒数 | diagnostic sidecar |
| OS CPU | process-tree CPU time、mean/peak utilization | Windows process sampler | 实际机器 CPU 占用 | diagnostic sidecar |
| WebGL GPU | first-frame GPU elapsed time | disjoint timer query | Cesium WebGL command 的 GPU 时间 | Discussion 诊断证据 |
| OS GPU | 3D/Copy engine mean/peak utilization | Windows `GPU Engine` counters | GPU 忙碌程度 | diagnostic sidecar |
| JS 内存 | `usedJSHeapSize` | `performance.memory` | 审稿人要求的 JS heap | Table 5 新列 1 |
| 进程内存 | private bytes / working set | Windows process sampler | Canvas、native allocations 等实际进程占用 | diagnostic sidecar |
| GPU process memory | dedicated/shared usage | Windows `GPU Process Memory` counters | 独显/集显资源驻留代理 | diagnostic sidecar |
| 纹理估算 | `sum(width*height*4)` | manager retained assets | 处理后 tile 的 RGBA8 等价量 | Table 5 新列 2 |
| Primitive | 现有 `primitiveCount` | manager stats | 几何对象规模 | 现有列/正文 |

Table 5 仍然只新增 `JS heap at endpoint (MiB)` 与 `Estimated texture (MiB, RGBA8)` 两列。CPU、GPU 和进程内存保存在自动生成的 diagnostic artifact；只有它们直接改变 L0/L1 机制判断时，才在 Discussion 中引用必要的一两个数值，不新增主表列。

### 4.2 不能混为一谈的量

- `firstFrameMs` 是 request-to-postRender 墙钟时间，不是 CPU time。
- `TaskDuration` 是 renderer task CPU time，不包含 GPU 执行或网络等待。
- timer query 只覆盖同一 WebGL context 的 GPU commands，不覆盖浏览器 compositor。
- GPU utilization 是 OS 采样比例，不等于 GPU elapsed time。
- JS heap 不包含大部分 Canvas backing、Cesium native/WebGL wrapper 或 GPU texture。
- process private bytes、working set、JS heap、GPU memory 和 texture estimate 彼此重叠或覆盖范围不同，禁止相加成“总内存”。
- estimated texture memory 是资源模型，不是驱动报告的精确显存。

### 4.3 资源数据契约

所有 capability-dependent 值必须带状态和单位，禁止用 `null` 或 0 同时表示“不可用”：

```ts
type MetricValue<T> =
  | { status: "measured"; value: T; unit: string }
  | { status: "unsupported"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "error"; message: string };

type ResourceCheckpoint = {
  recordId: string;
  checkpoint:
    | "beforeCondition"
    | "atReturn"
    | "afterFirstFrame"
    | "atPresent"
    | "atIdle"
    | "afterDestroySettled";
  epochMs: number;
  cdpTaskDurationSeconds: MetricValue<number>;
  cdpScriptDurationSeconds: MetricValue<number>;
  processCpuSeconds: MetricValue<Record<string, number>>;
  processPrivateBytes: MetricValue<Record<string, number>>;
  processWorkingSetBytes: MetricValue<Record<string, number>>;
  gpuDedicatedBytes: MetricValue<Record<string, number>>;
  gpuSharedBytes: MetricValue<Record<string, number>>;
};
```

连续 OS samples 单独保存，不重复嵌入每个 checkpoint。GPU frame record 保存 elapsed nanoseconds、extension name、query status 和 disjoint flag。原始值使用 bytes/seconds/nanoseconds，只有 CSV/论文输出转换为 MiB/ms。

## 5. Profile 隔离与测量扰动

### 5.1 `paper` profile

- 每个 condition 使用当前 3 次 warmup、10 个 measured blocks；
- 开启页面 marks、first-frame、JS heap 和 texture estimate；
- 关闭 OS sampler、CDP checkpoint wait 和 GPU timer query；
- 结果负责 Figure 8、Table 5 和主文时间；
- 使用独立 Edge temporary profile，运行结束后关闭。

### 5.2 `diagnostic` profile

- 使用新的独立 Edge temporary profile；
- 复用完全相同的 condition config、seed 和 block schedule；
- 开启 GPU query、CDP metrics、Windows process/GPU sampler 和资源 checkpoints；
- 默认同样运行 10 measured blocks，以便与 paper profile 比较中位数；
- diagnostic 中的 checkpoint 暂停和 sampler 开销允许影响该 profile 的墙钟时间，因此其 `presentMs` 不进入 Figure 8；
- 只以 record id、condition 和 block 与 paper 结果配对，不把两套 replicates 当成同一独立样本。

### 5.3 Sampler 本身的开销检查

在正式运行前执行一个短 preflight condition 两次：sampler off/on。记录 paper wall time 的差值，但不把它发展成新实验。若 sampler-on 的时间偏移超过 5%，diagnostic 仍可保存资源趋势，但禁止用其墙钟时间替代 paper profile。

## 6. Action 2：五阶段计时

### 6.1 数据契约

```ts
type BenchmarkStageName =
  | "task-gen"
  | "provider"
  | "masking"
  | "geometry-creation"
  | "first-frame";

type BenchmarkStageTiming = {
  stage: BenchmarkStageName;
  windowMs: number;
  operationSumMs: number;
  operationCount: number;
};
```

`LoadBenchmarkRecord` 增加：

- `stageTimings`；
- `firstFrameMs`；
- `renderRectanglePartCount`；
- `renderRectangleMode: "original" | "split-l2-extent"`；
- `performanceTimeOriginMs`，用于把 mark 时间与 OS sampler UTC 时间对齐。

保留现有 `presentMs` 作为 Figure 8(a) 主响应。

### 6.2 mark 边界

| 阶段 | start | end | 解释 |
|---|---|---|---|
| task-gen | `collectTileTasks()` 前 | task list/stats 完成 | 单线程墙钟 |
| provider | foreground 首个未缓存 request 开始 | foreground 最后一个 provider promise settled | 并发窗口 |
| masking | foreground 首个 mask preparation 开始 | foreground 最后一个 processed asset export 完成 | 可与 provider 重叠 |
| geometry-creation | load 返回后首个 geometry factory 调用 | 第二个确认帧前最后一个 geometry factory 调用结束 | 同时累计每次 createGeometry duration |
| first-frame | 首次 `requestRender()` 前 | 对应第一次 `postRender` | 同步 Cesium update + command submission 的总墙钟 |

`windowMs` 是首尾墙钟窗口，`operationSumMs` 是被测操作 duration 总和。并发阶段不能相加成 waterfall。mark 名称使用 `rtl:<recordId>:<stage>:start/end`；结果复制到 record 后清理 PerformanceEntry。

## 7. CPU 自动采集

### 7.1 CDP CPU

diagnostic condition 开始和 endpoint 分别读取：

- `Performance.getMetrics`：动态查找 `TaskDuration`、`ScriptDuration`；字段缺失则记录 `unsupported`；
- `SystemInfo.getProcessInfo`：按 process type/id 保存累计 `cpuTime`，用 endpoint-before 得到 CPU seconds。

CDP snapshot 只在 diagnostic profile 使用。它提供 condition 总 CPU，不声称把并发 provider/masking 精确分摊到单独线程。

### 7.2 Windows process CPU

`BrowserServer.process().pid` 作为根 PID，PowerShell 通过 `Win32_Process.ParentProcessId` 递归得到隔离 Edge process tree，并按 command line/CDP type 分类 browser、renderer、GPU、utility。

sampler 每 200 ms 保存 UTC timestamp、PID、type，以及 `Get-Process` 的 `TotalProcessorTime`、`PrivateMemorySize64` 和 `WorkingSet64`。相邻样本的标准化 CPU utilization 为：

```text
100 * deltaCpuSeconds / (deltaWallSeconds * logicalProcessorCount)
```

同时保留未归一化 CPU seconds。页面使用 `performance.timeOrigin + mark.startTime` 映射到 UTC，对时间序列按阶段区间积分。少于两个有效采样点的短阶段不报告 mean/peak CPU utilization，只保留 CDP delta 或页面 duration。

## 8. GPU 自动采集

### 8.1 WebGL first-frame GPU time

diagnostic profile 在 Cesium 主场景使用的同一个 WebGL context 上：

1. 从已经创建 Cesium context 的 `viewer.scene.canvas` 再次调用 `getContext("webgl2")`，失败时调用 `getContext("webgl")`；浏览器返回该 canvas 已有的同类型 context，不访问 Cesium 私有 `_gl`；
2. WebGL2 优先请求 `EXT_disjoint_timer_query_webgl2`，WebGL1 回退到 `EXT_disjoint_timer_query`；
3. `Scene.preRender` 开始 query，`Scene.postRender` 结束 query；
4. 不调用 `gl.finish()`，异步轮询 query availability；
5. 结果可用后检查 `GPU_DISJOINT_EXT`；
6. 输出 `measured`、`unsupported`、`invalid-disjoint` 或 `timeout`，禁止用 0 表示不可用。

这个值只测 WebGL frame GPU elapsed time。geometry factory 的同步 CPU 时间仍由 `geometry-creation.operationSumMs` 表示。

### 8.2 Windows GPU utilization

PowerShell sampler读取：

- `\GPU Engine(*)\Utilization Percentage`；
- `\GPU Process Memory(*)\Dedicated Usage`；
- `\GPU Process Memory(*)\Shared Usage`。

只保留 instance 名中 PID 属于隔离 Edge process tree 的样本。按 adapter LUID 和 engine type 分组；同一 adapter 的多个 3D engine 取每个 timestamp 的最大值，不把 engine 百分比相加到超过 100%。Copy engine 单独保存。

GPU memory 按 Edge process-tree PID 和 adapter 聚合 dedicated/shared bytes：独显重点报告 dedicated，集显重点报告 shared。它是浏览器进程级资源代理，不是单页面、单 Primitive 或单 texture 的精确显存。

## 9. 内存自动采集

### 9.1 页面层

每个 condition 保存：

- `performance.memory.usedJSHeapSize`；
- `totalJSHeapSize`；
- `jsHeapSizeLimit`；
- manager `retainedImageAssetCount`；
- manager `estimatedTextureRgbaBytes`；
- 现有 Primitive counts。

正式检查点为 `beforeCondition` 与 condition endpoint。Table 5 只报告 endpoint used heap 和 endpoint texture estimate。

### 9.2 diagnostic checkpoints

diagnostic profile 额外采集：

1. `beforeCondition`；
2. `atReturn`；
3. `afterFirstFrame`；
4. `atPresent`；
5. `atIdle`；
6. `afterDestroySettled`。

页面先记录当前 timing 边界，再调用 Playwright exposed binding；runner 随后读取 CDP 和 OS snapshot。由于外部 callback 可能暂停页面，这些检查点只存在于 diagnostic profile。

### 9.3 L4 明确估算

```text
4,852 * 256 * 256 * 4
= 1,271,922,688 bytes
= 1,213 MiB
= 1.184 GiB（约 1.2 GiB）
```

论文把该估算与 endpoint JS heap 并列，而不是要求两者相等。资源段落同时说明：manager 保留所有 processed tile images 和 Primitives 直到 clear/destroy；processor 的 raw/result LRUs 不会淘汰 manager 仍引用的 assets。

## 10. Action 2：≤L2 extent 的单一控制实验

### 10.1 操作定义

```ts
type RenderRectangleSubdivision =
  | { mode: "none" }
  | { mode: "max-angular-extent"; radians: number };
```

实验值固定为 `Math.PI / 4`（45°）：L0 每个 composite 切为 4x4 子矩形，L1 切为 2x2，L2 不发生变化。不以修改 granularity 替代该操作。

每个子矩形创建独立 Cesium Primitive，使 per-Primitive extent 确实被限制；同一 composite 的子 Primitives 共享一个 processed image 和同一个 Appearance/Material。geometry descriptor 在同步 `createGeometry()` 后把子矩形 `st` 映射回父影像 UV，避免完整影像在每个子矩形重复拉伸。

`TilePrimitiveRecord` 保存 `primitives: Primitive[]`，仍只保留一个 image asset、clip areas、plate/time 和 composite id；show/modelMatrix/remove 遍历数组。

### 10.2 等价断言

| 断言 | 期望 |
|---|---:|
| composite/source/mask counts | original 与 split 相等 |
| provider attempts/successes | 相等 |
| masking rendered/exported jobs | 相等 |
| composite records / retained images | 相等 |
| estimated texture bytes | 相等 |
| split L0 Primitive count | original 的 16 倍 |
| split L1 Primitive count | original 的 4 倍 |
| 每个子矩形 extent | ≤45° + epsilon |

另执行视觉 smoke check 验证 UV 方向、接缝、极区和经度边界。截图只用于验收，不增加论文指标。

### 10.3 运行设计

新增且只新增两个 Action 2 condition：

- `level-0-split-l2-extent`；
- `level-1-split-l2-extent`。

original L0-L4 与 split L0/L1 各运行 10 measured blocks。每个 block 内用固定 seed 随机排列 original/split L0/L1；block 是独立重复单位，tile 和子 Primitive 不是样本。paper 与 diagnostic 使用同一 schedule，但属于不同 profile，不把二者合并增加 n。

### 10.4 结论分支

1. geometry CPU time、first-frame 和 `presentMs` 同时下降：同步大跨度 geometry creation/内部合批主导；
2. geometry CPU time近似不变，但 GPU elapsed/utilization 与 first-frame 下降：extent-sensitive rendering/culling/overdraw 路径主导；
3. CPU/GPU 和 confirmed-frame 均不收敛：angular extent 不是充分主因，按 decisively bounded 表述。

静态验证表明 split 不减少总 triangles，因此任何分支都不能写成“由于总 tessellation 数下降”。完成该分支判定后停止，不追加第二套 fill-rate 实验。

## 11. Macrostrat cold/warm

### 11.1 临时静态 server 与 relay

一键 runner 的 Node HTTP server 同时：

- 服务 build 后的 `dist`；
- 将 `/benchmark-macrostrat/carto/...` 转发到 `https://tiles.macrostrat.org/carto/...`；
- 为 relay 响应设置并记录固定 `Cache-Control`；
- 保留 `X-Cache`/`X-Tile-Cache` 供审计；
- 不改变普通 demo provider 或 production deployment。

这解决了当前 Macrostrat response 缺少 WebGL 所需 CORS/明确 browser-cache header 的问题。cold 条件仍完整经过真实外网；warm 条件必须由浏览器 HTTP cache 命中，不能用 processor LRU 或上游 `X-Cache` 冒充。

### 11.2 配对区组

Macrostrat W1 L4 运行 10 个 paired blocks：

- 5 个 cold-first：clear -> cold measured -> warm measured；
- 5 个 warm-first：clear -> unmeasured prefill -> warm measured -> clear -> cold measured。

CDP `Network.clearBrowserCache` 控制状态，`requestServedFromCache`/response cache flags 验证标签。每个 measured record 创建新 manager/processor。cache assertion 不符或请求失败时保留原始记录，并把整个 pair 标记 invalid。

## 12. 集显设备复测

在一台中端集成 GPU 笔记本上运行九个核心条件，各 3 次 warmup、10 measured blocks。使用同一 Chromium 主版本、硬件加速、AC 供电、相同 CSS viewport/DPR 和 benchmark config。

同一条一键命令在该设备运行 `paper` 与 `diagnostic`；因此除审稿人要求的 timing/heap/texture 外，还会自动获得集显 shared GPU memory 和 GPU utilization sidecar。两台设备结果分别汇总，不合并成总体均值，也不声称设备普遍性。

## 13. 一键 runner 的文件结构

### 13.1 新增文件

```text
apps/simple-geo-reconstruct-demo/benchmark-harness/
  run-r2.mjs
  static-benchmark-server.mjs
  edge-session.mjs
  collect-cdp.mjs
  artifact-writer.mjs
  collect-windows-metrics.ps1
```

职责：

- `run-r2.mjs`：CLI、profile 顺序、seed、condition schedule、退出清理；
- `static-benchmark-server.mjs`：dist 静态文件与 Macrostrat relay；
- `edge-session.mjs`：Playwright `msedge` launchServer、临时 profile、CDP session 和 root PID；
- `collect-cdp.mjs`：Performance/SystemInfo/Network snapshots；
- `artifact-writer.mjs`：JSON/CSV/manifest，原子写入；
- `collect-windows-metrics.ps1`：Edge process tree、CPU、private/working-set、GPU engine/memory samples。

### 13.2 package scripts/dependency

app 增加 `playwright-core` dev dependency，复用系统 Edge，不下载浏览器包。`package.json` 增加：

```json
{
  "scripts": {
    "benchmark:r2": "pnpm run build && node ./benchmark-harness/run-r2.mjs"
  }
}
```

runner 在 Windows resource counters 不可用时 fail-fast；GPU timer extension 缺失属于可记录 capability，输出 `unsupported`，不伪造数值。

## 14. 页面和核心代码改动

| 文件 | 必要改动 |
|---|---|
| `SimpleGeoReconstructManager.ts` | task-gen/geometry marks；extent split；Primitive 数组/共享 Material；retained texture estimate |
| `simple-geo-reconstruct/src/index.ts` | 导出新增配置与 stats 类型 |
| `cesiumTIleProcesser.ts` | benchmark-only provider/masking stage tracker |
| `performanceBenchmarkTypes.ts` | schema v2；stage、heap、GPU availability、resource checkpoint、condition ids |
| `performanceBenchmarkConfig.ts` | 45° split、provider override、profile flags |
| `performanceBenchmark.ts` | first-frame、GPU query、heap、checkpoint binding、split/network conditions |
| `gpuFrameTimer.ts`（新建） | WebGL1/2 query、异步 result、disjoint/timeout handling |
| `providers.ts` | 复用 Macrostrat，允许 benchmark relay URL |
| app `package.json` | 一键命令和 `playwright-core` |

不把 Windows、CDP 或 Playwright 类型放进核心 manager/processor；这些只存在于 app benchmark/harness。

## 15. 论文输出不变

### Figure 8(a)

- original L0-L4 + split L0/L1；
- log 或明确 broken axis；
- 标注 `coarse-tile pathological regime`；
- caption 说明 split extent、相同 image/mask/composite 和变化后的 Primitive count；
- 定义 `⁽²⁾`。

### Table 5

- W1 修复为 `lon [-50°, 20°], lat [-25°, 10°]`；
- 只新增 `JS heap at endpoint (MiB)`；
- 只新增 `Estimated texture (MiB, RGBA8)`；
- 保留 Primitive count；
- CPU/GPU/process memory 不新增为主表列。

### 正文

- Discussion 按 CPU/GPU/extent 三分支写；
- resource paragraph 报 endpoint heap、L4 约 1.2 GiB estimate、Primitive 和 retention policy；
- generalization 严格四句：网络协议、cold/warm 结果、集显九条件结果、不声称普遍性；
- 全文核对 `Section 3.4`、`Sec. 3.4`、Figure 8、Table 5 和 `⁽²⁾`。

仓库当前没有论文 PDF/LaTeX/Word 源文件，因此实际排版修订仍需稿件源文件到位后完成。

## 16. 工期与停止条件

### 预计工期

- Action 2 页面 marks + split + paper runs：2-3 天；
- Action 3 heap/texture/network/device：2-3 天；
- 一键 harness、GPU query 和 Windows resource sampler：额外 1-2 天；
- 总工程时间按 5-8 天估计，比原始 4-6 天多出的工作明确来自可重复 CPU/GPU/进程资源自动化。

### 完成门槛

- 一条命令能 build、启动临时静态 server、运行 profiles、保存 artifacts 并清理进程；
- paper 与 diagnostic 使用独立 Edge，diagnostic timing 不进入主图；
- L0-L4 五阶段数据完整，split 等价断言全部通过；
- GPU query 每条记录有 measured/unsupported/invalid 状态，不存在伪 0；
- CPU/GPU/内存 samples 只包含隔离 Edge process tree，并能按 record/stage timestamp 对齐；
- Table 5 仍只有两项新增资源列；
- Macrostrat 有 10 个有效 paired blocks；
- 集显设备九条件各有 10 个有效 blocks；
- Figure/caption/Table/Discussion/cross-reference 完成；
- 原始失败记录不静默删除。

完成这些门槛后停止，不继续增加 draw-call、网络限速、泄漏或设备矩阵。

## 17. 依据

- [Cesium RectangleGeometry](https://cesium.com/learn/cesiumjs/ref-doc/RectangleGeometry.html)
- [Cesium 1.119 RectangleGeometryLibrary](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Core/RectangleGeometryLibrary.js#L152-L187)
- [Cesium 1.119 Primitive](https://github.com/CesiumGS/cesium/blob/1.119/packages/engine/Source/Scene/Primitive.js#L1319-L1350)
- [Chrome DevTools Protocol Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
- [Chrome DevTools Protocol SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/)
- [Chrome DevTools Protocol Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Khronos WebGL2 disjoint timer query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype) 与 [BrowserServer](https://playwright.dev/docs/api/class-browserserver)
- [Microsoft Get-Counter](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-counter)
- [MDN Performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)

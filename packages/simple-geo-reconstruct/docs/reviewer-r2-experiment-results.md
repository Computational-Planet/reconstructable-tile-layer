# R2 性能补充实验：数据处理、结果与论文表述边界

## 1. 修订目标与证据角色

本轮实验只回答审稿意见 R2 的四个问题：L0/L1 异常的可诊断解释、prepared-state 复用的资源代价、真实网络条件下的有界结果，以及第二设备上的定性复现。为避免不同采样开销和样本量相互污染，三个结果目录承担不同证据角色：

| 结果 | 角色 | 正式样本 |
|---|---|---:|
| `2026-07-23T15-30-09-990Z-rtx4080-paper-n50` | 论文主时序、阶段埋点、工作量、JS heap、纹理估算、年龄转换 | 11 条件，每条件 50 个随机完整区组 |
| `2026-07-24T02-02-56-276Z-rtx4080-diagnostic-network-n10` | CPU、进程内存、GPU 内存/利用率、WebGL GPU timer、Macrostrat 网络冷暖配对 | 诊断条件每项 10 个区组；网络 10 个配对区组 |
| `2026-07-23T15-19-04-757Z-integrated-laptop-n10` | 第二个中端集成 GPU 系统上的九个核心条件复现 | 每条件 10 个随机完整区组 |

所有统计均以正式区组为样本单位，报告中位数和 type-7 Q1--Q3，不进行不适合该单环境运行设计的显著性检验。主时序只取 paper profile；diagnostic profile 因系统采样和检查点存在额外扰动，只用于解释资源与执行位置，不能替代主时序。网络 cold/warm 按外层区组配对，设备结果不合并统计。

## 2. 完整性与有效性

三个运行目录的 manifest 所列文件均通过 SHA-256 复核。主设备 paper、主设备 diagnostic/network 和第二设备分别记录 13,019、3,521 和 4,862 条断言，合计 21,402 条，失败数均为零。主实验另有 1,200 条受控断言确认 split 与 original 在每个配对区组中保持 composite、来源贡献、裁剪多边形、图像请求、mask triangle、保留图像和纹理估算一致。正式记录没有重复 ID、非有限时序、失败或取消任务、WebGL context loss，也没有 idle 端残留队列或 Promise。

## 3. 主时序与工作量

主设备 RTX paper profile 的结果如下，单位为秒，格式为中位数 [Q1--Q3]：

| 条件 | API return | Confirmed frame | Idle |
|---|---:|---:|---:|
| Global L0 | 0.415 [0.367--0.452] | 67.643 [67.432--67.996] | 68.341 [68.172--68.711] |
| Global L1 | 6.191 [6.108--6.291] | 21.432 [21.198--21.616] | 21.975 [21.784--22.198] |
| Global L2 | 1.902 [1.867--1.950] | 6.234 [6.184--6.344] | 6.590 [6.552--6.706] |
| Global L3 | 1.598 [1.551--1.660] | 1.723 [1.688--1.798] | 4.196 [4.121--4.321] |
| Global L4 | 2.782 [2.694--2.870] | 2.856 [2.761--2.943] | 6.839 [6.681--7.032] |
| W1 L4 | 0.746 [0.712--0.785] | 0.801 [0.760--0.831] | 1.382 [1.331--1.416] |

初始化耗时 4.255 [3.981--4.441] s，其中 manager initialization 为 4.210 [3.948--4.413] s。W1 相对 global L4 将来源坐标从 512 降至 111、composite 从 4,852 降至 867、mask triangles 从 130,505 降至 20,614，分别减少 78.320%、82.131% 和 84.204%。因此，W1 结果支持“在 composite generation 前进行空间筛选可同时减少请求、裁剪、图像处理和 Primitive 创建”，但固定 W1 不能代表自动相机选择。

## 4. L0/L1 异常的受控界定

原始数据直接否定旧解释：L0 只有 1,335 个 composites，少于 L4 的 4,852 个；其 122,712 个 mask triangles 与 L4 的 130,505 个处于同一数量级，却需要 67.643 s 才到达 confirmed frame。因此，composite 总数或 mask-triangle 总量都不能解释 L0 比 L4 慢约 24 倍。

受控实验仅把每个 composite 的渲染矩形拆分为不超过 L2 角跨度的子矩形，保持 imagery、mask、composite identity 和纹理估算不变。结果如下：

| 条件 | Original confirmed frame | Split confirmed frame | 配对比值 | 下降区组 |
|---|---:|---:|---:|---:|
| L0 | 67.643 s | 56.669 s | 0.838 [0.833--0.843] | 50/50 |
| L1 | 21.432 s | 17.497 s | 0.817 [0.802--0.832] | 50/50 |

这一干预稳定降低了 L0/L1 的 confirmed-frame 时间，说明矩形角跨度敏感的几何或渲染工作确实有贡献，但下降只有约 16% 和 18%，没有使异常降至 L2--L4 的秒级范围。拆分还将 L0 Primitive 数从 1,335 增至 21,360，将 L1 从 1,557 增至 6,228。单次 geometry factory 调用的中位成本明显下降，但累计 geometry operation sum 在 L0 从 5.931 s 增至 6.917 s，在 L1 从 1.966 s 变为 1.983 s。阶段 window 会重叠，operation sum 也不是关键路径，两者都不能相加为总耗时。

诊断 profile 进一步界定执行位置。L0/L1 的首帧 GPU timer 分别只有约 56.5 ms 和 74.1 ms，远小于数十秒的 wall-clock interval；拆分后为约 42.3 ms 和 15.7 ms。浏览器进程树累计 CPU seconds 也只小幅下降。可据此排除“单个首帧 GPU 绘制时间独自支配异常”，但不能排除长期命令准备、重叠绘制或合成器工作。最严谨的结论是：异常主要落在 geometry-creation/presentation window，角跨度是稳定但不充分的贡献因素；剩余时间横跨 Cesium Primitive/geometry 初始化、命令提交、浏览器调度和合成边界，当前数据没有识别出单一充分原因。

论文与 Figure 8 应将 L0/L1 标为 `coarse-tile pathological regime`，不再把它们表现为普通单调缩放点，也不再使用“concentrated composite/clipping workload caused the delay”这一因果表述。

## 5. Prepared-state 复用及资源代价

两条年龄路径各含 50 个区组，每个区组 5 次转换，共 500 次正式转换。500/500 次转换的 processor request、image request attempt 和 WebGL masking-job 增量均为零。这是 prepared-state reuse 的设计验证，而不是零成本压力测试。

在 global L4，manager 保留 4,852 个 256x256 RGBA8 processed images；在 `dynamic3D` 中同时保留 4,852 个 Primitives。名义解码纹理量为 1,271,922,688 bytes，即 1,213 MiB 或约 1.185 GiB。idle 端 `performance.memory` 的 used JS heap 为 244.456 [212.039--309.443] MiB。两者属于不同分配域：纹理值是 RGBA8 估算，不含 geometry、mipmap、driver copy 等；JS heap 不含 renderer 或 GPU 管理的资源。Windows 诊断的浏览器进程树 private memory 和 GPU memory 又覆盖浏览器/Cesium/驱动的其他资源，不能与前两者相加或严格归因给 RTL。

年龄路径的资源端点统一取每个正式区组第 5 次转换，即第二次 `400->50` 后的 confirmed-frame 快照。此时 `dynamic3D` 的 used JS heap 为 227.055 [193.376--418.721] MiB，保留 4,852 个 images 和 4,852 个 Primitives；`bakedInstance` 为 437.347 [302.940--473.147] MiB，保留 4,852 个 images，并在目标年代构建 2,734 个 Primitives。两条路径的 RGBA8 纹理估算均仍为 1,213 MiB。

Manager 没有自动 eviction：processed images 和 Primitives 保留到显式调用 `clearAllTiles()` 或 `destroy()`。Processor 的 256-entry image LRU 和 512-entry result LRU 会淘汰缓存条目，但不会释放 manager 已持有的 prepared assets。因此，快速年龄切换的明确代价是保留全部 prepared imagery，并在 `dynamic3D` 中保留完整 Primitive 集。当前两个系统都有约 32 GiB RAM，实验不能回答 8 GiB 设备是否适用。

## 6. 真实网络的有界结果

Macrostrat W1 L4 通过不缓存的本地 relay 转发真实 HTTPS 请求，采用 10 个 counterbalanced paired blocks，其中 5 个 cold-first、5 个 warm-first。Cold 条件清空浏览器缓存；warm 条件保留浏览器 HTTP disk cache，但创建新的 RTL manager 和 processor。因而 `cold` 必须称为 browser-cache cold，不能称为 origin/CDN cold。

| 指标 | Browser-cache cold | Browser-cache warm |
|---|---:|---:|
| API return | 3.096 [2.965--3.232] s | 1.012 [0.995--1.022] s |
| Confirmed frame | 3.470 [3.325--3.643] s | 1.388 [1.368--1.397] s |
| Idle | 4.002 [3.825--4.122] s | 1.832 [1.808--1.862] s |
| Provider window | 2.516 [2.379--2.656] s | 0.416 [0.393--0.419] s |

Confirmed-frame 的 cold/warm 配对比值为 2.482 [2.391--2.611]，10/10 个 cold 区组更慢。Cold 的 460 个正式资源事件均未命中浏览器缓存且访问 relay；warm 的 460 个事件均来自 disk cache 且没有 relay 请求。690 次 relay 请求还包括 warm-first 区组的未计时预填充，不能把请求数当作样本量。由于本地 ETOPO1 与远程 Macrostrat 的 provider、投影和任务量不同，两者绝对差不能解释为纯网络开销。

## 7. 第二设备复现

第二系统为 Intel Core i5-12400、Intel UHD Graphics 730、12 个 logical processors 和约 31.75 GiB RAM，应写为 `a second mid-range integrated-GPU system`，不按结果目录名称称为 laptop。九个核心条件每项重复 10 个随机完整区组。

该系统重现了关键定性模式：L0/L1 confirmed-frame 分别为 63.843 s 和 20.075 s，仍是 global L4 2.636 s 的 24.22 倍和 7.61 倍；W1 L4 为 0.789 s，比 global L4 快 70.1%；`dynamic3D` 年龄转换仍为毫秒级，而 `bakedInstance` 为秒级。各条件绝对时间并非统一变慢，因此不能把设备差异单独归因于 GPU，也不能由两个系统声称设备普适性。此复现只能支持“现象不局限于一个高端、纯本地配置”。

## 8. 论文中允许与不允许的结论

允许的核心结论：

- L0/L1 是 fixed-level API 暴露的 coarse-tile pathological regime，不是推荐的交互工作点。
- Composite 总量和 mask-triangle 总量不能解释异常。
- 限制矩形角跨度稳定降低时延，但只解释部分差异；它是贡献因素，不是已证明的唯一主因。
- 500 次零重新处理验证 prepared-state reuse；其代价是约 1.185 GiB 的 L4 RGBA8 纹理估算和数千个保留 Primitive，且 manager 无自动 eviction。
- 一次真实网络 browser-cold/warm 配对和一个第二系统复现给出了超出高端本地基线的两个有界数据点。

不允许的扩展结论：

- 不得声称 tessellation、overdraw、CPU 或 GPU 单独支配 L0/L1 异常。
- 不得把 diagnostic wall time 替换主 paper 时序，也不得把多个设备合并统计。
- 不得把 JS heap、RGBA8 纹理估算、进程 private memory 或 GPU memory 相加。
- 不得把 browser-cache cold 描述为 Macrostrat origin/CDN cold，或把本地/远程绝对差解释为纯网络开销。
- 不得声称已证明跨设备普适性、8 GiB 设备适用性、长期内存稳定性或有界缓存行为。

## 9. 图表设计与原结果保留原则

Figure 8 继续承担原实验的主体结果，而不是被新增指标替换。Figure 8(a) 保留三条累计边界及三层填充色，用 8--15 s 断开的线性坐标同时容纳 L0/L1 病理区和 L2--L4/W1 的正常区间；split 只以空心 confirmed-frame 菱形和配对比值叠加，不连成新的层级曲线。Figure 8(b) 保留 source coordinates、composites 和 mask triangles，使“L0 triangles 与 L4 接近而 composites 更少”的反证可直接读取。Figure 8(c) 保留适合毫秒级 `dynamic3D` 的对数轴，Figure 8(d) 恢复 0--1.6 s 的线性轴；图注明确 `400->50^(2)` 表示同一区组内第二次访问 50 Ma。

新增 Figure 9 单独承载 R2 补充证据，避免破坏 Figure 8 的原有语义。Figure 9(a) 用横向中位数和 IQR 点区间展示五个会重叠的 performance-mark windows，不进行堆叠或求和；(b) 分别展示 used JS heap 与 RGBA8 texture estimate，并明确二者不可相加；(c) 保留全部 10 条 Macrostrat browser-cache cold/warm 配对轨迹；(d) 分别展示主设备 `n=50` 与第二系统 `n=10` 的六个共有加载条件，不进行区组配对或跨设备合并。

Table 5 保留环境和实验设计，并增加每个核心条件的 Primitive count、endpoint JS heap 和 RGBA8 texture estimate。精确 retained-image/Primitive 计数留在表中，不再为相同数字增加独立面板。CPU/GPU 诊断只在正文报告最能界定异常的 L0/L1 对照及 L4 资源锚点，避免把不同采样作用域压到同一坐标轴，也避免新增与 R2 无关的指标。

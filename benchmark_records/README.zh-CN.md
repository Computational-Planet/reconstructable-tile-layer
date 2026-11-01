# 论文基准测试记录

[English](README.md) | 简体中文

本目录保存正文及补充材料实际使用的三轮 R2 浏览器基准测试。日常测试输出仍写入被
git 忽略的 `output/`；这里只跟踪经过核对并用于论文的证据记录。

| 运行目录                                                     | 证据用途                                   | 保留的测试记录                       |
| ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------ |
| `r2/2026-07-23T15-30-09-990Z-rtx4080-paper-n50`              | 主设备 paper profile 测试，50 个测量区组   | `paper.json`                         |
| `r2/2026-07-24T02-02-56-276Z-rtx4080-diagnostic-network-n10` | 主设备诊断及配对网络测试，10 个测量区组    | `diagnostic.json.gz`、`network.json` |
| `r2/2026-07-23T15-19-04-757Z-integrated-laptop-n10`          | 第二设备 paper profile 复核，10 个测量区组 | `paper.json`                         |

每轮记录还包含 `assertions.json`、`host.json` 和整理后的 `manifest.json`，
这些正是论文分析流程读取的文件。各 manifest 保存全部保留文件的 SHA-256，
`r2/CHECKSUMS.sha256` 则覆盖整套整理后的记录。

为控制仓库体积，主设备诊断记录以 `diagnostic.json.gz` 保存。运行论文解析器前，
可在该目录执行 `gzip -dk diagnostic.json.gz`，原位解压出 `diagnostic.json`。
对应 manifest 同时记录压缩文件及解压后 JSON 内容的 SHA-256。

## 整理范围

本目录没有纳入论文解析器不读取的文件，包括未使用的 profile 副本、Windows 原始
逐采样数据流、重复 CSV 导出、运行日志和可视化冒烟测试截图。为保持审稿材料匿名，
复制件移除了本地主机名、仓库路径和用户目录；测试数值、实验配置、时间戳、浏览器
与硬件说明、断言结果及测试使用的 git commit 均未改变。每个整理后的 manifest
记录原始 manifest 的 SHA-256，并明确标注数值测量没有修改。

## 基准测试实现

生成此类记录的基准测试运行器位于
[`apps/reconstructable-tile-layer-demo/benchmark/r2`](../apps/reconstructable-tile-layer-demo/benchmark/r2)。

# Paper Benchmark Records

English | [简体中文](README.zh-CN.md)

This directory preserves the three R2 browser benchmark runs used by the
manuscript and its supplementary material. Routine benchmark output remains
under the git-ignored `output/` directory; only the reviewed evidence runs are
tracked here.

| Run directory                                                | Evidence role                                                       | Retained suite records            |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------- |
| `r2/2026-07-23T15-30-09-990Z-rtx4080-paper-n50`              | Primary paper-profile benchmark, 50 measured blocks                 | `paper.json`                      |
| `r2/2026-07-24T02-02-56-276Z-rtx4080-diagnostic-network-n10` | Primary diagnostic and paired network benchmark, 10 measured blocks | `diagnostic.json`, `network.json` |
| `r2/2026-07-23T15-19-04-757Z-integrated-laptop-n10`          | Secondary-device paper-profile replication, 10 measured blocks      | `paper.json`                      |

Each run also contains `assertions.json`, `host.json`, and a curated
`manifest.json`. These are the files read by the manuscript analysis pipeline.
The manifests record SHA-256 hashes for every retained artifact, and
`r2/CHECKSUMS.sha256` covers the complete curated record set.

## Curation boundary

The tracked records omit artifacts that the manuscript parser does not read:
unused profile copies, raw Windows sampling streams, redundant CSV exports,
run logs, and visual smoke-test screenshots. Local host names, repository
paths, and user-profile paths are redacted to keep the review materials
anonymous. Benchmark measurements, experimental configurations, timestamps,
browser and hardware descriptions, assertions, and the tested git commit are
unchanged. Each curated manifest records the SHA-256 digest of its original
source manifest and states that numerical measurements were not changed.

## Benchmark implementation

The benchmark runner used to produce these record types is maintained in
[`apps/reconstructable-tile-layer-demo/benchmark/r2`](../apps/reconstructable-tile-layer-demo/benchmark/r2).

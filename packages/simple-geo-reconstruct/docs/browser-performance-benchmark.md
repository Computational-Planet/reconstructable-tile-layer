# Browser performance benchmark

The demo installs a manuscript-oriented benchmark controller at
`window.__rtlPerformanceBenchmark`. Run it in a foreground browser tab before
initializing the interactive reconstruction manager. The controller releases
the unused interactive tile processor before the first run so each replicate
has exactly one offscreen tile-processing context. Reload the page before
returning to interactive controls after a benchmark.

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

For a short verification run, select conditions and reduce the repetition
counts without changing the versioned manuscript defaults:

```js
await window.__rtlPerformanceBenchmark.run({
  conditions: ["initialization", "level-0", "view-w1-level-4"],
  warmupRuns: 0,
  measuredBlocks: 1,
});
```

## Experimental boundaries

Each replicate creates a new imagery provider, `CesiumTileProcesser`, and
`SimpleGeoReconstructManager`. The Cesium viewer is reused so viewer creation is
not included in manager or tile-loading latency. The runner records four
snapshots for loading workloads:

1. `before`: initialized manager and empty RTL caches.
2. `atReturn`: the public loading Promise has resolved.
3. `atPresent`: two explicitly requested post-return frames have rendered.
4. `atIdle`: manager and processor work are empty and a final frame has rendered.

The manager also stores `foregroundProcessorStats` before background prewarm
processing starts. This is the only processor snapshot that should be treated
as the exact foreground boundary; a normal JavaScript continuation after the
public Promise may already overlap with prewarm work.

## Tile-count interpretation

The exported counts describe different layers of work:

- `sourceFeatureContributionCount`: feature-to-tile intersections before
  composite merging.
- `compositeTaskCount`: plate/time/tile reconstruction work units.
- `uniqueRawTileCount`: distinct source-service XYZ addresses selected.
- `totalRequests`: processing requests that reached the result-cache path.
- `imageRequestAttempts`: calls that started at `provider.requestImage`.
- Physical HTTP transfers are not inferred from these counters and require
  browser network instrumentation or server logs.

Every measured loading replicate is expected to satisfy task partition and
outcome accounting, zero failed/cancelled tasks, zero pending work, no WebGL
context loss, and readiness of all retained Primitive instances. Failed
assertions remain in the raw JSON and invalidate that replicate for manuscript
summaries.

## Cache and scene conditions

The versioned default is an RTL-cold, transport-steady benchmark: RTL manager
records and both processor caches are new for every replicate, whereas browser
and local-service caches are not cleared. Warm-up records are retained in the
JSON with `warmup: true` but excluded from summaries.

Fixed-level and W1 loads use `dynamic3D` in Cesium 3D. Age transitions are
stratified into 3D/`dynamic3D` and 2D/`bakedInstance`; the two strata describe
their intended runtime paths and are not an uncontrolled head-to-head mode
comparison. W1 uses the explicit reconstructed-frame rectangle in
`performanceBenchmarkConfig.ts`, while its camera pose is fixed separately for
presentation.

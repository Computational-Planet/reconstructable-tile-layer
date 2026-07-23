import { Rectangle, SceneMode, type Viewer } from "cesium";
import cesiumPackage from "cesium/package.json";
import {
  SimpleGeoReconstructManager,
  type PrimitiveTransformMode,
  type RenderRectangleSubdivision,
} from "simple-geo-reconstruct";
import {
  CesiumTileProcesser,
  type CesiumTileProcesserStats,
} from "tile-processer-webgl";

import { applyPoseView } from "../cesium/cameraControls";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import { createImageryProvider } from "../cesium/providers";
import { downloadBlob } from "../utils/downloads";
import { DEFAULT_PERFORMANCE_BENCHMARK_CONFIG } from "./performanceBenchmarkConfig";
import type {
  AgeBenchmarkRecord,
  AgeTransitionRecord,
  BenchmarkAssertion,
  BenchmarkCheckpointName,
  BenchmarkConditionId,
  BenchmarkEnvironment,
  BenchmarkReplicateRecord,
  BenchmarkStatsSnapshot,
  BenchmarkSuiteResult,
  InitializationBenchmarkRecord,
  LoadBenchmarkRecord,
  MetricValue,
  PerformanceBenchmarkConfig,
  PerformanceBenchmarkController,
  ResourceCheckpoint,
  RunBenchmarkOptions,
} from "./performanceBenchmarkTypes";
import { measureNextRenderedFrame } from "./gpuFrameTimer";
import { PerformanceStageCollector } from "./performanceStageCollector";

type BenchmarkRuntime = {
  processer: CesiumTileProcesser;
  manager: SimpleGeoReconstructManager;
};

type RuntimeConstruction = BenchmarkRuntime & {
  providerConstructorMs: number;
  processorConstructorMs: number;
  managerConstructorMs: number;
  managerInitMs: number;
  totalReadyMs: number;
};

type RuntimeBenchmarkControls = {
  stageCollector?: PerformanceStageCollector;
  renderRectangleSubdivision?: RenderRectangleSubdivision;
};

type InstallPerformanceBenchmarkOptions = {
  viewer: Viewer;
  getActiveManager: () => SimpleGeoReconstructManager | null;
  prepareExclusiveRuntime?: () => void;
  config?: PerformanceBenchmarkConfig;
};

const DEFAULT_CONDITIONS: BenchmarkConditionId[] = [
  "initialization",
  "level-0",
  "level-1",
  "level-2",
  "level-3",
  "level-4",
  "level-0-split-l2-extent",
  "level-1-split-l2-extent",
  "view-w1-level-4",
  "age-dynamic-3d",
  "age-baked-2d",
];

export function installPerformanceBenchmark({
  viewer,
  getActiveManager,
  prepareExclusiveRuntime,
  config = DEFAULT_PERFORMANCE_BENCHMARK_CONFIG,
}: InstallPerformanceBenchmarkOptions) {
  let running = false;
  let lastResult: BenchmarkSuiteResult | null = null;

  const controller: PerformanceBenchmarkController = {
    getConfig: () => cloneConfig(config),
    getLastResult: () => lastResult,
    run: async (options = {}) => {
      if (running) {
        throw new Error("A performance benchmark is already running.");
      }
      if (getActiveManager()) {
        throw new Error(
          "Reload the page and run the benchmark before initializing the interactive manager.",
        );
      }

      running = true;
      try {
        // The interactive processor is not part of a benchmark replicate. Its
        // removal keeps exactly one offscreen tile-processing context active.
        prepareExclusiveRuntime?.();
        lastResult = await runBenchmarkSuite(viewer, config, options);
        return lastResult;
      } finally {
        running = false;
      }
    },
    downloadLastResult: () => {
      if (!lastResult) {
        throw new Error("Run the benchmark before downloading its result.");
      }
      const timestamp = lastResult.completedAt.replace(/[:.]/g, "-");
      downloadBlob(
        new Blob([JSON.stringify(lastResult, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
        `rtl-performance-benchmark-${timestamp}.json`,
      );
    },
  };

  window.__rtlPerformanceBenchmark = controller;
  return () => {
    if (window.__rtlPerformanceBenchmark === controller) {
      delete window.__rtlPerformanceBenchmark;
    }
  };
}

async function runBenchmarkSuite(
  viewer: Viewer,
  baseConfig: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
): Promise<BenchmarkSuiteResult> {
  const config = resolveConfig(baseConfig, options);
  const profile = options.profile ?? "paper";
  const conditions = resolveConditions(options.conditions);
  const startedAt = new Date().toISOString();
  const records: BenchmarkReplicateRecord[] = [];
  const executionOrder: BenchmarkConditionId[] = [];
  const random = createSeededRandom(config.randomSeed);
  const measuredCounts = new Map<BenchmarkConditionId, number>();

  // Warm-ups are retained in the artifact for auditability but excluded from
  // manuscript summaries through the explicit `warmup` flag.
  for (const conditionId of conditions) {
    for (let index = 0; index < config.warmupRuns; index++) {
      executionOrder.push(conditionId);
      records.push(
        await runCondition(
          viewer,
          config,
          options,
          conditionId,
          true,
          null,
          index,
        ),
      );
    }
  }

  // Each block contains every condition exactly once. Shuffling within blocks
  // balances gradual thermal and order effects without unbalancing sample size.
  for (let blockIndex = 0; blockIndex < config.measuredBlocks; blockIndex++) {
    const blockOrder = shuffle([...conditions], random);
    for (const conditionId of blockOrder) {
      const replicateIndex = measuredCounts.get(conditionId) ?? 0;
      measuredCounts.set(conditionId, replicateIndex + 1);
      executionOrder.push(conditionId);
      records.push(
        await runCondition(
          viewer,
          config,
          options,
          conditionId,
          false,
          blockIndex,
          replicateIndex,
        ),
      );
    }
  }

  const firstProcessorStats = findFirstProcessorStats(records);
  return {
    schemaVersion: 2,
    profile,
    startedAt,
    completedAt: new Date().toISOString(),
    config,
    environment: collectEnvironment(viewer, firstProcessorStats),
    executionOrder,
    records,
  };
}

async function runCondition(
  viewer: Viewer,
  config: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
  conditionId: BenchmarkConditionId,
  warmup: boolean,
  blockIndex: number | null,
  replicateIndex: number,
): Promise<BenchmarkReplicateRecord> {
  if (conditionId === "initialization") {
    return runInitializationCondition(
      viewer,
      config,
      options,
      warmup,
      blockIndex,
      replicateIndex,
    );
  }
  if (conditionId === "age-dynamic-3d") {
    return runAgeCondition(
      viewer,
      config,
      options,
      "dynamic3D",
      warmup,
      blockIndex,
      replicateIndex,
    );
  }
  if (conditionId === "age-baked-2d") {
    return runAgeCondition(
      viewer,
      config,
      options,
      "bakedInstance",
      warmup,
      blockIndex,
      replicateIndex,
    );
  }

  const viewAware =
    conditionId === "view-w1-level-4" ||
    conditionId === "network-macrostrat-w1-level-4";
  const level = viewAware
    ? 4
    : conditionId.startsWith("level-0")
      ? 0
      : conditionId.startsWith("level-1")
        ? 1
        : Number(conditionId.slice("level-".length));
  return runLoadCondition(
    viewer,
    config,
    options,
    conditionId,
    level,
    viewAware,
    warmup,
    blockIndex,
    replicateIndex,
  );
}

async function runInitializationCondition(
  viewer: Viewer,
  config: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
  warmup: boolean,
  blockIndex: number | null,
  replicateIndex: number,
): Promise<InitializationBenchmarkRecord> {
  const profile = options.profile ?? "paper";
  const recordId = createRecordId(
    profile,
    "initialization",
    warmup,
    blockIndex,
    replicateIndex,
  );
  const resourceCheckpoints: ResourceCheckpoint[] = [];
  await setBenchmarkSceneMode(viewer, "dynamic3D", config);
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "beforeCondition",
    profile,
  );
  const runtime = await createRuntime(config, "dynamic3D", options);
  const finalSnapshot = snapshot(runtime);
  await appendCheckpoint(resourceCheckpoints, recordId, "atIdle", profile);
  const assertions = [
    assertion("manager-ready", runtime.manager.ready, true),
    assertion(
      "feature-imported",
      (finalSnapshot.manager.importDiagnostics?.totalImportedFeatures ?? 0) > 0,
      true,
    ),
    assertion(
      "rotation-plates-loaded",
      runtime.manager.rotationOperator.rotData.size > 0,
      true,
    ),
    assertion("webgl-context-count", finalSnapshot.processor.contextCount, 1),
    assertion(
      "webgl-context-loss",
      finalSnapshot.processor.contextLostCount,
      0,
    ),
  ];

  destroyRuntime(viewer, runtime);
  await waitForAnimationFrame();
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "afterDestroySettled",
    profile,
  );
  return {
    kind: "initialization",
    recordId,
    profile,
    conditionId: "initialization",
    warmup,
    blockIndex,
    replicateIndex,
    performanceTimeOriginMs: performance.timeOrigin,
    resourceCheckpoints,
    providerConstructorMs: runtime.providerConstructorMs,
    processorConstructorMs: runtime.processorConstructorMs,
    managerConstructorMs: runtime.managerConstructorMs,
    managerInitMs: runtime.managerInitMs,
    totalReadyMs: runtime.totalReadyMs,
    finalSnapshot,
    assertions,
  };
}

async function runLoadCondition(
  viewer: Viewer,
  config: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
  conditionId: LoadBenchmarkRecord["conditionId"],
  level: number,
  viewAware: boolean,
  warmup: boolean,
  blockIndex: number | null,
  replicateIndex: number,
): Promise<LoadBenchmarkRecord> {
  const profile = options.profile ?? "paper";
  const recordId = createRecordId(
    profile,
    conditionId,
    warmup,
    blockIndex,
    replicateIndex,
  );
  await setBenchmarkSceneMode(
    viewer,
    "dynamic3D",
    config,
    viewAware ? "w1" : "global",
  );
  const stageCollector = new PerformanceStageCollector();
  const split = conditionId.endsWith("split-l2-extent");
  const runtime = await createRuntime(config, "dynamic3D", options, {
    stageCollector,
    renderRectangleSubdivision: split
      ? {
          mode: "max-angular-extent",
          radians: config.splitMaximumAngularExtentRadians,
        }
      : { mode: "none" },
  });
  const resourceCheckpoints: ResourceCheckpoint[] = [];
  const before = snapshot(runtime);
  await appendCheckpoint(resourceCheckpoints, recordId, "beforeCondition", profile);
  const operationStart = now();

  if (viewAware) {
    await runtime.manager.loadFineTilesInViewAtLevel(viewer, level, {
      viewRectangle: Rectangle.fromDegrees(
        config.w1RectangleDegrees.west,
        config.w1RectangleDegrees.south,
        config.w1RectangleDegrees.east,
        config.w1RectangleDegrees.north,
      ),
    });
  } else {
    await runtime.manager.loadTilesOnLevel(viewer, level);
  }

  const returnMs = now() - operationStart;
  const atReturn = snapshot(runtime);
  stageCollector.freeze(["task-gen", "provider", "masking"]);
  await appendCheckpoint(resourceCheckpoints, recordId, "atReturn", profile);
  const firstFrame = await measureNextRenderedFrame(
    viewer,
    config.idleTimeoutMs,
    profile === "diagnostic",
  );
  stageCollector.onStageOperation(
    "first-frame",
    firstFrame.startTimeMs,
    firstFrame.endTimeMs,
  );
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "afterFirstFrame",
    profile,
  );
  await waitForRenderedFrames(viewer, 1, config.idleTimeoutMs);
  const presentMs = now() - operationStart;
  const atPresent = snapshot(runtime);
  stageCollector.freeze(["geometry-creation", "first-frame"]);
  await appendCheckpoint(resourceCheckpoints, recordId, "atPresent", profile);
  await waitForRuntimeIdle(runtime, config);
  await waitForRenderedFrames(viewer, 1, config.idleTimeoutMs);
  const idleMs = now() - operationStart;
  const atIdle = snapshot(runtime);
  await appendCheckpoint(resourceCheckpoints, recordId, "atIdle", profile);
  const foregroundProcessorSnapshot =
    atIdle.generationReport?.foregroundProcessorStats ?? null;
  const assertions = buildLoadAssertions(atIdle, split ? (level === 0 ? 16 : 4) : 1);
  const firstFrameGpu = await firstFrame.gpu;
  const stageTimings = stageCollector.finalize(recordId);

  destroyRuntime(viewer, runtime);
  await waitForAnimationFrame();
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "afterDestroySettled",
    profile,
  );
  return {
    kind: "load",
    recordId,
    profile,
    conditionId,
    warmup,
    blockIndex,
    replicateIndex,
    performanceTimeOriginMs: performance.timeOrigin,
    resourceCheckpoints,
    level,
    viewRectangleDegrees: viewAware ? { ...config.w1RectangleDegrees } : null,
    renderRectangleMode: split ? "split-l2-extent" : "original",
    renderRectanglePartCount: atIdle.manager.renderRectanglePartCount,
    returnMs,
    firstFrameMs: firstFrame.wallMs,
    presentMs,
    idleMs,
    stageTimings,
    firstFrameGpu,
    before,
    atReturn,
    atPresent,
    atIdle,
    foregroundProcessorSnapshot,
    assertions,
  };
}

async function runAgeCondition(
  viewer: Viewer,
  config: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
  transformMode: PrimitiveTransformMode,
  warmup: boolean,
  blockIndex: number | null,
  replicateIndex: number,
): Promise<AgeBenchmarkRecord> {
  const profile = options.profile ?? "paper";
  const conditionId =
    transformMode === "dynamic3D" ? "age-dynamic-3d" : "age-baked-2d";
  const recordId = createRecordId(
    profile,
    conditionId,
    warmup,
    blockIndex,
    replicateIndex,
  );
  const resourceCheckpoints: ResourceCheckpoint[] = [];
  await setBenchmarkSceneMode(viewer, transformMode, config);
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "beforeCondition",
    profile,
  );
  const runtime = await createRuntime(config, transformMode, options);

  // Age timing starts only after every Level-4 visible and prewarm task has
  // settled, so no background image work can leak into a transition.
  const preparationStart = now();
  await runtime.manager.loadTilesOnLevel(viewer, 4);
  await waitForRuntimeIdle(runtime, config);
  await waitForRenderedFrames(viewer, 1, config.idleTimeoutMs);
  const preparationIdleMs = now() - preparationStart;
  await appendCheckpoint(resourceCheckpoints, recordId, "atIdle", profile);

  const transitions: AgeTransitionRecord[] = [];
  const visitCounts = new Map<number, number>();
  let fromAgeMa = config.initialAgeMa;

  for (const toAgeMa of config.ageSequenceMa) {
    const visitIndex = visitCounts.get(toAgeMa) ?? 0;
    visitCounts.set(toAgeMa, visitIndex + 1);
    const before = snapshot(runtime);
    const operationStart = now();
    await runtime.manager.updateAge(toAgeMa);
    const returnMs = now() - operationStart;
    const atReturn = snapshot(runtime);
    const presentationFrames = transformMode === "dynamic3D" ? 1 : 2;
    await waitForRenderedFrames(
      viewer,
      presentationFrames,
      config.idleTimeoutMs,
    );
    const presentMs = now() - operationStart;
    const atPresent = snapshot(runtime);
    const assertions = buildAgeAssertions(before, atPresent, transformMode);

    transitions.push({
      fromAgeMa,
      toAgeMa,
      visitIndex,
      returnMs,
      presentMs,
      before,
      atReturn,
      atPresent,
      assertions,
    });
    fromAgeMa = toAgeMa;
  }

  const assertions = buildIdleAssertions(snapshot(runtime));
  await appendCheckpoint(resourceCheckpoints, recordId, "atPresent", profile);
  destroyRuntime(viewer, runtime);
  await waitForAnimationFrame();
  await appendCheckpoint(
    resourceCheckpoints,
    recordId,
    "afterDestroySettled",
    profile,
  );
  return {
    kind: "age",
    recordId,
    profile,
    conditionId,
    warmup,
    blockIndex,
    replicateIndex,
    performanceTimeOriginMs: performance.timeOrigin,
    resourceCheckpoints,
    transformMode,
    sceneMode: transformMode === "dynamic3D" ? "SCENE3D" : "SCENE2D",
    preparationIdleMs,
    transitions,
    assertions,
  };
}

async function createRuntime(
  config: PerformanceBenchmarkConfig,
  transformMode: PrimitiveTransformMode,
  options: RunBenchmarkOptions,
  controls: RuntimeBenchmarkControls = {},
): Promise<RuntimeConstruction> {
  const totalStart = now();
  const providerStart = now();
  const providerSelection = options.providerOverride ?? {
    key: config.providerKey,
  };
  const provider = createImageryProvider(
    providerSelection.key,
    providerSelection.customConfig,
    {
    ellipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
    },
  );
  const providerConstructorMs = now() - providerStart;

  const processorStart = now();
  const processer = new CesiumTileProcesser({
    slotCount: config.slotCount,
    outputType: config.outputType,
    maxImageCacheSize: config.maxImageCacheSize,
    maxResultCacheSize: config.maxResultCacheSize,
    benchmarkObserver: controls.stageCollector,
  });
  const processorConstructorMs = now() - processorStart;

  const managerStart = now();
  const manager = new SimpleGeoReconstructManager({
    provider,
    processer,
    anchorPlateId: config.anchorPlateId,
    featureSource: { url: config.featureUrl },
    rotationSources: config.rotationSources,
    initialAge: config.initialAgeMa,
    primitiveTransformMode: transformMode,
    referenceEllipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
    tileRequestConcurrency: config.tileRequestConcurrency,
    primitiveBatchSize: config.primitiveBatchSize,
    renderRectangleSubdivision: controls.renderRectangleSubdivision,
    benchmarkObserver: controls.stageCollector,
  });
  const managerConstructorMs = now() - managerStart;

  const initStart = now();
  await manager.init();
  const managerInitMs = now() - initStart;
  return {
    processer,
    manager,
    providerConstructorMs,
    processorConstructorMs,
    managerConstructorMs,
    managerInitMs,
    totalReadyMs: now() - totalStart,
  };
}

function destroyRuntime(viewer: Viewer, runtime: BenchmarkRuntime) {
  runtime.manager.destroy(viewer);
  runtime.processer.destroy();
  viewer.scene.requestRender();
}

function snapshot(runtime: BenchmarkRuntime): BenchmarkStatsSnapshot {
  return {
    capturedAtMs: now(),
    manager: runtime.manager.getStats(),
    processor: runtime.processer.getPoolStats(),
    generationReport: runtime.manager.getLastGenerationReport(),
    jsHeap: captureJsHeap(),
  };
}

async function waitForRuntimeIdle(
  runtime: BenchmarkRuntime,
  config: PerformanceBenchmarkConfig,
) {
  const start = now();
  while (true) {
    const state = snapshot(runtime);
    const reportComplete = state.generationReport?.backgroundComplete ?? true;
    const idle =
      state.manager.pendingCompositeTileCount === 0 &&
      state.processor.busyRendererCount === 0 &&
      state.processor.queuedJobCount === 0 &&
      state.processor.pendingExportCount === 0 &&
      state.processor.pendingImagePromiseCount === 0 &&
      state.processor.pendingResultPromiseCount === 0 &&
      reportComplete;
    if (idle) {
      return;
    }
    if (now() - start > config.idleTimeoutMs) {
      throw new Error(
        "Timed out while waiting for the RTL runtime to become idle.",
      );
    }
    for (let index = 0; index < config.pollIntervalFrames; index++) {
      await waitForAnimationFrame();
    }
  }
}

async function waitForRenderedFrames(
  viewer: Viewer,
  frameCount: number,
  timeoutMs: number,
) {
  for (let index = 0; index < frameCount; index++) {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        removePostRender();
        reject(
          new Error("Timed out while waiting for a Cesium postRender event."),
        );
      }, timeoutMs);
      const removePostRender = viewer.scene.postRender.addEventListener(() => {
        window.clearTimeout(timeoutId);
        removePostRender();
        resolve();
      });
      viewer.scene.requestRender();
    });
  }
}

async function setBenchmarkSceneMode(
  viewer: Viewer,
  transformMode: PrimitiveTransformMode,
  config: PerformanceBenchmarkConfig,
  camera: "global" | "w1" = "global",
) {
  if (transformMode === "bakedInstance") {
    if (viewer.scene.mode !== SceneMode.SCENE2D) {
      viewer.scene.morphTo2D(0);
    }
    viewer.camera.setView({
      destination: Rectangle.fromDegrees(-180, -90, 180, 90),
    });
  } else {
    applyPoseView(
      viewer,
      camera === "w1" ? config.w1Camera : config.globalCamera,
    );
  }
  await waitForRenderedFrames(viewer, 1, config.idleTimeoutMs);
}

function buildLoadAssertions(
  state: BenchmarkStatsSnapshot,
  expectedPartsPerComposite: number,
): BenchmarkAssertion[] {
  const report = state.generationReport;
  const completed = report
    ? report.currentVisibleCompletedCount + report.prewarmCompletedCount
    : 0;
  const failed = report
    ? report.currentVisibleFailedCount + report.prewarmFailedCount
    : 0;
  const accounted = completed + failed + (report?.cancelledTaskCount ?? 0);

  return [
    assertion(
      "task-partition-accounting",
      (report?.currentVisibleTaskCount ?? 0) + (report?.prewarmTaskCount ?? 0),
      report?.selectedTaskCount ?? 0,
    ),
    assertion(
      "task-outcome-accounting",
      accounted,
      report?.selectedTaskCount ?? 0,
    ),
    assertion("failed-tasks", failed, 0),
    assertion("cancelled-tasks", report?.cancelledTaskCount ?? 0, 0),
    assertion(
      "record-count",
      state.manager.loadedCompositeTileCount,
      completed,
    ),
    assertion(
      "primitive-ready",
      state.manager.readyPrimitiveCount,
      state.manager.primitiveCount,
    ),
    assertion(
      "retained-image-count",
      state.manager.retainedImageAssetCount,
      state.manager.loadedCompositeTileCount,
    ),
    assertion(
      "render-rectangle-parts",
      state.manager.renderRectanglePartCount,
      state.manager.loadedCompositeTileCount * expectedPartsPerComposite,
    ),
    assertion(
      "texture-estimate-present",
      state.manager.loadedCompositeTileCount === 0 ||
        state.manager.estimatedTextureRgbaBytes > 0,
      true,
    ),
    assertion(
      "source-composite-order",
      state.manager.sourceFeatureContributionCount >=
        state.manager.compositeTaskCount,
      true,
    ),
    assertion(
      "composite-raw-order",
      state.manager.compositeTaskCount >= state.manager.uniqueRawTileCount,
      true,
    ),
    ...buildIdleAssertions(state),
  ];
}

function buildAgeAssertions(
  before: BenchmarkStatsSnapshot,
  after: BenchmarkStatsSnapshot,
  transformMode: PrimitiveTransformMode,
): BenchmarkAssertion[] {
  const createdDelta =
    after.manager.primitiveCreatedCount - before.manager.primitiveCreatedCount;
  return [
    assertion(
      "processor-call-reuse",
      after.processor.totalRequests - before.processor.totalRequests,
      0,
    ),
    assertion(
      "source-image-reuse",
      after.processor.imageRequestAttempts -
        before.processor.imageRequestAttempts,
      0,
    ),
    assertion(
      "webgl-job-reuse",
      after.processor.renderedJobCount - before.processor.renderedJobCount,
      0,
    ),
    assertion(
      "dynamic-primitive-reuse",
      transformMode === "dynamic3D" ? createdDelta : createdDelta >= 0,
      transformMode === "dynamic3D" ? 0 : true,
    ),
    assertion(
      "visible-primitive-ready",
      after.manager.readyPrimitiveCount,
      after.manager.primitiveCount,
    ),
    assertion("webgl-context-loss", after.processor.contextLostCount, 0),
  ];
}

function buildIdleAssertions(
  state: BenchmarkStatsSnapshot,
): BenchmarkAssertion[] {
  return [
    assertion("manager-pending", state.manager.pendingCompositeTileCount, 0),
    assertion("renderer-busy", state.processor.busyRendererCount, 0),
    assertion("render-queue", state.processor.queuedJobCount, 0),
    assertion("export-queue", state.processor.pendingExportCount, 0),
    assertion("image-promises", state.processor.pendingImagePromiseCount, 0),
    assertion("result-promises", state.processor.pendingResultPromiseCount, 0),
    assertion("webgl-context-loss", state.processor.contextLostCount, 0),
  ];
}

function assertion(
  name: string,
  observed: number | string | boolean,
  expected: number | string | boolean,
): BenchmarkAssertion {
  return {
    name,
    passed: observed === expected,
    observed,
    expected,
  };
}

function collectEnvironment(
  viewer: Viewer,
  stats: CesiumTileProcesserStats,
): BenchmarkEnvironment {
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
  };
  return {
    collectedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform:
      navigatorWithMemory.userAgentData?.platform ??
      navigator.platform ??
      "unknown",
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? null,
    viewportCssWidth: viewer.scene.canvas.clientWidth,
    viewportCssHeight: viewer.scene.canvas.clientHeight,
    devicePixelRatio: window.devicePixelRatio,
    cesiumVersion: cesiumPackage.version,
    webgl: {
      webglVersion: stats.webglVersion,
      shadingLanguageVersion: stats.shadingLanguageVersion,
      vendor: stats.vendor,
      renderer: stats.renderer,
    },
  };
}

function findFirstProcessorStats(
  records: BenchmarkReplicateRecord[],
): CesiumTileProcesserStats {
  const first = records[0];
  if (!first) {
    throw new Error("The benchmark did not produce any records.");
  }
  if (first.kind === "initialization") {
    return first.finalSnapshot.processor;
  }
  if (first.kind === "load") {
    return first.atIdle.processor;
  }
  const firstTransition = first.transitions[0];
  if (!firstTransition) {
    throw new Error("The age benchmark did not produce any transitions.");
  }
  return firstTransition.atPresent.processor;
}

function resolveConfig(
  config: PerformanceBenchmarkConfig,
  options: RunBenchmarkOptions,
): PerformanceBenchmarkConfig {
  return {
    ...cloneConfig(config),
    warmupRuns: options.warmupRuns ?? config.warmupRuns,
    measuredBlocks: options.measuredBlocks ?? config.measuredBlocks,
    randomSeed: options.randomSeed ?? config.randomSeed,
  };
}

function resolveConditions(conditionIds?: BenchmarkConditionId[]) {
  const conditions = conditionIds ?? DEFAULT_CONDITIONS;
  if (conditions.length === 0) {
    throw new Error("Select at least one benchmark condition.");
  }
  return Array.from(new Set(conditions));
}

function cloneConfig(config: PerformanceBenchmarkConfig) {
  return {
    ...config,
    ageSequenceMa: [...config.ageSequenceMa],
    levels: [...config.levels],
    rotationSources: [...config.rotationSources],
    w1RectangleDegrees: { ...config.w1RectangleDegrees },
    globalCamera: { ...config.globalCamera },
    w1Camera: { ...config.w1Camera },
  };
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  for (let index = items.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function createRecordId(
  profile: string,
  conditionId: string,
  warmup: boolean,
  blockIndex: number | null,
  replicateIndex: number,
) {
  const phase = warmup ? "warmup" : `block-${blockIndex ?? "none"}`;
  return `${profile}:${conditionId}:${phase}:replicate-${replicateIndex}`;
}

function captureJsHeap() {
  const memory = (
    performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    }
  ).memory;
  if (!memory) {
    const unsupported: MetricValue<number> = {
      status: "unsupported",
      reason: "performance.memory is unavailable in this browser.",
    };
    return {
      usedJSHeapSize: unsupported,
      totalJSHeapSize: unsupported,
      jsHeapSizeLimit: unsupported,
    };
  }
  return {
    usedJSHeapSize: measured(memory.usedJSHeapSize, "bytes"),
    totalJSHeapSize: measured(memory.totalJSHeapSize, "bytes"),
    jsHeapSizeLimit: measured(memory.jsHeapSizeLimit, "bytes"),
  };
}

async function appendCheckpoint(
  checkpoints: ResourceCheckpoint[],
  recordId: string,
  checkpoint: BenchmarkCheckpointName,
  profile: "paper" | "diagnostic",
) {
  if (profile !== "diagnostic") {
    return;
  }
  const pageTimeMs = performance.now();
  const request = {
    recordId,
    checkpoint,
    pageTimeMs,
    epochMs: performance.timeOrigin + pageTimeMs,
    jsHeap: captureJsHeap(),
  };
  let external: unknown = {
    status: "unsupported",
    reason: "The benchmark runner checkpoint binding is unavailable.",
  };
  if (window.__rtlBenchmarkCheckpoint) {
    try {
      external = await window.__rtlBenchmarkCheckpoint(request);
    } catch (error) {
      external = {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  checkpoints.push({ ...request, external });
}

function measured<T>(value: T, unit: string): MetricValue<T> {
  return { status: "measured", value, unit };
}

function now() {
  return performance.now();
}

declare global {
  interface Window {
    __rtlPerformanceBenchmark?: PerformanceBenchmarkController;
    __rtlBenchmarkCheckpoint?: (request: {
      recordId: string;
      checkpoint: BenchmarkCheckpointName;
      epochMs: number;
      pageTimeMs: number;
      jsHeap: ReturnType<typeof captureJsHeap>;
    }) => Promise<unknown>;
  }
}

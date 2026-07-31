import type {
  ReconstructableTileLayerStats,
  ReconstructionTaskReport,
  PrimitiveTransformMode,
} from "reconstructable-tile-layer";
import type { WebGLTileProcessorStats } from "rtl-webgl-tile-processor";
import type {
  ProviderKey,
  UrlTemplateProviderConfig,
} from "../cesium/providers";

export type BenchmarkProfile = "paper" | "diagnostic";

export type BenchmarkConditionId =
  | "initialization"
  | "level-0"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4"
  | "level-0-split-l2-extent"
  | "level-1-split-l2-extent"
  | "view-w1-level-4"
  | "network-macrostrat-w1-level-4"
  | "age-dynamic-3d"
  | "age-baked-2d";

export type LoadBenchmarkConditionId = Exclude<
  BenchmarkConditionId,
  "initialization" | "age-dynamic-3d" | "age-baked-2d"
>;

export type BenchmarkStageName =
  | "task-gen"
  | "provider"
  | "masking"
  | "geometry-creation"
  | "first-frame";

export type BenchmarkStageTiming = {
  stage: BenchmarkStageName;
  startTimeMs: number;
  endTimeMs: number;
  windowMs: number;
  operationSumMs: number;
  operationCount: number;
};

export type MetricValue<T> =
  | { status: "measured"; value: T; unit: string }
  | { status: "unsupported"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "error"; message: string };

export type JsHeapSnapshot = {
  usedJSHeapSize: MetricValue<number>;
  totalJSHeapSize: MetricValue<number>;
  jsHeapSizeLimit: MetricValue<number>;
};

export type GpuFrameTiming = {
  extension: string | null;
  elapsedNanoseconds: MetricValue<number>;
  disjoint: boolean | null;
};

export type BenchmarkCheckpointName =
  | "beforeCondition"
  | "atReturn"
  | "afterFirstFrame"
  | "atPresent"
  | "atIdle"
  | "afterDestroySettled";

export type ResourceCheckpoint = {
  recordId: string;
  checkpoint: BenchmarkCheckpointName;
  epochMs: number;
  pageTimeMs: number;
  jsHeap: JsHeapSnapshot;
  external: unknown;
};

export type BenchmarkRectangleDegrees = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PerformanceBenchmarkConfig = {
  schemaVersion: 2;
  warmupRuns: number;
  measuredBlocks: number;
  randomSeed: number;
  idleTimeoutMs: number;
  pollIntervalFrames: number;
  providerKey: "gplates-topography-4326";
  featureUrl: string;
  rotationSources: string[];
  anchorPlateId: string;
  initialAgeMa: number;
  ageSequenceMa: number[];
  levels: number[];
  tileRequestConcurrency: number;
  primitiveBatchSize: number;
  slotCount: number;
  outputType: "canvas";
  maxImageCacheSize: number;
  maxResultCacheSize: number;
  splitMaximumAngularExtentRadians: number;
  w1RectangleDegrees: BenchmarkRectangleDegrees;
  globalCamera: BenchmarkCamera3D;
  w1Camera: BenchmarkCamera3D;
};

export type BenchmarkCamera3D = {
  targetLon: number;
  targetLat: number;
  range: number;
  heading: number;
  pitch: number;
  roll: number;
  orthographic: boolean;
};

export type BenchmarkStatsSnapshot = {
  capturedAtMs: number;
  manager: ReconstructableTileLayerStats;
  processor: WebGLTileProcessorStats;
  generationReport: ReconstructionTaskReport | null;
  jsHeap: JsHeapSnapshot;
};

export type BenchmarkAssertion = {
  name: string;
  passed: boolean;
  observed: number | string | boolean;
  expected: number | string | boolean;
};

type BaseBenchmarkRecord = {
  recordId: string;
  profile: BenchmarkProfile;
  warmup: boolean;
  blockIndex: number | null;
  replicateIndex: number;
  performanceTimeOriginMs: number;
  resourceCheckpoints: ResourceCheckpoint[];
};

export type InitializationBenchmarkRecord = BaseBenchmarkRecord & {
  kind: "initialization";
  conditionId: "initialization";
  providerConstructorMs: number;
  processorConstructorMs: number;
  managerConstructorMs: number;
  managerInitMs: number;
  totalReadyMs: number;
  finalSnapshot: BenchmarkStatsSnapshot;
  assertions: BenchmarkAssertion[];
};

export type LoadBenchmarkRecord = BaseBenchmarkRecord & {
  kind: "load";
  conditionId: LoadBenchmarkConditionId;
  level: number;
  viewRectangleDegrees: BenchmarkRectangleDegrees | null;
  renderRectangleMode: "original" | "split-l2-extent";
  renderRectanglePartCount: number;
  returnMs: number;
  firstFrameMs: number;
  presentMs: number;
  idleMs: number;
  stageTimings: BenchmarkStageTiming[];
  firstFrameGpu: GpuFrameTiming;
  before: BenchmarkStatsSnapshot;
  atReturn: BenchmarkStatsSnapshot;
  atPresent: BenchmarkStatsSnapshot;
  atIdle: BenchmarkStatsSnapshot;
  foregroundProcessorSnapshot: WebGLTileProcessorStats | null;
  assertions: BenchmarkAssertion[];
};

export type AgeTransitionRecord = {
  fromAgeMa: number;
  toAgeMa: number;
  visitIndex: number;
  returnMs: number;
  presentMs: number;
  before: BenchmarkStatsSnapshot;
  atReturn: BenchmarkStatsSnapshot;
  atPresent: BenchmarkStatsSnapshot;
  assertions: BenchmarkAssertion[];
};

export type AgeBenchmarkRecord = BaseBenchmarkRecord & {
  kind: "age";
  conditionId: "age-dynamic-3d" | "age-baked-2d";
  transformMode: PrimitiveTransformMode;
  sceneMode: "SCENE3D" | "SCENE2D";
  preparationIdleMs: number;
  transitions: AgeTransitionRecord[];
  assertions: BenchmarkAssertion[];
};

export type BenchmarkReplicateRecord =
  | InitializationBenchmarkRecord
  | LoadBenchmarkRecord
  | AgeBenchmarkRecord;

export type BenchmarkEnvironment = {
  collectedAt: string;
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemoryGiB: number | null;
  viewportCssWidth: number;
  viewportCssHeight: number;
  devicePixelRatio: number;
  cesiumVersion: string;
  webgl: {
    webglVersion: string;
    shadingLanguageVersion: string;
    vendor: string;
    renderer: string;
  };
};

export type BenchmarkSuiteResult = {
  schemaVersion: 2;
  profile: BenchmarkProfile;
  startedAt: string;
  completedAt: string;
  config: PerformanceBenchmarkConfig;
  environment: BenchmarkEnvironment;
  executionOrder: BenchmarkConditionId[];
  records: BenchmarkReplicateRecord[];
};

export type BenchmarkProviderOverride = {
  key: ProviderKey;
  customConfig?: UrlTemplateProviderConfig;
};

export type RunBenchmarkOptions = {
  profile?: BenchmarkProfile;
  conditions?: BenchmarkConditionId[];
  warmupRuns?: number;
  measuredBlocks?: number;
  randomSeed?: number;
  providerOverride?: BenchmarkProviderOverride;
};

export type BenchmarkCheckpointRequest = Omit<
  ResourceCheckpoint,
  "external"
>;

export type PerformanceBenchmarkController = {
  getConfig: () => PerformanceBenchmarkConfig;
  getLastResult: () => BenchmarkSuiteResult | null;
  run: (options?: RunBenchmarkOptions) => Promise<BenchmarkSuiteResult>;
  downloadLastResult: () => void;
};

import type {
  GeoTileStats,
  PrimitiveTransformMode,
  TileGenerationReport,
} from "simple-geo-reconstruct";
import type { CesiumTileProcesserStats } from "tile-processer-webgl";

export type BenchmarkConditionId =
  | "initialization"
  | "level-0"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4"
  | "view-w1-level-4"
  | "age-dynamic-3d"
  | "age-baked-2d";

export type BenchmarkRectangleDegrees = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PerformanceBenchmarkConfig = {
  schemaVersion: 1;
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
  manager: GeoTileStats;
  processor: CesiumTileProcesserStats;
  generationReport: TileGenerationReport | null;
};

export type BenchmarkAssertion = {
  name: string;
  passed: boolean;
  observed: number | string | boolean;
  expected: number | string | boolean;
};

export type InitializationBenchmarkRecord = {
  kind: "initialization";
  conditionId: "initialization";
  warmup: boolean;
  blockIndex: number | null;
  replicateIndex: number;
  providerConstructorMs: number;
  processorConstructorMs: number;
  managerConstructorMs: number;
  managerInitMs: number;
  totalReadyMs: number;
  finalSnapshot: BenchmarkStatsSnapshot;
  assertions: BenchmarkAssertion[];
};

export type LoadBenchmarkRecord = {
  kind: "load";
  conditionId: Extract<
    BenchmarkConditionId,
    `level-${number}` | "view-w1-level-4"
  >;
  warmup: boolean;
  blockIndex: number | null;
  replicateIndex: number;
  level: number;
  viewRectangleDegrees: BenchmarkRectangleDegrees | null;
  returnMs: number;
  presentMs: number;
  idleMs: number;
  before: BenchmarkStatsSnapshot;
  atReturn: BenchmarkStatsSnapshot;
  atPresent: BenchmarkStatsSnapshot;
  atIdle: BenchmarkStatsSnapshot;
  foregroundProcessorSnapshot: CesiumTileProcesserStats | null;
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

export type AgeBenchmarkRecord = {
  kind: "age";
  conditionId: "age-dynamic-3d" | "age-baked-2d";
  warmup: boolean;
  blockIndex: number | null;
  replicateIndex: number;
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
  webgl: CesiumTileProcesserStats extends infer _Stats
    ? {
        webglVersion: string;
        shadingLanguageVersion: string;
        vendor: string;
        renderer: string;
      }
    : never;
};

export type BenchmarkSuiteResult = {
  schemaVersion: 1;
  startedAt: string;
  completedAt: string;
  config: PerformanceBenchmarkConfig;
  environment: BenchmarkEnvironment;
  executionOrder: BenchmarkConditionId[];
  records: BenchmarkReplicateRecord[];
};

export type RunBenchmarkOptions = {
  conditions?: BenchmarkConditionId[];
  warmupRuns?: number;
  measuredBlocks?: number;
  randomSeed?: number;
};

export type PerformanceBenchmarkController = {
  getConfig: () => PerformanceBenchmarkConfig;
  getLastResult: () => BenchmarkSuiteResult | null;
  run: (options?: RunBenchmarkOptions) => Promise<BenchmarkSuiteResult>;
  downloadLastResult: () => void;
};

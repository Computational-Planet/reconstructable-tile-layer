import type {
  SimpleGeoReconstructBenchmarkObserver,
  SimpleGeoReconstructBenchmarkStage,
} from "simple-geo-reconstruct";
import type {
  TileProcesserBenchmarkObserver,
  TileProcesserBenchmarkStage,
} from "tile-processer-webgl";
import type {
  BenchmarkStageName,
  BenchmarkStageTiming,
} from "./performanceBenchmarkTypes";

type StageAccumulator = {
  firstStartMs: number;
  lastEndMs: number;
  operationSumMs: number;
  operationCount: number;
  frozen: boolean;
};

export class PerformanceStageCollector
  implements
    SimpleGeoReconstructBenchmarkObserver,
    TileProcesserBenchmarkObserver
{
  private readonly stages = new Map<BenchmarkStageName, StageAccumulator>();

  onStageOperation(
    stage:
      | SimpleGeoReconstructBenchmarkStage
      | TileProcesserBenchmarkStage
      | "first-frame",
    startTimeMs: number,
    endTimeMs: number,
  ) {
    const current = this.stages.get(stage);
    if (current?.frozen) {
      return;
    }
    const durationMs = Math.max(0, endTimeMs - startTimeMs);
    this.stages.set(stage, {
      firstStartMs: Math.min(current?.firstStartMs ?? startTimeMs, startTimeMs),
      lastEndMs: Math.max(current?.lastEndMs ?? endTimeMs, endTimeMs),
      operationSumMs: (current?.operationSumMs ?? 0) + durationMs,
      operationCount: (current?.operationCount ?? 0) + 1,
      frozen: false,
    });
  }

  freeze(stageNames: BenchmarkStageName[]) {
    stageNames.forEach((stage) => {
      const current = this.stages.get(stage);
      if (current) {
        current.frozen = true;
      }
    });
  }

  finalize(recordId: string): BenchmarkStageTiming[] {
    const timings = ALL_STAGES.map((stage) => {
      const current = this.stages.get(stage);
      if (!current) {
        return {
          stage,
          startTimeMs: 0,
          endTimeMs: 0,
          windowMs: 0,
          operationSumMs: 0,
          operationCount: 0,
        };
      }

      const startName = `rtl:${recordId}:${stage}:start`;
      const endName = `rtl:${recordId}:${stage}:end`;
      performance.mark(startName, { startTime: current.firstStartMs });
      performance.mark(endName, { startTime: current.lastEndMs });
      performance.measure(`rtl:${recordId}:${stage}`, startName, endName);
      return {
        stage,
        startTimeMs: current.firstStartMs,
        endTimeMs: current.lastEndMs,
        windowMs: current.lastEndMs - current.firstStartMs,
        operationSumMs: current.operationSumMs,
        operationCount: current.operationCount,
      };
    });

    performance.clearMarks(`rtl:${recordId}`);
    ALL_STAGES.forEach((stage) => {
      performance.clearMarks(`rtl:${recordId}:${stage}:start`);
      performance.clearMarks(`rtl:${recordId}:${stage}:end`);
      performance.clearMeasures(`rtl:${recordId}:${stage}`);
    });
    return timings;
  }
}

const ALL_STAGES: BenchmarkStageName[] = [
  "task-gen",
  "provider",
  "masking",
  "geometry-creation",
  "first-frame",
];

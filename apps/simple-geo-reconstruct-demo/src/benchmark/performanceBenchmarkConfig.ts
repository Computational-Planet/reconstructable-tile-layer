import type { PerformanceBenchmarkConfig } from "./performanceBenchmarkTypes";

/**
 * Versioned defaults for the manuscript benchmark.
 *
 * W1 is expressed in the reconstructed display frame because the manager
 * inverse-rotates that view before querying source tiles in modern coordinates.
 * Keeping the rectangle separate from the camera pose makes tile selection
 * deterministic even when browser camera calculations vary slightly.
 */
export const DEFAULT_PERFORMANCE_BENCHMARK_CONFIG: PerformanceBenchmarkConfig =
  {
    schemaVersion: 1,
    warmupRuns: 3,
    measuredBlocks: 10,
    randomSeed: 20260710,
    idleTimeoutMs: 10 * 60 * 1000,
    pollIntervalFrames: 1,
    providerKey: "gplates-topography-4326",
    featureUrl:
      "/features/Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz",
    rotationSources: [
      "/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot",
    ],
    anchorPlateId: "0",
    initialAgeMa: 120,
    ageSequenceMa: [50, 120, 200, 400, 50],
    levels: [0, 1, 2, 3, 4],
    tileRequestConcurrency: 64,
    primitiveBatchSize: 32,
    slotCount: 4,
    outputType: "canvas",
    maxImageCacheSize: 256,
    maxResultCacheSize: 512,
    // Benchmark W1: northern-to-central South Atlantic at 120 Ma.
    w1RectangleDegrees: {
      west: -50,
      south: -25,
      east: 20,
      north: 10,
    },
    globalCamera: {
      targetLon: 0,
      targetLat: 0,
      range: 16_000_000,
      heading: 0,
      pitch: -90,
      roll: 0,
      orthographic: false,
    },
    w1Camera: {
      targetLon: -15,
      targetLat: -7.5,
      range: 7_500_000,
      heading: 0,
      pitch: -90,
      roll: 0,
      orthographic: false,
    },
  };

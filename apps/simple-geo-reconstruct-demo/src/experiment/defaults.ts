/** Provides default experiment controls for the demo startup state. */
import type { ExperimentViewConfig } from "./types";

export function createDefaultExperimentViewConfig(): ExperimentViewConfig {
  const viewportWidth =
    typeof window === "undefined" ? 1280 : Math.round(window.innerWidth);
  const viewportHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight);

  return {
    caseId: "case1",
    modelName: "Matthews static polygons",
    viewMode: "3D_GLOBE",
    extent: {
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    },
    camera3D: {
      targetLon: 0,
      targetLat: 0,
      range: 16000000,
      heading: 0,
      pitch: -90,
      roll: 0,
      orthographic: false,
    },
    output: {
      width: viewportWidth,
      height: viewportHeight,
      pixelRatio: 1,
    },
  };
}

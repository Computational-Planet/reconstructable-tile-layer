/** Provides default experiment controls for the demo startup state. */
import type { ExperimentViewConfig, ExperimentViewPreset } from "./types";

export const EXPERIMENT_VIEW_PRESETS: Record<
  ExperimentViewPreset,
  { label: string; targetLon: number; targetLat: number }
> = {
  antimeridian: { label: "Antimeridian (±180°)", targetLon: 180, targetLat: 0 },
  "south-pole": { label: "South Pole", targetLon: 0, targetLat: -90 },
  "north-pole": { label: "North Pole", targetLon: 0, targetLat: 90 },
};

export function createDefaultExperimentViewConfig(): ExperimentViewConfig {
  const viewportWidth =
    typeof window === "undefined" ? 1280 : Math.round(window.innerWidth);
  const viewportHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight);

  return {
    caseId: "case1",
    modelName: "Matthews static polygons",
    viewMode: "3D_ORTHOGRAPHIC",
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
      orthographic: true,
    },
    output: {
      width: viewportWidth,
      height: viewportHeight,
      pixelRatio: 1,
    },
  };
}

/** Builds downloadable experiment metadata from the current demo runtime. */
import { Math as CesiumMath, SceneMode, type Viewer } from "cesium";
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
  SimpleGeoReconstructManager,
} from "simple-geo-reconstruct";
import type { CesiumTileProcesser } from "tile-processer-webgl";

import {
  getCentralMeridian,
  getExperimentProjection,
  getExperimentViewMode,
  getSceneModeName,
  isOrthographicCamera,
  rectangleToDegrees,
} from "../cesium/cameraControls";
import {
  PROVIDER_OPTIONS,
  type ProviderKey,
  type UrlTemplateProviderConfig,
} from "../cesium/providers";
import type { FeaturePresetKey, RotationPresetKey } from "../dataSources";
import { roundNumber } from "../utils/numbers";
import type { ExperimentExportInfo, ExperimentViewConfig } from "./types";

export type ExperimentExportContext = {
  age: number;
  customProviderConfig: UrlTemplateProviderConfig;
  debugEnabled: boolean;
  experimentViewConfig: ExperimentViewConfig;
  featurePresetKey: FeaturePresetKey;
  featureUrl: string;
  globeBaseColor: string;
  initialized: boolean;
  level: number;
  manager: SimpleGeoReconstructManager | null;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  rotationFiles: string[];
  rotPresetKey: RotationPresetKey;
  stats: GeoTileStats | null;
  status: string;
  tileProcesser: CesiumTileProcesser | null;
  viewer: Viewer;
};

function sanitizeFileSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_") || "experiment";
}

function getProviderLabel(providerKey: ProviderKey) {
  return (
    PROVIDER_OPTIONS.find((provider) => provider.key === providerKey)?.label ??
    providerKey
  );
}

export function createExportBaseName(
  config: ExperimentViewConfig,
  age: number,
  exportedAt: Date,
) {
  const timestamp = exportedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const ageSegment = `${roundNumber(age, 3)}`.replace(".", "p");
  return `${sanitizeFileSegment(config.caseId)}_${ageSegment}Ma_${timestamp}`;
}

export function createExperimentExportInfo(
  context: ExperimentExportContext,
  exportedAt: Date,
  exportBaseName: string,
): ExperimentExportInfo {
  const { camera, scene } = context.viewer;
  const viewRectangle = camera.computeViewRectangle(scene.globe.ellipsoid);
  const extent = viewRectangle
    ? {
        west: roundNumber(rectangleToDegrees(viewRectangle).west),
        south: roundNumber(rectangleToDegrees(viewRectangle).south),
        east: roundNumber(rectangleToDegrees(viewRectangle).east),
        north: roundNumber(rectangleToDegrees(viewRectangle).north),
      }
    : undefined;
  const position = camera.positionCartographic;
  const canvas = scene.canvas;
  const providerLabel = getProviderLabel(context.providerKey);
  const orthographic = isOrthographicCamera(context.viewer);

  return {
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    exportBaseName,
    caseId: context.experimentViewConfig.caseId,
    modelName: context.experimentViewConfig.modelName,
    rotationFile: context.rotationFiles[0] ?? "",
    rotationFiles: context.rotationFiles,
    platePolygonFile: context.featureUrl,
    timeMa: context.age,
    viewMode: getExperimentViewMode(scene.mode),
    projection: getExperimentProjection(
      scene.mode,
      context.providerKey,
      context.customProviderConfig,
    ),
    centralMeridian: roundNumber(getCentralMeridian(extent)),
    extent,
    camera3D:
      scene.mode === SceneMode.SCENE3D
        ? {
            ...context.experimentViewConfig.camera3D,
            heading: roundNumber(CesiumMath.toDegrees(camera.heading)),
            pitch: roundNumber(CesiumMath.toDegrees(camera.pitch)),
            roll: roundNumber(CesiumMath.toDegrees(camera.roll)),
            orthographic,
          }
        : undefined,
    output: {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      pixelRatio: context.viewer.resolutionScale,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      devicePixelRatio:
        typeof window === "undefined" ? 1 : window.devicePixelRatio,
      resolutionScale: context.viewer.resolutionScale,
      configuredCssWidth: context.experimentViewConfig.output.width,
      configuredCssHeight: context.experimentViewConfig.output.height,
      configuredPixelRatio: context.experimentViewConfig.output.pixelRatio,
    },
    layers: {
      rtlLayer: providerLabel,
      plateBoundary: context.initialized,
      controlPoints: false,
      graticule: false,
      backgroundColor: context.globeBaseColor,
      opacity: 1,
    },
    sources: {
      featurePresetKey: context.featurePresetKey,
      featureUrl: context.featureUrl,
      rotationPresetKey: context.rotPresetKey,
      rotUrls: context.rotationFiles,
      providerKey: context.providerKey,
      providerLabel,
      ...(context.providerKey === "custom-url-template"
        ? { customProviderConfig: context.customProviderConfig }
        : {}),
    },
    render: {
      initialized: context.initialized,
      level: context.level,
      polygonRenderIntent: context.polygonRenderIntent,
      primitiveTransformMode: context.primitiveTransformMode,
      debugEnabled: context.debugEnabled,
      status: context.status,
    },
    cesium: {
      sceneMode: getSceneModeName(scene.mode),
      mapProjection: scene.mapProjection.constructor.name,
      camera: {
        longitude: roundNumber(CesiumMath.toDegrees(position.longitude)),
        latitude: roundNumber(CesiumMath.toDegrees(position.latitude)),
        height: roundNumber(position.height, 3),
        heading: roundNumber(CesiumMath.toDegrees(camera.heading)),
        pitch: roundNumber(CesiumMath.toDegrees(camera.pitch)),
        roll: roundNumber(CesiumMath.toDegrees(camera.roll)),
        orthographic,
        frustum: camera.frustum.constructor.name,
      },
    },
    stats: {
      geoTileStats: context.manager?.getStats() ?? context.stats,
      tileProcesserStats: context.tileProcesser?.getPoolStats() ?? null,
    },
  };
}

/** Defines experiment import/export schemas shared by the demo modules. */
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";
import type { CesiumTileProcesser } from "tile-processer-webgl";

import type {
  ProviderKey,
  UrlTemplateProviderConfig,
} from "../cesium/providers";
import type {
  FeaturePresetKey,
  GplatesReferencePolygonKey,
  RotationPresetKey,
} from "../dataSources";

export type GeographicExtent = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ExperimentCamera3D = {
  targetLon: number;
  targetLat: number;
  range: number;
  heading: number;
  pitch: number;
  roll: number;
  orthographic: boolean;
};

export type ExperimentOutputConfig = {
  width: number;
  height: number;
  pixelRatio: number;
};

export type ExperimentViewMode = "2D_RECTANGULAR" | "3D_GLOBE";

export type ExperimentViewConfig = {
  caseId: string;
  modelName: string;
  viewMode: ExperimentViewMode;
  extent: GeographicExtent;
  camera3D: ExperimentCamera3D;
  output: ExperimentOutputConfig;
};

export type ExperimentProjection =
  | "PlateCarree"
  | "WebMercator"
  | "OrthographicGlobe";

export type ExperimentExportInfo = {
  schemaVersion: 1;
  exportedAt: string;
  exportBaseName: string;
  caseId: string;
  modelName: string;
  rotationFile: string;
  rotationFiles: string[];
  platePolygonFile: string;
  timeMa: number;
  viewMode: ExperimentViewMode;
  projection: ExperimentProjection;
  centralMeridian: number;
  extent?: GeographicExtent;
  camera3D?: ExperimentCamera3D;
  output: ExperimentOutputConfig & {
    canvasWidth: number;
    canvasHeight: number;
    devicePixelRatio: number;
    resolutionScale: number;
    configuredCssWidth: number;
    configuredCssHeight: number;
    configuredPixelRatio: number;
  };
  layers: {
    rtlLayer: string;
    plateBoundary: boolean;
    controlPoints: boolean;
    graticule: boolean;
    gplatesReferencePolygons: boolean;
    backgroundColor: string;
    opacity: number;
  };
  sources: {
    featurePresetKey: FeaturePresetKey;
    featureUrl: string;
    gplatesReferencePolygonKey: GplatesReferencePolygonKey;
    gplatesReferencePolygonUrl: string | null;
    rotationPresetKey: RotationPresetKey;
    rotUrls: string[];
    providerKey: ProviderKey;
    providerLabel: string;
    customProviderConfig?: UrlTemplateProviderConfig;
  };
  render: {
    initialized: boolean;
    level: number;
    polygonRenderIntent: string;
    primitiveTransformMode: string;
    debugEnabled: boolean;
    status: string;
  };
  cesium: {
    sceneMode: string;
    mapProjection: string;
    camera: {
      longitude: number;
      latitude: number;
      height: number;
      heading: number;
      pitch: number;
      roll: number;
      orthographic: boolean;
      frustum: string;
    };
  };
  stats: {
    geoTileStats: GeoTileStats | null;
    tileProcesserStats: ReturnType<CesiumTileProcesser["getPoolStats"]> | null;
  };
};

export type ImportedExperimentControlState = {
  age?: number;
  customProviderConfig?: UrlTemplateProviderConfig;
  debugEnabled?: boolean;
  experimentViewConfig?: Partial<ExperimentViewConfig> & {
    camera3D?: Partial<ExperimentCamera3D>;
    extent?: Partial<GeographicExtent>;
    output?: Partial<ExperimentOutputConfig>;
  };
  featurePresetKey?: FeaturePresetKey;
  featureUrl?: string;
  globeBaseColor?: string;
  level?: number;
  polygonRenderIntent?: PolygonRenderIntentMode;
  primitiveTransformMode?: PrimitiveTransformMode;
  providerKey?: ProviderKey;
  referencePolygonKey?: GplatesReferencePolygonKey;
  rotPresetKey?: RotationPresetKey;
  rotUrls?: string[];
};

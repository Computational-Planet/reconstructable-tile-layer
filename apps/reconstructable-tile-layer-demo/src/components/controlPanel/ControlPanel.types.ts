/** Shares control panel props across the grouped section components. */
import type { LocalRasterControls } from "../../hooks/useLocalRaster";
import type { LayerMode, LayerView } from "../../layers/types";
import type {
  ReconstructableTileLayerStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "reconstructable-tile-layer";

import type { ProviderKey, TileServiceConfig } from "../../cesium/providers";
import type {
  FeaturePreset,
  FeaturePresetKey,
  GplatesReferencePolygonKey,
  GplatesReferencePolygonSource,
  RotationAnchorMode,
  RotationPreset,
  RotationPresetKey,
} from "../../dataSources";
import type {
  ExperimentViewConfig,
  ExperimentViewMode,
  ExperimentViewPreset,
} from "../../experiment";

export type ControlPanelProps = {
  selectedLayer: LayerView | null;
  serviceMode: LayerMode;
  onServiceModeChange: (mode: LayerMode) => void;
  localRaster: LocalRasterControls;
  sourceKind: ImagerySourceKind;
  appliedService: AppliedService | null;
  modelNeedsApply: boolean;
  onSourceKindChange: (value: ImagerySourceKind) => void;
  age: number;
  busy: boolean;
  debugEnabled: boolean;
  featurePresetKey: FeaturePresetKey;
  featurePresets: FeaturePreset[];
  featureSourceLabel: string;
  featureUrl: string;
  globeBaseColor: string;
  graticuleEnabled: boolean;
  referencePolygonColor: string;
  referencePolygonKey: GplatesReferencePolygonKey;
  referencePolygonSources: GplatesReferencePolygonSource[];
  serviceConfig: TileServiceConfig;
  experimentViewConfig: ExperimentViewConfig;
  initialized: boolean;
  level: number;
  tileLevelRange?: { minimumLevel: number; maximumLevel?: number };
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  rotationAnchorMode: RotationAnchorMode;
  anchorPlateIdInput: string;
  rotPresetKey: RotationPresetKey;
  rotPresets: RotationPreset[];
  rotSourceLabels: string[];
  rotUrls: string;
  stats: ReconstructableTileLayerStats | null;
  status: string;
  onAgeChange: (value: number) => void;
  onApplyExtentView: () => void;
  onApplyOutputSize: () => void;
  onApplyProvider: () => void;
  onApplyPoseView: () => void;
  onApplyCameraPreset: (value: ExperimentViewPreset) => void;
  onApplyTransformMode: () => void;
  onCaptureScreenshot: () => void;
  onClear: () => void;
  onServiceConfigChange: (value: TileServiceConfig) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onExperimentSceneModeChange: (value: ExperimentViewMode) => void;
  onExperimentViewConfigChange: (value: ExperimentViewConfig) => void;
  onExportInfo: () => void;
  onFeaturePresetChange: (value: FeaturePresetKey) => void;
  onFeatureUpload: (file: File | null) => void;
  onFeatureUrlChange: (value: string) => void;
  onGlobeBaseColorChange: (value: string) => void;
  onGraticuleEnabledChange: (value: boolean) => void;
  onImportExperimentConfig: (file: File | null) => void;
  onLevelChange: (value: number) => void;
  onLoadFineInView: () => void;
  onLoadLevel: () => void;
  onPolygonRenderIntentChange: (value: PolygonRenderIntentMode) => void;
  onPrimitiveTransformModeChange: (value: PrimitiveTransformMode) => void;
  onProviderKeyChange: (value: ProviderKey) => void;
  onReferencePolygonColorChange: (value: string) => void;
  onReferencePolygonKeyChange: (value: GplatesReferencePolygonKey) => void;
  onRotationAnchorModeChange: (value: RotationAnchorMode) => void;
  onAnchorPlateIdInputChange: (value: string) => void;
  onRotPresetChange: (value: RotationPresetKey) => void;
  onRotUpload: (files: FileList | null) => void;
  onRotUrlsChange: (value: string) => void;
};

/** 来源选择是待应用配置；当前生效的服务单独保存，避免把选项误当作地图状态。 */
export type ImagerySourceKind = "tile-service" | "local-raster";
export type AppliedService = {
  config: TileServiceConfig;
  exampleKey: ProviderKey;
  label: string;
  modelKey: string;
};

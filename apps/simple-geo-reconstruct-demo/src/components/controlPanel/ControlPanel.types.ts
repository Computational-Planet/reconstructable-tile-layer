/** Shares control panel props across the grouped section components. */
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import type {
  ProviderKey,
  UrlTemplateProviderConfig,
} from "../../cesium/providers";
import type {
  FeaturePreset,
  FeaturePresetKey,
  GplatesReferencePolygonKey,
  GplatesReferencePolygonSource,
  RotationAnchorMode,
  RotationPreset,
  RotationPresetKey,
} from "../../dataSources";
import type { ExperimentViewConfig, ExperimentViewMode } from "../../experiment";

export type ControlPanelProps = {
  age: number;
  busy: boolean;
  debugEnabled: boolean;
  featurePresetKey: FeaturePresetKey;
  featurePresets: FeaturePreset[];
  featureUrl: string;
  globeBaseColor: string;
  referencePolygonKey: GplatesReferencePolygonKey;
  referencePolygonSources: GplatesReferencePolygonSource[];
  customProviderConfig: UrlTemplateProviderConfig;
  customProviderError: string;
  experimentViewConfig: ExperimentViewConfig;
  initialized: boolean;
  level: number;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  rotationAnchorMode: RotationAnchorMode;
  anchorPlateIdInput: string;
  rotPresetKey: RotationPresetKey;
  rotPresets: RotationPreset[];
  rotUrls: string;
  stats: GeoTileStats | null;
  status: string;
  onAgeChange: (value: number) => void;
  onApplyExtentView: () => void;
  onApplyOutputSize: () => void;
  onApplyProvider: () => void;
  onApplyPoseView: () => void;
  onApplyTransformMode: () => void;
  onCaptureScreenshot: () => void;
  onClear: () => void;
  onCustomProviderConfigChange: (value: UrlTemplateProviderConfig) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onExperimentSceneModeChange: (value: ExperimentViewMode) => void;
  onExperimentViewConfigChange: (value: ExperimentViewConfig) => void;
  onExportInfo: () => void;
  onFeaturePresetChange: (value: FeaturePresetKey) => void;
  onFeatureUpload: (file: File | null) => void;
  onFeatureUrlChange: (value: string) => void;
  onGlobeBaseColorChange: (value: string) => void;
  onInit: () => void;
  onImportExperimentConfig: (file: File | null) => void;
  onLevelChange: (value: number) => void;
  onLoadFineInView: () => void;
  onLoadLevel: () => void;
  onLoadRoot: () => void;
  onPolygonRenderIntentChange: (value: PolygonRenderIntentMode) => void;
  onPrimitiveTransformModeChange: (value: PrimitiveTransformMode) => void;
  onProviderKeyChange: (value: ProviderKey) => void;
  onReferencePolygonKeyChange: (value: GplatesReferencePolygonKey) => void;
  onRotationAnchorModeChange: (value: RotationAnchorMode) => void;
  onAnchorPlateIdInputChange: (value: string) => void;
  onRotPresetChange: (value: RotationPresetKey) => void;
  onRotUpload: (files: FileList | null) => void;
  onRotUrlsChange: (value: string) => void;
  onSaveCustomProviderConfig: () => boolean;
};

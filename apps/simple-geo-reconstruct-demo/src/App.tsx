/** Composes demo state, Cesium runtime hooks, and the control panel UI. */
import { useEffect, useState, type CSSProperties } from "react";
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import {
  applyExtentView,
  applyPoseView,
  applySceneMode,
  makeAppliedOutputSize,
  validateOutputConfig,
} from "./cesium/cameraControls";
import {
  DEFAULT_CUSTOM_PROVIDER_CONFIG,
  DEFAULT_PROVIDER_KEY,
  type ProviderKey,
  type UrlTemplateProviderConfig,
} from "./cesium/providers";
import { ControlPanel } from "./components/ControlPanel";
import {
  FEATURE_PRESETS,
  ROTATION_PRESETS,
} from "./dataSources";
import {
  createDefaultExperimentViewConfig,
  type ExperimentOutputConfig,
  type ExperimentViewMode,
} from "./experiment";
import { useCesiumRuntime } from "./hooks/useCesiumRuntime";
import { useDataSourceControls } from "./hooks/useDataSourceControls";
import { useExperimentIO } from "./hooks/useExperimentIO";
import { useReconstructActions } from "./hooks/useReconstructActions";
import { DEFAULT_GLOBE_BASE_COLOR } from "./cesium/createViewer";

function App() {
  const [age, setAge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [globeBaseColor, setGlobeBaseColor] = useState(
    DEFAULT_GLOBE_BASE_COLOR,
  );
  const [initialized, setInitialized] = useState(false);
  const [level, setLevel] = useState(3);
  const [polygonRenderIntent, setPolygonRenderIntent] =
    useState<PolygonRenderIntentMode>("all-polygons-area");
  const [primitiveTransformMode, setPrimitiveTransformModeState] =
    useState<PrimitiveTransformMode>("dynamic3D");
  const [providerKey, setProviderKey] =
    useState<ProviderKey>(DEFAULT_PROVIDER_KEY);
  const [customProviderConfig, setCustomProviderConfig] =
    useState<UrlTemplateProviderConfig>(DEFAULT_CUSTOM_PROVIDER_CONFIG);
  const [customProviderError, setCustomProviderError] = useState("");
  const [stats, setStats] = useState<GeoTileStats | null>(null);
  const [status, setStatus] = useState("Viewer is starting");
  const [experimentViewConfig, setExperimentViewConfig] = useState(
    createDefaultExperimentViewConfig,
  );
  const [appliedOutputSize, setAppliedOutputSize] =
    useState<ExperimentOutputConfig | null>(null);

  const {
    containerRef,
    managerRef,
    sceneModeCleanupRef,
    tileProcesserRef,
    viewerRef,
  } = useCesiumRuntime({
    appliedOutputSize,
    globeBaseColor,
    onStatusChange: setStatus,
  });

  const dataSourceControls = useDataSourceControls({
    onModelNameChange: (modelName) =>
      setExperimentViewConfig((config) => ({
        ...config,
        modelName,
      })),
    onStatusChange: setStatus,
  });

  useEffect(() => {
    if (debugEnabled) {
      localStorage.setItem("deepTimeGeoDebug", "1");
    } else {
      localStorage.removeItem("deepTimeGeoDebug");
    }
  }, [debugEnabled]);

  const reconstructActions = useReconstructActions({
    age,
    customProviderConfig,
    featureUrl: dataSourceControls.featureUrl,
    initialized,
    level,
    managerRef,
    polygonRenderIntent,
    primitiveTransformMode,
    providerKey,
    rotationSources: dataSourceControls.rotationSources,
    sceneModeCleanupRef,
    setBusy,
    setCustomProviderError,
    setInitialized,
    setProviderKey,
    setStats,
    setStatus,
    tileProcesserRef,
    viewerRef,
  });

  const experimentIO = useExperimentIO({
    age,
    applyImportedFeatureSource: dataSourceControls.applyImportedFeatureSource,
    applyImportedRotationSources:
      dataSourceControls.applyImportedRotationSources,
    customProviderConfig,
    debugEnabled,
    experimentViewConfig,
    featurePresetKey: dataSourceControls.featurePresetKey,
    featureUrl: dataSourceControls.featureUrl,
    globeBaseColor,
    initialized,
    level,
    managerRef,
    polygonRenderIntent,
    primitiveTransformMode,
    providerKey,
    rotationSources: dataSourceControls.rotationSources,
    rotPresetKey: dataSourceControls.rotPresetKey,
    setAge,
    setAppliedOutputSize,
    setBusy,
    setCustomProviderConfig,
    setCustomProviderError,
    setDebugEnabled,
    setExperimentViewConfig,
    setGlobeBaseColor,
    setLevel,
    setPolygonRenderIntent,
    setPrimitiveTransformMode: setPrimitiveTransformModeState,
    setProviderKey,
    setStatus,
    stats,
    status,
    tileProcesserRef,
    viewerRef,
  });

  const handleApplyExtentView = () => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    try {
      applyExtentView(viewer, experimentViewConfig.extent);
      setExperimentViewConfig((config) => ({
        ...config,
        viewMode: "2D_RECTANGULAR",
      }));
      const { west, south, east, north } = experimentViewConfig.extent;
      setStatus(
        `Extent view applied: ${west}, ${south}, ${east}, ${north}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyPoseView = () => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    try {
      applyPoseView(viewer, experimentViewConfig.camera3D);
      setExperimentViewConfig((config) => ({
        ...config,
        viewMode: "3D_GLOBE",
      }));
      setStatus("3D camera pose applied.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExperimentSceneModeChange = (viewMode: ExperimentViewMode) => {
    setExperimentViewConfig((config) => ({
      ...config,
      viewMode,
    }));

    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    try {
      applySceneMode(viewer, viewMode);
      setStatus(
        viewMode === "2D_RECTANGULAR"
          ? "Scene mode set to 2D rectangular."
          : "Scene mode set to 3D globe.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyOutputSize = () => {
    const error = validateOutputConfig(experimentViewConfig.output);
    if (error) {
      setStatus(error);
      return;
    }

    setAppliedOutputSize(makeAppliedOutputSize(experimentViewConfig.output));
    setStatus(
      `Viewer CSS size set to ${experimentViewConfig.output.width} x ${experimentViewConfig.output.height}.`,
    );
  };

  const cesiumContainerStyle: CSSProperties | undefined = appliedOutputSize
    ? {
        width: `${appliedOutputSize.width}px`,
        height: `${appliedOutputSize.height}px`,
      }
    : undefined;

  return (
    <main className="app-shell">
      <ControlPanel
        age={age}
        busy={busy}
        customProviderConfig={customProviderConfig}
        customProviderError={customProviderError}
        debugEnabled={debugEnabled}
        experimentViewConfig={experimentViewConfig}
        featurePresetKey={dataSourceControls.featurePresetKey}
        featurePresets={FEATURE_PRESETS}
        featureUrl={dataSourceControls.featureUrl}
        globeBaseColor={globeBaseColor}
        initialized={initialized}
        level={level}
        polygonRenderIntent={polygonRenderIntent}
        primitiveTransformMode={primitiveTransformMode}
        providerKey={providerKey}
        rotPresetKey={dataSourceControls.rotPresetKey}
        rotPresets={ROTATION_PRESETS}
        rotUrls={dataSourceControls.rotUrls}
        stats={stats}
        status={status}
        onAgeChange={setAge}
        onApplyProvider={reconstructActions.handleApplyProvider}
        onApplyExtentView={handleApplyExtentView}
        onApplyOutputSize={handleApplyOutputSize}
        onApplyPoseView={handleApplyPoseView}
        onApplyTransformMode={reconstructActions.handleApplyTransformMode}
        onCaptureScreenshot={experimentIO.handleCaptureScreenshot}
        onClear={reconstructActions.handleClear}
        onCustomProviderConfigChange={setCustomProviderConfig}
        onDebugEnabledChange={setDebugEnabled}
        onExperimentSceneModeChange={handleExperimentSceneModeChange}
        onExperimentViewConfigChange={setExperimentViewConfig}
        onExportInfo={experimentIO.handleExportInfo}
        onFeaturePresetChange={dataSourceControls.handleFeaturePresetChange}
        onFeatureUpload={dataSourceControls.handleFeatureUpload}
        onFeatureUrlChange={dataSourceControls.handleFeatureUrlChange}
        onGlobeBaseColorChange={setGlobeBaseColor}
        onInit={reconstructActions.handleInit}
        onImportExperimentConfig={experimentIO.handleImportExperimentConfig}
        onLevelChange={setLevel}
        onLoadFineInView={reconstructActions.handleLoadFineInView}
        onLoadLevel={reconstructActions.handleLoadLevel}
        onLoadRoot={reconstructActions.handleLoadRoot}
        onPolygonRenderIntentChange={setPolygonRenderIntent}
        onPrimitiveTransformModeChange={setPrimitiveTransformModeState}
        onProviderKeyChange={setProviderKey}
        onRotPresetChange={dataSourceControls.handleRotPresetChange}
        onRotUpload={dataSourceControls.handleRotUpload}
        onRotUrlsChange={dataSourceControls.handleRotUrlsChange}
        onSaveCustomProviderConfig={
          reconstructActions.handleSaveCustomProviderConfig
        }
      />
      <section className="viewer-workspace" aria-label="Cesium viewer">
        <div className="viewer-stage">
          <div
            ref={containerRef}
            className="cesium-container"
            style={cesiumContainerStyle}
          />
        </div>
      </section>
    </main>
  );
}

export default App;

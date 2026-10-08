/** Composes demo state, Cesium runtime hooks, and the control panel UI. */
import { useEffect, useState, type CSSProperties } from "react";
import type {
  ReconstructableTileLayerStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "reconstructable-tile-layer";

import {
  applyExtentView,
  applyPoseView,
  applySceneMode,
  makeAppliedOutputSize,
  validateOutputConfig,
} from "./cesium/cameraControls";
import {
  DEFAULT_PROVIDER_KEY,
  getServicePreset,
  getServiceLabel,
  type ProviderKey,
  type TileServiceConfig,
} from "./cesium/providers";
import { ControlPanel } from "./components/ControlPanel";
import {
  DEFAULT_ANCHOR_PLATE_ID,
  DEFAULT_GPLATES_REFERENCE_POLYGON_COLOR,
  DEFAULT_GPLATES_REFERENCE_POLYGON_KEY,
  DEFAULT_ROTATION_ANCHOR_MODE,
  FEATURE_PRESETS,
  GPLATES_REFERENCE_POLYGON_SOURCES,
  ROTATION_PRESETS,
  type GplatesReferencePolygonKey,
  type RotationAnchorMode,
} from "./dataSources";
import {
  createDefaultExperimentViewConfig,
  type ExperimentOutputConfig,
  type ExperimentViewMode,
} from "./experiment";
import { useCesiumRuntime } from "./hooks/useCesiumRuntime";
import { useDataSourceControls } from "./hooks/useDataSourceControls";
import { useExperimentIO } from "./hooks/useExperimentIO";
import { useReferencePolygonOverlay } from "./hooks/useReferencePolygonOverlay";
import { useReconstructActions } from "./hooks/useReconstructActions";
import { DEFAULT_GLOBE_BASE_COLOR } from "./cesium/createViewer";
import { useLocalRaster } from "./hooks/useLocalRaster";
import type {
  AppliedService,
  ImagerySourceKind,
} from "./components/controlPanel/ControlPanel.types";

function App() {
  const [age, setAge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [globeBaseColor, setGlobeBaseColor] = useState(DEFAULT_GLOBE_BASE_COLOR);
  const [initialized, setInitialized] = useState(false);
  const [level, setLevel] = useState(4);
  const [polygonRenderIntent, setPolygonRenderIntent] =
    useState<PolygonRenderIntentMode>("all-polygons-area");
  const [primitiveTransformMode, setPrimitiveTransformModeState] =
    useState<PrimitiveTransformMode>("dynamic3D");
  const [providerKey, setProviderKey] = useState<ProviderKey>(DEFAULT_PROVIDER_KEY);
  const [sourceKind, setSourceKind] = useState<ImagerySourceKind>("tile-service");
  const [appliedService, setAppliedService] = useState<AppliedService | null>(null);
  const [referencePolygonKey, setReferencePolygonKey] = useState<GplatesReferencePolygonKey>(
    DEFAULT_GPLATES_REFERENCE_POLYGON_KEY,
  );
  const [referencePolygonColor, setReferencePolygonColor] = useState(
    DEFAULT_GPLATES_REFERENCE_POLYGON_COLOR,
  );
  const [rotationAnchorMode, setRotationAnchorMode] = useState<RotationAnchorMode>(
    DEFAULT_ROTATION_ANCHOR_MODE,
  );
  const [anchorPlateIdInput, setAnchorPlateIdInput] = useState(DEFAULT_ANCHOR_PLATE_ID);
  const [serviceConfig, setServiceConfig] = useState<TileServiceConfig>(() =>
    getServicePreset(DEFAULT_PROVIDER_KEY),
  );
  const [stats, setStats] = useState<ReconstructableTileLayerStats | null>(null);
  const [status, setStatus] = useState("Viewer is starting");
  const [experimentViewConfig, setExperimentViewConfig] = useState(
    createDefaultExperimentViewConfig,
  );
  const [appliedOutputSize, setAppliedOutputSize] = useState<ExperimentOutputConfig | null>(null);

  const { containerRef, managerRef, sceneModeCleanupRef, webglProcessorRef, viewerRef } =
    useCesiumRuntime({
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

  useReferencePolygonOverlay({
    referencePolygonColor,
    referencePolygonKey,
    setStatus,
    viewerRef,
  });

  const resolvedAnchorPlateId =
    rotationAnchorMode === "auto"
      ? null
      : rotationAnchorMode === "default"
        ? DEFAULT_ANCHOR_PLATE_ID
        : anchorPlateIdInput.trim();

  const model = {
    name: experimentViewConfig.modelName,
    featureUrl: dataSourceControls.featureUrl,
    featureLabel: dataSourceControls.featureSourceLabel,
    rotationUrls: dataSourceControls.rotationSources,
    rotationLabels: dataSourceControls.rotSourceLabels,
    anchorPlateId: resolvedAnchorPlateId,
    polygonRenderIntent,
  };
  const modelKey = JSON.stringify(model);
  const clearReconstruction = () => {
    sceneModeCleanupRef.current?.();
    sceneModeCleanupRef.current = null;
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) managerRef.current?.destroy(viewer);
    managerRef.current = null;
    delete window.__simpleGeoReconstructStats;
    setInitialized(false);
    setStats(null);
    setAppliedService(null);
    setStatus("Reconstruction tiles cleared.");
  };
  const localRaster = useLocalRaster({
    viewerRef,
    age,
    setAge,
    setLevel,
    model,
    clearReconstruction,
    applyReconstruction: async (provider): Promise<boolean> => {
      const applied = await reconstructActions.initializeWithProvider(provider);
      if (applied) setAppliedService(null);
      return applied;
    },
  });

  const activeRasterProvider =
    localRaster.applied?.context.role === "modern-reconstructable"
      ? localRaster.applied.provider
      : undefined;
  const reconstructActions = useReconstructActions({
    activeRasterProvider,
    onServiceApplied: () => {
      localRaster.detachForService();
      setLevel((current) =>
        Math.max(
          serviceConfig.minimumLevel,
          Math.min(current, serviceConfig.maximumLevel ?? current),
        ),
      );
      setAppliedService({
        label: getServiceLabel(serviceConfig),
        config: structuredClone(serviceConfig),
        exampleKey: providerKey,
        modelKey,
      });
    },
    age,
    anchorPlateId: resolvedAnchorPlateId,
    serviceConfig,
    featureUrl: dataSourceControls.featureUrl,
    initialized,
    level,
    managerRef,
    polygonRenderIntent,
    primitiveTransformMode,
    rotationSources: dataSourceControls.rotationSources,
    sceneModeCleanupRef,
    setBusy,
    setInitialized,
    setStats,
    setStatus,
    webglProcessorRef,
    viewerRef,
  });

  const experimentIO = useExperimentIO({
    localRaster: localRaster.descriptor,
    appliedService,
    onImportSources: (hasLocalRaster) => {
      localRaster.remove();
      clearReconstruction();
      setSourceKind(hasLocalRaster ? "local-raster" : "tile-service");
    },
    age,
    applyImportedFeatureSource: dataSourceControls.applyImportedFeatureSource,
    applyImportedRotationSources: dataSourceControls.applyImportedRotationSources,
    serviceConfig,
    debugEnabled,
    experimentViewConfig,
    featurePresetKey: dataSourceControls.featurePresetKey,
    featureUrl: dataSourceControls.featureUrl,
    featureSourceLabel: dataSourceControls.featureSourceLabel,
    globeBaseColor,
    initialized,
    level,
    managerRef,
    polygonRenderIntent,
    primitiveTransformMode,
    providerKey,
    referencePolygonColor,
    referencePolygonKey,
    rotationAnchorMode,
    anchorPlateId: resolvedAnchorPlateId,
    rotationSources: dataSourceControls.rotationSources,
    rotPresetKey: dataSourceControls.rotPresetKey,
    rotSourceLabels: dataSourceControls.rotSourceLabels,
    setAge,
    setAppliedOutputSize,
    setBusy,
    setServiceConfig,
    setDebugEnabled,
    setExperimentViewConfig,
    setGlobeBaseColor,
    setLevel,
    setPolygonRenderIntent,
    setPrimitiveTransformMode: setPrimitiveTransformModeState,
    setProviderKey,
    setReferencePolygonColor,
    setReferencePolygonKey,
    setRotationAnchorMode,
    setAnchorPlateIdInput,
    setStatus,
    stats,
    status,
    webglProcessorRef,
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
      setStatus(`Extent view applied: ${west}, ${south}, ${east}, ${north}.`);
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
        localRaster={localRaster}
        sourceKind={sourceKind}
        onSourceKindChange={setSourceKind}
        appliedService={appliedService}
        modelNeedsApply={!!(initialized && appliedService && appliedService.modelKey !== modelKey)}
        age={age}
        busy={busy || localRaster.busy}
        serviceConfig={serviceConfig}
        debugEnabled={debugEnabled}
        experimentViewConfig={experimentViewConfig}
        featurePresetKey={dataSourceControls.featurePresetKey}
        featurePresets={FEATURE_PRESETS}
        featureSourceLabel={dataSourceControls.featureSourceLabel}
        featureUrl={dataSourceControls.featureUrl}
        globeBaseColor={globeBaseColor}
        anchorPlateIdInput={anchorPlateIdInput}
        initialized={initialized}
        level={level}
        tileLevelRange={
          activeRasterProvider
            ? {
                minimumLevel: activeRasterProvider.minimumLevel,
                maximumLevel: activeRasterProvider.maximumLevel,
              }
            : initialized && appliedService
              ? {
                  minimumLevel: appliedService.config.minimumLevel,
                  maximumLevel: appliedService.config.maximumLevel ?? undefined,
                }
              : undefined
        }
        polygonRenderIntent={polygonRenderIntent}
        primitiveTransformMode={primitiveTransformMode}
        providerKey={providerKey}
        referencePolygonColor={referencePolygonColor}
        referencePolygonKey={referencePolygonKey}
        referencePolygonSources={GPLATES_REFERENCE_POLYGON_SOURCES}
        rotationAnchorMode={rotationAnchorMode}
        rotPresetKey={dataSourceControls.rotPresetKey}
        rotPresets={ROTATION_PRESETS}
        rotSourceLabels={dataSourceControls.rotSourceLabels}
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
        onAnchorPlateIdInputChange={setAnchorPlateIdInput}
        onServiceConfigChange={setServiceConfig}
        onDebugEnabledChange={setDebugEnabled}
        onExperimentSceneModeChange={handleExperimentSceneModeChange}
        onExperimentViewConfigChange={setExperimentViewConfig}
        onExportInfo={experimentIO.handleExportInfo}
        onFeaturePresetChange={dataSourceControls.handleFeaturePresetChange}
        onFeatureUpload={dataSourceControls.handleFeatureUpload}
        onFeatureUrlChange={dataSourceControls.handleFeatureUrlChange}
        onGlobeBaseColorChange={setGlobeBaseColor}
        onImportExperimentConfig={experimentIO.handleImportExperimentConfig}
        onLevelChange={setLevel}
        onLoadFineInView={reconstructActions.handleLoadFineInView}
        onLoadLevel={reconstructActions.handleLoadLevel}
        onPolygonRenderIntentChange={setPolygonRenderIntent}
        onPrimitiveTransformModeChange={setPrimitiveTransformModeState}
        onProviderKeyChange={(key) => {
          setProviderKey(key);
          setServiceConfig(getServicePreset(key));
        }}
        onReferencePolygonColorChange={setReferencePolygonColor}
        onReferencePolygonKeyChange={setReferencePolygonKey}
        onRotationAnchorModeChange={setRotationAnchorMode}
        onRotPresetChange={dataSourceControls.handleRotPresetChange}
        onRotUpload={dataSourceControls.handleRotUpload}
        onRotUrlsChange={dataSourceControls.handleRotUrlsChange}
      />
      <section className="viewer-workspace" aria-label="Cesium viewer">
        <div className="viewer-stage">
          <div ref={containerRef} className="cesium-container" style={cesiumContainerStyle} />
        </div>
      </section>
    </main>
  );
}

export default App;

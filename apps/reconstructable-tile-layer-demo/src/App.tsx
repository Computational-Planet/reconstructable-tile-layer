/** Composes demo state, Cesium runtime hooks, and the control panel UI. */
import { useEffect, useState, type CSSProperties } from "react";
import type { PolygonRenderIntentMode, PrimitiveTransformMode } from "reconstructable-tile-layer";

import {
  applyCameraPreset,
  applyExtentView,
  applyPoseView,
  applySceneMode,
  makeAppliedOutputSize,
  validateOutputConfig,
} from "./cesium/cameraControls";
import {
  DEFAULT_PROVIDER_KEY,
  getServicePreset,
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
  EXPERIMENT_VIEW_PRESETS,
  type ExperimentOutputConfig,
  type ExperimentViewMode,
  type ExperimentViewPreset,
} from "./experiment";
import { useCesiumRuntime } from "./hooks/useCesiumRuntime";
import { useDataSourceControls } from "./hooks/useDataSourceControls";
import { useExperimentIO } from "./hooks/useExperimentIO";
import { useGraticuleOverlay } from "./hooks/useGraticuleOverlay";
import { useReferencePolygonOverlay } from "./hooks/useReferencePolygonOverlay";
import { DEFAULT_GLOBE_BASE_COLOR } from "./cesium/createViewer";
import { useLocalRaster } from "./hooks/useLocalRaster";
import { useLocalGeoJson } from "./vector/useLocalGeoJson";
import type { ImagerySourceKind } from "./components/controlPanel/ControlPanel.types";
import { useLayerManager } from "./layers/useLayerManager";
import { LayerPanel } from "./components/layers/LayerPanel";
import type { LayerDefinition, LayerMode } from "./layers/types";
import { useMacrostratLegend } from "./legend/useMacrostratLegend";

function App() {
  const [age, setAge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [globeBaseColor, setGlobeBaseColor] = useState(DEFAULT_GLOBE_BASE_COLOR);
  const [graticuleEnabled, setGraticuleEnabled] = useState(true);
  const [level, setLevel] = useState(4);
  const [polygonRenderIntent, setPolygonRenderIntent] =
    useState<PolygonRenderIntentMode>("all-polygons-area");
  const [primitiveTransformMode, setPrimitiveTransformModeState] =
    useState<PrimitiveTransformMode>("dynamic3D");
  const [providerKey, setProviderKey] = useState<ProviderKey>(DEFAULT_PROVIDER_KEY);
  const [sourceKind, setSourceKind] = useState<ImagerySourceKind>("tile-service");
  const [serviceMode, setServiceMode] = useState<LayerMode>("reconstructable");
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
  const [status, setStatus] = useState("Viewer is starting");
  const [experimentViewConfig, setExperimentViewConfig] = useState(
    createDefaultExperimentViewConfig,
  );
  const [appliedOutputSize, setAppliedOutputSize] = useState<ExperimentOutputConfig | null>(null);

  const { containerRef, managerRef, layerControllerRef, webglProcessorRef, viewerRef } =
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

  useGraticuleOverlay({ enabled: graticuleEnabled, viewerRef });

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
  const layers = useLayerManager({
    controllerRef: layerControllerRef,
    managerRef,
    age,
    setLevel,
    setStatus,
  });
  const localRaster = useLocalRaster({ viewerRef, model, addLayer: layers.addRaster });
  const localGeoJson = useLocalGeoJson({ addLayer: layers.addGeoJson });
  const macrostratLegend = useMacrostratLegend({
    viewerRef,
    controllerRef: layerControllerRef,
    layers: layers.layers,
    selectedId: layers.selected?.id,
    age,
    viewMode: experimentViewConfig.viewMode,
  });
  const initialized = !!layers.selected && layers.selected.status !== "needs-file";
  const stats = layers.stats;
  const selectedService =
    layers.selected?.source.kind === "service" ? layers.selected.source : null;
  const appliedService = selectedService
    ? {
        config: selectedService.config,
        exampleKey: selectedService.exampleKey ?? "custom-url-template",
        label: layers.selected!.name,
        modelKey: JSON.stringify(layers.selected?.model),
      }
    : null;
  const focusSource = () => {
    document
      .getElementById("imagery-source")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("source-kind")?.focus({ preventScroll: true });
  };
  const prepareLocalFile = (layer: LayerDefinition) => {
    if (layer.source.kind === "geojson") {
      setSourceKind("local-geojson");
      localGeoJson.prepareRestore(layer.id, layer.source.descriptor);
      focusSource();
      return;
    }
    if (layer.source.kind !== "local") return;
    setSourceKind("local-raster");
    localRaster.prepareRestore(layer.source.descriptor);
    if (layer.model) {
      dataSourceControls.applyImportedFeatureSource(layer.model.featureUrl, undefined);
      dataSourceControls.applyImportedRotationSources(layer.model.rotationUrls, undefined);
      setRotationAnchorMode(layer.model.anchorPlateId === null ? "auto" : "custom");
      setAnchorPlateIdInput(layer.model.anchorPlateId ?? DEFAULT_ANCHOR_PLATE_ID);
      setPolygonRenderIntent(
        layer.model.polygonRenderIntent === "classified" ? "classified" : "all-polygons-area",
      );
      setExperimentViewConfig((config) => ({ ...config, modelName: layer.model!.name }));
    }
    focusSource();
  };
  const loadSelected = (inView = false) => {
    if (layers.selected)
      void layerControllerRef.current?.load(layers.selected.id, inView ? undefined : level, inView);
  };

  const experimentIO = useExperimentIO({
    localRaster:
      layers.selected?.source.kind === "local" ? layers.selected.source.descriptor : undefined,
    layerControllerRef,
    appliedService,
    onImportSources: (hasLocalRaster) => {
      localRaster.remove();
      localGeoJson.remove();
      layerControllerRef.current?.restore([]);
      layers.setPanelOpen(true);
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
    graticuleEnabled,
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
    setGraticuleEnabled,
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
        viewMode: config.camera3D.orthographic ? "3D_ORTHOGRAPHIC" : "3D_GLOBE",
      }));
      setStatus("3D camera pose applied.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExperimentSceneModeChange = (viewMode: ExperimentViewMode) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    try {
      applySceneMode(viewer, viewMode);
      setExperimentViewConfig((config) => ({
        ...config,
        viewMode,
        camera3D: {
          ...config.camera3D,
          orthographic:
            viewMode === "2D_RECTANGULAR"
              ? config.camera3D.orthographic
              : viewMode === "3D_ORTHOGRAPHIC",
        },
      }));
      setStatus(
        viewMode === "2D_RECTANGULAR"
          ? "Scene mode set to 2D rectangular."
          : viewMode === "3D_ORTHOGRAPHIC"
            ? "Scene mode set to 3D (orthographic)."
            : "Scene mode set to 3D (perspective).",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyCameraPreset = (preset: ExperimentViewPreset) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    try {
      const camera3D = applyCameraPreset(
        viewer,
        preset,
        experimentViewConfig.camera3D.orthographic,
      );
      setExperimentViewConfig((config) => ({
        ...config,
        viewMode: camera3D.orthographic ? "3D_ORTHOGRAPHIC" : "3D_GLOBE",
        camera3D,
      }));
      setStatus(`Quick view applied: ${EXPERIMENT_VIEW_PRESETS[preset].label}.`);
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
    <main className={`app-shell${layers.panelOpen ? " has-layer-panel" : ""}`}>
      <ControlPanel
        macrostratLegend={macrostratLegend}
        localRaster={localRaster}
        localGeoJson={localGeoJson}
        sourceKind={sourceKind}
        onSourceKindChange={setSourceKind}
        appliedService={appliedService}
        modelNeedsApply={false}
        selectedLayer={layers.selected}
        serviceMode={serviceMode}
        onServiceModeChange={setServiceMode}
        age={age}
        busy={busy || localRaster.busy || localGeoJson.busy || layers.busy}
        serviceConfig={serviceConfig}
        debugEnabled={debugEnabled}
        experimentViewConfig={experimentViewConfig}
        featurePresetKey={dataSourceControls.featurePresetKey}
        featurePresets={FEATURE_PRESETS}
        featureSourceLabel={dataSourceControls.featureSourceLabel}
        featureUrl={dataSourceControls.featureUrl}
        globeBaseColor={globeBaseColor}
        graticuleEnabled={graticuleEnabled}
        anchorPlateIdInput={anchorPlateIdInput}
        initialized={initialized}
        level={level}
        tileLevelRange={layers.selected?.tileLevelRange}
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
        onAgeChange={(value) => {
          if (Number.isFinite(value)) setAge(Math.min(1800, Math.max(0, value)));
        }}
        onApplyProvider={() =>
          void layers.addService(serviceConfig, providerKey, model, serviceMode, level)
        }
        onApplyExtentView={handleApplyExtentView}
        onApplyOutputSize={handleApplyOutputSize}
        onApplyPoseView={handleApplyPoseView}
        onApplyCameraPreset={handleApplyCameraPreset}
        onApplyTransformMode={() => {
          void layerControllerRef.current
            ?.setTransformMode(primitiveTransformMode)
            .catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : String(error)),
            );
        }}
        onCaptureScreenshot={experimentIO.handleCaptureScreenshot}
        onClear={() => {
          if (layers.selected) layerControllerRef.current?.clear(layers.selected.id);
        }}
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
        onGraticuleEnabledChange={setGraticuleEnabled}
        onImportExperimentConfig={experimentIO.handleImportExperimentConfig}
        onLevelChange={setLevel}
        onViewLevelChange={(viewLevel) => {
          if (layers.selected)
            layerControllerRef.current?.update(layers.selected.id, { viewLevel });
        }}
        onLoadFineInView={() => loadSelected(true)}
        onLoadLevel={() => loadSelected()}
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
        <div className="cesium-attribution">
          <span>Powered by</span>
          <img
            src={`${import.meta.env.BASE_URL}icons/CesiumJS_light_color.svg`}
            alt="CesiumJS"
            width={104}
            height={18}
            draggable={false}
          />
        </div>
      </section>
      <LayerPanel
        controller={layerControllerRef.current}
        layers={layers.layers}
        selectedId={layers.selectedId}
        open={layers.panelOpen}
        onOpenChange={layers.setPanelOpen}
        age={age}
        onAdd={focusSource}
        onPrepareFile={prepareLocalFile}
        onUseModel={(id) => layerControllerRef.current?.updateModel(id, model)}
      />
    </main>
  );
}

export default App;

import { useEffect, useRef, useState } from "react";
import type { Viewer } from "cesium";
import {
  SimpleGeoReconstructManager,
  type GeoTileStats,
  type PolygonRenderIntentMode,
  type PrimitiveTransformMode,
} from "simple-geo-reconstruct";
import {
  CesiumTileProcesser,
  type TileImageOutputType,
} from "tile-processer-webgl";

import { createImageryProvider, type ProviderKey } from "./cesium/providers";
import { createViewer } from "./cesium/createViewer";
import { ControlPanel } from "./components/ControlPanel";
import {
  DEFAULT_FEATURE_PRESET,
  DEFAULT_ROTATION_PRESET,
  FEATURE_PRESETS,
  ROTATION_PRESETS,
  type FeaturePresetKey,
  type RotationPresetKey,
} from "./dataSources";

const TILE_OUTPUT_TYPE: TileImageOutputType = "canvas";

declare global {
  interface Window {
    __simpleGeoReconstructStats?: () => GeoTileStats;
    __tileProcesserStats?: () => ReturnType<CesiumTileProcesser["getPoolStats"]>;
  }
}

function parseRotationUrls(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatRotationUrls(urls: string[]) {
  return urls.join("\n");
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tileProcesserRef = useRef<CesiumTileProcesser | null>(null);
  const managerRef = useRef<SimpleGeoReconstructManager | null>(null);
  const sceneModeCleanupRef = useRef<(() => void) | null>(null);
  const uploadedFeatureUrlRef = useRef<string | null>(null);
  const uploadedRotUrlsRef = useRef<string[]>([]);

  const [age, setAge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [featurePresetKey, setFeaturePresetKey] = useState<FeaturePresetKey>(
    DEFAULT_FEATURE_PRESET.key,
  );
  const [featureUrl, setFeatureUrl] = useState(DEFAULT_FEATURE_PRESET.url);
  const [initialized, setInitialized] = useState(false);
  const [level, setLevel] = useState(3);
  const [polygonRenderIntent, setPolygonRenderIntent] =
    useState<PolygonRenderIntentMode>("all-polygons-area");
  const [primitiveTransformMode, setPrimitiveTransformModeState] =
    useState<PrimitiveTransformMode>("dynamic3D");
  const [providerKey, setProviderKey] =
    useState<ProviderKey>("arcgis-world-imagery");
  const [rotPresetKey, setRotPresetKey] = useState<RotationPresetKey>(
    DEFAULT_ROTATION_PRESET.key,
  );
  const [rotUrls, setRotUrls] = useState(
    formatRotationUrls(DEFAULT_ROTATION_PRESET.urls),
  );
  const [stats, setStats] = useState<GeoTileStats | null>(null);
  const [status, setStatus] = useState("Viewer is starting");

  const refreshStats = () => {
    setStats(managerRef.current?.getStats() ?? null);
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const viewer = createViewer(containerRef.current);
    const processer = new CesiumTileProcesser({
      slotCount: 4,
      outputType: TILE_OUTPUT_TYPE,
    });
    viewerRef.current = viewer;
    tileProcesserRef.current = processer;
    window.__tileProcesserStats = () => processer.getPoolStats();
    setStatus("Viewer ready. Initialize the manager to load data.");

    return () => {
      sceneModeCleanupRef.current?.();
      managerRef.current?.destroy(viewer);
      processer.destroy();
      viewer.destroy();
      delete window.__simpleGeoReconstructStats;
      delete window.__tileProcesserStats;
      revokeUploadedFeatureUrl();
      revokeUploadedRotUrls();
      managerRef.current = null;
      tileProcesserRef.current = null;
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (debugEnabled) {
      localStorage.setItem("deepTimeGeoDebug", "1");
    } else {
      localStorage.removeItem("deepTimeGeoDebug");
    }
  }, [debugEnabled]);

  useEffect(() => {
    if (!initialized || !managerRef.current) {
      return;
    }

    let cancelled = false;
    void managerRef.current.setAge(age).then(() => {
      if (cancelled) {
        return;
      }
      viewerRef.current?.scene.requestRender();
      refreshStats();
    });

    return () => {
      cancelled = true;
    };
  }, [age, initialized]);

  const handleInit = async () => {
    const viewer = viewerRef.current;
    const processer = tileProcesserRef.current;
    const rotationSources = parseRotationUrls(rotUrls);
    if (!viewer || !processer) {
      setStatus("Viewer is not ready yet.");
      return;
    }
    if (rotationSources.length === 0) {
      setStatus("Add at least one ROT file before initialization.");
      return;
    }

    setBusy(true);
    setStatus("Loading feature and rotation data...");
    try {
      sceneModeCleanupRef.current?.();
      managerRef.current?.destroy(viewer);

      const manager = new SimpleGeoReconstructManager({
        provider: createImageryProvider(providerKey),
        processer,
        featureSource: {
          url: featureUrl.trim(),
          polygonRenderIntent,
        },
        rotationSources,
        initialAge: age,
        primitiveTransformMode,
      });

      managerRef.current = manager;
      await manager.init();
      sceneModeCleanupRef.current = manager.bindSceneModeSync(viewer);
      window.__simpleGeoReconstructStats = () => manager.getStats();
      setInitialized(true);
      setStatus("Manager initialized.");
      refreshStats();
      viewer.scene.requestRender();
    } catch (error) {
      console.error(error);
      setInitialized(false);
      setStats(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const revokeUploadedFeatureUrl = () => {
    if (uploadedFeatureUrlRef.current) {
      URL.revokeObjectURL(uploadedFeatureUrlRef.current);
      uploadedFeatureUrlRef.current = null;
    }
  };

  const revokeUploadedRotUrls = () => {
    uploadedRotUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    uploadedRotUrlsRef.current = [];
  };

  const handleFeaturePresetChange = (key: FeaturePresetKey) => {
    setFeaturePresetKey(key);
    if (key === "custom") {
      return;
    }

    const preset = FEATURE_PRESETS.find((item) => item.key === key);
    if (preset) {
      revokeUploadedFeatureUrl();
      setFeatureUrl(preset.url);
    }
  };

  const handleFeatureUpload = (file: File | null) => {
    if (!file) {
      return;
    }

    revokeUploadedFeatureUrl();
    const url = URL.createObjectURL(file);
    uploadedFeatureUrlRef.current = url;
    setFeaturePresetKey("custom");
    setFeatureUrl(url);
    setStatus(`Feature upload selected: ${file.name}`);
  };

  const handleFeatureUrlChange = (value: string) => {
    revokeUploadedFeatureUrl();
    setFeaturePresetKey("custom");
    setFeatureUrl(value);
  };

  const handleRotPresetChange = (key: RotationPresetKey) => {
    setRotPresetKey(key);
    if (key === "custom") {
      return;
    }

    const preset = ROTATION_PRESETS.find((item) => item.key === key);
    if (preset) {
      revokeUploadedRotUrls();
      setRotUrls(formatRotationUrls(preset.urls));
    }
  };

  const handleRotUpload = (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    revokeUploadedRotUrls();
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    uploadedRotUrlsRef.current = urls;
    setRotPresetKey("custom");
    setRotUrls(formatRotationUrls(urls));
    setStatus(
      `ROT uploads selected: ${selectedFiles.map((file) => file.name).join(", ")}`,
    );
  };

  const handleRotUrlsChange = (value: string) => {
    revokeUploadedRotUrls();
    setRotPresetKey("custom");
    setRotUrls(value);
  };

  const handleApplyProvider = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    setBusy(true);
    setStatus("Refreshing loaded tile imagery...");
    try {
      await manager.setProvider(viewer, createImageryProvider(providerKey));
      setStatus("Provider applied.");
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleApplyTransformMode = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    setBusy(true);
    setStatus("Applying primitive transform mode...");
    try {
      await manager.setPrimitiveTransformMode(viewer, primitiveTransformMode, {
        removeBeforeBuild: true,
      });
      setStatus("Transform mode applied.");
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleLoadRoot = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    setBusy(true);
    setStatus("Loading root tiles...");
    try {
      await manager.loadTilesAtRoot(viewer);
      setStatus("Root tiles loaded.");
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleLoadLevel = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    setBusy(true);
    setStatus(`Loading level ${level} tiles...`);
    try {
      await manager.loadTilesOnLevel(viewer, level);
      setStatus(`Level ${level} tiles loaded.`);
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleLoadFineInView = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    setBusy(true);
    setStatus("Loading tiles in current view...");
    try {
      await waitForNextPaint();
      const result = await manager.loadFineTilesInView(viewer);
      const nextStatus = result.skippedReason
        ? `View load skipped: ${result.skippedReason}.`
        : result.loadedCount > 0
          ? `Loaded ${result.loadedCount}/${result.taskCount} view tiles at level ${result.level}.`
          : `No new view tiles at level ${result.level}. Move the camera or zoom in.`;
      setStatus(nextStatus);
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    manager.clear(viewer);
    setStatus("Tiles cleared.");
    refreshStats();
  };

  return (
    <main className="app-shell">
      <div ref={containerRef} className="cesium-container" />
      <ControlPanel
        age={age}
        busy={busy}
        debugEnabled={debugEnabled}
        featurePresetKey={featurePresetKey}
        featurePresets={FEATURE_PRESETS}
        featureUrl={featureUrl}
        initialized={initialized}
        level={level}
        polygonRenderIntent={polygonRenderIntent}
        primitiveTransformMode={primitiveTransformMode}
        providerKey={providerKey}
        rotPresetKey={rotPresetKey}
        rotPresets={ROTATION_PRESETS}
        rotUrls={rotUrls}
        stats={stats}
        status={status}
        onAgeChange={setAge}
        onApplyProvider={handleApplyProvider}
        onApplyTransformMode={handleApplyTransformMode}
        onClear={handleClear}
        onDebugEnabledChange={setDebugEnabled}
        onFeatureUrlChange={handleFeatureUrlChange}
        onFeaturePresetChange={handleFeaturePresetChange}
        onFeatureUpload={handleFeatureUpload}
        onInit={handleInit}
        onLevelChange={setLevel}
        onLoadFineInView={handleLoadFineInView}
        onLoadLevel={handleLoadLevel}
        onLoadRoot={handleLoadRoot}
        onPolygonRenderIntentChange={setPolygonRenderIntent}
        onPrimitiveTransformModeChange={setPrimitiveTransformModeState}
        onProviderKeyChange={setProviderKey}
        onRotPresetChange={handleRotPresetChange}
        onRotUpload={handleRotUpload}
        onRotUrlsChange={handleRotUrlsChange}
      />
    </main>
  );
}

export default App;

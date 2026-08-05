/** Encapsulates manager initialization and tile loading actions. */
import { useEffect, type MutableRefObject } from "react";
import type { Viewer } from "cesium";
import {
  ReconstructableTileLayer,
  type ReconstructableTileLayerStats,
  type PolygonRenderIntentMode,
  type PrimitiveTransformMode,
} from "reconstructable-tile-layer";
import type { WebGLTileProcessor } from "rtl-webgl-tile-processor";

import { waitForNextPaint } from "../cesium/cameraControls";
import {
  createImageryProvider,
  validateUrlTemplateProviderConfig,
  type ProviderKey,
  type UrlTemplateProviderConfig,
} from "../cesium/providers";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import { resolveDemoAssetUrl } from "../utils/demoAssetUrl";

type UseReconstructActionsOptions = {
  age: number;
  anchorPlateId: string | null;
  customProviderConfig: UrlTemplateProviderConfig;
  featureUrl: string;
  initialized: boolean;
  level: number;
  managerRef: MutableRefObject<ReconstructableTileLayer | null>;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  rotationSources: string[];
  sceneModeCleanupRef: MutableRefObject<(() => void) | null>;
  setBusy: (value: boolean) => void;
  setCustomProviderError: (value: string) => void;
  setInitialized: (value: boolean) => void;
  setProviderKey: (value: ProviderKey) => void;
  setStats: (value: ReconstructableTileLayerStats | null) => void;
  setStatus: (value: string) => void;
  webglProcessorRef: MutableRefObject<WebGLTileProcessor | null>;
  viewerRef: MutableRefObject<Viewer | null>;
};

export function useReconstructActions({
  age,
  anchorPlateId,
  customProviderConfig,
  featureUrl,
  initialized,
  level,
  managerRef,
  polygonRenderIntent,
  primitiveTransformMode,
  providerKey,
  rotationSources,
  sceneModeCleanupRef,
  setBusy,
  setCustomProviderError,
  setInitialized,
  setProviderKey,
  setStats,
  setStatus,
  webglProcessorRef,
  viewerRef,
}: UseReconstructActionsOptions) {
  const refreshStats = () => {
    setStats(managerRef.current?.getRuntimeStats() ?? null);
  };

  const createSelectedImageryProvider = () => {
    if (providerKey === "custom-url-template") {
      const errors = validateUrlTemplateProviderConfig(customProviderConfig);
      if (errors.length > 0) {
        setCustomProviderError(errors[0]);
        setStatus(errors[0]);
        return null;
      }
    }

    try {
      setCustomProviderError("");
      return createImageryProvider(providerKey, customProviderConfig, {
        ellipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCustomProviderError(message);
      setStatus(message);
      return null;
    }
  };

  useEffect(() => {
    if (!initialized || !managerRef.current) {
      return;
    }

    let cancelled = false;
    void managerRef.current.setReconstructionAge(age).then(() => {
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
    const webglProcessor = webglProcessorRef.current;
    if (!viewer || !webglProcessor) {
      setStatus("Viewer is not ready yet.");
      return;
    }
    if (rotationSources.length === 0) {
      setStatus("Add at least one ROT file before initialization.");
      return;
    }
    const resolvedAnchorPlateId =
      anchorPlateId === null ? null : anchorPlateId.trim();
    if (resolvedAnchorPlateId === "") {
      setStatus("Enter an anchor plate ID or choose Auto recurse.");
      return;
    }

    const provider = createSelectedImageryProvider();
    if (!provider) {
      return;
    }

    setBusy(true);
    setStatus("Loading feature and rotation data...");
    try {
      sceneModeCleanupRef.current?.();
      managerRef.current?.destroy(viewer);

      const manager = new ReconstructableTileLayer({
        anchorPlateId: resolvedAnchorPlateId,
        provider,
        processor: webglProcessor,
        featureSource: {
          url: resolveDemoAssetUrl(featureUrl.trim()),
          polygonRenderIntent,
        },
        rotationSources: rotationSources.map(resolveDemoAssetUrl),
        initialAge: age,
        primitiveTransformMode,
        referenceEllipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
      });

      managerRef.current = manager;
      await manager.initialize();
      sceneModeCleanupRef.current = manager.bindSceneModeSync(viewer);
      window.__simpleGeoReconstructStats = () => manager.getRuntimeStats();
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

  const handleApplyProvider = async () => {
    const viewer = viewerRef.current;
    const manager = managerRef.current;
    if (!viewer || !manager) {
      return;
    }

    const provider = createSelectedImageryProvider();
    if (!provider) {
      return;
    }

    setBusy(true);
    setStatus("Applying provider and clearing loaded tiles...");
    try {
      await manager.setImageryProvider(viewer, provider);
      setStatus("Provider applied. Reload tiles for the new imagery source.");
      refreshStats();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCustomProviderConfig = () => {
    const errors = validateUrlTemplateProviderConfig(customProviderConfig);
    if (errors.length > 0) {
      setCustomProviderError(errors[0]);
      setStatus(errors[0]);
      return false;
    }

    setCustomProviderError("");
    setProviderKey("custom-url-template");
    setStatus("Custom provider settings saved.");
    return true;
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
      await manager.loadRootTiles(viewer);
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
      await manager.loadSourceTilesAtLevel(viewer, level);
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
      const result = await manager.refineTilesForView(viewer);
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

  return {
    handleApplyProvider,
    handleApplyTransformMode,
    handleClear,
    handleInit,
    handleLoadFineInView,
    handleLoadLevel,
    handleLoadRoot,
    handleSaveCustomProviderConfig,
    refreshStats,
  };
}

/** Encapsulates manager initialization and tile loading actions. */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { ImageryProvider, Viewer } from "cesium";
import {
  ReconstructableTileLayer,
  type ReconstructableTileLayerStats,
  type PolygonRenderIntentMode,
  type PrimitiveTransformMode,
} from "reconstructable-tile-layer";
import type { WebGLTileProcessor } from "rtl-webgl-tile-processor";

import { waitForNextPaint } from "../cesium/cameraControls";
import { createTileServiceProvider, type TileServiceConfig } from "../cesium/providers";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import { resolveDemoAssetUrl } from "../utils/demoAssetUrl";

type UseReconstructActionsOptions = {
  activeRasterProvider?: ImageryProvider;
  onServiceApplied: () => void;
  age: number;
  anchorPlateId: string | null;
  serviceConfig: TileServiceConfig;
  featureUrl: string;
  initialized: boolean;
  level: number;
  managerRef: MutableRefObject<ReconstructableTileLayer | null>;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  rotationSources: string[];
  sceneModeCleanupRef: MutableRefObject<(() => void) | null>;
  setBusy: (value: boolean) => void;
  setInitialized: (value: boolean) => void;
  setStats: (value: ReconstructableTileLayerStats | null) => void;
  setStatus: (value: string) => void;
  webglProcessorRef: MutableRefObject<WebGLTileProcessor | null>;
  viewerRef: MutableRefObject<Viewer | null>;
};

export function useReconstructActions({
  activeRasterProvider,
  onServiceApplied,
  age,
  anchorPlateId,
  serviceConfig,
  featureUrl,
  initialized,
  level,
  managerRef,
  polygonRenderIntent,
  primitiveTransformMode,
  rotationSources,
  sceneModeCleanupRef,
  setBusy,
  setInitialized,
  setStats,
  setStatus,
  webglProcessorRef,
  viewerRef,
}: UseReconstructActionsOptions) {
  const initialization = useRef(0);
  useEffect(
    () => () => {
      initialization.current++;
    },
    [],
  );
  const refreshStats = () => {
    setStats(managerRef.current?.getRuntimeStats() ?? null);
  };

  const createSelectedImageryProvider = () => {
    try {
      return createTileServiceProvider(serviceConfig, {
        ellipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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

  const initializeWithProvider = async (suppliedProvider?: ImageryProvider): Promise<boolean> => {
    const viewer = viewerRef.current;
    const webglProcessor = webglProcessorRef.current;
    if (!viewer || !webglProcessor) {
      setStatus("Viewer is not ready yet.");
      return false;
    }
    if (rotationSources.length === 0) {
      setStatus("Add at least one ROT file before initialization.");
      return false;
    }
    const resolvedAnchorPlateId = anchorPlateId === null ? null : anchorPlateId.trim();
    if (resolvedAnchorPlateId === "") {
      setStatus("Enter an anchor plate ID or choose Auto recurse.");
      return false;
    }

    const provider = suppliedProvider ?? activeRasterProvider ?? createSelectedImageryProvider();
    if (!provider) {
      return false;
    }

    const token = ++initialization.current;
    setBusy(true);
    setInitialized(false);
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
      if (
        token !== initialization.current ||
        managerRef.current !== manager ||
        !manager.ready ||
        viewer.isDestroyed()
      )
        return false;
      sceneModeCleanupRef.current = manager.bindSceneModeSync(viewer);
      if (!suppliedProvider && !activeRasterProvider) onServiceApplied();
      window.__simpleGeoReconstructStats = () => manager.getRuntimeStats();
      setInitialized(true);
      setStatus("Manager initialized.");
      refreshStats();
      viewer.scene.requestRender();
      return true;
    } catch (error) {
      if (token !== initialization.current) return false;
      console.error(error);
      managerRef.current?.destroy(viewer);
      managerRef.current = null;
      setInitialized(false);
      setStats(null);
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (token === initialization.current) setBusy(false);
    }
  };

  const handleApplyProvider = async () => {
    const provider = createSelectedImageryProvider();
    if (!provider) {
      return;
    }

    // 应用服务同时绑定当前模型；首次使用和从本地源切回都走同一个入口。
    if (await initializeWithProvider(provider)) {
      onServiceApplied();
      setStatus("Source applied. Load tiles to reconstruct it.");
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

    if (
      activeRasterProvider &&
      (!Number.isInteger(level) ||
        level < (activeRasterProvider.minimumLevel ?? 0) ||
        level > (activeRasterProvider.maximumLevel ?? 24))
    ) {
      setStatus(
        `Local raster supports L${activeRasterProvider.minimumLevel ?? 0}–L${activeRasterProvider.maximumLevel ?? 24}. Choose a level in that range.`,
      );
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
      // 本地低分辨率源也从 L2 细分起步，避免视野较大时自动退回难用的 L0/L1。
      const result = await manager.refineTilesForView(
        viewer,
        activeRasterProvider
          ? {
              minLevel: Math.min(2, activeRasterProvider.maximumLevel ?? 2),
            }
          : {},
      );
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
    initializeWithProvider,
    handleLoadFineInView,
    handleLoadLevel,
    handleLoadRoot,
    refreshStats,
  };
}

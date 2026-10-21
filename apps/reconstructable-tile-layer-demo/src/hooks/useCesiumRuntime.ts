/** Coordinates Cesium viewer and tile processor lifecycle for the demo app. */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import type {
  ReconstructableTileLayer,
  ReconstructableTileLayerStats,
} from "reconstructable-tile-layer";
import { WebGLTileProcessor, type TileImageOutputType } from "rtl-webgl-tile-processor";

import { applyGlobeBaseColor, createViewer, DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import type { ExperimentOutputConfig } from "../experiment";
import { createDefaultExperimentViewConfig } from "../experiment/defaults";
import { applySceneMode } from "../cesium/cameraControls";
import { installPerformanceBenchmark } from "../benchmark/performanceBenchmark";
import { LayerController } from "../layers/LayerController";

const TILE_OUTPUT_TYPE: TileImageOutputType = "canvas";

declare global {
  interface Window {
    __simpleGeoReconstructStats?: () => ReconstructableTileLayerStats;
    __tileProcesserStats?: () => ReturnType<WebGLTileProcessor["getRuntimeStats"]>;
  }
}

type UseCesiumRuntimeOptions = {
  appliedOutputSize: ExperimentOutputConfig | null;
  globeBaseColor: string;
  onStatusChange: (value: string) => void;
};

export function useCesiumRuntime({
  appliedOutputSize,
  globeBaseColor,
  onStatusChange,
}: UseCesiumRuntimeOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const webglProcessorRef = useRef<WebGLTileProcessor | null>(null);
  const managerRef = useRef<ReconstructableTileLayer | null>(null);
  const layerControllerRef = useRef<LayerController | null>(null);
  const sceneModeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const viewer = createViewer(containerRef.current, DEMO_ELLIPSOID_CONFIG);
    // 首次创建时同步应用面板的默认投影，确保实际相机与控件状态一致。
    applySceneMode(viewer, createDefaultExperimentViewConfig().viewMode);
    const webglProcessor = new WebGLTileProcessor({
      slotCount: 4,
      outputType: TILE_OUTPUT_TYPE,
    });
    viewerRef.current = viewer;
    webglProcessorRef.current = webglProcessor;
    const layerController = new LayerController(viewer, webglProcessor);
    layerControllerRef.current = layerController;
    const removeStatsSubscription = layerController.subscribe(() => {
      const selected = layerController.selectedManager;
      if (selected) window.__simpleGeoReconstructStats = () => selected.getRuntimeStats();
      else delete window.__simpleGeoReconstructStats;
    });
    window.__tileProcesserStats = () => webglProcessor.getRuntimeStats();
    const removePerformanceBenchmark = installPerformanceBenchmark({
      viewer,
      getActiveManager: () => layerController.firstManager,
      prepareExclusiveRuntime: () => {
        if (layerController.hasLayers)
          throw new Error("Remove all layers before running an exclusive benchmark.");
        layerController.destroy();
        layerControllerRef.current = null;
        webglProcessor.destroy();
        if (webglProcessorRef.current === webglProcessor) {
          webglProcessorRef.current = null;
        }
        delete window.__tileProcesserStats;
      },
    });
    onStatusChange("Viewer ready. Prepare an imagery source, then add a layer.");

    return () => {
      removePerformanceBenchmark();
      removeStatsSubscription();
      sceneModeCleanupRef.current?.();
      layerController.destroy();
      webglProcessor.destroy();
      viewer.destroy();
      delete window.__simpleGeoReconstructStats;
      delete window.__tileProcesserStats;
      managerRef.current = null;
      layerControllerRef.current = null;
      webglProcessorRef.current = null;
      viewerRef.current = null;
    };
  }, [onStatusChange]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    applyGlobeBaseColor(viewer, globeBaseColor);
  }, [globeBaseColor]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !appliedOutputSize) {
      return;
    }

    viewer.resolutionScale = appliedOutputSize.pixelRatio;
    const resizeId = requestAnimationFrame(() => {
      viewer.resize();
      viewer.scene.requestRender();
    });

    return () => cancelAnimationFrame(resizeId);
  }, [appliedOutputSize]);

  return {
    containerRef,
    managerRef,
    layerControllerRef,
    sceneModeCleanupRef,
    webglProcessorRef,
    viewerRef,
  };
}

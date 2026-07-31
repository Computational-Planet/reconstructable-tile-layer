/** Coordinates Cesium viewer and tile processor lifecycle for the demo app. */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import type {
  ReconstructableTileLayer,
  ReconstructableTileLayerStats,
} from "reconstructable-tile-layer";
import {
  WebGLTileProcessor,
  type TileImageOutputType,
} from "rtl-webgl-tile-processor";

import {
  applyGlobeBaseColor,
  createViewer,
  DEMO_ELLIPSOID_CONFIG,
} from "../cesium/createViewer";
import type { ExperimentOutputConfig } from "../experiment";
import { installPerformanceBenchmark } from "../benchmark/performanceBenchmark";

const TILE_OUTPUT_TYPE: TileImageOutputType = "canvas";

declare global {
  interface Window {
    __simpleGeoReconstructStats?: () => ReconstructableTileLayerStats;
    __tileProcesserStats?: () => ReturnType<
      WebGLTileProcessor["getRuntimeStats"]
    >;
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
  const sceneModeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const viewer = createViewer(containerRef.current, DEMO_ELLIPSOID_CONFIG);
    const webglProcessor = new WebGLTileProcessor({
      slotCount: 4,
      outputType: TILE_OUTPUT_TYPE,
    });
    viewerRef.current = viewer;
    webglProcessorRef.current = webglProcessor;
    window.__tileProcesserStats = () => webglProcessor.getRuntimeStats();
    const removePerformanceBenchmark = installPerformanceBenchmark({
      viewer,
      getActiveManager: () => managerRef.current,
      prepareExclusiveRuntime: () => {
        webglProcessor.destroy();
        if (webglProcessorRef.current === webglProcessor) {
          webglProcessorRef.current = null;
        }
        delete window.__tileProcesserStats;
      },
    });
    onStatusChange("Viewer ready. Initialize the manager to load data.");

    return () => {
      removePerformanceBenchmark();
      sceneModeCleanupRef.current?.();
      managerRef.current?.destroy(viewer);
      webglProcessor.destroy();
      viewer.destroy();
      delete window.__simpleGeoReconstructStats;
      delete window.__tileProcesserStats;
      managerRef.current = null;
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
    sceneModeCleanupRef,
    webglProcessorRef,
    viewerRef,
  };
}

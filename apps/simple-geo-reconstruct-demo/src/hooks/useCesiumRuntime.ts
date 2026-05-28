/** Coordinates Cesium viewer and tile processor lifecycle for the demo app. */
import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import type { GeoTileStats } from "simple-geo-reconstruct";
import { CesiumTileProcesser, type TileImageOutputType } from "tile-processer-webgl";
import type { SimpleGeoReconstructManager } from "simple-geo-reconstruct";

import {
  applyGlobeBaseColor,
  createViewer,
  DEMO_ELLIPSOID_CONFIG,
} from "../cesium/createViewer";
import type { ExperimentOutputConfig } from "../experiment";

const TILE_OUTPUT_TYPE: TileImageOutputType = "canvas";

declare global {
  interface Window {
    __simpleGeoReconstructStats?: () => GeoTileStats;
    __tileProcesserStats?: () => ReturnType<
      CesiumTileProcesser["getPoolStats"]
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
  const tileProcesserRef = useRef<CesiumTileProcesser | null>(null);
  const managerRef = useRef<SimpleGeoReconstructManager | null>(null);
  const sceneModeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const viewer = createViewer(containerRef.current, DEMO_ELLIPSOID_CONFIG);
    const processer = new CesiumTileProcesser({
      slotCount: 4,
      outputType: TILE_OUTPUT_TYPE,
    });
    viewerRef.current = viewer;
    tileProcesserRef.current = processer;
    window.__tileProcesserStats = () => processer.getPoolStats();
    onStatusChange("Viewer ready. Initialize the manager to load data.");

    return () => {
      sceneModeCleanupRef.current?.();
      managerRef.current?.destroy(viewer);
      processer.destroy();
      viewer.destroy();
      delete window.__simpleGeoReconstructStats;
      delete window.__tileProcesserStats;
      managerRef.current = null;
      tileProcesserRef.current = null;
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
    tileProcesserRef,
    viewerRef,
  };
}

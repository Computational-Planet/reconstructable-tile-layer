import { useEffect, type MutableRefObject } from "react";
import type { Viewer } from "cesium";

import { GraticuleOverlay } from "../cesium/GraticuleOverlay";

type UseGraticuleOverlayOptions = {
  enabled: boolean;
  viewerRef: MutableRefObject<Viewer | null>;
};

export function useGraticuleOverlay({ enabled, viewerRef }: UseGraticuleOverlayOptions) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!enabled || !viewer || viewer.isDestroyed()) return;

    const overlay = new GraticuleOverlay(viewer);
    overlay.show();
    // 关闭或卸载即释放整个集合和监听器，兼容 StrictMode 的重复挂载。
    return () => overlay.destroy();
  }, [enabled, viewerRef]);
}

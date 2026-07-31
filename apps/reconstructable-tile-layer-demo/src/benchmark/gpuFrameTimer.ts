import type { Viewer } from "cesium";
import type { GpuFrameTiming, MetricValue } from "./performanceBenchmarkTypes";

type WebGl1TimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  createQueryEXT(): WebGLQuery | null;
  beginQueryEXT(target: number, query: WebGLQuery): void;
  endQueryEXT(target: number): void;
  getQueryObjectEXT(query: WebGLQuery, parameter: number): number | boolean;
  deleteQueryEXT(query: WebGLQuery): void;
};

type WebGl2TimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

export type RenderedFrameMeasurement = {
  startTimeMs: number;
  endTimeMs: number;
  wallMs: number;
  gpu: Promise<GpuFrameTiming>;
};

export async function measureNextRenderedFrame(
  viewer: Viewer,
  timeoutMs: number,
  gpuEnabled: boolean,
): Promise<RenderedFrameMeasurement> {
  const gpuTimer = gpuEnabled ? createGpuTimer(viewer) : null;
  const startTimeMs = performance.now();

  return new Promise<RenderedFrameMeasurement>((resolve, reject) => {
    let queryStarted = false;
    const timeoutId = window.setTimeout(() => {
      removePreRender();
      removePostRender();
      reject(new Error("Timed out while waiting for a Cesium postRender event."));
    }, timeoutMs);
    const removePreRender = viewer.scene.preRender.addEventListener(() => {
      removePreRender();
      queryStarted = gpuTimer?.begin() ?? false;
    });
    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      window.clearTimeout(timeoutId);
      removePostRender();
      const endTimeMs = performance.now();
      const wallMs = endTimeMs - startTimeMs;
      const gpu =
        gpuTimer && queryStarted
          ? gpuTimer.endAndRead()
          : Promise.resolve(
              unsupportedGpuTiming(
                gpuEnabled
                  ? "A compatible disjoint timer query extension is unavailable."
                  : "GPU timer query is disabled in the paper profile.",
              ),
            );
      resolve({ startTimeMs, endTimeMs, wallMs, gpu });
    });
    viewer.scene.requestRender();
  });
}

function createGpuTimer(viewer: Viewer) {
  const canvas = viewer.scene.canvas;
  const webgl2 = canvas.getContext("webgl2");
  if (webgl2) {
    const extension = webgl2.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as WebGl2TimerExtension | null;
    if (!extension) {
      return null;
    }
    const query = webgl2.createQuery();
    if (!query) {
      return null;
    }
    return {
      begin: () => {
        webgl2.beginQuery(extension.TIME_ELAPSED_EXT, query);
        return true;
      },
      endAndRead: () => {
        webgl2.endQuery(extension.TIME_ELAPSED_EXT);
        return pollQuery(
          () => webgl2.getQueryParameter(query, webgl2.QUERY_RESULT_AVAILABLE),
          () => Number(webgl2.getQueryParameter(query, webgl2.QUERY_RESULT)),
          () => Boolean(webgl2.getParameter(extension.GPU_DISJOINT_EXT)),
          () => webgl2.deleteQuery(query),
          "EXT_disjoint_timer_query_webgl2",
        );
      },
    };
  }

  const webgl = canvas.getContext("webgl");
  const extension = webgl?.getExtension(
    "EXT_disjoint_timer_query",
  ) as WebGl1TimerExtension | null;
  const query = extension?.createQueryEXT();
  if (!webgl || !extension || !query) {
    return null;
  }
  return {
    begin: () => {
      extension.beginQueryEXT(extension.TIME_ELAPSED_EXT, query);
      return true;
    },
    endAndRead: () => {
      extension.endQueryEXT(extension.TIME_ELAPSED_EXT);
      return pollQuery(
        () =>
          Boolean(
            extension.getQueryObjectEXT(
              query,
              extension.QUERY_RESULT_AVAILABLE_EXT,
            ),
          ),
        () =>
          Number(
            extension.getQueryObjectEXT(query, extension.QUERY_RESULT_EXT),
          ),
        () => Boolean(webgl.getParameter(extension.GPU_DISJOINT_EXT)),
        () => extension.deleteQueryEXT(query),
        "EXT_disjoint_timer_query",
      );
    },
  };
}

async function pollQuery(
  isAvailable: () => boolean,
  readNanoseconds: () => number,
  isDisjoint: () => boolean,
  dispose: () => void,
  extension: string,
): Promise<GpuFrameTiming> {
  const deadline = performance.now() + 5_000;
  try {
    while (!isAvailable()) {
      if (performance.now() >= deadline) {
        return {
          extension,
          elapsedNanoseconds: { status: "invalid", reason: "query-timeout" },
          disjoint: null,
        };
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const disjoint = isDisjoint();
    return {
      extension,
      elapsedNanoseconds: disjoint
        ? { status: "invalid", reason: "gpu-disjoint" }
        : measured(readNanoseconds(), "ns"),
      disjoint,
    };
  } catch (error) {
    return {
      extension,
      elapsedNanoseconds: {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      disjoint: null,
    };
  } finally {
    dispose();
  }
}

function unsupportedGpuTiming(reason: string): GpuFrameTiming {
  return {
    extension: null,
    elapsedNanoseconds: { status: "unsupported", reason },
    disjoint: null,
  };
}

function measured<T>(value: T, unit: string): MetricValue<T> {
  return { status: "measured", value, unit };
}

import { Matrix4, type Ellipsoid, type Viewer } from "cesium";

export const DEFAULT_TILE_REQUEST_CONCURRENCY = 64;
export const DEFAULT_PRIMITIVE_BATCH_SIZE = 32;
export const GEO_TILE_STATS_SCHEMA_VERSION = 3;
export const TILE_GENERATION_REPORT_SCHEMA_VERSION = 1;
export const IDENTITY_MODEL_MATRIX = Matrix4.clone(Matrix4.IDENTITY);

/** Runs asynchronous work with a fixed number of streaming workers. */
export async function runStreamingWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      // Each worker exits through the bounds check after claiming all remaining items.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) {
          return;
        }
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

export function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Returns a monotonic high-resolution timestamp when the runtime provides one. */
export function now() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

/** Coalesces repeated render requests into at most one request per frame. */
export function createFrameRenderScheduler(viewer: Viewer, isCurrent: () => boolean) {
  let renderScheduled = false;

  return () => {
    if (renderScheduled) {
      return;
    }
    renderScheduled = true;

    void waitForNextFrame().then(() => {
      renderScheduled = false;
      if (isCurrent()) {
        viewer.scene.requestRender();
      }
    });
  };
}

export function getEllipsoidKey(ellipsoid: Ellipsoid) {
  const { x, y, z } = ellipsoid.radii;
  return `${x},${y},${z}`;
}

export function comparePlateIds(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);

  if (leftIsNumeric && rightIsNumeric && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function isDeepTimeGeoDebugEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("deepTimeGeoDebug") === "1";
}

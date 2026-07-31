import { canvasToBlob } from "./canvas.js";
import { RetainedTileImageAsset } from "./tileImageAsset.js";
import { now } from "./time.js";
import type { ExportTiming, TileImageOutputType } from "./types.js";

export type ExportResult = {
  asset: RetainedTileImageAsset;
  timing: ExportTiming;
};

export async function createAssetFromSnapshot(
  snapshotCanvas: HTMLCanvasElement,
  outputType: TileImageOutputType,
): Promise<ExportResult> {
  const width = snapshotCanvas.width;
  const height = snapshotCanvas.height;
  const exportStart = now();

  if (outputType === "dataUrl") {
    const encodeStart = now();
    const source = snapshotCanvas.toDataURL();
    const encodeMs = now() - encodeStart;
    return {
      asset: new RetainedTileImageAsset(source, width, height, "dataUrl"),
      timing: {
        exportMs: now() - exportStart,
        encodeMs,
      },
    };
  }

  if (typeof URL === "undefined" || typeof snapshotCanvas.toBlob !== "function") {
    const encodeStart = now();
    const source = snapshotCanvas.toDataURL();
    const encodeMs = now() - encodeStart;
    return {
      asset: new RetainedTileImageAsset(source, width, height, "dataUrl"),
      timing: {
        exportMs: now() - exportStart,
        encodeMs,
      },
    };
  }

  const encodeStart = now();
  const blob = await canvasToBlob(snapshotCanvas);
  const encodeMs = now() - encodeStart;
  return {
    asset: new RetainedTileImageAsset(URL.createObjectURL(blob), width, height, "blobUrl"),
    timing: {
      exportMs: now() - exportStart,
      encodeMs,
    },
  };
}

export function createCanvasAssetFromSnapshot(snapshotCanvas: HTMLCanvasElement) {
  return new RetainedTileImageAsset(
    snapshotCanvas,
    snapshotCanvas.width,
    snapshotCanvas.height,
    "canvas",
  );
}

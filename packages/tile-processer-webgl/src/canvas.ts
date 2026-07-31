import type { CesiumTileProcesserOptions } from "./types.js";

export function isCanvasElement(value: unknown): value is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement;
}

export function cloneCanvas(sourceCanvas: HTMLCanvasElement) {
  if (typeof document === "undefined") {
    throw new Error("无法创建Canvas快照：当前环境不存在document对象");
  }

  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = sourceCanvas.width;
  snapshotCanvas.height = sourceCanvas.height;
  const context = snapshotCanvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建Canvas 2D上下文");
  }
  context.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  return snapshotCanvas;
}

export function disposeSnapshotCanvas(snapshotCanvas: HTMLCanvasElement) {
  snapshotCanvas.width = 0;
  snapshotCanvas.height = 0;
}

export function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas导出Blob失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export function createInternalCanvas(options: CesiumTileProcesserOptions) {
  if (typeof document === "undefined") {
    throw new Error("无法创建内部Canvas：当前环境不存在document对象");
  }

  const canvas = document.createElement("canvas");
  canvas.width = options.width ?? 256;
  canvas.height = options.height ?? 256;
  return canvas;
}

/** Handles browser-side file downloads for exported experiment artifacts. */
import type { ExperimentExportInfo } from "../experiment";

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJson(info: ExperimentExportInfo, fileName: string) {
  const blob = new Blob([JSON.stringify(info, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, fileName);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(
        new Error(
          "Unable to export the viewer canvas. Check whether the imagery source allows canvas reads.",
        ),
      );
    }, "image/png");
  });
}

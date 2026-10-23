import { createInternalCanvas } from "./canvas.js";
import { LegacyCanvasRendererPool } from "./renderers/legacyCanvasRenderer.js";
import { SingleContextTileRenderer } from "./renderers/singleContextRenderer.js";
import type { CesiumTileProcesserOptions, RendererPool } from "./types.js";

export function createRendererPool(
  externalCanvas: HTMLCanvasElement | undefined,
  options: CesiumTileProcesserOptions,
): RendererPool {
  return options.legacyCanvasPool === true
    ? new LegacyCanvasRendererPool(externalCanvas, options)
    : new SingleContextTileRenderer(externalCanvas ?? createInternalCanvas(options), options);
}

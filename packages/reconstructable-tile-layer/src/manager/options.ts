import type { CesiumTileProcessor } from "rtl-webgl-tile-processor";

import type { ResolvedFeatureFiles, SimpleGeoReconstructManagerOptions } from "./types.js";

/** Resolves the preferred processor option while preserving the legacy spelling. */
export function resolveTileProcessor(
  options: SimpleGeoReconstructManagerOptions,
): CesiumTileProcessor {
  // The public union requires one spelling; the assertion preserves the legacy
  // JavaScript failure timing if an untyped caller supplies neither one.
  return (options.processor ?? options.processer) as CesiumTileProcessor;
}

/** Resolves modern and legacy source options to the internal URL set. */
export function resolveFeatureFiles(
  options: SimpleGeoReconstructManagerOptions,
): ResolvedFeatureFiles {
  const source = options.featureSource;
  const sourceConfig = typeof source === "string" ? { url: source } : source;
  const polygon = sourceConfig?.url ?? options.files?.polygon;
  const rots = options.rotationSources ?? options.files?.rots;

  if (!polygon) {
    throw new Error("SimpleGeoReconstructManager requires a feature source URL.");
  }
  if (!rots || rots.length === 0) {
    throw new Error("SimpleGeoReconstructManager requires at least one ROT URL.");
  }

  return {
    polygon,
    rots,
    polygonRenderIntent: sourceConfig?.polygonRenderIntent ?? options.files?.polygonRenderIntent,
  };
}

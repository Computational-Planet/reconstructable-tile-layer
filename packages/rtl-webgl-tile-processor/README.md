# rtl-webgl-tile-processor

This package implements the manuscript's **WebGL processor**. It requests
service-delivered source tiles, remaps WebMercator texture coordinates when
needed, triangulates tile-local `TileClipArea` masks, and exports transparent
processed tile images for Cesium materials.

The recommended paper-aligned class name is `WebGLTileProcessor`. The
existing `CesiumTileProcessor` and historical `CesiumTileProcesser` names
remain aliases of the same implementation.

## Installation

```sh
pnpm add rtl-webgl-tile-processor cesium
```

`earcut` is bundled for mask triangulation. Its license is recorded in
`THIRD_PARTY_NOTICES.md`.

## Create a processor

```ts
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

const webglProcessor = new WebGLTileProcessor({
  width: 256,
  height: 256,
  outputType: "canvas",
  slotCount: 4,
});
```

The package requires a browser DOM, `HTMLCanvasElement`, WebGL 1 with depth
and stencil buffers, and a Cesium `ImageryProvider`. Cross-origin imagery must
permit canvas use.

## Complete source tile

```ts
const processedImage = await webglProcessor.processSourceTileImage(x, y, level, imageryProvider);
```

## Plate-domain-masked source tile

```ts
const clipAreas = [
  {
    polygons: [
      {
        exterior: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
        interiors: [[0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75, 0.25, 0.25]],
      },
    ],
  },
];

const processedImage = await webglProcessor.processMaskedSourceTileImage(
  x,
  y,
  level,
  clipAreas,
  imageryProvider,
);
```

Coordinates are tile-local and normally lie in `[0, 1]`. A null result means
the work was cancelled or no usable processed image could be produced.

## Processed image ownership

Every non-null `ProcessedTileImage` is retained for the caller. Call
`release()` exactly once for every returned reference, including cache hits.
The `source` is a blob URL, data URL, or canvas according to `outputType`.

`clearBuffer()` releases cached results and cancels queued work while leaving
the processor usable. `destroy()` permanently releases its WebGL contexts,
render slots, textures, programs, buffers, canvases, and caches.

Use `getRuntimeStats()` for cache, queue, provider, masking, rendering, and
export counters.

## RTL method relationship

Complete tiles bypass the clipping mask. Boundary tiles use the union of their
tile-local plate-domain areas as a stencil mask, then draw the source texture
only where the stencil is active. This is the implementation described in the
Methodology subsection “GPU tile masking, rendering, and age-aware reuse.”

## Compatibility

All previous `reproject*` methods, `getPoolStats()`, `clearBuffer()`, and
the existing class and type names remain available. The paper-aligned methods
are thin aliases and do not change caching, masking, or output behavior.

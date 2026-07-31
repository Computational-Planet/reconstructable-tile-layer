# tile-processer-webgl

`tile-processer-webgl` reprojects Cesium imagery tiles in the browser and can
clip the result to one or more tile-local polygons. It uses a WebGL 1 context,
with reusable texture and framebuffer slots by default, and returns retained
image assets that can be passed to Cesium materials or ordinary browser APIs.

The original public class name, `CesiumTileProcesser`, remains available for
compatibility. New code can use the correctly spelled `CesiumTileProcessor`
alias; both names reference the same class.

## Installation

Install the package and its Cesium peer dependency:

```sh
pnpm add tile-processer-webgl cesium
```

The small `earcut` triangulation dependency is bundled so both the ESM and
CommonJS entry points work on every supported Node.js runtime. Its ISC
license is included in `THIRD_PARTY_NOTICES.md`.

## Requirements

- A browser environment with `document`, `HTMLCanvasElement`, and WebGL 1.
- A WebGL implementation with depth and stencil buffers.
- A Cesium `ImageryProvider` whose `requestImage` method can load the requested
  tile.
- Cross-origin image responses that permit canvas use when the provider is on a
  different origin. Otherwise browser canvas export may be blocked.

The package does not create a Cesium viewer and does not manage imagery layers.

## Basic usage

```ts
import type { ImageryProvider } from "cesium";
import { CesiumTileProcessor } from "tile-processer-webgl";

const processor = new CesiumTileProcessor({
  width: 256,
  height: 256,
  outputType: "blobUrl",
  slotCount: 4,
});

async function appendProcessedTile(imageryProvider: ImageryProvider) {
  const asset = await processor.reprojectTileImage(0, 0, 0, imageryProvider);
  if (!asset) {
    return;
  }

  try {
    if (typeof asset.source !== "string") {
      return;
    }

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Tile image failed to load.")), {
        once: true,
      });
      image.src = asset.source as string;
    });
    document.querySelector("#tile-output")?.append(image);
  } finally {
    asset.release();
  }
}
```

You may also pass an `HTMLCanvasElement` as the first constructor argument. The
processor sets that canvas to the configured output dimensions.

Image-returning methods resolve to `null` when the provider supplies no image,
the clip mask is empty, the processor has been destroyed, queued work is
cancelled by `clearBuffer()`, or a caught request, render, or export operation
fails. Caught processing failures are logged to the console instead of
rejecting the returned promise, so callers should treat `null` as a recoverable
tile failure.

## Tile and clip coordinates

The `x`, `y`, and `level` arguments use the same tile coordinates as the Cesium
imagery provider. The provider's tiling scheme determines whether Web Mercator
texture-coordinate correction is required.

Clip rings are flat arrays in tile-local coordinates:

```ts
const clipArea = {
  polygons: [
    {
      exterior: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
      interiors: [[0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75, 0.25, 0.25]],
    },
  ],
};

const asset = await processor.reprojectMultiClippedTileAreaImage(
  0,
  0,
  0,
  [clipArea],
  imageryProvider,
  "canvas",
);
```

Coordinates normally lie in `[0, 1]`, where `(0, 0)` and `(1, 1)` are opposite
corners of the tile. `reprojectClippedTileImage` accepts one exterior ring;
`reprojectMultiClippedTileAreaImage` supports multiple polygons and holes.

## Output types

The image methods accept an optional output type and otherwise use the
constructor's `outputType`:

- `"blobUrl"` returns an object URL. `release()` revokes it when the final
  retained reference is released.
- `"dataUrl"` returns a PNG data URL. This is convenient but requires a
  synchronous encoding step and usually uses more memory.
- `"canvas"` returns an `HTMLCanvasElement`. `release()` clears its dimensions
  when the final retained reference is released.

Every non-null `TileImageAsset` is retained for the caller. Call `release()`
exactly once for each returned reference, including cache hits. The deprecated
`reprojectTile` and `reprojectClippedTile` methods return plain data URL strings
and manage their temporary asset references internally.

## Cache and processor lifecycle

`clearBuffer()` releases cached processed assets, clears source imagery caches,
and resolves work that is still queued with `null`. The processor remains usable
afterward. Assets already returned to callers remain valid until their owners
call `release()`.

`destroy()` calls `clearBuffer()`, releases WebGL buffers, textures, programs,
and contexts, and clears internally managed canvases. Destruction is permanent;
create a new processor for later work.

Use `getPoolStats()` for a snapshot of queue, cache, WebGL context, timing, and
resource counters. `recordMaterialApplyMs()` lets a Cesium integration add its
material-application time to those cumulative statistics.

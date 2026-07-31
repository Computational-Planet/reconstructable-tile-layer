# polygon-tile-quadtree

`polygon-tile-quadtree` maps geographic polygon geometry onto a Cesium tiling
scheme and returns the visible tiles at a requested level. It supports both the
original single-ring API and an area API with multiple polygons and interior
rings.

## Installation

```sh
pnpm add polygon-tile-quadtree cesium
```

## Area API

Use `GeographicClipArea` for longitude/latitude coordinates in degrees. Every
ring is a flat coordinate array and should repeat its first coordinate pair at
the end.

```ts
import { GeographicTilingScheme } from "cesium";
import { QuadTreeTileProcessor, type GeographicClipArea } from "polygon-tile-quadtree";

const area: GeographicClipArea = {
  polygons: [
    {
      exterior: [10, 10, 30, 10, 30, 30, 10, 30, 10, 10],
      interiors: [[15, 15, 20, 15, 20, 20, 15, 20, 15, 15]],
    },
  ],
};

const processor = new QuadTreeTileProcessor(new GeographicTilingScheme(), area);

const tiles = processor.getTilesByLevel(5);
```

Area results use `NormalizedClipArea`: coordinates are local to each tile and
normally range from `0` to `1`. A result's `clipArea` retains multiple polygons
and interior rings.

## Single-Ring API

Single-ring input remains supported alongside the area API.

```ts
import { GeographicTilingScheme } from "cesium";
import { QuadTreeTileProcessor } from "polygon-tile-quadtree";

const closedRing = [10, 10, 20, 10, 20, 20, 10, 20, 10, 10];
const processor = new QuadTreeTileProcessor(new GeographicTilingScheme(), closedRing);

const tiles = [];
processor.findTilesByLevel(5, tiles);
```

For compatibility, the original misspelled name `QuadTreeTileProcesser` is
still exported as the same class. New code should use `QuadTreeTileProcessor`.

## Traversal Methods

The allocation-friendly facade methods create a result array when one is not
provided:

- `getTilesByLevel(level, result?)`
- `getTilesInBoundingSphere(level, boundingSphere, result?)`
- `getRootTiles(result?)`

The compatible accumulator methods remain unchanged:

- `findTilesByLevel(level, result)`
- `findTilesByLevelInBoundingSphere(level, boundingSphere, result)`
- `findTilesAtRoot(result)`

Every `NodeInfo` contains `tileXYL` (`x`, `y`, and `l`) and a legacy `polygon`
field. `polygon: null` means the complete tile is visible and no clipping is
required. Area-mode results also expose `clipArea` so holes and disjoint
polygons are not lost.

## Bounds and Updates

`boundingSpheres` contains model-space bounds for the processor extents.
Call `updateBoundingSpheres(modelMatrix)` after changing the plate model
matrix, then use `intersectsCurrentBoundingSphere` or
`getTilesInBoundingSphere` for spatial filtering.

`updatePolygon` rebuilds the tree with new geometry. `updateProvider` rebuilds
when the provider's tiling-scheme class or ellipsoid radii differ from the
current scheme. Applications using custom schemes with other mutable layout
properties should construct a new processor after those properties change.

## Additional Exports

The package root exports the node classes, `TileClipMode`, `TileXYL`, clipping
area types, normalization helpers, legacy geometry helpers, and constants.
Prefer importing from the package root rather than from internal file paths.

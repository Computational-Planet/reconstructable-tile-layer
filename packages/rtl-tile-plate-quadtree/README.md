# rtl-tile-plate-quadtree

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This package implements the manuscript's **tile--plate quadtree indexing**
stage. One `PlateDomainTileQuadtree` maps a polygonal plate-domain feature
from the modern geographic frame to source tiles in the imagery provider's
exact tiling scheme.

The package retains MultiPolygon parts and interior rings through
`TileClipArea`. Selected entries represent no coverage, complete coverage, or
partial coverage that must be masked by the WebGL processor.

## Highlights

- Uses the imagery provider's exact Cesium tiling scheme and ellipsoid.
- Preserves MultiPolygon parts and holes in tile-local clip areas.
- Distinguishes empty, complete, and partially covered source tiles.
- Supports explicit-level and conservative view-aware queries.

## Installation

```sh
pnpm add rtl-tile-plate-quadtree cesium
```

## Usage

```ts
import { GeographicTilingScheme } from "cesium";
import { PlateDomainTileQuadtree, type PlateDomainGeometry } from "rtl-tile-plate-quadtree";

const plateDomain: PlateDomainGeometry = {
  polygons: [
    {
      exterior: [10, 10, 30, 10, 30, 30, 10, 30, 10, 10],
      interiors: [[15, 15, 20, 15, 20, 20, 15, 20, 15, 15]],
    },
  ],
};

const tilePlateIndex = new PlateDomainTileQuadtree(new GeographicTilingScheme(), plateDomain);

const entries = tilePlateIndex.queryTilesAtLevel(5);
```

Input coordinates are longitude/latitude degrees. Rings should repeat their
first coordinate pair at the end. A returned `TilePlateIndexEntry` contains
`tileXYL` and, for partial coverage, a tile-local `clipArea` whose axes
normally span `[0, 1]`. A null legacy `polygon` value denotes complete tile
coverage.

## View-aware query

```ts
const candidates = tilePlateIndex.queryTilesInBoundingSphere(level, reconstructedViewSphere);
```

Call `updateBoundingSpheres(modelMatrix)` before a reconstructed-frame
bounding-sphere query. The test is conservative: it can retain candidates whose
exact rotated footprint lies outside the view.

`updateProvider(provider)` rebuilds the index when the tiling-scheme class or
ellipsoid changes. Construct a new index when a custom tiling scheme changes
other layout properties.

## Geometry behavior

- Geographic and WebMercator level-zero layouts come from the Cesium tiling
  scheme.
- Children use exact `tileXYToRectangle` bounds.
- Partial intersections are normalized back to each child tile's `[0, 1]^2`
  domain.
- General antimeridian-crossing rings must be supplied as dateline-separated
  polygon components.

These rules correspond to the Methodology subsection “Tile-plate quadtree
indexing and reconstruction task generation.”

## Compatibility

`QuadTreeTileProcessor` and the historical `QuadTreeTileProcesser` remain
aliases of `PlateDomainTileQuadtree`. Existing traversal methods
(`getTilesByLevel`, `getTilesInBoundingSphere`, `getRootTiles`, and the
accumulator-style `find*` methods) remain unchanged.

# rtl-tile-plate-quadtree

[Monorepo](../../../../README.md) · English | [简体中文](README.zh-CN.md)

This package implements the manuscript's **tile--plate quadtree indexing**
stage. One `PlateDomainTileQuadtree` maps a polygonal plate-domain feature
from the modern geographic frame to source tiles in the imagery provider's
exact tiling scheme.

The package retains MultiPolygon parts and interior rings through `TileClipArea`.
Nodes distinguish NONE, FULL and NEED_CLIP coverage. Queries omit NONE nodes and
return complete tiles or partially covered tiles for WebGL masking.

## Highlights

- Uses the imagery provider's exact Cesium tiling scheme and ellipsoid.
- Preserves MultiPolygon parts and holes in tile-local clip areas.
- Distinguishes empty, complete, and partially covered source tiles.
- Supports explicit-level and conservative view-aware queries.

## Use through RTL

This module's single source lives in RTL's `modules/tile-plate-quadtree`. If RTL is installed, use:

```ts
import { PlateDomainTileQuadtree } from "reconstructable-tile-layer/quadtree";
```

No standalone package installation is needed. The installation and examples below
remain valid for standalone use. Run `pnpm --filter rtl-tile-plate-quadtree build` from the
repository root to produce the independent ESM, CommonJS and declaration outputs.
Both distributions share source; their build outputs and class identities are separate.

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
normally span `[0, 1]`.

## View-aware query

```ts
const candidates = tilePlateIndex.queryTilesInBoundingSphere(level, modernViewSphere);
```

Tile traversal uses a sphere in the **modern source frame**. Inverse-rotate a
reconstructed-view sphere with the plate's matrix before passing it here.
`updateBoundingSpheres(modelMatrix)` updates the plate-domain bounds used by
`intersectsCurrentBoundingSphere` for the preceding candidate test; it does not
transform the tile nodes. RTL's `refineTilesForView` and `querySourceRegions`
coordinate these two steps.

NONE nodes are pruned before subdivision; only intersecting FULL and NEED_CLIP
nodes contribute at the requested level. Bounding-sphere intersection remains
conservative and is not an exact test against the clipped plate footprint.

`updateProvider(provider)` rebuilds the index from its source geometry and the
provider's tiling scheme on every call, including changes to coverage, root-grid
layout or a custom tiling scheme of the same class.

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

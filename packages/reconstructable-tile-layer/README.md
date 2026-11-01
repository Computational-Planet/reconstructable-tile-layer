# reconstructable-tile-layer

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This package implements the manuscript's browser-side **Reconstructable Tile
Layer (RTL)** object. It joins a published imagery provider with polygonal
plate-domain features, ROT finite rotations, tile--plate indexes, composite
task scheduling, WebGL-processed images, and Cesium primitives.

The public layer class is `ReconstructableTileLayer`.

GPlates reading, rotation mathematics, tile indexing and WebGL processing live
in four source modules under `modules/`. RTL bundles their implementation and
declarations; consumers do not need to install the four standalone module packages.
The demo owns file selection and object-URL lifetimes.

## Highlights

- Registers published imagery services without republishing their tiles.
- Combines plate-domain features, finite rotations, and tile processing in one
  executable age-aware layer.
- Schedules foreground and background composite tasks while retaining reusable
  processed images.
- Supports adaptive root loading, explicit source levels, and view-aware
  refinement.
- Synchronizes Cesium scene modes and exposes runtime diagnostics.

## Installation

```sh
pnpm add reconstructable-tile-layer cesium
```

Rendering requires a browser DOM, WebGL and a Cesium viewer. The caller owns the
viewer, imagery provider and WebGL processor. Importing a public entry does not
create these resources. The `/gplates` entry does not import Cesium; GPML parsing
still requires `DOMParser`, and URL readers require `fetch`.

## Public entries and module boundaries

| Entry                                  | Responsibility                                          | Optional standalone distribution                                   |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `reconstructable-tile-layer`           | Layer, scheduling, retained records and processor       | Main installation                                                  |
| `reconstructable-tile-layer/gplates`   | ROT/GPML/GPMLZ reading, feature records and diagnostics | [rtl-gplates-source](modules/gplates-source/README.md)             |
| `reconstructable-tile-layer/rotation`  | Finite rotations and reference-plate chains             | [rtl-finite-rotation](modules/finite-rotation/README.md)           |
| `reconstructable-tile-layer/quadtree`  | Tile–plate indexes and clip areas                       | [rtl-tile-plate-quadtree](modules/tile-plate-quadtree/README.md)   |
| `reconstructable-tile-layer/processor` | Source image requests, reprojection and WebGL masking   | [rtl-webgl-tile-processor](modules/webgl-tile-processor/README.md) |

Every entry has ESM, CommonJS and TypeScript declarations. Root and subpath entries
share implementations within the same module format, so `WebGLTileProcessor` from
the root and `/processor` is the same constructor. Use public entries instead of
importing `src`, `dist` or `modules` paths.

The four modules retain their own manifests, builds, tests and standalone package
names. Their source is compiled into RTL rather than externalized as runtime
dependencies. Development-only workspace edges record build order and cache
invalidation. A change to a module requires rebuilding/releasing RTL to reach RTL
consumers; publishing the standalone module does not update an installed RTL.

Standalone builds have their own class identities. RTL accepts the public structural
`TileProcessor` contract, so a compatible standalone processor can be injected
without depending on private class fields. Prefer one distribution per application;
mixing both may duplicate code and caches. Cesium remains a shared peer dependency.
The caller still creates and destroys the processor, which may be shared by layers.

GPlates records cross module boundaries as plain data. Rotation owns the mathematics,
quadtree owns indexing, and processor owns image processing; none imports the RTL
manager. The standalone rotation build includes the reader code it uses and does not
require a separate `rtl-gplates-source` installation.

Raster source and imagery-provider packages are optional extensions.
GeoJSON reconstruction is not part of RTL; a vector extension can use these public contracts.

## Usage

```ts
import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider, Viewer } from "cesium";
import { ReconstructableTileLayer, WebGLTileProcessor } from "reconstructable-tile-layer";

const ellipsoid = Ellipsoid.WGS84;
const viewer = new Viewer("cesiumContainer", {
  baseLayer: false,
  ellipsoid,
  requestRenderMode: true,
});

const imageryProvider = new UrlTemplateImageryProvider({
  url: "/tiles/topography/{z}/{x}/{y}.png",
  tilingScheme: new GeographicTilingScheme({ ellipsoid }),
  minimumLevel: 0,
  maximumLevel: 8,
});

const webglProcessor = new WebGLTileProcessor({
  outputType: "canvas",
  slotCount: 4,
});

const rtl = await ReconstructableTileLayer.create({
  provider: imageryProvider,
  processor: webglProcessor,
  featureSource: {
    url: "/models/static-polygons.gpmlz",
    polygonRenderIntent: "all-polygons-area",
  },
  rotationSources: ["/models/rotations.rot"],
  initialAge: 0,
  anchorPlateId: "0",
  primitiveTransformMode: "dynamic3D",
  referenceEllipsoid: ellipsoid,
});

rtl.bindSceneModeSync(viewer);
await rtl.loadRootTiles(viewer);
await rtl.loadSourceTilesAtLevel(viewer, 4);
await rtl.setReconstructionAge(120);

const refinement = await rtl.refineTilesForView(viewer, {
  minLevel: 2,
  maxLevel: 8,
  targetTileScreenSize: 256,
  maxRawViewTileCount: 128,
});

console.log(refinement, rtl.getRuntimeStats());

rtl.destroy(viewer);
webglProcessor.destroy();
viewer.destroy();
```

Use `new ReconstructableTileLayer(options)` followed by
`await rtl.initialize()` when an explicit preparation phase is preferable.

## RTL inputs

### Optional local scientific rasters

The main package keeps its existing `ImageryProvider` interface and has no raster,
NetCDF, HDF5 or GDAL dependency. Install the optional adapter when needed:

```sh
pnpm add rtl-raster-imagery-provider rtl-raster-source
```

```ts
import { openRasterSource } from "rtl-raster-source";
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

const source = await openRasterSource(file);
const localProvider = await RasterImageryProvider.fromSource(source, {
  ellipsoid: viewer.scene.globe.ellipsoid,
  style: { kind: "single-band", band: 0, domain: [-8000, 4000] },
});
// Use only when file coordinates are in the modern frame of the selected model.
await rtl.setImageryProvider(viewer, localProvider);
await rtl.loadRootTiles(viewer);
await rtl.setReconstructionAge(100);

// Detach before releasing the provider/source. The processor/viewer remain caller-owned.
rtl.destroy(viewer);
localProvider.destroy();
source.close();
```

For NetCDF, open `rtl-raster-source/netcdf`, inspect `describeVariable`, select a
2D slice, then pass that source to the adapter. A dataset owns its slices; close
it after the providers and slices. See each package's README for worker hosting
and ownership examples.

Already-paleo snapshots such as PaleoDEM use ordinary Cesium imagery at an explicit
display age, without RTL rotation. Model-calendar time must not be interpreted as
geological age. Transporting modern elevation with a plate model does not predict
paleo topography. Numeric point queries and inverse raster sampling are not implemented
by this integration; source-region queries return geographic bounds rather than values.

Provider replacement invalidates cached tile coverage, age/rebuild work and pending
image delivery. `clear()` keeps the manager reusable. `destroy()` invalidates pending
initialization and releases retained imagery; the caller then closes owned sources.
An in-flight view refinement interrupted by replacement reports `stale-source`.

### Published imagery service

`provider` supplies the source tile coordinates, tiling scheme, image
request, and service access behavior. Geographic EPSG:4326 and WebMercator
tiling schemes are supported. Use `setImageryProvider(viewer, provider)` to
replace the source; the RTL clears provider-specific prepared state and must be
loaded again.

### Plate-domain features

`featureSource` accepts GPML, GPMLZ, XML, the custom JSON
feature-array format, or an uploaded `blob:` URL. Area features provide the plate
identifier, validity interval, and `TileClipArea`. Parsed line-like and
unclassified features remain available in import diagnostics but do not create
reconstruction units.

`polygonRenderIntent: "classified"` fills classified area features.
`"all-polygons-area"` treats every parsed polygon geometry as an area.

### Finite-rotation model

`rotationSources` contains one or more GPlates ROT URLs.
`anchorPlateId` defaults to `"0"`; pass `null` to recurse without forcing
an identity anchor. Ages are millions of years ago (Ma).

## Loading and executable age state

- `loadRootTiles(viewer)` creates an adaptive initial representation.
- `loadSourceTilesAtLevel(viewer, level)` loads all relevant source tiles at
  one explicit level.
- `refineTilesForView(viewer, options)` selects a source level from the current
  reconstructed view, or locks it to `options.level` when supplied.
- `refineTilesForView(viewer, level, options)` locks the source level while keeping
  view filtering. An `undefined` level uses `options.level`, or automatic selection
  if neither is set. A numeric argument takes precedence over `options.level`.
- `setReconstructionAge(age)` changes visibility and plate transforms while
  reusing retained processed images.

A refinement result contains the selected `level`, `loadedCount`, and
`taskCount`. `skippedReason` explains a no-op caused by missing view state,
unprepared input, or a stale age request.

```ts
await rtl.refineTilesForView(viewer); // automatic selection
await rtl.refineTilesForView(viewer, { level: 0 }); // current view at exactly L0
const level: number | undefined = fixedLevelEnabled ? selectedLevel : undefined;
await rtl.refineTilesForView(viewer, level);
```

A fixed level must be a nonnegative integer within the provider's declared range;
invalid values reject with `RangeError`. `minLevel`, `maxLevel`,
`targetTileScreenSize`, and `maxRawViewTileCount` affect automatic selection only.
Fixed levels are not lowered to satisfy that tile budget. The same rules apply to
`loadFineTilesInView` and `loadFineTilesInViewAtLevel`.

Loading accumulates processed tiles and skips tasks already loaded or pending;
`refineTilesForView` does not clear existing coverage, including when its level
changes. Call `clear(viewer)` to reset coverage explicitly. The demo separately
chooses to clear when switching to a different whole-layer specified-level load.

## Query modern source regions

`querySourceRegions(rectangle, { level, age?, clipToView? })` uses the same bounding-sphere candidate
selection, inverse plate rotations, and quadtree traversal as view refinement. At the
exact requested `level`, it selects intersecting FULL and NEED_CLIP tiles from domains
valid at the requested age. NONE nodes are pruned without descending into them.
`level` must be an integer within the provider's supported range; it is never adjusted
automatically. Omit `age` to use the layer's current age. Initialize the layer first;
the query expands the spatial index as needed but neither fetches imagery nor changes
loaded tiles, task statistics, or the displayed age. Already-loaded tiles remain eligible.

```ts
import { Rectangle, Math as CesiumMath } from "cesium";

const result = await rtl.querySourceRegions(Rectangle.fromDegrees(100, 20, 110, 30), {
  level: 4,
  age: 120,
});
if (!result.skippedReason) {
  for (const rectangle of result.rectangles) {
    const bounds = [rectangle.west, rectangle.south, rectangle.east, rectangle.north].map(
      CesiumMath.toDegrees,
    );
    console.log(bounds);
  }
}
```

`SourceRegionQueryResult` contains `age`, `level`, `regions`, combined `rectangles`, and optional `skippedReason`
(`not-ready`, `stale-source`, or `stale-age`). Each `ReconstructionSourceRegion`
contains `plateId`, `modernBoundingSphere`, and per-plate `rectangles` in radians.
By default, the combined rectangles deduplicate selected tiles across plates and pack adjacent
tiles into solid rectangles without filling holes or including unselected tiles.
Bounds follow the provider's tile grid (including WebMercator latitude spacing) and
are split at the antimeridian. A plate with no selected tiles contributes no region.
Set **`clipToView: true`** for point-sized or other narrow queries: each plate's
selected coverage is intersected with the geographic bounds of its inverse-rotated
view sphere before combining results. This preserves the query's small footprint
instead of expanding it to whole tiles. Empty intersections are omitted and identical
or contained bounds are removed; the same level, age and NONE-node filters still apply.
Returned rectangles are conservative bounds, not exact plate-clipped footprints;
they can still contain neighboring units. Service-specific requests and legend grouping
remain application responsibilities. The exported `boundingSphereToGeographicRectangles`
and `splitGeographicRectangle` helpers are independently usable geometry utilities.

## Composite tasks and retained state

Feature contributions are merged into `CompositeTileTask` objects by plate
identifier, validity interval, and source-tile coordinate. Foreground tasks for
the current age complete first; other valid model states can be prepared in the
background. Each successful task becomes a `ProcessedTileRecord` containing
the retained image, task metadata, and zero or more Cesium primitives.

`dynamic3D` retains primitives and changes visibility and
`Primitive.modelMatrix`. `bakedInstance` retains processed images but
rebuilds age-visible primitives with transforms on geometry instances.
`bindSceneModeSync(viewer)` selects the appropriate mode during Cesium scene
changes.

## Lifecycle and diagnostics

Independent RTL instances can share one processor. Give each instance its own
caller-owned `primitiveCollection`, set `orderedRendering: true`, and opt out of
global cache resets with `clearProcessorOnReset: false`. Order those containers
to stack raster surfaces. `rtl.show` and `rtl.opacity` control layer presentation
and survive age updates, clearing and reloading. RTL only destroys its own child
collection, leaving the caller's parent intact.

`createTileSurfaceAppearance(image, { ordered: true, opacity })` gives other
fixed-coordinate surfaces the same alpha blending behavior. Ordered rendering
targets coincident raster surfaces on an ellipsoid, not general 3D transparency.
Opacity is applied per surface. Retaining multiple levels can blend overlapping
coverage more than once; an application that needs only one coverage set can
clear it explicitly before reloading. RTL does not automatically evict old levels.

In shared mode, clearing one RTL leaves other sources' caches intact. Before
closing a source, destroy its referencing layers, call
`processor.clearProvider(provider)`, then close the provider. Destroy the processor
when the whole shared runtime ends. Layer lists, visibility age ranges and local
file ownership remain application responsibilities.

`clear(viewer)` removes layer-owned primitives and processed tile state while
keeping imported plate-domain and finite-rotation data ready. `destroy(viewer)`
also removes listeners and releases all layer-owned image references. It does
not destroy the caller-owned WebGL processor or viewer.

`getRuntimeStats()` reports task counts, retained records and images, primitive
counts, texture-payload estimates, and import diagnostics.
`getLastReconstructionTaskReport()` reports foreground and background
completion for the latest generation.

## Method limits

RTL reconstructs the service-delivered visual layer. It does not restore source
attributes, topology, feature identity, or numerical raster values. General
antimeridian-crossing rings must be supplied as dateline-separated polygon
components. Service access, CORS, licensing, supported tile organization, model
coverage, and browser resources remain application constraints.

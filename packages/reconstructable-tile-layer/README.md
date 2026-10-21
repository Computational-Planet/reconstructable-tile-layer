# reconstructable-tile-layer

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This package implements the manuscript's browser-side **Reconstructable Tile
Layer (RTL)** object. It joins a published imagery provider with polygonal
plate-domain features, ROT finite rotations, tile--plate indexes, composite
task scheduling, WebGL-processed images, and Cesium primitives.

The recommended public class is `ReconstructableTileLayer`. The existing
`SimpleGeoReconstructManager` name remains an alias of the same class.

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
pnpm add reconstructable-tile-layer rtl-webgl-tile-processor cesium
```

The package is browser-only. It requires `fetch`, the DOM, WebGL, and a Cesium
viewer. The caller owns the viewer, imagery provider, and WebGL processor.

## Usage

```ts
import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider, Viewer } from "cesium";
import { ReconstructableTileLayer } from "reconstructable-tile-layer";
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

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
it after the providers and slices. Optional `rtl-raster-converter` exports numeric
COG data with explicitly hosted GDAL assets; no conversion is required for direct
display. See each package's README for worker hosting and ownership examples.

Already-paleo snapshots such as PaleoDEM use ordinary Cesium imagery at an explicit
display age, without RTL rotation. Model-calendar time must not be interpreted as
geological age. Transporting modern elevation with a plate model does not predict
paleo topography. Query/inverse sampling is not implemented by this integration.

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

`featureSource` accepts GPML, GPMLZ, XML, the repository's legacy JSON
feature array, or an uploaded `blob:` URL. Area features provide the plate
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
  reconstructed view.
- `refineTilesForView(viewer, level, options)` uses an explicit clamped level
  while keeping view filtering.
- `setReconstructionAge(age)` changes visibility and plate transforms while
  reusing retained processed images.

A refinement result contains the selected `level`, `loadedCount`, and
`taskCount`. `skippedReason` explains a no-op caused by missing view state,
unprepared input, or a stale age request.

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
Opacity is applied per surface; applications should replace old LOD coverage
before loading a different level to avoid blending overlapping levels twice.

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

## Compatibility

The original `SimpleGeoReconstructManager`, `provider`, `processor`,
`featureSource`, `rotationSources`, `initialAge`, `setAge`,
`setProvider`, `loadTilesOnLevel`, `loadFineTilesInView`,
`loadTilesAtRoot`, `getStats`, and `getLastGenerationReport` interfaces
remain available. Historical `processer` and `PaleoData.time.begine`
spellings are retained for existing consumers.

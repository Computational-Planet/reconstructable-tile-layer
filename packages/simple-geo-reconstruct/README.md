# simple-geo-reconstruct

`simple-geo-reconstruct` connects GPlates feature data and rotation models to
Cesium imagery. It imports polygon features, builds per-feature tile quadtrees,
reprojects imagery through `tile-processer-webgl`, applies plate rotations, and
owns the Cesium primitives created for the reconstructed tiles.

The package is browser-only. It requires the DOM, `fetch`, WebGL, and a Cesium
viewer configured with an ellipsoid compatible with the imagery provider and
rotation model.

## Installation

Install the reconstruction package and Cesium in the application that owns the
viewer:

```sh
pnpm add simple-geo-reconstruct tile-processer-webgl cesium
```

The example below constructs the tile processor directly, so it is listed as an
application dependency. `plates-rotation-operator` and
`polygon-tile-quadtree` are internal dependencies resolved by a normal
published installation.

## Complete Example

The manager does not own the viewer or tile processor. Destroy resources in the
order shown below when the application is disposed.

```ts
import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider, Viewer } from "cesium";
import { SimpleGeoReconstructManager } from "simple-geo-reconstruct";
import { CesiumTileProcessor } from "tile-processer-webgl";

const ellipsoid = Ellipsoid.WGS84;
const viewer = new Viewer("cesiumContainer", {
  baseLayer: false,
  ellipsoid,
  requestRenderMode: true,
});

const provider = new UrlTemplateImageryProvider({
  url: "/tiles/topography/{z}/{x}/{y}.png",
  tilingScheme: new GeographicTilingScheme({ ellipsoid }),
  minimumLevel: 0,
  maximumLevel: 8,
});

const processor = new CesiumTileProcessor({
  outputType: "canvas",
  slotCount: 4,
});

const manager = await SimpleGeoReconstructManager.create({
  processor,
  provider,
  featureSource: {
    url: "/data/static-polygons.gpmlz",
    polygonRenderIntent: "all-polygons-area",
  },
  rotationSources: ["/data/rotations.rot"],
  referenceEllipsoid: ellipsoid,
  initialAge: 0,
  primitiveTransformMode: "dynamic3D",
});

// Automatically switches between dynamic 3D transforms and baked 2D/CV geometry.
manager.bindSceneModeSync(viewer);

await manager.loadTilesAtRoot(viewer);
await manager.setAge(100); // 100 Ma

// Load additional detail selected from the current camera view.
const detail = await manager.loadFineTilesInView(viewer, {
  minLevel: 2,
  maxLevel: 8,
  targetTileScreenSize: 256,
  maxRawViewTileCount: 128,
});

console.log(detail, manager.getStats());

function dispose() {
  manager.destroy(viewer);
  processor.destroy();
  viewer.destroy();
}
```

Applications that prefer an explicit initialization phase can use
`new SimpleGeoReconstructManager(options)` followed by `await manager.init()`.
The legacy `CesiumTileProcesser` class name and the manager's `processer`
constructor option and property remain supported, but new code should use the
correctly spelled `CesiumTileProcessor` class name and `processor` option and
getter.

## Input Data

### Feature Sources

`featureSource` accepts a URL string or an object with a URL and polygon intent.
Supported sources are:

- `.gpml`, `.xml`, plain UTF-8 GPML, `.gpmlz`, gzip, or zip-contained GPML;
- the project's legacy JSON feature array;
- uploaded `blob:` URLs, whose format is detected from their content.

`polygonRenderIntent: "classified"` fills only feature types classified as
areas. `"all-polygons-area"` treats every parsed polygon geometry as a filled
area. Parsed line-like and unknown features remain available through
`allPaleoData` and import diagnostics, but the manager's tile rendering path
uses only area features.

Use `coordinateOrder` with the standalone `parseGpmlText` or
`loadFeaturePolygonData*` functions when a GPML source does not follow the usual
latitude/longitude ordering.

The legacy JSON reader preserves its historical behavior and consumes only the
first polygon in each feature. GPML input supports multiple polygons and
interior rings.

### Rotation Sources

`rotationSources` must contain at least one URL to a GPlates ROT file. Ages are
expressed in millions of years ago (Ma). `anchorPlateId` defaults to `"0"`; pass
`null` to follow rotation chains without forcing a fixed anchor ID.

Feature and rotation URLs are loaded with `fetch`, so the server must permit
browser access and provide the required CORS headers.

## Loading Tiles

Choose one loading strategy after initialization:

- `loadTilesAtRoot(viewer)` loads an adaptive coarse representation.
- `loadTilesOnLevel(viewer, level)` loads all relevant tiles at one level.
- `loadFineTilesInView(viewer, options)` selects a level from the camera and
  loads only tiles intersecting the view.
- `loadFineTilesInView(viewer, level, options)` forces a clamped level while
  retaining view intersection filtering.

A view-based load returns `level`, `loadedCount`, and `taskCount`. It may also
return `skippedReason` as `"no-view-rectangle"`, `"not-ready"`, or
`"stale-age"`. Repeating a request can legitimately load zero new tiles when
matching composite tiles are already cached.

## Age And Scene Modes

Use `await manager.setAge(age)` to update visibility and plate transforms.

- `dynamic3D` stores plate transforms on primitives and is intended for Cesium
  3D mode.
- `bakedInstance` rebuilds geometry with transforms baked into instances and is
  used for Cesium 2D and Columbus View.

`bindSceneModeSync(viewer)` switches these modes during Cesium morph events and
returns a cleanup callback. Calling `manager.destroy()` also removes the bound
listeners. Use `setPrimitiveTransformMode` directly only when the application
manages scene-mode transitions itself.

## Provider Changes And Cleanup

`await manager.setProvider(viewer, provider)` replaces the imagery provider,
rebuilds quadtrees when the tiling scheme changes, invalidates provider-specific
caches, and removes rendered tiles. Load tiles again after the call completes.

`manager.clear(viewer)` removes generated primitives and clears tile caches but
keeps imported feature and rotation data ready for another load.

`manager.destroy(viewer)` is the terminal manager cleanup operation. It removes
scene listeners, releases retained tile image assets, and removes manager-owned
primitives. It intentionally does not call `processor.destroy()` or
`viewer.destroy()` because those objects are supplied and owned by the caller.

## Diagnostics

`manager.getStats()` returns a snapshot containing import diagnostics, task
counts, primitive counts, cache sizes, estimated texture bytes, and timing
counters. `manager.getLastGenerationReport()` describes foreground and
background completion for the latest generation request.

The standalone import API is useful when data must be inspected before creating
a manager:

```ts
import { loadFeaturePolygonDataWithDiagnostics } from "simple-geo-reconstruct";

const { items, diagnostics } = await loadFeaturePolygonDataWithDiagnostics("/data/model.gpmlz", {
  polygonRenderIntent: "classified",
});
```

## Compatibility And Limits

- Existing methods such as `updateAge`, `updateProvider`,
  `generateTilePrimitivesAtRoot`, and `generateTilePrimitivesOnLevelN` remain
  available for compatibility. New code should use the corresponding `set*` or
  `load*` methods.
- `PaleoData.time.begine` is a historical public spelling and is intentionally
  retained. It represents the interval's begin age in Ma.
- The manager assumes feature geometry, imagery tiling, rotation calculations,
  and the Cesium viewer use compatible ellipsoids.
- WebGL context limits and imagery-provider request throttling still apply.
- The package does not render line features; it reconstructs filled polygon
  areas and preserves non-area classifications for diagnostics.

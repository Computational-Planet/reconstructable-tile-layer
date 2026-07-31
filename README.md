# Reconstructable Tile Layer (RTL)

This repository contains the TypeScript reference implementation accompanying
the manuscript _Reconstructable Tile Layers for Geological-Time-Driven Digital
Earth: Browser-side Paleogeographic Reconstruction of Published Web Tile
Services without Republication_.

RTL treats geological age and the selected rigid plate model as executable
layer state. It keeps a compatible published Web tile service as the imagery
source, assigns its tile content to polygonal plate domains, applies
ROT-derived finite rotations, masks boundary tiles in WebGL, and renders the
processed fragments in Cesium. The implementation reconstructs the published
visual layer; it does not recover source attributes, topology, feature
identities, or numerical raster values.

## Method-to-code map

| Paper term or stage          | Recommended code API                            | Package                                               |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Reconstructable Tile Layer   | `ReconstructableTileLayer`                      | `reconstructable-tile-layer`                          |
| Service registration         | `provider`, `setImageryProvider`                | `reconstructable-tile-layer`                          |
| Plate-domain feature         | `PlateDomainFeature`, `PlateDomainSourceConfig` | `reconstructable-tile-layer`                          |
| `TileClipArea`               | Geographic and tile-local polygon masks         | `rtl-tile-plate-quadtree`, `rtl-webgl-tile-processor` |
| Finite-rotation interpolator | `FiniteRotationInterpolator`                    | `rtl-finite-rotation`                                 |
| Tile--plate quadtree         | `PlateDomainTileQuadtree`                       | `rtl-tile-plate-quadtree`                             |
| Composite tile task          | `CompositeTileTask`                             | `reconstructable-tile-layer`                          |
| Processed tile record        | `ProcessedTileRecord`                           | `reconstructable-tile-layer`                          |
| WebGL processor              | `WebGLTileProcessor`                            | `rtl-webgl-tile-processor`                            |
| Age-aware update             | `setReconstructionAge`                          | `reconstructable-tile-layer`                          |
| View-aware refinement        | `refineTilesForView`                            | `reconstructable-tile-layer`                          |

These names follow the Methodology section of the manuscript: service
registration; plate-domain and rotation preparation; tile--plate indexing and
task scheduling; and GPU masking and Cesium rendering. The source directories
remain in place; only workspace package identifiers and imports were renamed.

## Packages

| Package                                                                   | Role in RTL                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`rtl-finite-rotation`](packages/rtl-finite-rotation)                     | Parses ROT records, interpolates unit quaternions, and composes plate-reference chains.                        |
| [`rtl-tile-plate-quadtree`](packages/rtl-tile-plate-quadtree)             | Builds lazy plate-domain tile indexes and produces complete or clipped source-tile entries.                    |
| [`rtl-webgl-tile-processor`](packages/rtl-webgl-tile-processor)           | Requests source imagery, remaps WebMercator textures, and produces GPU-masked processed tile images.           |
| [`reconstructable-tile-layer`](packages/reconstructable-tile-layer)       | Implements the browser-side RTL object, task scheduling, retained records, age updates, and Cesium primitives. |
| [`reconstructable-tile-layer-demo`](apps/reconstructable-tile-layer-demo) | Demonstrates the paper workflow with interchangeable services, plate models, ages, and views.                  |

Each package README describes its method role, input contract, minimal usage,
and retained-resource lifecycle.

## Requirements

- Node.js 18 or newer
- pnpm 9.x; the repository is pinned to pnpm 9.0.5
- A browser with WebGL support for the rendering packages and demo
- Cesium 1.x in applications that consume the libraries

## Install and build

```sh
corepack enable
corepack prepare pnpm@9.0.5 --activate
pnpm install --frozen-lockfile
pnpm build
```

The shared Rollup configuration emits ESM, CommonJS, and TypeScript declaration
outputs for all four libraries. Cesium remains a peer dependency and is not
bundled into the packages.

## Minimal RTL workflow

```ts
import { ReconstructableTileLayer } from "reconstructable-tile-layer";
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";

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
});

rtl.bindSceneModeSync(viewer);
await rtl.loadSourceTilesAtLevel(viewer, 4);
await rtl.setReconstructionAge(120);
await rtl.refineTilesForView(viewer);

rtl.destroy(viewer);
webglProcessor.destroy();
```

The imagery provider, WebGL processor, and Cesium viewer are caller-owned.
Destroy the RTL before destroying those dependencies.

## Inputs and method scope

RTL accepts Cesium imagery providers using geographic EPSG:4326 or WebMercator
tiling schemes. Plate-domain sources may be GPML, GPMLZ, XML, the repository's
legacy JSON shape, or uploaded browser URLs. Finite rotations are read from
GPlates ROT text.

The implementation preserves MultiPolygon parts and interior rings in
`TileClipArea`. General antimeridian-crossing rings must already be encoded as
dateline-separated polygon components, matching the current method limitation
described in the manuscript.

## Demo

The demo keeps the paper's browser workflow in one application: import a
reproducible configuration, select a published imagery source and paired
plate-domain/ROT inputs, change reconstruction age or model, load an explicit
source level, refine the current view, and export the resulting scene metadata.

```sh
pnpm --filter reconstructable-tile-layer-demo dev
```

Its existing UI text, layout, reference polygons, experiment schema, benchmark
controller, and datasets are preserved.

## Compatibility

Paper-aligned names are the recommended API. Reinstall workspace dependencies
after pulling the package-name migration. Historical symbol exports remain
available, including `RotationOperator`, `QuadTreeTileProcesser`,
`QuadTreeTileProcessor`, `CesiumTileProcesser`, `CesiumTileProcessor`,
`SimpleGeoReconstructManager`, and their existing methods and option names.
No reconstruction algorithm or runtime result is changed by the aliases.

## Verification

```sh
pnpm check
```

This runs formatting, linting, package and demo builds, TypeScript checks, and
the repository's original quadtree test.

## Citation

Please cite the manuscript named above when using this implementation in
research. Author, venue, DOI, and final bibliographic metadata should be taken
from the published paper once available.

## License

Source code is licensed under the ISC License. Bundled geological and imagery
resources retain the citations and terms identified by their original
providers.

# Reconstructable Tile Layer Demo

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This Cesium application demonstrates the browser-side Reconstructable Tile
Layer (RTL) described in the accompanying manuscript. It uses the
paper-aligned `ReconstructableTileLayer` and `WebGLTileProcessor` APIs while
preserving the original interface, controls, datasets, reference polygon
overlays, export schema, and rendering behavior.

## Quick start

From the repository root, with dependencies already installed:

```sh
pnpm dev
```

After a fresh clone or a dependency change, install once before starting:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Turbo starts all four library watch builds and the Vite demo together. Use the
local URL printed by Vite in the terminal.

## Paper workflow

The demo supports the same operations used by the manuscript's case studies:

- register WMS, WMTS, XYZ, URL-template, or custom compatible imagery sources;
- load GPML, GPMLZ, XML, legacy JSON, uploaded plate-domain data, and ROT files;
- switch reconstruction age, rigid plate model, and Cesium transform mode;
- load a fixed source-tile level or refine tiles for the current view;
- overlay the existing GPlates reference polygons;
- import reproducible configurations and export screenshots with runtime
  metadata.

The source service supplies imagery and styling. RTL supplies plate-domain
assignment, finite rotations, tile-local masking, age-aware placement, and
view-aware source-tile selection.

## Runtime data

The application expects its bundled assets under `public/`. Online providers
remain subject to their availability, access policy, CORS configuration, and
attribution requirements.

For an isolated demo process, first ensure the workspace libraries have already
been built, then run:

```sh
pnpm --filter reconstructable-tile-layer-demo dev
```

## Basic sequence

1. Import an experiment JSON or keep the default configuration.
2. Select the feature source, ROT model, and imagery provider.
3. Configure the scene, output, polygon intent, and transform mode.
4. Initialize the layer.
5. Set `Age Ma` and load root tiles, an explicit level, or the current view.
6. Export runtime information or a screenshot when needed.

Imported `schemaVersion: 1` experiment files restore control values and camera
state but do not automatically initialize or load the layer.

## Export compatibility

The screenshot and JSON export behavior is unchanged. The JSON keeps the
existing `schemaVersion: 1`, `geoTileStats`, and `tileProcesserStats`
field names so previous experiment configurations and analysis scripts remain
compatible.

A screenshot is taken directly from the Cesium canvas and excludes the control
panel. Cross-origin imagery must permit canvas reading.

## Optional benchmark controller

Before initializing the interactive layer, the existing browser benchmark can
be invoked from the console:

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

This controller is retained to reproduce the manuscript's browser measurements;
it is not required for normal demo use. Refresh the page after an exclusive
benchmark run before returning to the interactive workflow.

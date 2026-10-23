# Reconstructable Tile Layer Demo

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This Cesium application demonstrates the browser-side Reconstructable Tile
Layer (RTL) described in the accompanying manuscript. It uses the
paper-aligned `ReconstructableTileLayer` and `WebGLTileProcessor` APIs while
supporting tile services, local scientific rasters, plate models, reference polygon
overlays, export schema, and rendering behavior.

## Quick start

From the repository root, with dependencies already installed:

```sh
pnpm dev
```

After a fresh clone or a dependency change, install once before starting:

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm dev
```

Turbo starts the RTL and nested module watch builds with the Vite demo.
The three optional raster packages are built by `pnpm build:packages`; rerun that
command after editing their code or worker assets. Use the local URL printed by Vite.

## Package integration

The demo imports `ReconstructableTileLayer` and `WebGLTileProcessor` from
`reconstructable-tile-layer`. Processor-specific types use its `/processor` public
entry. RTL bundles its core modules from `packages/reconstructable-tile-layer/modules`;
the demo accesses them through RTL's public entries.

`src/layers`, local-file controls, object-URL ownership, timeline coordination and
ordinary GeoJSON remain demo responsibilities. Numeric TIFF input, its Cesium
provider and optional COG conversion still use the three separate raster extensions.
This distribution change preserves native ordinary imagery/vector behavior and the
existing reconstruction path.

## Panel workflow

1. **Plate model**: choose plate domains and ROT files. Use **Model settings** for URLs, anchor and polygon mode.
2. **Layer data source**: choose **Tile map service**, **Local TIFF / GeoTIFF** or **Local GeoJSON**. Services have a visible connection
   form; local files use **Source settings**. **Add layer** preserves existing layers.
   Services can reconstruct or use fixed coordinates. **Selected layer** identifies the selection in the right panel.
3. **Timeline & tiles**: tile actions apply to the selected reconstruction layer; the age control updates every reconstruction layer.

Local settings collapse after successful application; the online connection form stays visible. Spatial metadata, citations, display style and optional COG export
expand on demand. Reference overlays, view/render controls, experiment import/export and statistics follow the main workflow.
Ordinary imagery, including reference and snapshot rasters, uses Cesium's native `ImageryLayer` and loads automatically as you navigate.

## Right-hand Layers panel

Hide the panel with **Hide**, then reopen it with the top-right **Layers** button.
Layers are grouped into reconstruction, ordinary imagery and ordinary vectors. Vector list order does not set draw order. Higher entries within a group draw on top;
reconstruction layers draw above native imagery. Move layers within their group using the arrows.
Each layer has visibility, a name, opacity and removal. Only reconstruction layers have manual tile controls.
Narrow windows use a floating right panel.

Fixed-coordinate layers support **All ages** or an inclusive **Youngest / Oldest (Ma)** interval.
For example, 100–150 Ma includes both endpoints. Timeline changes never override a user's hidden state.
Snapshots initially use their scientific age as both endpoints; editing their display range does not rotate their coordinates.
Adding a snapshot does not move the timeline. Graticules and reference outlines remain auxiliary overlays.

Changing the source form or plate model prepares the next addition without clearing existing layers.
Use **Use current plate model** on a reconstruction layer to explicitly replace its model, then reload its tiles.
Switching reconstruction tile levels or loading the current view replaces that layer's coverage, preventing
overlapping LODs from applying opacity twice. Other layers keep their tiles.
Cesium handles ordinary imagery LOD, view-dependent requests, caching and texture cleanup directly;
ordinary layers do not use the RTL processor or the demo's manual tile loader.
**Clear prepared file** releases only the local editor's file reference. Added layers retain independent references;
the raster source and Worker close after their last editor/layer owner releases them.

Demo business logic lives in `src/layers`, with UI in `src/components/layers` and `src/styles/layers.css`.
The RTL package supplies reusable containers, visibility, opacity and ordered surface appearances;
the processor supports provider-scoped cache invalidation. Sources keep independent tiles.

**Rendering → Show graticule** toggles a 30° latitude/longitude grid with coordinate
labels (on by default), independently of imagery and reconstruction age. The grid
uses the demo's sphere in 2D and 3D, appears in screenshots, and is saved/restored
through the existing experiment JSON field `layers.graticule`.

## Connect online imagery

**Tile map service** connects user-supplied services. **Fill from example** populates the editable form;
the existing citation button remains available. **Your connection (blank form)** starts an empty connection.
Changes show **Example settings edited**, with **Reset example** to restore the original values.
The provider is constructed entirely from form values, independently of the example selection.

- **XYZ / TMS URL template**: enter the address with `{z}` for level, `{x}` for column and `{y}` for rows
  counted from the north (XYZ), or `{reverseY}` from the south (TMS). `{s}` supports subdomains.
- **WMS**: enter the endpoint, layers, version, request CRS, styles, image format and transparency.
  The form and tile grid generate GetMap parameters, replacing stale controlled endpoint query parameters
  such as `LAYERS`, `BBOX` and `REQUEST`. WMS 1.3.0 EPSG:4326 uses latitude/longitude BBOX order;
  CRS:84 and WMS 1.1.1 use longitude/latitude order.
- **WMTS**: use a KVP endpoint or REST template, with layer, style, format and tile matrix set ID.
  REST supports `{Layer}`, `{style}`, `{TileMatrixSet}`, `{TileMatrix}`, `{TileRow}` and `{TileCol}`.
  Advanced fields accept one matrix label per level starting at L0, plus dimensions such as `Time=...`.

The two GPlates examples expose their Demo-hosted addresses as `/tiles/.../{z}/{x}/{y}.png`.
These relative URLs use the current site's origin and the same connection path as external services;
replace them with your own endpoints as needed.

Match **Projection / tiling scheme** to the actual service grid. Advanced settings include L0 columns/rows,
tile pixel dimensions, coverage, subdomains, extra query parameters, connection name and attribution.
Defaults are a global 2×1 Geographic root grid or 1×1 Web Mercator grid. Coverage clips that grid without
changing its origin. Other projections, non-global origins, a single dateline-crossing coverage rectangle
and matrix sets that do not double in both directions require another tiling scheme implementation.
Service min/max levels are separate from the reconstruction loading level in step 3. WMTS permits at most
four tiles at its minimum level; normally retain min=0 and load L2/L3 in step 3. Additional parameters use
one `name=value` per line and cannot override controlled protocol fields. Service `TIME` / WMTS dimensions
stay fixed independently of the geological age slider.

Use **Test tile connection** to read and preview one tile at the coverage center, then **Add layer**
and load reconstruction tiles in step 3. Testing uses the same provider configuration, including image decoding
and Canvas readback, without replacing the active source. It checks one position/level, not all tiles.
The server must allow browser access (CORS).

Experiment JSON saves each layer's complete connection in `layerStack[].source.config`, including edited
example values. `source.exampleKey` identifies the example; requests use the saved configuration.
`sources.serviceConfig` restores the source editor. When a service is selected, export uses its applied
connection, excluding pending form edits. Incomplete, unapplied connection forms are omitted from export.
Import restores the layer list; use **Load tiles** for reconstruction layers. **Add layer** creates an additional layer.

Parameters map to Cesium's [URL template](https://cesium.com/learn/cesiumjs/ref-doc/UrlTemplateImageryProvider.html),
[WMS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapServiceImageryProvider.html) and
[WMTS](https://cesium.com/learn/cesiumjs/ref-doc/WebMapTileServiceImageryProvider.html) providers.

## Camera views

**Camera & Output → Scene mode** offers **2D rectangular**, **3D (perspective)**,
and **3D (orthographic)** (default). Orthographic mode keeps the 3D globe and reconstruction layers
and uses parallel projection. **Quick view** centers the antimeridian (±180°), South Pole,
or North Pole and fits the entire globe to the viewport. Presets retain the current 3D projection;
from 2D they restore the last selected 3D projection. **Detailed** still provides manual target,
range, orientation, and output controls.

Experiment JSON uses `viewMode: "3D_ORTHOGRAPHIC"` and `projection: "OrthographicGlobe"`
for orthographic views. Perspective views keep `viewMode: "3D_GLOBE"` and use
`projection: "PerspectiveGlobe"`. The explicit `viewMode` determines the camera projection on import.

## Local scientific rasters

1. Choose **Layer data source → Local TIFF / GeoTIFF → Source settings**, then select a georeferenced TIFF, BigTIFF or COG. Files stay in the browser. For NetCDF data, convert it to GeoTIFF beforehand.
2. For present-day data that should follow reconstruction, select **Reconstruct from 0 Ma (follows timeline)**, confirm the plate-model frame, click **Add layer**, then load tiles. **Paleo snapshot** starts with a single-age visibility interval; **Reference / unknown** displays the stored coordinates. Edit fixed layers' age ranges in Layers.
3. **Display style** supports single-band/RGB, sampled or manual numeric ranges, color ramps and additional raw NoData exclusions. Display styles do not alter stored numbers or numeric exports. Adding again creates another independent layer.
4. **Numeric COG export (optional) → Create numeric COG** loads GDAL only when requested and exports the TIFF's stored numeric bands. Conversion supports cancellation. Download the COG together with its provenance JSON; **Load converted COG** reopens it for display or reconstruction.

The panel distinguishes stored dimensions/COG overviews from map tile levels. L2 subdivides the file's coverage into 4×4 source tiles; L3 into 8×8. More subdivisions or resampling do not add source detail. See the [provider policy](../../packages/rtl-raster-imagery-provider/README.md) for supported projections and library-level overrides. TIFF needs usable georeferencing; a plain unreferenced image is insufficient.

Local raster descriptions preserve filename, applied style and scientific context, with `requiresReselect: true`. Files and session blob URLs are not embedded in experiment JSON. Imported local plate domains and ROT files also require reselection. Original missing units are not inferred; non-finite scientific metadata is serialized as text. Moving modern scalar data with plates illustrates geometric transport, not a prediction of paleo topography.

Production/browser requirements include WebGL, Canvas, File/Blob, module Workers and WASM. GDAL assets load only for optional conversion. Public raster libraries retain their separate format capabilities; the demo imports only their TIFF path.

## Local GeoJSON vectors

Choose **Layer data source → Local GeoJSON**, select a `.geojson` or GeoJSON `.json` file, then **Add layer**. Feature collections, individual features, points, lines, polygons, Multi geometries and geometry collections are supported. Coordinates must be WGS84 longitude/latitude with optional height; reproject other coordinate systems before importing. Empty files without drawable geometry, malformed rings, non-finite coordinates and other formats such as TopoJSON are rejected with a message.

Vectors use Cesium's native [GeoJsonDataSource](https://cesium.com/learn/cesiumjs/ref-doc/GeoJsonDataSource.html), preserving supported simplestyle properties and entity geometry. In **Ordinary vectors**, rename, show/hide, adjust opacity, set an inclusive geological age range, zoom to or remove a layer. Opacity multiplies each original feature alpha. The timeline changes visibility only; vectors do not rotate, clip, rasterize or use RTL.

Vector overlap follows native geometry depth and transparency. The panel does not offer vector reorder controls or imply a common stack with imagery/RTL. GeoJSON parsing and native lifetime management live in `src/vector`; the file editor is separate from raster controls and reusable RTL packages. Local file contents are not included in exported configuration: use **Prepare local file** and **Restore selected layer** after importing.

## Paper workflow

The demo supports the same operations used by the manuscript's case studies:

- register WMS, WMTS, XYZ, URL-template, or custom compatible imagery sources;
- load GPML, GPMLZ, XML, compatible JSON, uploaded plate-domain data, and ROT files;
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

1. Import a configuration from [case_configs](../../case_configs/README.md), or choose a plate model
   and data source and click **Add layer** to create a layer.
2. In **Layers**, select a reconstruction layer. Set **Tile loading** to **Specified level** or
   **Current view · automatic level**, then click **Load tiles**.
3. Adjust the global geological age, camera and output. The explicit level/view actions in
   **Timeline & tiles** update the selected layer's saved loading mode when they complete.
4. Export runtime information or a screenshot when needed.

## Experiment configuration

Experiment JSON uses `schemaVersion: 3` with a required `layerStack` containing all layer sources,
display settings, age ranges, models and loading choices. Each layer retains `loadMode: "level"`
or `"view"`; `level` is used only for level-based loading. View-based loading selects the level
automatically from the current camera and provider limits. The global age, view, output and
reference polygon settings are restored alongside the layers.

Import validates the configuration before replacing the layer list, then activates ordinary online
imagery automatically. **Load tiles** runs the saved loading choice for a reconstruction layer.
Local layers require **Prepare local file**, TIFF/GeoJSON reselection and **Restore selected layer**.
Reselect local plate-model files and use **Use current plate model** on the affected layer.
File contents and session `blob:` URLs are not persisted.

Case files contain inputs only. Runtime exports additionally include `geoTileStats` for the selected
reconstruction layer and `tileProcesserStats` for the shared processor, plus camera/device measurements.
Runtime statistics do not control subsequent imports.

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

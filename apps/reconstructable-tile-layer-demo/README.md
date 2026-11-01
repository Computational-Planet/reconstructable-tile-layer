# Reconstructable Tile Layer Demo

[Monorepo](../../README.md) · English | [简体中文](README.zh-CN.md)

This Cesium application demonstrates the browser-side Reconstructable Tile
Layer (RTL) described in the accompanying manuscript. It uses the
paper-aligned `ReconstructableTileLayer` and `WebGLTileProcessor` APIs while
supporting tile services, local TIFF rasters, ordinary GeoJSON vectors, multiple
layers, plate models, GPlates reference outlines, Macrostrat legends and experiment export.

## Quick start

Use Node.js 22 and pnpm 9.0.5, matching the repository build. From the repository
root, with dependencies installed and workspace libraries already built:

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
ordinary GeoJSON are demo responsibilities. `src/legend` owns map selection and
Macrostrat requests; RTL supplies the generic `querySourceRegions` API.
Numeric TIFF input, its Cesium
provider and optional COG conversion use the three separate raster extensions.
Ordinary imagery and vectors use Cesium's native display components.

## Panel workflow

1. **Plate model**: choose plate domains and ROT files. Use **Model settings** for URLs, anchor and polygon mode.
2. **Layer data source**: choose **Tile map service**, **Local TIFF / GeoTIFF** or **Local GeoJSON**. Services have a visible connection
   form; local files use **Source settings**. **Add layer** preserves existing layers.
   Services can reconstruct or use fixed coordinates. **Selected** identifies the selection in the right panel.
3. **Timeline & tiles**: **Load level**, **Load view** and **Clear** apply to the selected reconstruction layer; **Age (Ma)** updates every reconstruction layer. Fixed layers use the age only to determine visibility.

Local settings collapse after successful application; the online connection form stays visible. Spatial metadata, citations, display style and optional COG export
expand on demand. Reference overlays, view/render controls, experiment import/export and statistics follow the main workflow.
Click the small **?** beside a field to read its instructions; click outside or press Escape to close them.
Errors, loading progress and the selected layer's state remain visible. Short controls share rows;
**Experiment** groups **Import**, **Export info** and **Screenshot** together.
Ordinary imagery, including reference and snapshot rasters, uses Cesium's native `ImageryLayer` and loads automatically as you navigate.

## Right-hand Layers panel

Hide the panel with **Hide**, then reopen it with the top-right **Layers** button.
The header, global age and **Add layer** stay visible while the layer list scrolls independently.
Scrolling stops at the list's edges, so long layer stacks do not scroll the page.
Small **?** buttons explain layer ordering, source details, model replacement, age ranges and tile loading.
Escape closes an open explanation first; pressing it again closes the panel. Layer status and errors remain visible.
Layers are grouped into reconstruction, ordinary imagery and ordinary vectors.
Higher entries within the reconstruction or ordinary-imagery group draw on top;
use the arrows to reorder within either group. Reconstruction layers draw above
native imagery, with no cross-group ordering. Vector list order does not set draw order.
Each layer has visibility, a name, opacity and removal. Only reconstruction layers have manual tile controls.
The selected reconstruction layer shows its bound model and ROT filenames. Multiple ROT
files include a count; hover over the filenames or open the model's **?** to read the full list.
Narrow windows use a floating right panel.

The grid workspace shows a small **Powered by CesiumJS** label at the bottom right.
It moves with the Layers panel and remains outside the map canvas.

Fixed-coordinate layers support **All ages** or an inclusive **Youngest / Oldest (Ma)** interval.
For example, 100–150 Ma includes both endpoints. Timeline changes never override a user's hidden state.
Snapshots initially use their scientific age as both endpoints; editing their display range does not rotate their coordinates.
Adding a snapshot does not move the timeline. Graticules and reference outlines remain auxiliary overlays.

Changing the source form or plate model prepares the next addition without clearing existing layers.
Use **Use current** beside a reconstruction layer's model to explicitly replace it, then reload its tiles.
**Load view** on the left and **Current view → Load tiles** on the right retain existing tiles
and add coverage for the current view, including when the automatic or fixed view level changes.
Repeated requests skip already-loaded tasks. Use **Clear** / **Clear tiles** to reset the accumulated
coverage. Different retained levels can overlap and blend their opacity; clearing first starts a fresh view.
Whole-layer **Specified level** loading replaces coverage when switching from view loading or another level.
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
through the experiment JSON field `layers.graticule`.

## Reference & Legend

**Reference & Legend**, **GPlates reference**, and **Macrostrat legend** are collapsed
by default. GPlates outlines provide source and colour controls.

In **Macrostrat legend**, set **Zoom (z)** (default **4**) to match the source tiles,
then use the adjacent **Select area** or **Select point** buttons. **Select area**
drags a rectangle; keep the whole box on the globe and zoom in or use 2D if necessary.
**Select point** takes one click on the globe and marks it with a small orange dot.
The point becomes a tiny box extending **0.0001°** in each direction (0.0002° wide/high,
with latitude clamped at the poles and longitude wrapped at the dateline). Both
selection modes share model selection, caching and legend display. Escape or **Cancel** ends selection
and restores camera controls. **Query again** reuses the saved point or area;
**Clear** removes the selection and its marker. Expand **Query point** / **Query area**
to inspect the selected coordinates and modern query bounds.

At **0 Ma**, the selected bounds are queried directly. At older ages, choose a
Macrostrat Carto reconstruction layer: the query uses that layer's bound plate model,
the global age, and RTL's inverse view-sphere path followed by quadtree selection
at the exact Legend **z** level (within the layer's provider range). NONE nodes are
pruned; only intersecting FULL and NEED_CLIP tiles contribute. For area queries, selected tiles are
packed per plate, then deduplicated and combined across plates without filling gaps
or holes. Disconnected coverage can therefore produce several query rectangles.
Point queries enable RTL's `clipToView` option: intersect each plate's selected coverage
with the inverse-rotated small query bounds, then combine and deduplicate those bounds.
The requested area stays small rather than growing to a z-level tile. Zoom still controls
quadtree filtering and the Macrostrat legend level. This can prepare an imported layer's
model without loading or clearing its tiles. Antimeridian-crossing ranges are split.
Returned rectangles are conservative and can include nearby units, so this is not a
pixel-exact legend of the rotated image.

Duplicate bounds and bounds fully contained by another are removed before querying.
Results appear as each area finishes and are merged by `legend_id`; there is no need
to wait for all areas. Failed or timed-out requests are skipped, with their count
shown alongside the partial results. **Query again** retries failed areas while
reusing successful cached areas. **Cancel** stops remaining requests and keeps the
entries already received. The display groups records by normalized colour, retaining
every original ID and its associated attributes. Common names/ages label each colour;
different names/ages are shown as multiple units/ages, with their records in the details.
Common properties appear once; differing lithology, descriptions, source IDs and age
ranges remain associated with their original legend IDs. Identical attribute combinations
share a detail row listing their IDs. A shared colour does not identify the rock at a particular location.

**Limit (colors)** defaults to **1000** (editable from 1 to 1000) and counts displayed
colour groups, not raw records. Exceeding it hides **all** groups and asks for a smaller
area. Missing/invalid colours remain separate records rather than a shared grey category.
The status reports both colour-group and original-record counts. Changing the age, model, layer, zoom,
limit or view mode invalidates the displayed result and cancels pending work.

The demo's `src/legend` owns selection, API requests, cancellation and a five-minute,
64-area cache with a total budget of 50,000 original records; `entries.ts` owns normalization
and grouping, while `MacrostratLegendSection` and `LegendGroupItem` own the UI. Record
details are rendered only when a colour is expanded. Requests use
`https://macrostrat.org/api/v3/map/carto/legend?bounds=W,S,E,N&zoom=z`, with at most
three concurrent requests and a 25-second timeout per request. Partial results are
explicitly marked, and an all-failed query is reported separately from an empty legend. See
[Macrostrat data services](https://macrostrat.org/docs/data-services) for service
details. Legend settings, selections and results are temporary session tools and
are not included in experiment JSON.

## Connect online imagery

**Tile map service** connects user-supplied services. **Fill from example** populates the editable form;
use the citation button to view the source reference. **Your connection (blank form)** starts an empty connection.
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
and uses parallel projection. **Quick view** centers the prime meridian/equator intersection (0°, 0°),
antimeridian (±180°), South Pole, or North Pole and fits the entire globe to the viewport.
Presets retain the current 3D projection;
from 2D they restore the last selected 3D projection. **Detailed** provides manual target,
range, orientation, extent, and output controls. Use **Apply extent**, **Apply pose**
or **Apply output size** after editing the corresponding fields. Output width and
height are CSS pixels; **Pixel ratio** controls Cesium's resolution scale. The
exported JSON records actual `output.canvasWidth` and `output.canvasHeight` as well
as configured values, so use those actual dimensions when preparing figures.

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

1. Import a configuration from [paper_configs](../../paper_configs/README.md), or choose a plate model
   and data source and click **Add layer** to create a layer.
2. In **Layers**, select a reconstruction layer. Set **Tile loading** to **Specified level** or
   **Current view**, then click **Load tiles**. For the current view, leave **Lock view level**
   unchecked for automatic selection, or check it and enter a fixed level (including L0).
3. Adjust the global geological age, camera and output. The explicit level/view actions in
   **Timeline & tiles** update the selected layer's saved loading mode when they complete.
4. Export runtime information or a screenshot when needed.

**Timeline & tiles** also provides **Lock view level** beside **Load view**.
Both panels edit the same setting for the selected layer. The fixed view level is independent of
the full-extent **Level** input. Inputs use the source's available level range, including
local TIFF limits after preparation. Fixed view loading retains spatial filtering and never
automatically lowers the requested level; completion reports the actual level used.

## Experiment configuration

Experiment JSON uses `schemaVersion: 3` with a required `layerStack` containing all layer sources,
display settings, age ranges, models and loading choices. Each layer retains `loadMode: "level"`
or `"view"`; `level` is used only for level-based loading. An optional `viewLevel` locks the level
for view-based loading; omitting it selects automatically from the current camera and provider
limits. `viewLevel: 0` locks L0. The global age, view, output and
reference polygon settings are restored alongside the layers.

Import validates the configuration before replacing the layer list, then activates ordinary online
imagery automatically. **Load tiles** runs the saved loading choice for a reconstruction layer.
Import replaces the existing stack and releases its loaded results. JSON stores
settings, not tile images, accumulated coverage or loading history; see the
[paper figure guide](../../paper_configs/README.md) for sequences that combine levels.
Local layers require **Prepare local file**, TIFF/GeoJSON reselection and **Restore selected layer**.
Reselect local plate-model files and use **Use current** on the affected layer.
File contents and session `blob:` URLs are not persisted.

Case files contain inputs only. Runtime exports additionally include `geoTileStats` for the selected
reconstruction layer and `tileProcesserStats` for the shared processor, plus camera/device measurements.
Runtime statistics do not control subsequent imports.

**Export info** downloads the configuration and runtime measurements as JSON.
**Screenshot** downloads both the map PNG and a JSON file with the same base name.
The PNG is taken directly from the Cesium canvas: it includes rendered overlays
such as the graticule and GPlates outlines, but excludes both panels, legend entries,
the grid background and the **Powered by CesiumJS** label. Use a browser or system
screenshot to document UI controls or a displayed legend. Cross-origin imagery must
permit canvas reading.

## Optional benchmark controller

Before initializing the interactive layer, the browser benchmark can
be invoked from the console:

```js
const result = await window.__rtlPerformanceBenchmark.run();
window.__rtlPerformanceBenchmark.downloadLastResult();
```

This controller reproduces the manuscript's browser measurements;
it is not required for normal demo use. Refresh the page after an exclusive
benchmark run before returning to the interactive workflow.

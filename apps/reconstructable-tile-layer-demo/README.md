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

Turbo starts the four core library watch builds and the Vite demo together.
The three optional raster packages are built by `pnpm build:packages`; rerun that
command after editing their code or worker assets. Use the local URL printed by Vite.

## Panel workflow

1. **Plate model**: choose plate domains and ROT files. Use **Model settings** for URLs, anchor and polygon mode.
2. **Imagery data source**: choose **Tile map service** or **Local TIFF / NetCDF**. Services have a visible connection
   form; local files use **Source settings**. Both share **Apply source**, which also initializes the selected model for services.
   **Current source** identifies the applied source; changing the source type or editing the form keeps existing imagery active.
3. **Reconstruction**: load tiles and adjust the adjacent age controls. Reapply after changing the plate model.

Local settings collapse after successful application; the online connection form stays visible. Spatial metadata, citations, display style and optional COG export
expand on demand. Reference overlays, view/render controls, experiment import/export and statistics follow the main workflow.
Reference and snapshot rasters display directly; the reconstruction section explains why tile loading is disabled.

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

Use **Test tile connection** to read and preview one tile at the coverage center, then **Apply source**
and load reconstruction tiles in step 3. Testing uses the same provider configuration, including image decoding
and Canvas readback, without replacing the active source. It checks one position/level, not all tiles.
The server must allow browser access (CORS).

Experiment JSON saves the complete connection in `sources.serviceConfig`, including edited example values.
When a service is active, export records the applied connection, excluding pending form edits.
Old preset selections and four-field `customProviderConfig` values migrate on import. Import restores the form;
click **Apply source** to activate it.
Incomplete, unapplied connection forms are omitted from export. Older Demo versions do not understand
`serviceConfig`; restore edited WMS/WMTS connections with this version or newer.

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
`projection: "PerspectiveGlobe"`. Historical `3D_GLOBE` configs with
`camera3D.orthographic: true` migrate on import. External scripts reading these enums
must recognize the new values.

## Local scientific rasters

1. Choose a local TIFF/COG or NetCDF file in **Imagery data source → Local TIFF / NetCDF → Source settings**. No upload
   endpoint is used. NetCDF variables retain their names, dimensions and units;
   choose time/depth indices and click **Read selected slice**.
2. For a present-day source that follows the timeline, select **Reconstruct from
   0 Ma (follows timeline)**, confirm the frame, click **Apply source**, then
   **Load Tiles By Level**. Apply selects L2 for low-resolution rasters and L3 for
   finer ones; prefer view loading for higher levels. The local `RasterImageryProvider`
   supplies RTL tiles using the selected plate domains, ROT files and anchor.
   The timeline rotates the plates; it does not hide the source beyond 0 Ma.
   **Paleo snapshot (visible at one age)** displays an explicitly dated snapshot
   only at that age. **Reference / unknown** displays stored coordinates.
3. Expand **Display style** to configure single-band/RGB, a sampled or manual physical range, and the color
   ramp. Declared missing values stay transparent. Extra raw NoData exclusions
   affect display only; they do not alter scientific metadata or numeric exports.
   Apply again to replace the style. Changing the selected plate model invalidates
   an active modern reconstruction until explicitly reapplied.
4. Expand **Numeric COG export (optional)**. **Create numeric COG** loads GDAL resources only when requested. TIFF exports
   stored numeric bands; NetCDF exports the selected 2D slice in physical units.
   Confirm the explicit regular geographic target grid for NetCDF, including
   Gaussian latitude. Conversion exposes real stages and supports cancellation.
5. Download both COG and provenance JSON. **Load converted COG** reopens the result;
   **Apply source** uses the chosen scientific path. Removing/replacing a file
   detaches old imagery/reconstruction before closing its provider, source and Worker.

To test reconstruction, open `tmp/paleo-domain-review/Map01_PALEOMAP_1deg_Holocene_0Ma.nc`,
read variable `z`, and select both Seton 2012 static polygons and Seton 2012 ROT.
Choose **Reconstruct from 0 Ma**, confirm, apply and load the suggested L2 tiles, then move
the timeline through 0, 50 and 100 Ma. Source coordinates remain present-day;
the timeline selects the reconstruction target. The `Map23_…100Ma.nc` grid already
describes 100 Ma geography and can be displayed in snapshot mode. File names and
NetCDF format do not automatically select either use.

The panel shows stored sizes/COG overviews, available map levels and recommended
start separately. Map levels subdivide the file's coverage: L2 has 4×4 source
tiles and L3 has 8×8; they are not COG overview indices. The 361×181 PaleoDEM NC
and its 720×360 resampled COG both default to maximum L2; 3600×3600 ETOPO to L4.
Subdivision and resampling do not add source detail. Unsupported levels produce
an explicit message without silently falling back. See the [provider policy](../../packages/rtl-raster-imagery-provider/README.md)
for library-level overrides.

PaleoDEM files form an age sequence even without a `time` dimension. DeepMIP model
time (e.g. `365_day` with a 1950 origin) is separate from its Eocene experiment;
record the experiment/version explicitly. Original attributes and missing units
are preserved. Curvilinear/rotated/unstructured NetCDF grids are rejected, including
the tested DeepMIP ocean `tos`; one `tas` success is not all-model compatibility.
Moving ETOPO with plates illustrates geometric transport of modern scalar data,
not a prediction of paleo topography.

Experiment exports include `sources.localRaster` with filename, original slice,
applied style, scientific context and `requiresReselect: true`. Files and transient
blob URLs are not embedded. Uploaded plate-domain and ROT files are also recorded
as file descriptions; importing them clears the corresponding URL controls and
requires file reselection before model initialization. Reimport asks for the original file and explicit
reapplication; it does not recreate data from a JSON descriptor. Non-finite scientific
metadata such as NaN is serialized as text, preserving its meaning rather than null.

Production/browser requirements: WebGL, Canvas, File/Blob, module Workers and WASM.
Vite uses `worker.format = "es"`; GDAL JS/WASM/data are copied through `?url` imports
and fetched only by conversion. See [package documentation](../../README.md#workspaces)
for custom asset hosting/CSP and [actual dataset coverage](../../scripts/raster/README.md#production-demo-and-scientific-meaning).
No backend, map query or regional statistics implementation is included.

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
4. Click **Apply source** to apply the source and initialize the layer.
5. Set `Age Ma` and load root tiles, an explicit level, or the current view.
6. Export runtime information or a screenshot when needed.

Imported `schemaVersion: 1` experiment files restore control values and camera
state but do not automatically initialize or load the layer.

## Export compatibility

The screenshot export and existing JSON fields remain compatible. The JSON keeps the
existing `schemaVersion: 1`, `geoTileStats`, and `tileProcesserStats`
field names so previous experiment configurations and analysis scripts remain
compatible.

Uploaded model files now require reselection on import, as described above; expired
`blob:` URLs in older configurations are cleared as well.

Direct sampling of compressed NetCDF can be slow: the tested 3600×3600 ETOPO file
took about 90 seconds to generate level-0 reconstruction tiles. The corresponding
COG loaded much faster. See the [browser evidence instructions](../../scripts/raster/README.md)
for measured UI actions, sample sizes, versions and limits; passing a format test
does not establish interactive performance for arbitrary datasets.

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

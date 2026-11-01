# rtl-raster-converter

Convert a local TIFF or a selected numeric raster slice to a Cloud Optimized
GeoTIFF in a browser Worker. The application serves static assets; user files are
not uploaded. [中文说明](README.zh-CN.md)

The converter is independent of Cesium, React and `reconstructable-tile-layer`.
Importing it or creating a converter does not initialize GDAL or start a Worker.
Each `toCOG` call owns one Worker and virtual filesystem, released on success,
failure, cancellation or disposal. GDAL is initialized lazily inside that Worker.

## Install and configure assets

```sh
pnpm add rtl-raster-converter gdal3.js@2.8.1
```

For Vite, import the engine files as asset URLs. These URL imports do not execute
the engine on the main thread.

```ts
import { createRasterConverter } from "rtl-raster-converter";
import js from "gdal3.js/dist/package/gdal3.js?url";
import wasm from "gdal3.js/dist/package/gdal3WebAssembly.wasm?url";
import data from "gdal3.js/dist/package/gdal3WebAssembly.data?url";

const converter = await createRasterConverter({ assets: { js, wasm, data } });
const controller = new AbortController();
const result = await converter.toCOG(file, {
  signal: controller.signal,
  compression: "DEFLATE",
  overviewResampling: "nearest",
  onProgress: ({ stage, completed, total }) => {
    updateProgress(stage, completed, total);
  },
});
// Save result.blob as result.filename, and result.provenanceBlob alongside it.
// Pass result.blob to openRasterSource or RasterImageryProvider.fromFile.
converter.dispose();
```

For another build system, copy the three original engine files from
`gdal3.js/dist/package` to a public static directory and supply their URLs. Host
the converter's `dist/worker.js` too if the bundler does not handle `new URL`:

```ts
const converter = await createRasterConverter({
  assets: {
    js: "/gdal/gdal3.js",
    wasm: "/gdal/gdal3WebAssembly.wasm",
    data: "/gdal/gdal3WebAssembly.data",
  },
  workerFactory: () => new Worker("/raster-converter/worker.js"),
});
```

This is a **classic Worker** because the supplied engine uses `importScripts`.
Do not create it with `type: "module"`. The `./worker` package export is for asset
resolution, not main-thread import. Serve WASM as `application/wasm`, and permit
the assets/Worker in the application's CSP. No CDN is selected automatically.
The optional engine peer is unnecessary if those assets are already self-hosted.

## Export a selected NetCDF slice

The tested GDAL build has COG/GTiff but no NetCDF/HDF5 driver. Open NetCDF with the
source package, select its non-spatial indices, then pass the borrowed slice:

```ts
import { openNetCDFSource } from "rtl-raster-source/netcdf";

const dataset = await openNetCDFSource(file);
const slice = await dataset.selectSlice({ variable: "tas", indices: { time: 0 } });
try {
  const result = await converter.toCOG(slice, {
    grid: {
      bounds: [-180, -90, 180, 90],
      width: 720,
      height: 360,
      resampling: "nearest",
    },
    provenance: { dataset: dataset.metadata.attributes, originalFilename: file.name },
  });
  // result.blob contains physical numeric samples, not an RGBA color map.
} finally {
  slice.close();
  dataset.close();
}
```

The shown 0.5° output grid is an explicit resampling choice. All rectilinear
sources, including regular NetCDF coordinates and Gaussian latitude, require
`grid`; the converter does not silently replace native axes with an affine grid.
The current scientific-grid sampler is nearest-neighbor. Pixel-edge bounds are
ordered `[west, south, east, north]` in degrees. For a region crossing 180°, express
east beyond 180° rather than below west. Latitude must remain within ±90°.
Cells outside source coverage become NoData, not repeated edge values.

Source samples are written as Float64 physical values: stored missing values and
valid ranges are checked before `raw * scale + offset`. Missing cells become NaN;
units remain attached. Source file metadata, native coordinates, variable, selected
indices, sampling choices and supplied application context are saved in the JSON
sidecar. Non-finite metadata numbers are encoded as strings such as `"NaN"`.
Save both outputs when scientific provenance matters. Units or ages absent from
the file are not inferred from filenames or publications.

The converter borrows a source and never closes it. A direct TIFF conversion
retains GDAL's native sample types and band metadata; the `RasterSource` path
normalizes values as described above. Direct TIFF inputs cannot use `grid` or
`bands`; open a source first for those operations.

## Explicit georeference and reprojection

An unreferenced TIFF is rejected. Supply a known EPSG code and north-up,
pixel-corner transform to georeference or override it:

```ts
await converter.toCOG(file, {
  georeference: { epsg: 4326, transform: [-2, 1, 0, 2, 0, -1] },
});
```

Reprojection uses `reproject: { epsg, bounds, width, height, resampling }`.
Target EPSG is 4326 or 3857; bounds use that CRS's units. Target dimensions are
required so work can be estimated before conversion. Reprojection supports
`nearest`, `bilinear` and `cubic`; overview resampling is a separate option
(`nearest`, `average`, `mode`). Use nearest for categories. Interpolation follows
GDAL's output data type, so integer TIFF samples can round interpolated values.

## Limits and lifetime

- One job per converter; concurrent calls reject with `busy`. Await the job or
  cancel its signal before starting another.
- Cancellation terminates the active Worker. The same converter can run a fresh
  job. `dispose()` also aborts preparation/reads and permanently rejects reuse.
- The default `memoryBudgetBytes` is 256 MiB. It limits input/output size and an
  estimate of two Float64 raster buffers. It is not a cap on total browser/WASM
  memory. Smaller target grids may be necessary on constrained devices.
- A Worker timeout defaults to 180 seconds and can be configured. It excludes
  source-slice preparation. Progress uses real stages; row counts are provided
  while preparing a slice, but no artificial GDAL percentage is reported.
- Sources are read in bounded row chunks; GDAL still stores its output and
  temporary datasets in memory. No multi-gigabyte guarantee is made.
- NC3/NC4 reading support comes from the selected source. Curvilinear, rotated
  and unstructured NetCDF grids are not regridded by this package.
- Conversion does not rotate plates or establish a layer's coordinate epoch.
  PaleoDEM/other existing paleogeographic snapshots must retain their age/model
  context and should not be reconstructed again merely because they became COGs.

`RasterConversionError.code` distinguishes `aborted`, `closed`, `busy`,
`invalid-input`, `unsupported-format`, `unsupported-grid`, `resource-limit` and
`engine-error`. Borrowed source read errors also propagate to the caller.

## Validation

The repository's `scripts/raster/run-reference-browser.mjs --converter` uses a
production build and real browser Worker, with fixed public files and independent
numeric baselines. It tests COG readback, source samples/metadata, cancellation,
recovery and disposal. Test services are static and close after execution; no
frontend development server is required. See the corpus compatibility matrix in
`scripts/raster/README.md` for the actual tested cases.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the separate engine license.

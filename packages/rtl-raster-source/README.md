# rtl-raster-source

Browser-local raster metadata and numeric windows, without Cesium or React. Files
stay in the browser. Importing this package does not start a worker, load WASM or
allocate a canvas. This ESM package includes TypeScript declarations.

```sh
npm install rtl-raster-source
```

```ts
import { openRasterSource, toPhysicalValue } from "rtl-raster-source";

const source = await openRasterSource(file, {
  memoryBudgetBytes: 64 * 1024 * 1024,
  decoderWorkers: 2,
});
try {
  const result = await source.readWindow({
    window: [100, 200, 116, 216], // exclusive right/bottom edges
    bands: [0], // zero-based
    signal: controller.signal,
  });
  const physicalValue = toPhysicalValue(result.bands[0][0], source.metadata.bands[0]);
} finally {
  source.close();
}
```

`readWindow` returns caller-owned typed arrays with raw, row-major samples. Missing
values and CF scale/offset are band metadata; `toPhysicalValue` checks missing
values before scaling. Smaller output `width`/`height` request nearest-neighbor
sampling and permit overviews. A default preview is not a global statistic.

`metadata.transform` uses GDAL order and maps **pixel edges** to native coordinates.
Use `(column + 0.5, row + 0.5)` to locate a sample center. PixelIsPoint registration
and nonzero tiepoint pixel coordinates are accounted for. `bounds` uses native CRS
units; `getGeographicBounds` supports EPSG:4326/3857. EPSG:3857 projection math always
uses 6378137 m, independently of any display ellipsoid.

Current GeoTIFF support covers north-up, axis-aligned grayscale/RGB numeric rasters,
local TIFF/BigTIFF/COG, strips, tiles and reduced-resolution images. Rotated grids,
missing EPSG codes and unsupported photometric interpretations produce explicit
errors. Numeric windows remain independent of imagery color maps. Palette/CMYK
TIFF and lossy scientific-value conversion are not implied by RGB support.

Reads are serialized and sampled block by block. The byte budget estimates decoder
buffers and output arrays; it is not a browser-wide memory cap. Even a one-pixel
request may require decoding a whole compressed strip. Oversized blocks or outputs
produce `RasterError` with `code: "resource-limit"`. COG with overviews reduces I/O
and decode work. There is no promise of arbitrary multi-GB file support.

`close()` is idempotent, cancels reads and releases the decoding pool. Abort a read
with `signal`; subsequent reads remain usable. A source closed by its owner must
not be reused. GeoTIFF decoder workers use the dependency's worker loader; CSP must
allow its worker resources (including `blob:` when used by that loader).

Public-file test provenance and independent numeric oracles are documented in
[the reference-data tools](../../scripts/raster/README.md). See
[中文说明](./README.zh-CN.md) and [third-party notices](./THIRD_PARTY_NOTICES.md).

## Scientific NetCDF grids

```ts
import { openNetCDFSource } from "rtl-raster-source/netcdf";

const dataset = await openNetCDFSource(file);
const variable = dataset.metadata.variables.find((v) => v.name === "tos")!;
const layout = dataset.describeVariable(variable.name); // CF spatial axes + non-spatial selectors
const time = await dataset.readCoordinate("time"); // raw values; inspect units/calendar
const slice = await dataset.selectSlice({ variable: variable.name, indices: { time: 12 } });
// The same source works with RasterImageryProvider.fromSource(slice).
try {
  const raw = await slice.readWindow({ window: [90, 85, 91, 86] });
} finally {
  slice.close(); // other slices remain open
  dataset.close(); // terminates its worker and invalidates all remaining slices
}
```

CF/COARDS geographic rectilinear grids can use either latitude direction, either
spatial dimension order, 0–360 longitude, and nonuniform one-dimensional latitude
(including Gaussian grids). Variable and dimension names are group-qualified.
Supply an original-array index for each non-spatial dimension with more than one
element. Full original variable/global attributes remain available. Calendars such
as `360_day`, `noleap` and year-zero origins are **not** converted to JavaScript
`Date`; coordinate values, units and calendar must travel together.

`describeVariable(name)` discovers `longitude`, `latitude`, and `selectors`
(original dimension name, size, optional coordinate variable) without reading
samples. Build time/depth selectors from this layout, not guessed axis names.
It shares `selectSlice`'s grid checks and rejects curvilinear grids explicitly.

`slice.metadata.slice.selections` retains each selected non-spatial coordinate's
index, raw scalar (for supported numeric axes), original units/calendar and other
attributes. `datasetAttributes` retains the file's global provenance. These travel
with the slice metadata after the original dataset has been closed.

For these grids, `metadata.transform` is `null`: `metadata.coordinates.x/y` retain
the original physical coordinate centers and array order. `planGeographicRead`
builds `sampleColumns`/`sampleRows` for a geographic output image; `readWindow`
then returns samples at those original indices, including the longitude seam.
It does not invent a uniform transform for a Gaussian grid. CF bounds take
precedence over inferred cell edges. Display bounds clip latitude at the poles.

Slice values remain packed, with `_Unsigned` reinterpreted as the corresponding
unsigned integer type. `_FillValue`, `missing_value` and `valid_range/min/max` are
checked in stored units before `scale_factor`/`add_offset`. Metadata diagnostics
are in `slice.metadata.warnings`, e.g. a missing auxiliary coordinate referenced
by an otherwise usable file. Two-dimensional coordinates, rotated/curvilinear or
unstructured grids, CDF-5, numeric types beyond exact supported precision, and
CDF-2 variable offsets above 4 GiB return explicit errors. Generic HDF5 without
NetCDF dimension scales is not treated as NetCDF.

NetCDF uses one module Worker per dataset. The header-only NetCDF3 reader uses
Blob ranges; NetCDF4 mounts the File with HDF5 WORKERFS, then reads hyperslabs.
HDF5/WASM loads only for NetCDF4. Copy **all** `dist/workers` files together when
self-hosting assets, retaining the supplied licenses. The default `new URL`
worker URL supports bundlers; with Vite use `worker: { format: "es" }` for worker
code splitting. For other hosting arrangements pass
`workerFactory: () => new Worker("/raster-workers/netcdf.js", { type: "module" })`.
CSP must allow module Workers and WASM compilation. Importing the subentry itself
does not start either. A cancelled read settles promptly; a current bounded
decoder call may finish before the next read starts. `dataset.close()` terminates
the Worker immediately and releases its file mount and WASM memory.

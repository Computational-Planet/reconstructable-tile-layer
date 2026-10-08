# Public geoscience reference data

`node scripts/raster/download-reference-data.mjs` downloads the pinned files in
`reference-datasets.json` to the ignored `tmp/raster-reference-data` cache. It checks
file signatures, size limits and SHA-256 hashes. No binary reference files are
published with the libraries. A changed upstream file fails verification.

The **format regression corpus** contains NOAA PSL NCEP/NCAR air climatology, PCMDI/IPSL sea-surface
temperature, NCAR Community Climate System Model (CCSM) atmosphere, and the same
NOAA ETOPO 2022 tile in both GeoTIFF and NetCDF. Source links and provenance are in
the manifest. These files exercise CF/COARDS conventions, calendars, coordinate
bounds, Gaussian latitude, unlimited dimensions, pressure levels and longitude
wrapping. These are not a representative paleogeographic corpus: NOAA PSL is not
NOAA Paleoclimatology, and the CCSM SRES A1B sample is a future climate scenario.
Their presence does not imply that every grid has been implemented.

For independent expected values, create a separate Python environment, install
`requirements-reference.txt`, and run `python scripts/raster/inspect-reference-data.py`.
The resulting `reference-metadata.json` records native dimensions, selected
attributes, axis spacing and raw samples without automatic masking/scaling. This
tool is for tests; application data processing runs entirely in the browser.

Keep original metadata and acknowledgments if redistributing data. In particular,
the CCSM file contains its project acknowledgment and redistribution conditions.
The repository downloads original files from their providers and does not bundle
them into npm packages. ETOPO citation: NOAA National Centers for Environmental
Information (2022), ETOPO 2022 15 Arc-Second Global Relief Model,
[doi:10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74).

Build the packages, generate the independent oracle, then run
`node scripts/raster/run-reference-browser.mjs`. This uses a Vite **production**
build, headless Edge and an automatically closed loopback static fixture service.
It never starts a development server. Set `RASTER_BROWSER_CHANNEL` for a different
locally installed Playwright browser channel. Evidence goes to the ignored
`tmp/raster-reference-browser/evidence.json` cache. No user file is uploaded.

After building `rtl-raster-source`, run
`node scripts/raster/run-netcdf-worker-browser.mjs` to test the package's Worker
files directly, without a second bundling step. It tests plain Worker URLs and
URLs with `?worker_file&type=module`, including repeated reads after closing a
slice. This catches HDF5 chunks importing the Worker entry again and resetting
its dataset state, a failure that production rebundling can hide. Add `--domain`
to include the downloaded PaleoDEM 0 Ma and 100 Ma files. The runner uses a
temporary loopback static fixture service, closes it on exit, and stores evidence
under `tmp/netcdf-worker-browser-*/evidence.json`; no development server is started.

The browser tests exercise the published source/provider APIs, with geotiff 3.0.5,
netcdfjs 4.0.0, h5wasm 0.10.3 and Cesium 1.119.0. Original small fixtures are
independently generated with
`python packages/rtl-raster-source/test/generate-netcdf-fixtures.py` and committed
for deterministic regression tests; public scientific files remain separate.

| Dataset                         | Tested through public APIs                                                                                           | Remaining work                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| NCEP/NCAR air climatology (NC4) | Raw samples including time 6, descending pole-centered latitude, cyclic longitude, provider image                    | Demo selection and COG export      |
| PCMDI/IPSL SST (NC3)            | Unlimited time records including time 12, CF bounds/NoData, 360_day retained, provider image                         | Demo selection and COG export      |
| CCSM atmosphere (NC3)           | tas and pressure-level ua, Gaussian latitude, noleap/year-zero metadata, provider images                             | Demo selection and COG export      |
| ETOPO NetCDF4 + TIFF            | Samples match Python, same-position elevation equals across opposite row orders, vertical EPSG retained in TIFF      | COG export through product package |
| Independent CDF-2 fixture       | Unpadded single record variable, transposed spatial axes, unsigned packed values/NoData/scaling                      | —                                  |
| Independent NC4 group fixture   | Group-qualified dimensions, time between spatial dimensions, custom coordinate names, descending nonuniform latitude | —                                  |

All NetCDF cases additionally exercise cancelled reads followed by successful
reads and provider output. The grouped fixtures check dataset-close invalidation.
CCSM's `tas` references an absent `height` coordinate; this produces a metadata
warning while its existing spatial axes are used. Tests do not claim support for
curvilinear/rotated/unstructured grids or arbitrary multi-gigabyte files.

## Paleogeographic domain corpus

`python scripts/raster/download-domain-reference-data.py` downloads four pinned
files from the official PaleoDEM archive and CEDA DeepMIP-Eocene Phase 1 archive.
Sources, exact filenames, scientific purpose and SHA-256 hashes are recorded in
`domain-reference-datasets.json`. Data stay in the ignored `tmp/paleo-domain-review`
cache. The PaleoDEM ZIP is approximately 9.3 MB; the two DeepMIP files total 9.5 MB.
The downloader reads only the selected archive entries and does not download the
full DeepMIP collection. Python is development/test tooling, not application runtime.

After installing `requirements-reference.txt` in a separate test environment, run
`python scripts/raster/inspect-domain-reference-data.py` to generate an independent
NetCDF metadata and raw-value record. Then run
`node scripts/raster/run-reference-browser.mjs --domain` to exercise the actual
browser source/provider APIs. Evidence is written to
`tmp/raster-reference-browser/domain-evidence.json`.

| Pinned case                                                             | Observed file structure                                                                                                | Browser acceptance                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| PaleoDEM Holocene 0 Ma and Early Cretaceous 100 Ma, original 1° archive | NC4, COARDS/CF-1.5, `z(lat,lon)`, 181×361; poles and duplicated longitude endpoint; no internal time axis or `z.units` | Exact raw samples −4920 and 480, preserved grid/metadata, nonempty provider images                 |
| DeepMIP CESM1.2-CAM5, Eocene-p1-x3, v1.0 monthly mean `tas`             | NC3, CF-1.8, `time×lat×lon`, 12×96×144; K; `365_day`, reference date in 1950                                           | Exact raw sample 307.0730285644531, retained experiment and time metadata, nonempty provider image |
| Same DeepMIP experiment, monthly mean `tos`                             | NC3, `time×nlat×nlon`, 12×384×320; two-dimensional `TLAT/TLONG`                                                        | Expected `unsupported-grid`; this is an explicit rejection test, not ocean-grid support            |

PaleoDEM files already describe the geography at their published ages. They should
be selected and displayed as age-specific maps; these tests do not rotate them
again. A filename age, a companion GPML selection interval and processing history
are separate provenance fields. Elevation units given in the publication must not
be silently inserted into the original file metadata.

The DeepMIP `time` axis represents climatological months, independently of the
Eocene experiment. Keep model, experiment, version, averaging method and native
grid. One working atmospheric variable does not establish compatibility with all
variables, ocean grids, models or PMIP datasets. Native curvilinear grid support
requires a separately validated browser implementation.

These source tests establish reading and imagery generation. The separate production
Demo tests below exercise full Cesium scene integration and modern-coordinate plate
reconstruction. Transporting present-day elevation does not predict past topography.
PMIP `lgm` / `midHolocene` remain untested.

Scientific sources: [PaleoDEM release](https://www.earthbyte.org/paleodem-resource-scotese-and-wright-2018/),
[PaleoDEM version record](https://zenodo.org/records/5460860),
[DeepMIP-Eocene data descriptor](https://www.nature.com/articles/s41597-024-03773-4),
[CEDA collection](https://catalogue.ceda.ac.uk/uuid/95aa41439d564756950f89921b6ef215/).

## Browser COG conversion

Build `rtl-raster-converter` and generate its small independent TIFF fixture with
`python packages/rtl-raster-converter/test/generate-fixtures.py`, then run
`node scripts/raster/run-reference-browser.mjs --converter`. Both public download
corpora and the independent `reference-metadata.json` oracle must be present.
The runner copies the pinned gdal3.js 2.8.1 static assets to the temporary test
directory and exercises the public converter API in a real Worker.

Tested cases include full ETOPO TIFF conversion (raw value, horizontal/vertical
CRS, NoData, COG layout and overviews), cancellation followed by recovery,
concurrent-job rejection, explicit georeferencing of an otherwise rejected TIFF,
EPSG:4326 to EPSG:3857 nearest reprojection, packed-value scaling/NaN, and selected
PaleoDEM/DeepMIP/NCEP/PCMDI/CCSM/ETOPO NetCDF slice exports. Rectilinear exports use
explicit geographic target grids, including the CCSM Gaussian latitude case.
Most numeric slice tests intentionally export a single known-position pixel;
PaleoDEM tests a 720×360 resampled grid. They do not establish whole-model or
arbitrary-size performance. The test also disposes an active GDAL Worker.

Evidence is saved to `tmp/raster-reference-browser/converter-evidence.json`.
Units, selected indices/native axes, explicit application age/experiment context
and resampling choices are checked in the COG and its JSON provenance sidecar.
Curvilinear `tos` remains rejected by the source and is not converted. Demo
controls, complete RTL reconstruction and isolated package consumers are separate
acceptance items, not proved by these converter tests.

## Isolated package consumer

After building all packages, run
`node scripts/raster/run-packed-consumer.mjs <absolute-path-to-pnpm.cjs>`.
Alternatively set the task-specific `RTL_PNPM_CLI` environment variable to that
path. The runner invokes Node with structured arguments, packs all seven library
packages, and installs the tarballs in a fresh OS temporary directory outside the
repository. It leaves that directory available for inspection; no packages are
published and no existing directories are deleted.

The fixture uses only public package imports and asset URLs. It checks DOM-free
imports, published TypeScript declarations, a single Cesium resolution, Vite
production builds, actual TIFF/NC3/NC4/COG Worker operation, and ordinary RTL builds
without the optional raster engines. It instantiates a Cesium ImageryLayer and
checks the RTL provider parameter's type compatibility; complete Viewer/plate
reconstruction is a separate integration test.

For reproducibility the consumer pins Cesium 1.119.0, its repository baseline
`@zip.js/zip.js` 2.7.45, GDAL 2.8.1, Vite 5.3.3 and TypeScript 5.5.3. This is a
specific tested dependency set, not a claim that every Cesium/transitive version
works. The dependency override belongs only to the test consumer, not to any
published library. Evidence goes to `tmp/raster-packed-consumer-evidence.json`.

## Production Demo and scientific meaning

Run `pnpm build`, then `node scripts/raster/run-demo-browser.mjs`. The runner opens
the production Demo in headless Edge, uploads real local files through its controls,
uses a temporary loopback static server and closes both browser and server. No dev
or HMR server is used. The API tests and Demo tests serve different purposes:

| Data / native format                               | Browser evidence                                                                                                             | Scientific use / limits                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PaleoDEM 0 / 100 Ma, NetCDF4, 181×361              | Original values −4920 / 480; ordinary Cesium imagery; age visibility; file replacement; 720×360 COG export/readback          | Already-paleo coordinates; zero RTL processor requests; age and its source explicitly supplied; missing `z.units` remains missing                        |
| DeepMIP Eocene CESM1.2-CAM5 x3 v1.0 `tas`, NetCDF3 | Variable/time selector; `365_day` / 1950-origin time retained; K units; imagery; numeric COG API                             | Geological experiment kept separately; one native rectilinear atmospheric grid tested                                                                    |
| Same DeepMIP `tos`, 2D TLAT/TLONG                  | API and UI explicitly reject curvilinear grid                                                                                | Negative fixture, not evidence of all-DeepMIP support                                                                                                    |
| NOAA ETOPO 2022 N00E000 TIFF / NetCDF4, 3600×3600  | Cross-format independent numeric oracle; bounded imagery; full TIFF COG; UI cancellation/recovery; numeric CRS/NoData checks | Modern terrain. TIFF with matching Seton 2012 static polygons + ROT creates real RTL primitives; 701 at 100 Ma agrees with independent Rodrigues formula |
| NOAA PSL NCEP/NCAR climatology, NetCDF4            | CF/COARDS, descending latitude, 0–360, monthly selector, units and selected numeric COG API                                  | Format regression; not NOAA Paleoclimatology                                                                                                             |
| PCMDI/IPSL `tos_O1_2001-2002.nc`, NetCDF3          | Unlimited records, CF bounds, `360_day`, missing cells, units, numeric COG API                                               | Format regression; not paleogeographic reconstruction evidence                                                                                           |
| CCSM SRES A1B `tas` / `ua`, NetCDF3                | Gaussian 1D latitude, time/pressure indices, raw values/units; explicit-grid `tas` COG API                                   | Future scenario; format regression, not a paleo experiment                                                                                               |
| Owned tiny TIFF/NC3/NC4 fixtures                   | Packed/unsigned/missing/grouped axes, RGB, EPSG:3857 on 6371009 m sphere, georeference errors, cancel/close                  | Edge-case regression, supplementary to downloaded scientific files                                                                                       |

The Demo additionally checks style replacement, extra **display-only** NoData
without numeric mutation, source/model changes releasing primitives/caches, and
experiment JSON that requires raster and uploaded model-file reselection. It checks that HDF5/GDAL do not
load on startup and scientific Workers terminate after removal. All requests in
this test stay on the temporary local origin; production processing requires no
data-upload service. Output, screenshots and evidence are in
`tmp/raster-demo-browser/` (not packaged as library assets).

Evidence includes file sizes, hardware, individual UI action timings, and main-page
JS heap snapshots. The latter exclude Worker/WASM/GPU allocations and are not peak
memory measurements. These are single headless functional runs, including automation
and paint waits, not controlled throughput benchmarks. Direct ETOPO NetCDF4 tile
generation took about 90 seconds in the measured run; the same region's converted
COG was much faster. This is a current performance limitation of direct compressed
NetCDF sampling, even though the numerical and reconstruction checks pass.

Tested on Edge 154.0.4258.53, Cesium 1.119.0, geotiff 3.0.5, netcdfjs 4.0.0,
h5wasm 0.10.3 and gdal3.js 2.8.1, using Vite 5.3.3 and TypeScript 5.5.3. Results
do not establish other browsers, arbitrary file sizes, all NetCDF calendars/grids,
PMIP compatibility, or prediction of paleo environmental fields. The default
64 MiB source / 256 MiB conversion budgets estimate work buffers, not total browser
memory. Source inspection/numeric oracles use independent Python readers only as
development tools; they are not part of the browser product.

The supplied COG engine has GTiff/COG but no NetCDF/HDF5 driver; the browser source
reader selects a numeric slice first. TIFFImageryProvider 2.17.5 was evaluated;
its non-COG full-image tile and automatic range-scan behavior did not meet the
bounded-read/ownership contract. The adapter therefore uses the public geotiff API
through `RasterSource` and implements the standard Cesium provider contract.
No private upstream provider internals are imported.

## Raster map levels and reconstruction

After `pnpm build` and downloading the two corpora above, run
`node scripts/raster/run-raster-levels-browser.mjs`. It uses the production Demo
and an ephemeral static server, never a dev/HMR server. Seven cases verify:

- PaleoDEM raw values and nearest-sampled images at default L2 and explicitly
  enabled L3; the default provider rejects L3.
- Actual original NetCDF reconstruction at its suggested L2, including declared
  limits and an explicit UI error for an out-of-range request.
- Actual clipped primitive textures at 0 Ma match source samples across all 16
  L2 tiles; this catches orientation errors after the provider stage.
- L2 source visibility and finite rotation at 100 Ma.
- The same source converted to numeric COG, reopened and reconstructed at L2.
- ETOPO TIFF starting at L3 with all 64 source tiles, including retries when the
  provider's eight-request limit is reached, without failed image requests.
- View-based ETOPO refinement to L4 within a selected geographic view.

Evidence and a screenshot are written to `tmp/raster-levels-browser/`. With the
1×1 root over file coverage, L2 has 16 source tiles and L3 has 64; plate clipping
can produce more reconstruction primitives. Default maximum level is at least
L2, independent of stored overview count. Finer virtual subdivision resamples
existing values. COG storage/overview optimization remains separate from the
map-level policy; see the [provider documentation](../../packages/rtl-raster-imagery-provider/README.md).

`run-demo-browser.mjs` explicitly retains L0 for its earlier format/lifecycle
baseline. Its L0 timings are not the recommended interactive workflow. The
targeted level runner validates the current L2/L3 defaults; neither runner's
single-run timings are a controlled performance comparison.

## Unified Demo source panel

After building the Demo and downloading PaleoDEM, run `node scripts/raster/run-source-panel-browser.mjs`.
It checks the shared Apply source action, tile-service/local-file switching, NetCDF readiness,
actual L2 reconstruction, model changes, custom services, reference/snapshot behavior, experiment import,
and a 390-pixel-wide layout. Screenshots and results are saved to `tmp/source-panel-browser/`.
The test uses a temporary static server for the production build and closes it on exit.

## Editable online service connections

Build the Demo, then run `node scripts/raster/run-service-connections-browser.mjs`.
Its 20 browser cases exercise all 11 example configurations through the visible form and real Cesium
providers, XYZ/TMS indexing, custom root grids/subdomains, WMS axis order and standard Mercator metre
bounds, parameter precedence, WMTS REST/KVP matrix labels/dimensions, coverage, image decode/readback,
failed requests, validation, active-vs-pending state, complete experiment export/import and narrow layout.
Image responses are deterministic PNG fixtures; this suite tests request assembly and UI behavior,
not availability or CORS policy of public endpoints. It closes its temporary production static server
and saves screenshots and request evidence in `tmp/service-connections-browser/`.

Pure configuration and legacy-import tests run with
`pnpm exec vitest run apps/reconstructable-tile-layer-demo/src/cesium/tileServiceConfig.spec.ts --pool=forks --maxWorkers=1 --minWorkers=1`.
The unified panel suite above additionally loads a real PaleoDEM NetCDF into RTL at L2.

## Texture direction and spatial alignment

After building the packages, downloading PaleoDEM and running the production
Demo conversion test above (which creates `tmp/raster-demo-browser/paleodem-ui.cog.tif`),
run `node scripts/raster/run-raster-orientation-browser.mjs`. It builds a static
fixture page and closes its loopback server and Edge process when finished.
No dev/HMR server is started.

Its 19 cases exercise both renderer pools with a directional RGB gradient from
Canvas, HTMLImageElement, a flipped ImageBitmap and Cesium's real `loadImage`
decode path. Geographic and Mercator providers are checked at independently
calculated positions, including a northern-half stencil mask. Downloaded PaleoDEM
0 Ma NC4, the 100 Ma numeric COG from the Demo test, and the owned EPSG:3857 RGB TIFF are each checked across all
16 L2 tiles (61,696 pixel comparisons per file). The original NC also has 64
independent longitude/latitude-to-array checks. These catch per-tile north/south
inversion even when tile counts, raw values and plate rotation matrices pass.

Evidence is written to `tmp/raster-orientation-browser/evidence.json`; the separate
level runner saves 0 Ma and 100 Ma Demo screenshots. Tests use tolerance at most
two channel values for WebGL sampling and ignore partially transparent boundary
pixels when checking clipped scene textures.

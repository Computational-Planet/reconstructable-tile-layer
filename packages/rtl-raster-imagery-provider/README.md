# rtl-raster-imagery-provider

A standard Cesium `ImageryProvider` backed by local numeric rasters. It works with
Cesium alone and with `reconstructable-tile-layer`. Cesium is a peer dependency;
the adapter brings `rtl-raster-source` automatically. It does not depend on React,
the reconstruction package or GDAL. ESM and TypeScript declarations are included.

```sh
npm install cesium rtl-raster-imagery-provider
```

```ts
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

const provider = await RasterImageryProvider.fromFile(file, {
  ellipsoid: viewer.scene.globe.ellipsoid,
  style: { kind: "single-band", band: 0, domain: [-8000, 4000] },
});
const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
viewer.camera.flyTo({ destination: provider.rectangle });

// After removing the imagery layer:
viewer.imageryLayers.remove(imageryLayer, true);
provider.destroy();
```

The host application configures Cesium assets and creates its viewer. This package
does not create a viewer or start a server. `fromFile` owns its new source.
`fromSource(source)` borrows an existing source unless `ownsSource: true` is passed.
Creation failure also closes a source whose ownership was explicitly transferred.

For reconstruction, pass the same provider through the main package's existing
`provider` option, or use `layer.setImageryProvider(viewer, provider)` to replace it. Destroy
the reconstruction layer before its provider. The main package acquires no raster
or conversion dependencies through this integration.

```ts
const layer = await ReconstructableTileLayer.create({
  provider,
  processor,
  featureSource,
  rotationSources,
  initialAge: 0,
});
layer.bindSceneModeSync(viewer);
await layer.loadSourceTilesAtLevel(viewer, provider.recommendedReconstructionLevel);
await layer.setReconstructionAge(100);
```

Single-band styles accept a physical-value `domain` and an optional RGBA `colors`
array. RGB styles use `{ kind: "rgb", bands: [0, 1, 2], domains: [[0, 255], [0, 255],
[0, 255]] }`. Without domains, a bounded 128×128 preview estimates them; this is not
an exact global min/max. Missing samples are transparent. Styles are fixed for a
provider's lifetime, so cached tiles cannot silently retain an old color map.

Both style kinds accept `additionalNoData: [-9999]` to make additional **raw**
sample values transparent. This display-only exclusion is applied before scale/
offset and preview-range estimation. It does not alter source metadata, numeric
reads or COG exports. Keep the applied style with your visualization provenance.

The source coordinate age determines its use: present-day grids, including the
0 Ma PaleoDEM file, can supply RTL reconstruction tiles; grids already expressed
in nonzero-age paleo coordinates can be displayed as age-specific Cesium snapshots.
Applications confirm compatibility with the plate domains and reference frame.
For NetCDF, use `openNetCDFSource(file)` from `rtl-raster-source/netcdf`, select a
2D slice, and pass it to `RasterImageryProvider.fromSource(source)`. Its provider
uses the same RTL integration above; conversion to COG is optional. The provider
continues serving present-day tiles as `setReconstructionAge` changes the target.
Close the reconstruction layer, provider, slice and dataset in that order. NetCDF model
calendar time is separate from geological experiment age; see the
[tested scientific data matrix](../../scripts/raster/README.md).

For style changes over shared data, open the source separately, create borrowed
providers, replace the active provider, then destroy the previous provider. Close
the shared source after all providers are destroyed. Do not borrow the source of an
owning provider and then destroy its owner.

The provider supports geographic output tiles from north-up EPSG:4326/3857 input.
Mercator projection math uses the CRS radius independently of the supplied display
ellipsoid. Each file's coverage uses one level-zero tile: L2 has 4×4 source tiles,
L3 has 8×8. A regional file's level is not the same ground resolution as a global
XYZ service's level. Tiles default to 256×256 pixels.

`nativeMaximumLevel = max(0, ceil(log2(max(width, height) / tileSize)))`, capped at
24, estimates the stored pixel scale, not scientific detail added by resampling.
The default `maximumLevel` is `max(2, nativeMaximumLevel)`; the recommended RTL
start is `min(3, maximumLevel)`. Low-resolution files can therefore reach L2,
while finer files start at L3. Prefer view-based refinement above that. Subdivision
uses nearest sampling of existing values and does not improve source accuracy.
An explicit `maximumLevel` overrides the default (0–24); requests outside it fail.
`getRasterLevelInfo(metadata, options)` returns the same policy before creating a
provider, without reading pixels or starting a Worker.

COG stored overviews, listed separately in `source.metadata.overviews`, reduce
decoding work. Their count does not define the maximum map level. For example,
361×181 PaleoDEM NetCDF and its 720×360 resampled COG both default to maximum L2;
3600×3600 ETOPO defaults to maximum L4 and recommended start L3. Conversion remains
available for tiled storage and overview optimization.

Default display cache is 16 MiB of RGBA canvases and pending work is limited to eight
tiles. Saturated requests return `undefined` for Cesium or the RTL processor to retry. Source decode
budgets are separate. `destroy()` is idempotent and cancels work. No point-query
behavior is implemented; `source` retains raw data access for higher-level tools.

See [中文说明](./README.zh-CN.md) and [third-party notices](./THIRD_PARTY_NOTICES.md).

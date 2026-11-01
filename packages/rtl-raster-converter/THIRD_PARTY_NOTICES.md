# Third-party components

The converter's own source and Worker adapter use the ISC license in `LICENSE`.
This package does not embed or modify GDAL engine code, WASM binaries or data files.
Applications supply the engine's separately hosted static assets.

The tested engine is [gdal3.js 2.8.1](https://github.com/bugra9/gdal3.js), licensed
under LGPL-2.1-or-later. Its npm package includes its `LICENSE`. Its browser build
includes GDAL, PROJ, GEOS and other native components under their respective
licenses; consult the upstream [component and license list](https://gdal3.js.org/docs/)
when distributing those assets. The explicit asset URLs allow applications to
replace or rebuild the engine independently of this adapter.

`rtl-raster-source` is used for generic numeric/grid helpers and is separately
licensed under ISC. Its GeoTIFF/NetCDF engine notices are distributed with that
package. No Cesium or React dependency is introduced by this converter.

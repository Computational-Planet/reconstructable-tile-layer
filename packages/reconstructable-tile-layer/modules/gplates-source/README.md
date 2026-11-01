# rtl-gplates-source

[Monorepo](../../../../README.md) · English | [简体中文](README.zh-CN.md)

GPlates file readers and normalized source records shared by RTL and finite-rotation
interpolation. This package owns URL/local-file reading, gzip/ZIP decoding, ROT
parsing, GPML polygon parsing and adaptation to RTL-compatible plate-domain data.
It depends only on `fflate`; it does not depend on Cesium, React or any RTL package.

## Use through RTL

This module's single source lives in RTL's `modules/gplates-source`. If RTL is installed, use:

```ts
import { loadFiniteRotationRecords } from "reconstructable-tile-layer/gplates";
```

No standalone package installation is needed. The installation and examples below
remain valid for standalone use. Run `pnpm --filter rtl-gplates-source build` from the
repository root to produce the independent ESM, CommonJS and declaration outputs.
Both distributions share source; their build outputs and class identities are separate.

## Installation

```sh
pnpm add rtl-gplates-source
```

## Reading model files

```ts
import {
  loadFeaturePolygonDataWithDiagnostics,
  loadFiniteRotationRecords,
} from "rtl-gplates-source";

const { items, diagnostics } = await loadFeaturePolygonDataWithDiagnostics(
  "/models/static-polygons.gpmlz",
  { polygonRenderIntent: "all-polygons-area" },
);
const rotations = await loadFiniteRotationRecords(["/models/rotations.rot"]);
```

Loaders accept URL strings, `URL`, `File`/`Blob`, `ArrayBuffer` and `Uint8Array`.
Strings always mean URLs. Pass decoded text to `parseGpmlText` or
`parseFiniteRotationText`. Local files can be passed directly without object URLs:

```ts
async function readUploadedModel(plates: File, rotationFiles: File[]) {
  const polygons = await loadFeaturePolygonDataWithDiagnostics(plates, {
    polygonRenderIntent: "all-polygons-area",
  });
  const rotations = await loadFiniteRotationRecords(rotationFiles);
  return { polygons, rotations };
}
```

`signal` cancels fetches and prevents processing cancelled local reads. `sourceName`
overrides the label used for diagnostics and filename-based classification; otherwise
the URL or `File.name` is used. Anonymous blobs/buffers use `"unknown"`.
Filenames containing `static_polygons` or `static_plate` retain the existing
all-polygons-area inference; an explicit `polygonRenderIntent` takes precedence.

## Responsibility boundary

| Layer                        | Responsibility                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `rtl-gplates-source`         | Decode files; return feature geometry, plate IDs, valid ages, ROT records and diagnostics.                  |
| `rtl-finite-rotation`        | Convert records to quaternions, interpolate ages and compose plate-reference chains.                        |
| `reconstructable-tile-layer` | Build plate-domain indexes, schedule tile clipping and render reconstructed imagery.                        |
| Demo                         | Select files, manage object-URL lifetimes when using RTL's existing URL configuration, and display results. |

`FeaturePolygonData.clipArea` is a plain coordinate structure compatible with RTL's
quadtree input. It has no dependency on the quadtree package. `ParsedGpmlFeature`
retains source metadata and polygon parts before the RTL adapter is applied.
No loading function creates Cesium objects, workers, object URLs or UI resources.

Already parsed ROT records can be handed to the rotation package:

```ts
import { FiniteRotationInterpolator } from "rtl-finite-rotation";

const interpolator = new FiniteRotationInterpolator({ anchorPlateId: "0" });
await interpolator.initializeFromRecords(rotations);
const matrix = await interpolator.getPlateRotationMatrix("101", 100);
```

## APIs and format coverage

| API                                                       | Result                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `readGplatesText(source, options?)`                       | Decoded text; compression is detected from bytes.               |
| `decodeGplatesArrayBuffer(bytes, sourceName?)`            | Synchronous UTF-8, gzip or ZIP decoding.                        |
| `parseFiniteRotationText(text)`                           | ROT records grouped by moving plate ID.                         |
| `loadFiniteRotationRecords(sources, options?)`            | Read sources in supplied order, then parse their combined text. |
| `parseGpmlText(text, options?)`                           | GPML feature members with metadata and polygon geometry.        |
| `parsedGpmlFeaturesToPaleoData(features, options?)`       | RTL-compatible polygon records and diagnostics.                 |
| `loadFeaturePolygonDataWithDiagnostics(source, options?)` | Decode, parse and adapt GPML/GPMLZ/XML or custom polygon JSON.  |
| `loadFeaturePolygonData(source, options?)`                | Only the normalized polygon records.                            |
| `readGplatesXmlFromUrl(url, options?)`                    | Read GPML/XML from a URL.                                       |

GPML parsing needs `DOMParser` and DOM node types. Imports, byte readers and ROT
parsing also work in Node.js 18+; parsing GPML in Node requires a DOM implementation.
No DOM access or network request occurs on import.

ZIP decoding selects the first GPML/XML entry, otherwise a ROT entry, otherwise the
first non-directory entry. It does not merge an archive of multiple model files.
GPML geometry support covers polygons, including holes and multiple polygon parts.
Point/line parsing, dynamic topology resolution and vector reconstruction are not supported.
The custom JSON format is not GeoJSON and uses the first polygon of each feature.

ROT parsing retains input order, ignores `!` comments and malformed lines, drops
consecutive equal-age/equal-reference duplicates, and subtracts 0.01 Ma from the
previous record on an equal-age reference change.

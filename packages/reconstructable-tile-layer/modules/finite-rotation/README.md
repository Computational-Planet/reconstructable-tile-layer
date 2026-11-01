# rtl-finite-rotation

[Monorepo](../../../../README.md) · English | [简体中文](README.zh-CN.md)

This package implements the manuscript's **finite-rotation interpolator**. It
parses GPlates ROT records, converts finite Euler rotations to unit
quaternions, interpolates control ages with Cesium `QuaternionSpline`, and
recursively composes reference-plate chains to an anchor plate.

The public class is `FiniteRotationInterpolator`.

File reading, decompression and ROT parsing are delegated to
[`rtl-gplates-source`](../gplates-source/README.md). This package owns
rotation mathematics.
`init(sources, options?)` also accepts local files and byte buffers, with an optional
`signal`. Use `initializeFromRecords(records)` for already parsed source data.

## Highlights

- Parses standard GPlates ROT text from URLs or memory.
- Interpolates finite Euler rotations as unit quaternions.
- Composes moving/fixed plate chains to a configurable anchor plate.
- Returns forward and inverse Cesium rotation matrices without creating scene
  resources.

## Use through RTL

This module's single source lives in RTL's `modules/finite-rotation`. If RTL is installed, use:

```ts
import { FiniteRotationInterpolator } from "reconstructable-tile-layer/rotation";
```

No standalone package installation is needed. The installation and examples below
remain valid for standalone use. Run `pnpm --filter rtl-finite-rotation build` from the
repository root to produce the independent ESM, CommonJS and declaration outputs.
Both distributions share source; their build outputs and class identities are separate.

The independent build includes the GPlates reader code it uses, with no runtime
dependency on the standalone reader package.

## Installation

```sh
pnpm add rtl-finite-rotation cesium
```

## Usage

```ts
import { FiniteRotationInterpolator } from "rtl-finite-rotation";

const finiteRotations = new FiniteRotationInterpolator({
  anchorPlateId: "0",
});

await finiteRotations.initializeFromText(`
1 0   0  0  0  0
1 100 10 20 30 0
`);

const plateMatrix = await finiteRotations.getPlateRotationMatrix("1", 50);
const inverseMatrix = await finiteRotations.getInversePlateRotationMatrix("1", 50);
```

Use `init(urls)` to fetch one or more ROT sources. Use
`initializeFromText(text)` for an in-memory source. `ready` becomes true only
after initialization finishes.

## ROT record model

Each non-comment line has six whitespace-separated fields:

```text
movingPlateId age poleLatitude poleLongitude angle fixedPlateId
```

Text after `!` is ignored. The parser consumes records in file order. The
interpolator uses the reference identifier of the upper bracketing record,
clamps ages outside the control range, and terminates recursive composition at
`anchorPlateId`. The default anchor is `"0"`; pass `null` when no identity
anchor should be forced.

Paper-aligned exported types and helpers include:

- `FiniteRotationRecord`
- `FiniteRotationSeries`
- `FiniteRotationInterpolatorOptions`
- `parseFiniteRotationText`
- `interpolateFiniteRotationAtAge`
- `getPlateRotationMatrixAtAge`

## Ownership and environment

The package does not create browser or Cesium scene resources. A custom
`referenceEllipsoid` may be supplied when Euler-pole axes should not use
`Ellipsoid.default`.

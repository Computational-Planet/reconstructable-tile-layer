# plates-rotation-operator

`plates-rotation-operator` parses GPlates finite-rotation data and evaluates
plate rotations with Cesium quaternions and matrices. Data can be loaded from
in-memory text or fetched from one or more URLs.

## Installation

```sh
pnpm add plates-rotation-operator cesium
```

## Initialize From Text

`initializeFromText` is the simplest entry point when rotation data is already
available as a string.

```ts
import { RotationOperator } from "plates-rotation-operator";

const rotationText = `
1 0   0  0  0  0
1 100 10 20 30 0
`;

const rotations = new RotationOperator({ anchorPlateId: "0" });
await rotations.initializeFromText(rotationText);

const matrix = await rotations.getRotateMatrix("1", 50);
```

`ready` becomes `true` only after initialization completes. If initialization
throws, it remains `false`.

## Initialize From URLs

The compatible URL API fetches all files, joins their text, and parses them as
one rotation dataset.

```ts
const rotations = new RotationOperator();
await rotations.init(["/rotations/model-a.rot", "/rotations/model-b.rot"]);
```

`init` preserves the existing loader behavior: it reads every response body and
rejects only when `fetch` or body reading throws. `ready` remains `false` when
that happens, so callers should handle transport failures before enabling
rotation-based workflows.

`loadRotationText(text)` is a lower-level composition method. It adds parsed
records to `rotData` without changing `ready`, allowing several text sources to
be loaded before an application exposes the operator as ready.

## Rotation Text Format

Each data line contains six whitespace-separated fields:

```text
movingPlateId age poleLatitude poleLongitude angle fixedPlateId
```

Text following `!` is treated as a comment. Blank and malformed lines are
ignored. `convertFileContentToJson` exposes the parser when an application only
needs structured `RotItem` records.

## Main API

- `getRotateMatrix(plateId, age)` returns the forward `Matrix3`.
- `getInverseRotateMatrix(plateId, age)` returns its transpose/inverse.
- `rotatePointToModern(point, plateId, age)` maps a reconstructed Cartesian
  point into its modern position.
- `createQuaternionFromRotation(item)` converts one Euler-pole record.
- `rotData` exposes parsed records and optional interpolation splines by plate.

Set `anchorPlateId` to the fixed reference plate. The default is `"0"`; use
`null` when no plate should be treated as an identity anchor. A custom
`referenceEllipsoid` can be supplied when Euler-pole axes should not use
`Ellipsoid.default`.

## Compatibility Exports

All existing helper functions are exported from the package root, including
`getQuaternionAtAge`, `rotatePoints`, `rotatePointToModern`, and
`getPositionsAtAge`. The original misspelled names remain available, while the
root also provides these aliases:

- `getRotateMatrixAtAge` for `getRotateMatirxAtAge`
- `rotateCartesianPoint` for `rotateCartensianPoint`

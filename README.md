# Tile Processing and Paleogeographic Reconstruction

This monorepo contains four TypeScript libraries for Cesium-based imagery tile
processing and plate reconstruction, plus the original interactive React demo.
The code is organized for reuse without changing the reconstruction, geometry,
caching, rendering, benchmark, or demo behavior used by the project.

## Packages

| Package                                                           | Purpose                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`plates-rotation-operator`](packages/plates-rotation-operator)   | Parse GPlates rotation files and calculate plate rotations at a geological age.       |
| [`polygon-tile-quadtree`](packages/polygon-tile-quadtree)         | Index geographic polygons in a Cesium quadtree and clip them to tile bounds.          |
| [`tile-processer-webgl`](packages/tile-processer-webgl)           | Reproject and mask Cesium imagery tiles with a reusable WebGL renderer.               |
| [`simple-geo-reconstruct`](packages/simple-geo-reconstruct)       | Coordinate GPlates loading, plate rotation, quadtree selection, and Cesium rendering. |
| [`simple-geo-reconstruct-demo`](apps/simple-geo-reconstruct-demo) | Show the supported packages in an interactive Cesium application.                     |

Each package has a focused README with installation, a minimal example, and
resource-cleanup notes. Historic `Processer` spellings remain available for
compatibility; correctly spelled `Processor` aliases are also exported.

## Requirements

- Node.js 18 or newer
- pnpm 9.x (the repository is pinned to pnpm 9.0.5)
- A browser with WebGL support for the rendering packages and demo

Cesium is a peer dependency of every publishable package that uses its runtime
or types. Applications should install a compatible Cesium 1.x release.

## Setup

```sh
corepack enable
corepack prepare pnpm@9.0.5 --activate
pnpm install --frozen-lockfile
pnpm build
```

Useful checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

`pnpm test` runs the repository's original quadtree tests. `pnpm check` combines
format checking, linting, builds, type checking, and those existing tests.

To work on a package that depends on other workspace libraries, build its
dependencies first:

```sh
pnpm --filter "simple-geo-reconstruct^..." build
pnpm --filter simple-geo-reconstruct typecheck
pnpm --filter simple-geo-reconstruct build
```

## Repository layout

```text
apps/
  simple-geo-reconstruct-demo/   Interactive integration example
packages/
  plates-rotation-operator/      Rotation parsing and interpolation
  polygon-tile-quadtree/         Polygon-aware tile quadtree
  tile-processer-webgl/          WebGL tile processing
  simple-geo-reconstruct/        High-level reconstruction manager
```

Run the demo with `pnpm --filter simple-geo-reconstruct-demo dev`. Its existing
benchmark tools, reference polygon overlays, bundled datasets, controls, and
configuration schema are unchanged.

The shared Rollup configuration emits three trees for each library:
`dist/es` for ESM, `dist/cjs` for CommonJS, and `dist/types` for declarations.
Cesium remains a peer dependency, so builds do not include a second Cesium copy.

The repository ISC license covers the source code only. Bundled geological and
imagery data retain the citations and terms shown by the demo and their original
providers.

## License

Source code is licensed under the ISC License. See [`LICENSE`](LICENSE).

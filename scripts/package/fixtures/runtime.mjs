import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.fetch = () => {
  throw new Error("Import fetched a resource");
};
globalThis.Worker = class {
  constructor() {
    throw new Error("Import created a worker");
  }
};
const reader = require("reconstructable-tile-layer/gplates");
assert(
  !Object.keys(require.cache).some((file) =>
    /[\\/]node_modules[\\/](?:cesium|@cesium)[\\/]/.test(file),
  ),
  "GPlates subpath loaded Cesium",
);
for (const load of [(name) => import(name), async (name) => require(name)]) {
  const [rtl, gplates, rotation, quadtree, processor] = await Promise.all(
    ["", "/gplates", "/rotation", "/quadtree", "/processor"].map((suffix) =>
      load(`reconstructable-tile-layer${suffix}`),
    ),
  );
  assert.equal(rtl.WebGLTileProcessor, processor.WebGLTileProcessor);
  assert.equal(rtl.SimpleGeoReconstructManager, rtl.ReconstructableTileLayer);
  assert.equal(rtl.parseGpmlText, gplates.parseGpmlText);
  assert.equal(rotation.parseFiniteRotationText, gplates.parseFiniteRotationText);
  assert.equal(typeof quadtree.PlateDomainTileQuadtree, "function");
  const records = await gplates.loadFiniteRotationRecords([
    new Blob(["1 0 90 0 0 0\n1 100 90 0 30 0"]),
  ]);
  const interpolator = new rotation.FiniteRotationInterpolator();
  await interpolator.initializeFromRecords(records);
  assert.equal(interpolator.ready, true);
  assert.ok(await interpolator.getPlateRotationMatrix("1", 50));
  if (process.argv.includes("--standalone")) {
    for (const name of [
      "rtl-gplates-source",
      "rtl-finite-rotation",
      "rtl-tile-plate-quadtree",
      "rtl-webgl-tile-processor",
    ]) {
      assert.ok(Object.keys(await load(name)).length, `Missing exports from ${name}`);
    }
    const standalone = await load("rtl-finite-rotation");
    const separate = new standalone.FiniteRotationInterpolator();
    await separate.initializeFromRecords(records);
    assert.deepEqual(
      await separate.getPlateRotationMatrix("1", 50),
      await interpolator.getPlateRotationMatrix("1", 50),
    );
  }
}
if (process.argv.includes("--standalone")) {
  // 栅格扩展保持原有 ESM 入口，不要求它们增加 CommonJS 构建。
  for (const name of ["rtl-raster-source", "rtl-raster-imagery-provider"]) {
    assert.ok(Object.keys(await import(name)).length, `Missing exports from ${name}`);
  }
}
assert.deepEqual(
  reader.parseFiniteRotationText("1 0 0 0 0 0"),
  (await import("reconstructable-tile-layer/gplates")).parseFiniteRotationText("1 0 0 0 0 0"),
);
process.stdout.write(
  "PASS: ESM/CJS public entries, shared constructors/readers, no import-time network or workers\n",
);

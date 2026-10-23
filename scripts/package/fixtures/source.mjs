import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("cesium"));
const esm = await import("rtl-gplates-source");
const cjs = require("rtl-gplates-source");
assert.deepEqual(
  esm.parseFiniteRotationText("1 0 0 0 0 0"),
  cjs.parseFiniteRotationText("1 0 0 0 0 0"),
);
assert.equal(await esm.readGplatesText(new Blob(["local text"])), "local text");
assert.equal(require("rtl-gplates-source/package.json").peerDependencies, undefined);
process.stdout.write("PASS: standalone GPlates reader without Cesium\n");

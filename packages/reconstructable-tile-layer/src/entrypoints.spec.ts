import { describe, expect, it } from "vitest";
import * as rtl from "./index.js";
import * as gplates from "./gplates.js";
import * as rotation from "./rotation.js";
import * as processor from "./processor.js";

describe("unified public entries", () => {
  it("shares processor constructors and legacy reader exports", () => {
    expect(rtl.WebGLTileProcessor).toBe(processor.WebGLTileProcessor);
    expect(rtl.CesiumTileProcesser).toBe(processor.WebGLTileProcessor);
    expect(rtl.parseGpmlText).toBe(gplates.parseGpmlText);
    expect(rtl.loadFeaturePolygonDataWithDiagnostics).toBe(
      gplates.loadFeaturePolygonDataWithDiagnostics,
    );
    expect(rotation.parseFiniteRotationText).toBe(gplates.parseFiniteRotationText);
  });

  it("uses the same parsed rotation record contract across subpaths", async () => {
    const rotations = await gplates.loadFiniteRotationRecords([
      new Blob(["1 0 90 0 0 0\n1 100 90 0 30 0"]),
    ]);
    const interpolator = new rotation.FiniteRotationInterpolator();
    await interpolator.initializeFromRecords(rotations);
    expect(interpolator.ready).toBe(true);
    expect(await interpolator.getPlateRotationMatrix("1", 50)).toBeDefined();
  });
});

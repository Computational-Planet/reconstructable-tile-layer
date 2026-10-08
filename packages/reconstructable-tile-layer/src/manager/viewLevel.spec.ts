import type { ImageryProvider } from "cesium";
import { describe, expect, it } from "vitest";
import { clampFineViewLevel } from "./viewLevel.js";

describe("source level limits", () => {
  it("clamps application options and explicit levels to a small raster", () => {
    const provider = { minimumLevel: 0, maximumLevel: 1 } as ImageryProvider;
    expect(clampFineViewLevel(8, provider, { minLevel: 3, maxLevel: 18 })).toBe(1);
    expect(clampFineViewLevel(-1, provider, {})).toBe(0);
  });

  it("respects a provider minimum even when options request lower levels", () => {
    const provider = { minimumLevel: 3, maximumLevel: 8 } as ImageryProvider;
    expect(clampFineViewLevel(0, provider, { minLevel: 0, maxLevel: 1 })).toBe(3);
    expect(clampFineViewLevel(NaN, provider, {})).toBe(3);
  });
});

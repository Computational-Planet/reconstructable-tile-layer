import { GeographicTilingScheme, Rectangle, type ImageryProvider, type Viewer } from "cesium";
import { describe, expect, it } from "vitest";
import { resolveFineViewLevel, validateFixedViewLevel } from "./viewLevel.js";

const provider = {
  minimumLevel: 0,
  maximumLevel: 8,
  tilingScheme: new GeographicTilingScheme(),
} as ImageryProvider;
const viewer = {
  scene: { canvas: { clientWidth: 8192, clientHeight: 4096 } },
} as unknown as Viewer;

describe("fixed view level", () => {
  it("accepts zero and the provider's upper limit without changing them", () => {
    expect(validateFixedViewLevel(0, provider)).toBe(0);
    expect(validateFixedViewLevel(8, provider)).toBe(8);
  });

  it.each([-1, 1.5, NaN, Infinity, 9])("rejects invalid level %s", (level) => {
    expect(() => validateFixedViewLevel(level, provider)).toThrow(RangeError);
  });

  it("honors provider limits and does not impose the automatic default maximum", () => {
    expect(() => validateFixedViewLevel(0, { ...provider, minimumLevel: 3 })).toThrow(/3–8/);
    expect(validateFixedViewLevel(20, { ...provider, maximumLevel: undefined })).toBe(20);
  });
});

describe("automatic view level", () => {
  it("retains viewport selection and lowers the level to meet the tile budget", () => {
    const unrestricted = resolveFineViewLevel(viewer, provider, Rectangle.MAX_VALUE, {
      maxRawViewTileCount: 10000,
    });
    expect(unrestricted).toBeGreaterThan(0);
    expect(
      resolveFineViewLevel(viewer, provider, Rectangle.MAX_VALUE, { maxRawViewTileCount: 1 }),
    ).toBe(0);
  });

  it("bounds application preferences by the actual source levels", () => {
    expect(
      resolveFineViewLevel(viewer, { ...provider, maximumLevel: 1 }, Rectangle.MAX_VALUE, {
        minLevel: 3,
        maxLevel: 18,
      }),
    ).toBe(1);
    expect(
      resolveFineViewLevel(viewer, { ...provider, minimumLevel: 3 }, Rectangle.MAX_VALUE, {
        minLevel: 0,
        maxLevel: 1,
      }),
    ).toBe(3);
  });
});

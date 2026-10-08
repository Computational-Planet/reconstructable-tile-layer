import { GeographicProjection, type ImageryProvider, WebMercatorTilingScheme } from "cesium";
import { describe, expect, it } from "vitest";
import { getIdentityTextureCoordData, getTextureCoordData } from "./glInitFunc.js";

describe("texture projection selection", () => {
  it("does not warp imagery that a custom Mercator subclass already projects to latitude", () => {
    class CustomScheme extends WebMercatorTilingScheme {}
    const tilingScheme = new CustomScheme();
    Object.defineProperty(tilingScheme, "projection", { value: new GeographicProjection() });
    const provider = { tilingScheme } as ImageryProvider;
    expect(getTextureCoordData(5, provider, 0, 0, 1)).toEqual(getIdentityTextureCoordData(5));
  });

  it("still warps a genuine Mercator texture", () => {
    const provider = { tilingScheme: new WebMercatorTilingScheme() } as ImageryProvider;
    expect(getTextureCoordData(5, provider, 0, 0, 1)).not.toEqual(getIdentityTextureCoordData(5));
  });
});

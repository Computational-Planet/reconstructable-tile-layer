import { Ellipsoid, GeographicProjection } from "cesium";
import { describe, expect, it, vi } from "vitest";
import type { RasterMetadata, RasterSource } from "rtl-raster-source";
import { RasterImageryProvider } from "./RasterImageryProvider.js";
import { resolveStyle, writeColor } from "./style.js";
import { getRasterLevelInfo } from "./levels.js";

function source(): RasterSource {
  const metadata: RasterMetadata = {
    format: "geotiff",
    width: 3,
    height: 1,
    crs: { epsg: 4326 },
    transform: [10, 1, 0, 20, 0, -1],
    bounds: [10, 19, 13, 20],
    pixelInterpretation: "area",
    overviews: [],
    bands: [
      {
        name: "Temperature",
        dataType: "int16",
        noData: [-9999],
        scale: 0.5,
        offset: 273.15,
        units: "K",
      },
    ],
  };
  return {
    metadata,
    closed: false,
    close: vi.fn(),
    readWindow: vi.fn(async (options) => ({
      width: 3,
      height: 1,
      window: options.window,
      bands: [new Int16Array([-9999, 0, 10])],
    })),
  };
}

describe("raster imagery ownership and scientific styles", () => {
  it("does not allocate DOM resources during creation with an explicit domain, and borrows sources", async () => {
    const raster = source();
    const sphere = new Ellipsoid(6371009, 6371009, 6371009);
    const provider = await RasterImageryProvider.fromSource(raster, {
      ellipsoid: sphere,
      maximumLevel: 18,
      style: { kind: "single-band", band: 0, domain: [273, 300] },
    });
    expect(raster.readWindow).not.toHaveBeenCalled();
    expect(provider.tilingScheme.projection).toBeInstanceOf(GeographicProjection);
    expect(provider.tilingScheme.ellipsoid).toBe(sphere);
    expect(provider.nativeMaximumLevel).toBe(0);
    expect(provider.maximumLevel).toBe(18);
    provider.destroy();
    provider.destroy();
    expect(raster.close).not.toHaveBeenCalled();
    await expect(provider.requestImage(0, 0, 0)).rejects.toMatchObject({ code: "closed" });
  });

  it("releases explicitly owned sources exactly once and refuses unsupported levels", async () => {
    const raster = source();
    const provider = await RasterImageryProvider.fromSource(raster, {
      ownsSource: true,
      maximumLevel: 0,
      style: { kind: "single-band", band: 0, domain: [273, 300] },
    });
    await expect(provider.requestImage(0, 0, 1)).rejects.toThrow(RangeError);
    provider.destroy();
    provider.destroy();
    expect(raster.close).toHaveBeenCalledTimes(1);
  });

  it("lets low-resolution grids subdivide at L2 while reporting native detail separately", async () => {
    const raster = source();
    const provider = await RasterImageryProvider.fromSource(raster, {
      style: { kind: "single-band", band: 0, domain: [273, 300] },
    });
    expect(provider.nativeMaximumLevel).toBe(0);
    expect(provider.maximumLevel).toBe(2);
    expect(provider.recommendedReconstructionLevel).toBe(2);
    expect(provider.tilingScheme.getNumberOfXTilesAtLevel(2)).toBe(4);
    expect(provider.tilingScheme.getNumberOfYTilesAtLevel(2)).toBe(4);
    expect(provider.tilingScheme.tileXYToRectangle(0, 0, 2).width * 4).toBeCloseTo(
      provider.rectangle.width,
    );
    await expect(provider.requestImage(0, 0, 3)).rejects.toThrow(RangeError);
    await expect(provider.requestImage(4, 0, 2)).rejects.toThrow(RangeError);
    provider.destroy();
    await expect(
      RasterImageryProvider.fromSource(raster, {
        maximumLevel: 25,
        style: { kind: "single-band", band: 0, domain: [273, 300] },
      }),
    ).rejects.toThrow(RangeError);
  });

  it("reports useful levels before decoding PaleoDEM, DeepMIP or ETOPO pixels", () => {
    for (const [width, height, native, maximum, recommended] of [
      [361, 181, 1, 2, 2],
      [144, 96, 0, 2, 2],
      [720, 360, 2, 2, 2],
      [3600, 3600, 4, 4, 3],
    ]) {
      expect(getRasterLevelInfo({ width, height })).toMatchObject({
        nativeMaximumLevel: native,
        maximumLevel: maximum,
        recommendedReconstructionLevel: recommended,
      });
    }
    expect(getRasterLevelInfo({ width: 361, height: 181 }, { maximumLevel: 3 })).toMatchObject({
      nativeMaximumLevel: 1,
      maximumLevel: 3,
      recommendedReconstructionLevel: 3,
    });
  });

  it("calibrates from raw data in physical units and renders NoData as transparent", async () => {
    const raster = source();
    const style = await resolveStyle(raster, {
      kind: "single-band",
      band: 0,
      colors: [
        [0, 0, 255, 255],
        [255, 0, 0, 255],
      ],
    });
    expect(style.domains[0][0]).toBeCloseTo(273.15);
    expect(style.domains[0][1]).toBeCloseTo(278.15);
    const rgba = new Uint8ClampedArray(8);
    writeColor([NaN], style, rgba, 0);
    writeColor([275.65], style, rgba, 4);
    expect([...rgba]).toEqual([0, 0, 0, 0, 128, 0, 128, 255]);
    const excluded = await resolveStyle(raster, {
      kind: "single-band",
      band: 0,
      additionalNoData: [0],
    });
    expect(excluded.domains[0][0]).toBeCloseTo(278.15);
    expect(raster.metadata.bands[0].noData).toEqual([-9999]);
  });
});

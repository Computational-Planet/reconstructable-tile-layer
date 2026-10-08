import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { writeArrayBuffer } from "geotiff";
import { openRasterSource } from "./geotiff.js";
import {
  getGeographicBounds,
  nativeToPixel,
  pixelToNative,
  toPhysicalValue,
  WEB_MERCATOR_RADIUS,
} from "./spatial.js";
import type { RasterSource } from "./types.js";

// Node 仅补齐浏览器 FileReader；TIFF 编解码仍使用真实 geotiff 引擎。
class TestFileReader {
  result: ArrayBuffer | null = null;
  onload?: () => void;
  onerror?: (error: unknown) => void;
  onabort?: (error: unknown) => void;
  private aborted = false;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then(
      (result) => {
        if (!this.aborted) {
          this.result = result;
          this.onload?.();
        }
      },
      (error: unknown) => this.onerror?.(error),
    );
  }
  abort() {
    this.aborted = true;
    this.onabort?.(new DOMException("Aborted", "AbortError"));
  }
}

function fixture(point = false) {
  return new Blob([
    writeArrayBuffer(new Float32Array([-9999, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23]), {
      width: 4,
      height: 3,
      BitsPerSample: [32],
      SampleFormat: [3],
      SamplesPerPixel: 1,
      GTModelTypeGeoKey: 2,
      GeographicTypeGeoKey: 4326,
      GTRasterTypeGeoKey: point ? 2 : 1,
      ModelPixelScale: [2, 2, 0],
      ModelTiepoint: [1, 1, 0, 12, 18, 0],
      GDAL_NODATA: "-9999",
    }),
  ]);
}

describe("GeoTIFF numeric source", () => {
  const sources: RasterSource[] = [];
  beforeEach(() => vi.stubGlobal("FileReader", TestFileReader));
  afterEach(() => {
    sources.forEach((source) => source.close());
    vi.unstubAllGlobals();
  });
  async function open(blob = fixture(), budget?: number) {
    const source = await openRasterSource(blob, { decoderWorkers: 0, memoryBudgetBytes: budget });
    sources.push(source);
    return source;
  }

  it("reads a non-origin window as raw Float32 samples with correct coordinates", async () => {
    const source = await open();
    expect(source.metadata.transform).toEqual([10, 2, 0, 20, 0, -2]);
    expect(source.metadata.bounds).toEqual([10, 14, 18, 20]);
    const result = await source.readWindow({ window: [1, 1, 4, 3] });
    expect(result.bands[0]).toBeInstanceOf(Float32Array);
    expect([...result.bands[0]]).toEqual([11, 12, 13, 21, 22, 23]);
    expect(source.metadata.bands[0].noData).toEqual([-9999]);
    expect(Object.isFrozen(source.metadata.transform)).toBe(true);
    expect(
      nativeToPixel(
        source.metadata.transform,
        ...pixelToNative(source.metadata.transform, 2.5, 1.5),
      ),
    ).toEqual([2.5, 1.5]);
  });

  it("normalizes PixelIsPoint to pixel edges and samples resized windows at pixel centers", async () => {
    const source = await open(fixture(true));
    expect(source.metadata.transform).toEqual([9, 2, 0, 21, 0, -2]);
    const result = await source.readWindow({ window: [0, 0, 4, 2], width: 2, height: 1 });
    expect([...result.bands[0]]).toEqual([11, 13]);
  });

  it("rejects excessive working buffers, invalid windows and calls after close", async () => {
    const source = await open(fixture(), 32);
    await expect(source.readWindow({ window: [0, 0, 4, 3] })).rejects.toMatchObject({
      code: "resource-limit",
    });
    await expect(source.readWindow({ window: [-1, 0, 2, 2] })).rejects.toThrow(RangeError);
    source.close();
    source.close();
    await expect(source.readWindow({ window: [0, 0, 1, 1] })).rejects.toMatchObject({
      code: "closed",
    });
  });

  it("samples a stripped TIFF without an overview under a budget smaller than the full raster", async () => {
    const blob = new Blob([
      await readFile(new URL("../test/fixtures/stripped-preview.tif", import.meta.url)),
    ]);
    const source = await open(blob, 128 * 1024);
    expect(source.metadata.overviews).toHaveLength(0);
    const preview = await source.readWindow({ window: [0, 0, 512, 128], width: 16, height: 8 });
    expect(preview.bands[0][0]).toBe(8 * 512 + 16);
    expect(preview.bands[0][127]).toBe(120 * 512 + 496);
  });

  it("cancels a queued read without poisoning the next read", async () => {
    const source = await open();
    const controller = new AbortController();
    const cancelled = source.readWindow({ window: [0, 0, 4, 3], signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
    expect([...(await source.readWindow({ window: [2, 2, 4, 3] })).bands[0]]).toEqual([22, 23]);
  });

  it("checks CF missing values before scaling and keeps EPSG:3857 independent of globe radius", async () => {
    const source = await open();
    const band = { ...source.metadata.bands[0], scale: 0.5, offset: 273.15 };
    expect(toPhysicalValue(-9999, band)).toBeNaN();
    expect(toPhysicalValue(10, band)).toBeCloseTo(278.15);
    const bounds = getGeographicBounds({
      ...source.metadata,
      crs: { epsg: 3857 },
      bounds: [
        0,
        0,
        (Math.PI * WEB_MERCATOR_RADIUS) / 2,
        WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + Math.PI / 6)),
      ],
    });
    expect(bounds[2]).toBeCloseTo(90);
    expect(bounds[3]).toBeCloseTo(60);
  });
});

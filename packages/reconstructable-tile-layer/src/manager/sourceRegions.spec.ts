import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  Ellipsoid,
  GeographicTilingScheme,
  Math as CesiumMath,
  Matrix3,
  Rectangle,
  type ImageryProvider,
} from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundingSphereToGeographicRectangles, splitGeographicRectangle } from "./sourceRegions.js";
import { SimpleGeoReconstructManager, type PaleoData } from "../SimpleGeoReconstructManager.js";
import type { TileProcessor } from "../processor.js";

afterEach(() => vi.restoreAllMocks());

describe("source sphere geographic bounds", () => {
  it("splits dateline extents without turning them into almost-global ranges", () => {
    const sphere = new BoundingSphere(
      Cartesian3.fromDegrees(179, 0, 0, Ellipsoid.UNIT_SPHERE),
      0.1,
    );
    const result = boundingSphereToGeographicRectangles(sphere, Ellipsoid.UNIT_SPHERE);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.west <= r.east && r.width < 0.2)).toBe(true);
    expect(result.some((r) => Rectangle.contains(r, Cartographic.fromDegrees(-179, 0)))).toBe(true);
    expect(splitGeographicRectangle(Rectangle.fromDegrees(170, -10, -170, 10))).toHaveLength(2);
  });
  it("handles pole-crossing caps, globe-covering spheres, and spheres missing the surface", () => {
    const polar = boundingSphereToGeographicRectangles(
      new BoundingSphere(new Cartesian3(0, 0, 1), 0.2),
      Ellipsoid.UNIT_SPHERE,
    );
    expect(polar[0].width).toBeCloseTo(2 * Math.PI);
    expect(polar[0].north).toBeCloseTo(Math.PI / 2);
    expect(
      boundingSphereToGeographicRectangles(
        new BoundingSphere(Cartesian3.ZERO, 1),
        Ellipsoid.UNIT_SPHERE,
      ),
    ).toEqual([Rectangle.MAX_VALUE]);
    expect(
      boundingSphereToGeographicRectangles(
        new BoundingSphere(Cartesian3.ZERO, 0.5),
        Ellipsoid.UNIT_SPHERE,
      ),
    ).toEqual([]);
    expect(() =>
      boundingSphereToGeographicRectangles(
        new BoundingSphere(Cartesian3.ZERO, NaN),
        Ellipsoid.UNIT_SPHERE,
      ),
    ).toThrow(RangeError);
  });
  it.each([Ellipsoid.UNIT_SPHERE, Ellipsoid.WGS84, new Ellipsoid(3, 2, 1)])(
    "contains every sampled surface point inside the query sphere (%s)",
    (ellipsoid) => {
      // 用地表点覆盖不同纬度、极区和反经线，验证四至是保守包围而非缩小的近似。
      for (const [lon, lat] of [
        [178, 35],
        [10, 78],
        [-110, -25],
      ]) {
        const sphere = new BoundingSphere(
          Cartesian3.fromDegrees(lon, lat, 0, ellipsoid),
          ellipsoid.minimumRadius * 0.4,
        );
        const bounds = boundingSphereToGeographicRectangles(sphere, ellipsoid);
        let included = 0;
        for (let x = -180; x <= 180; x += 3)
          for (let y = -90; y <= 90; y += 3) {
            const point = Cartesian3.fromDegrees(x, y, 0, ellipsoid);
            if (Cartesian3.distance(point, sphere.center) <= sphere.radius) {
              included++;
              expect(
                bounds.some((r) => Rectangle.contains(r, Cartographic.fromDegrees(x, y))),
                `${lon},${lat}: ${x},${y}`,
              ).toBe(true);
            }
          }
        expect(included).toBeGreaterThan(0);
      }
    },
  );
});

function feature(
  id: string,
  plateId: string,
  lon: number,
  begin = 100,
  end = 0,
  lat = 0,
): PaleoData {
  const exterior = [
    lon - 5,
    lat - 5,
    lon + 5,
    lat - 5,
    lon + 5,
    lat + 5,
    lon - 5,
    lat + 5,
    lon - 5,
    lat - 5,
  ];
  return {
    plateId,
    featureId: id,
    lonlats: exterior,
    clipArea: { polygons: [{ exterior }] },
    renderIntent: "area",
    time: { begine: begin, end },
  };
}
async function managerSetup(items?: PaleoData[]) {
  const requestImage = vi.fn();
  const manager = new SimpleGeoReconstructManager({
    provider: {
      tilingScheme: new GeographicTilingScheme({ ellipsoid: Ellipsoid.UNIT_SPHERE }),
      maximumLevel: 8,
      requestImage,
    } as unknown as ImageryProvider,
    processor: {
      clearBuffer: vi.fn(),
      getPoolStats: vi.fn(() => ({})),
    } as unknown as TileProcessor,
    featureSource: "memory.json",
    rotationSources: ["memory.rot"],
  });
  vi.spyOn(manager, "getPaleoDataFlatten").mockResolvedValue({
    items: items ?? [
      feature("a", "1", 0),
      feature("b", "1", 0),
      feature("expired", "2", 0, 5),
      // 远处样本避开四叉树根节点的赤道分界；跨分界的小多边形也可能获得半球级保守包围球。
      feature("far", "3", 135, 100, 0, 25),
    ],
    diagnostics: undefined,
  });
  vi.spyOn(manager.rotationOperator, "init").mockResolvedValue();
  const rotation = Matrix3.fromRotationZ(Math.PI / 2);
  vi.spyOn(manager.rotationOperator, "getRotateMatrix").mockResolvedValue(rotation);
  const inverse = vi
    .spyOn(manager.rotationOperator, "rotatePointToModern")
    .mockImplementation(async (point) =>
      Matrix3.multiplyByVector(Matrix3.transpose(rotation, new Matrix3()), point, new Cartesian3()),
    );
  await manager.initialize();
  return { manager, inverse, requestImage };
}

describe("read-only source-region queries", () => {
  it("reuses inverse view rotation, groups plate parts and excludes invalid-age features", async () => {
    const { manager, inverse, requestImage } = await managerSetup();
    const result = await manager.querySourceRegions(Rectangle.fromDegrees(88, -2, 92, 2), {
      age: 20,
      level: 4,
    });
    expect(result.regions.map((r) => r.plateId)).toEqual(["1"]);
    const center = Ellipsoid.UNIT_SPHERE.cartesianToCartographic(
      result.regions[0].modernBoundingSphere.center,
    );
    expect(CesiumMath.toDegrees(center.longitude)).toBeCloseTo(0);
    expect(
      result.regions[0].rectangles.some((r) =>
        Rectangle.contains(r, Cartographic.fromDegrees(0, 0)),
      ),
    ).toBe(true);
    expect(inverse).toHaveBeenCalledOnce();
    expect(inverse.mock.calls[0].slice(1)).toEqual(["1", 20]);
    expect(requestImage).not.toHaveBeenCalled();
    expect(manager.getRuntimeStats().loadedCompositeTileCount).toBe(0);
  });
  it.each([false, true])(
    "removes a coarse sphere candidate when its view contains only NONE tiles (clip %s)",
    async (clipToView) => {
      const { manager, inverse, requestImage } = await managerSetup([feature("a", "1", 0)]);
      // 跨赤道的小板块拥有宽松的根包围球；逆旋转后 40°E 附近却没有板块覆盖。
      const result = await manager.querySourceRegions(Rectangle.fromDegrees(129, -1, 131, 1), {
        age: 20,
        level: 4,
        clipToView,
      });
      expect(inverse).toHaveBeenCalledOnce();
      expect(result.regions).toEqual([]);
      expect(result.rectangles).toEqual([]);
      expect(requestImage).not.toHaveBeenCalled();
    },
  );
  it("keeps point-sized inverse bounds small at every zoom instead of expanding to full tiles", async () => {
    const { manager, requestImage } = await managerSetup();
    const view = Rectangle.fromDegrees(89.9999, -0.0001, 90.0001, 0.0001);
    const results = [];
    for (const level of [0, 4, 8]) {
      const result = await manager.querySourceRegions(view, {
        age: 5,
        level,
        clipToView: true,
      });
      // 同一范围对应两个有效板块；重复四至合并一次，范围不受瓦片层级影响。
      expect(result.regions.map((region) => region.plateId)).toEqual(["1", "2"]);
      expect(result.rectangles).toHaveLength(1);
      const rectangle = result.rectangles[0];
      expect(CesiumMath.toDegrees(rectangle.width)).toBeGreaterThan(0.0002);
      expect(CesiumMath.toDegrees(rectangle.width)).toBeLessThan(0.0004);
      expect(CesiumMath.toDegrees(rectangle.height)).toBeLessThan(0.0004);
      expect(Rectangle.contains(rectangle, Cartographic.fromDegrees(0, 0))).toBe(true);
      results.push(result.rectangles);
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const area = await manager.querySourceRegions(view, { age: 5, level: 4 });
    expect(CesiumMath.toDegrees(area.rectangles[0].width)).toBeCloseTo(22.5);
    expect(requestImage).not.toHaveBeenCalled();
  });
  it("uses the exact query level and combines overlapping plate coverage only once", async () => {
    const { manager } = await managerSetup();
    const view = Rectangle.fromDegrees(88, -2, 92, 2);
    const coarse = await manager.querySourceRegions(view, { age: 5, level: 4 });
    const fine = await manager.querySourceRegions(view, { age: 5, level: 5 });
    expect(coarse.regions).toHaveLength(2);
    expect(coarse.rectangles).toEqual(coarse.regions[0].rectangles);
    expect(coarse.rectangles).toHaveLength(1);
    expect(coarse.level).toBe(4);
    expect(fine.level).toBe(5);
    expect(fine.rectangles[0].width).toBeCloseTo(coarse.rectangles[0].width / 2);
    expect(fine.rectangles[0].height).toBeCloseTo(coarse.rectangles[0].height / 2);
    expect((await manager.querySourceRegions(view, { age: 5, level: 0 })).level).toBe(0);
    await expect(manager.querySourceRegions(view, { level: -1 })).rejects.toThrow(RangeError);
    await expect(manager.querySourceRegions(view, { level: 4.5 })).rejects.toThrow(RangeError);
    await expect(manager.querySourceRegions(view, { level: 9 })).rejects.toThrow(RangeError);
  });
  it("honors validity endpoints and reports an empty region without broadening it", async () => {
    const { manager } = await managerSetup();
    const view = Rectangle.fromDegrees(88, -2, 92, 2);
    expect(
      (await manager.querySourceRegions(view, { age: 5, level: 4 })).regions.map((r) => r.plateId),
    ).toContain("2");
    expect((await manager.querySourceRegions(view, { age: 101, level: 4 })).regions).toEqual([]);
  });
  it("discards a query after the implicit age changes", async () => {
    const { manager, inverse } = await managerSetup();
    let resolve!: (point: Cartesian3) => void;
    inverse.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = manager.querySourceRegions(Rectangle.fromDegrees(88, -2, 92, 2), { level: 4 });
    await vi.waitFor(() => expect(inverse).toHaveBeenCalled());
    await manager.setAge(10);
    resolve(Cartesian3.UNIT_X);
    expect((await pending).skippedReason).toBe("stale-age");
  });
  it("discards a query when its source is destroyed", async () => {
    const { manager, inverse } = await managerSetup();
    let resolve!: (point: Cartesian3) => void;
    inverse.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = manager.querySourceRegions(Rectangle.fromDegrees(88, -2, 92, 2), {
      age: 20,
      level: 4,
    });
    await vi.waitFor(() => expect(inverse).toHaveBeenCalled());
    manager.destroy();
    resolve(Cartesian3.UNIT_X);
    expect((await pending).skippedReason).toBe("stale-source");
  });
});

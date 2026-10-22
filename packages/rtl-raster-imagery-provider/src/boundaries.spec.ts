import {
  Cartesian2,
  Cartographic,
  Ellipsoid,
  Geometry,
  GeometryInstance,
  GeometryPipeline,
  Math as CesiumMath,
  Rectangle,
  RectangleGeometry,
} from "cesium";
import { describe, expect, it, vi } from "vitest";
import { planGeographicRead, type RasterBounds, type RasterSource } from "rtl-raster-source";
import { RasterImageryProvider } from "./RasterImageryProvider.js";

// splitLongitude 是 Primitive 实际调用的 Cesium 内部 API，未包含在公开类型声明中。
type SplitGeometryInstance = GeometryInstance & {
  westHemisphereGeometry?: Geometry;
  eastHemisphereGeometry?: Geometry;
};
const { splitLongitude } = GeometryPipeline as typeof GeometryPipeline & {
  splitLongitude(instance: SplitGeometryInstance): SplitGeometryInstance;
};

async function providerFor(bounds: RasterBounds, ellipsoid: Ellipsoid) {
  const source: RasterSource = {
    metadata: {
      format: "geotiff",
      width: 1147,
      height: 571,
      crs: { epsg: 4326 },
      transform: [
        bounds[0],
        (bounds[2] - bounds[0]) / 1147,
        0,
        bounds[3],
        0,
        (bounds[1] - bounds[3]) / 571,
      ],
      bounds,
      pixelInterpretation: "area",
      bands: [{ name: "Band 1", dataType: "uint8", noData: [], scale: 1, offset: 0 }],
      overviews: [],
    },
    closed: false,
    close: vi.fn(),
    readWindow: vi.fn(),
  };
  return RasterImageryProvider.fromSource(source, {
    ellipsoid,
    maximumLevel: 24,
    style: { kind: "single-band", band: 0, domain: [0, 255] },
  });
}

const extents: { name: string; bounds: RasterBounds }[] = [
  { name: "reported TIFF", bounds: [-180, 90 - 571 * 0.31523642732049034, 180, 90] },
  { name: "north pole and near-global roundoff", bounds: [-180, -90, 180 - 1e-12, 90 - 1e-12] },
  { name: "regional south pole", bounds: [-172.7, -90, 180, 32.1] },
  { name: "regional north pole", bounds: [-180, -32.1, 173.7, 90] },
  { name: "antimeridian and both poles", bounds: [170, -90, 190, 90] },
  { name: "antimeridian inside a tile", bounds: [171.3, -90, 190, 32.1] },
  { name: "near-global shifted longitudes", bounds: [0, -90, 360 - 1e-12, 90] },
];

describe.each([
  { name: "reconstruction sphere", ellipsoid: new Ellipsoid(6371009, 6371009, 6371009) },
  { name: "WGS84", ellipsoid: Ellipsoid.WGS84 },
])("raster boundaries on $name", ({ ellipsoid }) => {
  it.each(extents)("builds and splits all L0-L3 geometries for $name", async ({ bounds }) => {
    const provider = await providerFor(bounds, ellipsoid);
    try {
      for (let level = 0; level <= 3; level++) {
        const count = 2 ** level;
        for (let y = 0; y < count; y++) {
          for (let x = 0; x < count; x++) {
            const rectangle = provider.tilingScheme.tileXYToRectangle(x, y, level);
            expect(rectangle.width).toBeCloseTo(provider.rectangle.width / count, 12);
            expect(rectangle.height).toBeCloseTo(provider.rectangle.height / count, 12);
            expect(
              provider.tilingScheme.positionToTileXY(Rectangle.center(rectangle), level),
            ).toEqual(new Cartesian2(x, y));
            // 使用 Cesium 的真实切分路径，避免仅检查边界数值而漏掉渲染阶段的属性数量错误。
            const geometry = RectangleGeometry.createGeometry(
              new RectangleGeometry({ rectangle, ellipsoid }),
            );
            expect(geometry).toBeDefined();
            const instance: SplitGeometryInstance = new GeometryInstance({ geometry: geometry! });
            expect(() => splitLongitude(instance)).not.toThrow();
            for (const result of [
              instance.geometry,
              instance.westHemisphereGeometry,
              instance.eastHemisphereGeometry,
            ]) {
              if (result) expect(Geometry.computeNumberOfVertices(result)).toBeGreaterThan(0);
            }
          }
        }
      }
    } finally {
      provider.destroy();
    }
  });
});

it("retains exact outer edges and reusable results through L24", async () => {
  const provider = await providerFor([-172.7, -90, 180, 32.1], Ellipsoid.WGS84);
  try {
    const scratch = new Rectangle();
    for (let level = 0; level <= 24; level++) {
      const last = 2 ** level - 1;
      const nw = provider.tilingScheme.tileXYToRectangle(0, 0, level, scratch);
      expect(nw).toBe(scratch);
      expect(nw.west).toBe(provider.rectangle.west);
      expect(nw.north).toBe(provider.rectangle.north);
      const se = provider.tilingScheme.tileXYToRectangle(last, last, level, scratch);
      expect(se).toBe(scratch);
      expect(se.east).toBe(provider.rectangle.east);
      expect(se.south).toBe(-CesiumMath.PI_OVER_TWO);
    }
  } finally {
    provider.destroy();
  }
});

it("samples across the antimeridian in the original raster column order", async () => {
  const provider = await providerFor([170, -10, 190, 10], Ellipsoid.WGS84);
  try {
    const samples = [0, 1].map((x) => {
      const rectangle = provider.tilingScheme.tileXYToRectangle(x, 0, 1);
      const bounds = [rectangle.west, rectangle.south, rectangle.east, rectangle.north].map(
        CesiumMath.toDegrees,
      ) as unknown as RasterBounds;
      return planGeographicRead(provider.source.metadata, bounds, 2, 1).sampleColumns;
    });
    expect(samples).toEqual([
      [143, 430],
      [716, 1003],
    ]);
  } finally {
    provider.destroy();
  }
});

it.each([
  { bounds: [170, -30, 190, 30] as RasterBounds, outside: 0 },
  { bounds: [190, -30, 545, 30] as RasterBounds, outside: -172 },
])(
  "locates wrapped raster tiles on both sides of zero longitude: $bounds",
  async ({ bounds, outside }) => {
    const provider = await providerFor(bounds, Ellipsoid.WGS84);
    try {
      const scheme = provider.tilingScheme;
      const scratch = new Cartesian2();
      for (let x = 0; x < 8; x++) {
        const center = Rectangle.center(scheme.tileXYToRectangle(x, 0, 3));
        expect(scheme.positionToTileXY(center, 3, scratch)).toBe(scratch);
        expect(scratch).toEqual(new Cartesian2(x, 0));
      }
      expect(scheme.positionToTileXY(Cartographic.fromDegrees(outside, 0), 3)).toBeUndefined();
      expect(scheme.positionToTileXY(Cartographic.fromDegrees(175, 40), 3)).toBeUndefined();
    } finally {
      provider.destroy();
    }
  },
);

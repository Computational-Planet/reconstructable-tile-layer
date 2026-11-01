import { GeographicTilingScheme, type ImageryProvider, Rectangle } from "cesium";
import { describe, expect, it } from "vitest";

import { QuadTreeTileProcessor } from "./QuadTreeTileProcesser.js";
import type { GeographicClipArea, NodeInfo } from "./types.js";

function area(west: number, south: number, east: number, north: number): GeographicClipArea {
  return {
    polygons: [{ exterior: [west, south, east, south, east, north, west, north, west, south] }],
  };
}

function scheme(rectangle: Rectangle, rootColumns = 1) {
  return new GeographicTilingScheme({
    rectangle,
    numberOfLevelZeroTilesX: rootColumns,
    numberOfLevelZeroTilesY: 1,
  });
}

function provider(tilingScheme: GeographicTilingScheme) {
  // 索引更新只读取瓦片方案，无需在单元测试中创建影像或浏览器资源。
  return { tilingScheme } as ImageryProvider;
}

function expectLocalLongitudeRange(tree: QuadTreeTileProcessor, west: number, east: number) {
  const tiles = tree.queryTilesAtLevel(0);
  expect(tiles).toHaveLength(1);
  const ring = tiles[0].clipArea!.polygons[0].exterior;
  const longitudes = ring.filter((_value, index) => index % 2 === 0);
  expect(Math.min(...longitudes)).toBeCloseTo(west);
  expect(Math.max(...longitudes)).toBeCloseTo(east);
}

describe("QuadTreeTileProcessor provider replacement", () => {
  it("keeps root requests inside the source level range", () => {
    const tree = new QuadTreeTileProcessor(
      scheme(Rectangle.fromDegrees(0, 0, 20, 20)),
      area(12, 12, 18, 18),
    );
    const tiles: NodeInfo[] = [];
    tree.findTilesAtRoot(tiles, { minLevel: 0, maxLevel: 0 });
    expect(tiles).toHaveLength(1);
    expect(tiles[0].tileXYL.l).toBe(0);
    const deeper: NodeInfo[] = [];
    tree.findTilesAtRoot(deeper, { minLevel: 4, maxLevel: 4 });
    expect(deeper.length).toBeGreaterThan(0);
    expect(deeper.every((tile) => tile.tileXYL.l === 4)).toBe(true);
  });
  it("recalculates clipping coordinates for regional rasters with the same CRS", () => {
    const tree = new QuadTreeTileProcessor(
      scheme(Rectangle.fromDegrees(0, 0, 20, 20)),
      area(12, 12, 18, 18),
    );
    expectLocalLongitudeRange(tree, 0.6, 0.9);

    tree.updateProvider(provider(scheme(Rectangle.fromDegrees(10, 10, 30, 30))));

    expectLocalLongitudeRange(tree, 0.1, 0.4);
  });

  it("rebuilds geographic roots when their layout changes from one column to two", () => {
    const rectangle = Rectangle.fromDegrees(-20, -10, 20, 20);
    const tree = new QuadTreeTileProcessor(scheme(rectangle), area(-10, 0, 10, 10));
    expect(tree.rootNum).toBe(1);

    tree.updateProvider(provider(scheme(rectangle, 2)));

    expect(tree.rootNum).toBe(2);
    expect(tree.queryTilesAtLevel(0).map((tile) => tile.tileXYL)).toEqual([
      { x: 0, y: 0, l: 0 },
      { x: 1, y: 0, l: 0 },
    ]);
  });

  it("removes tiles and bounding spheres when the next raster has no plate coverage", () => {
    const tree = new QuadTreeTileProcessor(
      scheme(Rectangle.fromDegrees(0, 0, 20, 20)),
      area(12, 12, 18, 18),
    );
    expect(tree.queryTilesAtLevel(1).length).toBeGreaterThan(0);
    expect(tree.boundingSpheres.length).toBeGreaterThan(0);

    tree.updateProvider(provider(scheme(Rectangle.fromDegrees(80, 0, 100, 20))));

    expect(tree.queryTilesAtLevel(1)).toEqual([]);
    expect(tree.rootNum).toBe(0);
    expect(tree.boundingSpheres).toEqual([]);
    expect(tree.currentBoundingSpheres).toEqual([]);
  });

  it("also refreshes a reused tiling scheme whose rectangle was changed in place", () => {
    const tilingScheme = scheme(Rectangle.fromDegrees(0, 0, 20, 20));
    const tree = new QuadTreeTileProcessor(tilingScheme, area(12, 12, 18, 18));
    expectLocalLongitudeRange(tree, 0.6, 0.9);

    Rectangle.clone(Rectangle.fromDegrees(10, 10, 30, 30), tilingScheme.rectangle);
    tree.updateProvider(provider(tilingScheme));

    expectLocalLongitudeRange(tree, 0.1, 0.4);
  });
});

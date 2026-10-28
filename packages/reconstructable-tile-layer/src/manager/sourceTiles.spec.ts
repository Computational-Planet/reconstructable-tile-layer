import {
  BoundingSphere,
  Cartesian3,
  Ellipsoid,
  GeographicTilingScheme,
  Rectangle,
  WebMercatorTilingScheme,
} from "cesium";
import { describe, expect, it, vi } from "vitest";
import { AreaQuadTreeTileNode, QuadTreeTileNode, TileClipMode } from "../quadtree.js";
import {
  intersectSourceRectangles,
  sourceTileRectangles,
  splitGeographicRectangle,
} from "./sourceRegions.js";

it("limits dateline tile coverage to both narrow sides of a point query, omitting disjoint bounds", () => {
  const tiles = [
    Rectangle.fromDegrees(135, -45, 180, 0),
    Rectangle.fromDegrees(-180, -45, -135, 0),
    Rectangle.fromDegrees(-90, -45, -45, 0),
  ];
  const limits = splitGeographicRectangle(
    Rectangle.fromDegrees(179.9999, -10.0001, -179.9999, -9.9999),
  );
  expect(intersectSourceRectangles(tiles, limits)).toEqual(limits);
  expect(intersectSourceRectangles([tiles[2]], limits)).toEqual([]);
  expect(
    intersectSourceRectangles(
      [Rectangle.fromDegrees(1, 0, 2, 1)],
      [Rectangle.fromDegrees(0, 0, 1, 1)],
    ),
  ).toEqual([]);
});

describe.each([
  ["geographic", new GeographicTilingScheme()],
  ["WebMercator", new WebMercatorTilingScheme()],
] as const)("source tile packing (%s)", (_name, scheme) => {
  it("deduplicates tiles and combines a solid block along actual provider boundaries", () => {
    const tiles = [
      { x: 2, y: 1, l: 3 },
      { x: 3, y: 1, l: 3 },
      { x: 2, y: 2, l: 3 },
      { x: 3, y: 2, l: 3 },
      { x: 2, y: 1, l: 3 },
    ];
    const northwest = scheme.tileXYToRectangle(2, 1, 3);
    const southeast = scheme.tileXYToRectangle(3, 2, 3);
    expect(sourceTileRectangles(tiles, scheme, 3)).toEqual([
      new Rectangle(northwest.west, southeast.south, southeast.east, northwest.north),
    ]);
  });

  it("preserves holes, missing rows, and separated dateline edges", () => {
    const lastX = scheme.getNumberOfXTilesAtLevel(3) - 1;
    const tiles = [
      ...[1, 2, 3].flatMap((y) =>
        [2, 3, 4].filter((x) => !(x === 3 && y === 2)).map((x) => ({ x, y, l: 3 })),
      ),
      { x: 2, y: 5, l: 3 },
      { x: 0, y: 0, l: 3 },
      { x: lastX, y: 0, l: 3 },
    ];
    const packed = sourceTileRectangles(tiles, scheme, 3);
    expect(packed.length).toBeLessThan(tiles.length);
    for (let y = 0; y < scheme.getNumberOfYTilesAtLevel(3); y++)
      for (let x = 0; x <= lastX; x++) {
        const center = Rectangle.center(scheme.tileXYToRectangle(x, y, 3));
        const covered = packed.filter((rectangle) => Rectangle.contains(rectangle, center));
        expect(covered.length, `tile ${x}/${y}`).toBe(
          tiles.some((tile) => tile.x === x && tile.y === y) ? 1 : 0,
        );
      }
    expect(packed.every((rectangle) => rectangle.west < rectangle.east)).toBe(true);
    expect(sourceTileRectangles([], scheme, 3)).toEqual([]);
  });
});

const scheme = new GeographicTilingScheme({ ellipsoid: Ellipsoid.UNIT_SPHERE });
const rectangle = scheme.tileXYToRectangle(0, 0, 0);
const partial = [0.1, 0.1, 0.4, 0.1, 0.4, 0.4, 0.1, 0.4, 0.1, 0.1];
const sphere = new BoundingSphere(Cartesian3.ZERO, 3);
describe.each([
  [
    "area",
    () => [
      new AreaQuadTreeTileNode(0, 0, 0, rectangle, scheme, { polygons: [] }),
      new AreaQuadTreeTileNode(0, 0, 0, rectangle, scheme),
      new AreaQuadTreeTileNode(0, 0, 0, rectangle, scheme, {
        polygons: [{ exterior: partial }],
      }),
    ],
  ],
  [
    "flat polygon",
    () => [
      new QuadTreeTileNode(0, 0, 0, rectangle, scheme, []),
      new QuadTreeTileNode(0, 0, 0, rectangle, scheme),
      new QuadTreeTileNode(0, 0, 0, rectangle, scheme, partial),
    ],
  ],
] as const)("source traversal states (%s)", (_name, createNodes) => {
  it("prunes NONE before splitting, and retains FULL and NEED_CLIP", () => {
    const [none, full, clipped] = createNodes();
    expect([none.status, full.status, clipped.status]).toEqual([
      TileClipMode.NONE_DISPLAY,
      TileClipMode.FULL_DISPLAY,
      TileClipMode.NEED_CLIP,
    ]);
    const split = vi.spyOn(none, "splitNodeIfNeeded");
    expect(none.getTileInfoByLevelInBoundingSphere(0, sphere, [])).toEqual([]);
    expect(none.getTileInfoByLevelInBoundingSphere(4, sphere, [])).toEqual([]);
    expect(split).not.toHaveBeenCalled();
    expect(none.child).toBeNull();
    const fullTiles = full.getTileInfoByLevelInBoundingSphere(1, sphere, []);
    expect(fullTiles).toHaveLength(4);
    expect(fullTiles.every((tile) => tile.polygon === null)).toBe(true);
    const clippedTiles = clipped.getTileInfoByLevelInBoundingSphere(1, sphere, []);
    expect(clippedTiles).toHaveLength(1);
    expect(clippedTiles[0].polygon).not.toBeNull();
  });
});

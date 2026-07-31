import { TilingScheme, WebMercatorTilingScheme } from "cesium";

import { AreaQuadTreeTileNode } from "./AreaQuadTreeTileNode.js";
import { QuadTreeTileNode } from "./QuadTreeTileNode.js";
import { TileClipMode, type GeographicClipArea, type TileXYL } from "./types.js";
import { normalizeAreaToTileRectangle } from "./utils/areaGeometry.js";
import { clipToLR } from "./utils/geometry.js";

export interface PolygonRootBuildTarget {
  roots: QuadTreeTileNode[];
  rootXYLs: TileXYL[];
  incrementRootCount(count: number): void;
}

export interface AreaRootBuildTarget {
  roots: AreaQuadTreeTileNode[];
  rootXYLs: TileXYL[];
  incrementRootCount(count: number): void;
}

function createLegacyRoot(tilingScheme: TilingScheme, tile: TileXYL, polygon: number[]) {
  return new QuadTreeTileNode(
    tile.x,
    tile.y,
    tile.l,
    tilingScheme.tileXYToRectangle(tile.x, tile.y, tile.l),
    tilingScheme,
    polygon,
  );
}

/**
 * Creates legacy flat-polygon roots using the same projection branches and
 * coordinate adjustments as the original processor constructor.
 */
export function buildPolygonRoots(
  tilingScheme: TilingScheme,
  polygons: Array<Array<number>>,
  hasLeftPoints: boolean,
  hasRightPoints: boolean,
  target: PolygonRootBuildTarget,
) {
  if (tilingScheme instanceof WebMercatorTilingScheme) {
    for (const polygon of polygons) {
      const tile = { x: 0, y: 0, l: 0 };
      target.incrementRootCount(1);
      target.rootXYLs.push(tile);
      target.roots.push(createLegacyRoot(tilingScheme, tile, polygon));
    }
    return;
  }

  for (const polygon of polygons) {
    if (hasLeftPoints && hasRightPoints) {
      const { polygonL, polygonR } = clipToLR(polygon, 1);
      for (let i = 0; i < polygonR.length; i += 2) {
        polygonR[i] -= 1;
      }
      const leftTile = { x: 0, y: 0, l: 0 };
      const rightTile = { x: 1, y: 0, l: 0 };
      target.incrementRootCount(2);
      target.rootXYLs.push(leftTile, rightTile);
      target.roots.push(
        createLegacyRoot(tilingScheme, leftTile, polygonL),
        createLegacyRoot(tilingScheme, rightTile, polygonR),
      );
    } else if (hasLeftPoints) {
      const tile = { x: 0, y: 0, l: 0 };
      target.incrementRootCount(1);
      target.rootXYLs.push(tile);
      target.roots.push(createLegacyRoot(tilingScheme, tile, polygon));
    } else {
      for (let i = 0; i < polygon.length; i += 2) {
        polygon[i] -= 1;
      }
      const tile = { x: 1, y: 0, l: 0 };
      target.incrementRootCount(1);
      target.rootXYLs.push(tile);
      target.roots.push(createLegacyRoot(tilingScheme, tile, polygon));
    }
  }
}

/** Creates visible level-zero roots for a geographic clipping area. */
export function buildAreaRoots(
  tilingScheme: TilingScheme,
  area: GeographicClipArea,
  target: AreaRootBuildTarget,
) {
  const rootXCount = tilingScheme.getNumberOfXTilesAtLevel(0);
  const rootYCount = tilingScheme.getNumberOfYTilesAtLevel(0);

  for (let y = 0; y < rootYCount; y++) {
    for (let x = 0; x < rootXCount; x++) {
      const rectangle = tilingScheme.tileXYToRectangle(x, y, 0);
      const localArea = normalizeAreaToTileRectangle(area, rectangle);
      const node = new AreaQuadTreeTileNode(x, y, 0, rectangle, tilingScheme, localArea);
      if (node.status === TileClipMode.NONE_DISPLAY) {
        continue;
      }

      target.incrementRootCount(1);
      target.rootXYLs.push({ x, y, l: 0 });
      target.roots.push(node);
    }
  }
}

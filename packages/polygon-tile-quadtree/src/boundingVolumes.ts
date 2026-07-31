import { BoundingSphere, Cartesian3, Matrix4, Rectangle, TilingScheme } from "cesium";

import type { AreaQuadTreeTileNode } from "./AreaQuadTreeTileNode.js";
import type { QuadTreeTileNode } from "./QuadTreeTileNode.js";
import { TileClipMode } from "./types.js";

export interface BoundingExtentResult {
  rectangles: Rectangle[];
  levels: number[];
  complete: boolean;
}

/** Returns whether two bounding spheres overlap or touch. */
export function boundingSpheresIntersect(left: BoundingSphere, right: BoundingSphere) {
  const radiusSum = left.radius + right.radius;
  return Cartesian3.distanceSquared(left.center, right.center) <= radiusSum * radiusSum;
}

function countVisibleLegacyChildren(node: QuadTreeTileNode) {
  let count = 0;
  if (node.child?.lb.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.lt.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.rb.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.rt.status !== TileClipMode.NONE_DISPLAY) count++;
  return count;
}

/**
 * Finds the first branching rectangle below each legacy root. The child
 * selection order intentionally matches the original traversal.
 */
export function findLegacyBoundingExtents(
  roots: QuadTreeTileNode[],
  rootNum: number,
  result: BoundingExtentResult,
): BoundingExtentResult {
  for (let i = 0; i < rootNum; i++) {
    let currentNode = roots[i];
    // Traversal exits through a branching, empty, or missing-child condition below.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      currentNode.splitNodeIfNeeded();
      const count = countVisibleLegacyChildren(currentNode);
      if (count > 1) {
        result.rectangles.push(currentNode.rectangle);
        result.levels.push(currentNode.tileXYZ.l);
        break;
      }
      if (count === 0) {
        console.error("No Child Node");
        result.complete = false;
        return result;
      }

      // These independent checks preserve the legacy descent order exactly.
      if (currentNode.child && currentNode.child.lb.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.lb;
      }
      if (currentNode.child && currentNode.child.lt.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.lt;
      }
      if (currentNode.child && currentNode.child.rb.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.rb;
      }
      if (currentNode.child && currentNode.child.rt.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.rt;
      }
    }
  }

  return result;
}

function countVisibleAreaChildren(node: AreaQuadTreeTileNode) {
  let count = 0;
  if (node.child?.lb.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.lt.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.rb.status !== TileClipMode.NONE_DISPLAY) count++;
  if (node.child?.rt.status !== TileClipMode.NONE_DISPLAY) count++;
  return count;
}

/** Finds the first branching rectangle below each area-aware root. */
export function findAreaBoundingExtents(
  roots: AreaQuadTreeTileNode[],
  rootNum: number,
  result: BoundingExtentResult,
): BoundingExtentResult {
  for (let i = 0; i < rootNum; i++) {
    let currentNode = roots[i];
    // Traversal exits through a branching, full, empty, or missing-child condition below.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      currentNode.splitNodeIfNeeded();
      const count = countVisibleAreaChildren(currentNode);
      if (count > 1 || currentNode.status === TileClipMode.FULL_DISPLAY) {
        result.rectangles.push(currentNode.rectangle);
        result.levels.push(currentNode.tileXYZ.l);
        break;
      }
      if (count === 0 || !currentNode.child) {
        result.complete = false;
        return result;
      }

      if (currentNode.child.lb.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.lb;
      } else if (currentNode.child.lt.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.lt;
      } else if (currentNode.child.rb.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.rb;
      } else if (currentNode.child.rt.status !== TileClipMode.NONE_DISPLAY) {
        currentNode = currentNode.child.rt;
      }
    }
  }

  return result;
}

/** Creates fixed-model bounding spheres for a set of tile rectangles. */
export function createBoundingSpheres(rectangles: Rectangle[], tilingScheme: TilingScheme) {
  return rectangles.map((rectangle) =>
    BoundingSphere.fromRectangle3D(rectangle, tilingScheme.ellipsoid),
  );
}

/** Applies a rigid model transform to bounding spheres without scaling them. */
export function transformBoundingSpheres(
  spheres: BoundingSphere[],
  modelMatrix: Matrix4 = Matrix4.IDENTITY,
) {
  return spheres.map((sphere) =>
    BoundingSphere.transformWithoutScale(sphere, modelMatrix, new BoundingSphere()),
  );
}

// Quadtree-oriented Sutherland-Hodgman clipping. Input coordinates are
// normalized to the parent tile's [0, 1] range and are clipped in two passes.

import { DEFAULT_ACCURATE } from "../constants.js";
import { TileClipMode } from "../types.js";

/** Splits a normalized polygon into the four child-tile coordinate spaces. */
export function clipPolygonByQuadTreeNodes(polygon: Array<number>, ratio: number) {
  // Split the polygon into left and right portions at x = 0.5.
  const { polygonL, polygonR } = clipToLR(polygon, 0.5);
  // Split the left portion at the tiling scheme's y ratio.
  const { polygonB: polygonLB, polygonT: polygonLT } = clipToBT(polygonL, ratio);
  // Apply the same split to the right portion.
  const { polygonB: polygonRB, polygonT: polygonRT } = clipToBT(polygonR, ratio);
  // Remap every child polygon to its local [0, 1] coordinate range.
  for (let i = 0; i < polygonLB.length; i = i + 2) {
    polygonLB[i] = polygonLB[i] * 2;
    polygonLB[i + 1] = (polygonLB[i + 1] * 1) / ratio;
  }
  for (let i = 0; i < polygonLT.length; i = i + 2) {
    polygonLT[i] = polygonLT[i] * 2;
    polygonLT[i + 1] = ((polygonLT[i + 1] - ratio) * 1) / (1 - ratio);
  }
  for (let i = 0; i < polygonRB.length; i = i + 2) {
    polygonRB[i] = (polygonRB[i] - 0.5) * 2;
    polygonRB[i + 1] = (polygonRB[i + 1] * 1) / ratio;
  }
  for (let i = 0; i < polygonRT.length; i = i + 2) {
    polygonRT[i] = (polygonRT[i] - 0.5) * 2;
    polygonRT[i + 1] = ((polygonRT[i + 1] - ratio) * 1) / (1 - ratio);
  }
  // Empty portions are retained here and filtered during tree construction.
  return { polygonLB, polygonLT, polygonRB, polygonRT };
}
enum LPStatus {
  INITIAL,
  LEFT,
  RIGHT,
  BOTTOM,
  TOP,
  // MIDDLE, // A middle state would represent a point on the split line.
}
/** Clips a normalized polygon into portions left and right of `xi`. */
export function clipToLR(polygon: Array<number>, xi: number) {
  let polygonL: Array<number> = [];
  let polygonR: Array<number> = [];
  let lastP: LPStatus = LPStatus.INITIAL;
  for (let i = 0; i < polygon.length - 1; i = i + 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    // Assign points on the split line to the left portion deterministically.
    if (x <= xi) {
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.LEFT) {
        // Append directly when starting or continuing on the left.
        polygonL.push(x);
        polygonL.push(y);
      } else if (lastP === LPStatus.RIGHT) {
        // Crossing from the right requires an intersection with the split line.
        const x0 = polygonR[polygonR.length - 2];
        const y0 = polygonR[polygonR.length - 1];
        // The slope is finite because the endpoints lie on opposite sides of `xi`.
        const k = (y - y0) / (x - x0);
        const b = y - k * x;
        // Evaluate the intersection's y coordinate.
        const yi = k * xi + b;
        // Append the intersection and current point to the left portion.
        polygonL.push(xi);
        polygonL.push(yi);
        polygonL.push(x);
        polygonL.push(y);
        // Append the intersection to the right portion.
        polygonR.push(xi);
        polygonR.push(yi);
      }
      // Record the current side for the next edge.
      lastP = LPStatus.LEFT;
    } else if (x > xi) {
      // Mirror the clipping procedure for a point on the right.
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.RIGHT) {
        // Append directly when starting or continuing on the right.
        polygonR.push(x);
        polygonR.push(y);
      } else if (lastP === LPStatus.LEFT) {
        // Crossing from the left requires an intersection with the split line.
        const x0 = polygonL[polygonL.length - 2];
        const y0 = polygonL[polygonL.length - 1];
        // The slope is finite because the endpoints lie on opposite sides of `xi`.
        const k = (y - y0) / (x - x0);
        const b = y - k * x;
        // Evaluate the intersection's y coordinate.
        const yi = k * xi + b;
        // Append the intersection and current point to the right portion.
        polygonR.push(xi);
        polygonR.push(yi);
        polygonR.push(x);
        polygonR.push(y);
        // Append the intersection to the left portion.
        polygonL.push(xi);
        polygonL.push(yi);
      }
      // Record the current side for the next edge.
      lastP = LPStatus.RIGHT;
    }
  }
  // Close each non-empty ring by repeating its first point when necessary.
  if (
    polygonL.length !== 0 &&
    (Math.abs(polygonL[0] - polygonL[polygonL.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonL[1] - polygonL[polygonL.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonL.push(polygonL[0]);
    polygonL.push(polygonL[1]);
  }
  if (
    polygonR.length !== 0 &&
    (Math.abs(polygonR[0] - polygonR[polygonR.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonR[1] - polygonR[polygonR.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonR.push(polygonR[0]);
    polygonR.push(polygonR[1]);
  }
  return { polygonL, polygonR };
}

/** Clips a normalized polygon into portions below and above `yi`. */
export function clipToBT(polygon: Array<number>, yi: number) {
  let polygonB: Array<number> = [];
  let polygonT: Array<number> = [];
  let lastP: LPStatus = LPStatus.INITIAL;
  for (let i = 0; i < polygon.length - 1; i = i + 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    // Assign points on the split line to the bottom portion deterministically.
    if (y <= yi) {
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.BOTTOM) {
        polygonB.push(x);
        polygonB.push(y);
      } else if (lastP === LPStatus.TOP) {
        // Crossing from above requires an intersection with the split line.
        const x0 = polygonT[polygonT.length - 2];
        const y0 = polygonT[polygonT.length - 1];
        // Solve for the intersection's x coordinate.
        let k, xi, b;
        if (x - x0 === 0) {
          // A vertical segment has no finite slope, but its x coordinate is constant.
          xi = x;
        } else {
          k = (y - y0) / (x - x0);
          b = y - k * x;
          // Evaluate x at y = yi.
          xi = (yi - b) / k;
        }

        // Append the intersection and current point to the bottom portion.
        polygonB.push(xi);
        polygonB.push(yi);
        polygonB.push(x);
        polygonB.push(y);
        // Append the intersection to the top portion.
        polygonT.push(xi);
        polygonT.push(yi);
      }
      // Record the current side for the next edge.
      lastP = LPStatus.BOTTOM;
    } else if (y > yi) {
      // Mirror the clipping procedure for a point above the split line.
      if (lastP === LPStatus.INITIAL || lastP === LPStatus.TOP) {
        // Append directly when starting or continuing above the split line.
        polygonT.push(x);
        polygonT.push(y);
      } else if (lastP === LPStatus.BOTTOM) {
        // Crossing from below requires an intersection with the split line.
        const x0 = polygonB[polygonB.length - 2];
        const y0 = polygonB[polygonB.length - 1];
        // Solve for the intersection's x coordinate.
        let k, xi, b;
        if (x - x0 === 0) {
          // A vertical segment has no finite slope, but its x coordinate is constant.
          xi = x;
        } else {
          k = (y - y0) / (x - x0);
          b = y - k * x;
          // Evaluate x at y = yi.
          xi = (yi - b) / k;
        }
        // Append the intersection and current point to the top portion.
        polygonT.push(xi);
        polygonT.push(yi);
        polygonT.push(x);
        polygonT.push(y);
        // Append the intersection to the bottom portion.
        polygonB.push(xi);
        polygonB.push(yi);
      }
      // Record the current side for the next edge.
      lastP = LPStatus.TOP;
    }
  }
  // Close each non-empty ring by repeating its first point when necessary.
  if (
    polygonB.length !== 0 &&
    (Math.abs(polygonB[0] - polygonB[polygonB.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonB[1] - polygonB[polygonB.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonB.push(polygonB[0]);
    polygonB.push(polygonB[1]);
  }
  if (
    polygonT.length !== 0 &&
    (Math.abs(polygonT[0] - polygonT[polygonT.length - 2]) > DEFAULT_ACCURATE ||
      Math.abs(polygonT[1] - polygonT[polygonT.length - 1]) > DEFAULT_ACCURATE)
  ) {
    polygonT.push(polygonT[0]);
    polygonT.push(polygonT[1]);
  }
  return { polygonB, polygonT };
}

// Classify boundary-only polygons, including paths with overlapping edges.
// The numeric state identifies one of the tile's four directed boundary segments.
function checkPointState(x: number, y: number) {
  if (y === 0 && x < 1)
    return 0; // Bottom edge from (0, 0), excluding (1, 0).
  else if (x === 1 && y < 1)
    return 1; // Right edge from (1, 0), excluding (1, 1).
  else if (y === 1 && x > 0)
    return 2; // Top edge from (1, 1), excluding (0, 1).
  else if (x === 0 && y > 0)
    return 3; // Left edge from (0, 1), excluding (0, 0).
  else return null; // A point away from the boundary requires clipping.
}

/** Classifies whether a normalized polygon hides, fills, or clips a tile. */
export function checkClipMode(polygon: Array<number>) {
  if (polygon.length < 6) return TileClipMode.NONE_DISPLAY; // Fewer than three points cannot enclose an area.
  let oriState = checkPointState(polygon[0], polygon[1]);
  if (oriState === null) return TileClipMode.NEED_CLIP;
  let lastState = oriState;
  // Record the first state after leaving the initial edge and the final state
  // before returning to it, which distinguishes a full loop from a zero-area trace.
  let oriOut: number = -1;
  let lastIn: number = -1;

  for (let i = 2; i < polygon.length; i = i + 2) {
    // Read the current vertex.
    const x = polygon[i];
    const y = polygon[i + 1];
    let currentState = checkPointState(x, y);

    if (currentState === null) return TileClipMode.NEED_CLIP; // Interior points require clipping.
    if (currentState === lastState) continue; // Remain on the same boundary edge.
    if (currentState !== lastState) {
      if (currentState !== (lastState + 4 + 1) % 4 && currentState !== (lastState + 4 - 1) % 4) {
        return TileClipMode.NEED_CLIP; // Skipping a boundary state cuts through the tile interior.
      }

      // Verify that the transition passes through the appropriate tile corner.
      // Read the preceding vertex.
      const x0 = polygon[i - 2];
      const y0 = polygon[i - 1];
      let needClip = true;
      switch (currentState) {
        case 0:
          if (lastState === 3) {
            // Forward transition 3 -> 0: validate the current point.
            if (x === 0 && y === 0) needClip = false;
          } else {
            // Reverse transition 1 -> 0: validate the preceding point.
            if (x0 === 1 && y0 === 0) needClip = false;
          }
          break;
        case 1:
          if (lastState === 0) {
            // Forward transition 0 -> 1: validate the current point.
            if (x === 1 && y === 0) needClip = false;
          } else {
            // Reverse transition 2 -> 1: validate the preceding point.
            if (x0 === 1 && y0 === 1) needClip = false;
          }
          break;
        case 2:
          if (lastState === 1) {
            // Forward transition 1 -> 2: validate the current point.
            if (x === 1 && y === 1) needClip = false;
          } else {
            // Reverse transition 3 -> 2: validate the preceding point.
            if (x0 === 0 && y0 === 1) needClip = false;
          }
          break;
        case 3:
          if (lastState === 2) {
            // Forward transition 2 -> 3: validate the current point.
            if (x === 0 && y === 1) needClip = false;
          } else {
            // Reverse transition 0 -> 3: validate the preceding point.
            if (x0 === 0 && y0 === 0) needClip = false;
          }
          break;
        default:
      }
      if (needClip) {
        return TileClipMode.NEED_CLIP; // A transition away from a tile corner requires clipping.
      }
      // This is a valid adjacent-edge transition through a tile corner. Track it
      // relative to the initial boundary state.
      if (oriOut === -1 && lastState === oriState) {
        oriOut = currentState; // First state reached after leaving the initial edge.
      }
      if (currentState === oriState) {
        lastIn = lastState; // Latest state observed before returning to the initial edge.
      }
      // Advance to the next edge.
      lastState = currentState;
    }
  }
  // A boundary-only path is either a complete tile loop or a zero-area trace.
  if (oriOut === lastIn) {
    return TileClipMode.NONE_DISPLAY; // Matching entry and exit states enclose no area.
  } else return TileClipMode.FULL_DISPLAY; // Different states describe a complete loop.
}

/** A two-dimensional Cartesian point. */
export interface Point {
  /** Horizontal coordinate. */
  x: number;
  /** Vertical coordinate. */
  y: number;
}

/** Returns the intersection of a segment and the vertical line `x = xi`. */
export function calIntersectionWithX(p1: Point, p2: Point, xi: number) {
  // The slope is finite because the endpoints have distinct x coordinates.
  let k = (p2.y - p1.y) / (p2.x - p1.x);
  let b = p2.y - k * p2.x;
  // Evaluate y at x = xi.
  let yi = k * xi + b;
  return { x: xi, y: yi };
}
/** Returns the intersection of a segment and the horizontal line `y = yi`. */
export function calIntersectionWithY(p1: Point, p2: Point, yi: number) {
  // Solve for the intersection's x coordinate.
  let k, xi, b;
  if (p2.x - p1.x === 0) {
    // A vertical segment has no finite slope, but its x coordinate is constant.
    xi = p2.x;
  } else {
    k = (p2.y - p1.y) / (p2.x - p1.x);
    b = p2.y - k * p2.x;
    // Evaluate x at y = yi.
    xi = (yi - b) / k;
  }
  return { x: xi, y: yi };
}

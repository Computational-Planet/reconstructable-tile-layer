import { BoundingSphere, ImageryProvider, Matrix4, Rectangle, TilingScheme } from "cesium";
import {
  boundingSpheresIntersect,
  createBoundingSpheres,
  findAreaBoundingExtents,
  findLegacyBoundingExtents,
  transformBoundingSpheres,
} from "./boundingVolumes.js";
import type { AreaQuadTreeTileNode } from "./AreaQuadTreeTileNode.js";
import type { QuadTreeTileNode } from "./QuadTreeTileNode.js";
import { ANGLE_ACCURATE, DEFAULT_ACCURATE, PI_10 } from "./constants.js";
import { buildAreaRoots, buildPolygonRoots } from "./rootBuilders.js";
import type { GeographicClipArea, NodeInfo, TileXYL } from "./types.js";
import { calIntersectionWithX, type Point } from "./utils/geometry.js";

type CrossInfo = {
  index: number;
  magnify: boolean;
};

function getTilingSchemeReferenceKey(tilingScheme: TilingScheme) {
  const { x, y, z } = tilingScheme.ellipsoid.radii;
  return `${tilingScheme.constructor.name}:${x},${y},${z}`;
}

function isTileClipArea(value: Array<number> | GeographicClipArea): value is GeographicClipArea {
  return !Array.isArray(value) && Array.isArray(value.polygons);
}

/**
 * Builds and traverses a tile quadtree for a closed geographic polygon or a
 * geographic multipolygon clipping area.
 */
export class QuadTreeTileProcesser {
  private _tilingScheme!: TilingScheme;
  private _rectangle: Array<Rectangle> = [];
  private _boundingSpheres: Array<BoundingSphere> = [];
  private _currentBoundingSpheres: Array<BoundingSphere> = [];
  private _polygon: Array<number> = [];
  private _sourceGeometry: Array<number> | GeographicClipArea = [];
  private _rootNum = 0;
  private _rootXYLs: Array<TileXYL> = [];
  private _realRootLevel: Array<number> = [];
  private _roots: Array<QuadTreeTileNode> = [];
  private _areaMode = false;
  private _areaRoots: Array<AreaQuadTreeTileNode> = [];

  /**
   * @param tilingScheme Cesium tiling scheme used to identify tile rectangles.
   * @param polygon A closed `[longitude, latitude, ...]` ring in degrees, or a
   * geographic clipping area with optional holes and multiple polygons.
   */
  constructor(tilingScheme: TilingScheme, polygon: Array<number> | GeographicClipArea) {
    this.init(tilingScheme, polygon);
  }

  private init(tilingScheme: TilingScheme, polygon: Array<number> | GeographicClipArea) {
    this._tilingScheme = tilingScheme;
    this._sourceGeometry = polygon;
    if (isTileClipArea(polygon)) {
      this.initArea(tilingScheme, polygon);
      return;
    }

    this._polygon = polygon;
    this._rootNum = 0;
    this._rootXYLs = [];
    this._realRootLevel = [];
    this._roots = [];
    this._areaRoots = [];
    this._boundingSpheres = [];
    this._currentBoundingSpheres = [];
    this._areaMode = false;

    for (let i = 0; i < this._polygon.length; i = i + 2) {
      if (this._polygon[i + 1] > 89.5) {
        this._polygon[i + 1] = 89.5;
      }
      if (this._polygon[i + 1] < -89.5) {
        this._polygon[i + 1] = -89.5;
      }
    }

    const normalizedPolygon: Array<number> = []; // Polygon in root-tile coordinates.

    // Normalize the vertices while collecting the longitude delta, antimeridian
    // crossings, and hemisphere distribution needed by EPSG:4326 clipping.

    const oriRectangle = tilingScheme.tileXYToRectangle(0, 0, 0);

    const west = oriRectangle.west;
    const east = oriRectangle.east;
    const north = oriRectangle.north;
    const south = oriRectangle.south;

    let angleSum = 0; // Accumulated longitude delta used to detect pole enclosure.
    let avgLat = 0; // Average latitude used to select the pole hemisphere.
    const crossIndex: Array<CrossInfo> = []; // Recorded antimeridian crossings.

    let hasL = false; // Whether EPSG:4326 clipping includes a negative-longitude vertex.
    let hasR = false; // Whether EPSG:4326 clipping includes a positive-longitude vertex.
    for (let i = 0; i < this._polygon.length; i = i + 2) {
      if (i !== 0) {
        // Compute the longitude difference from the preceding vertex.
        let angleDif = this._polygon[i] - this._polygon[i - 2];
        // A wrapped difference greater than 180 degrees indicates an antimeridian crossing.
        if (
          Math.abs(this._polygon[i]) > 120 &&
          Math.abs(this._polygon[i - 2]) > 120 &&
          Math.abs(angleDif) > 180
        ) {
          if (angleDif < 0) {
            angleDif = 360 + angleDif; // Restore the wrapped angular difference.
            crossIndex.push({ index: i - 2, magnify: true }); // Crossing from +180 to -180 degrees.
          } else {
            angleDif = angleDif - 360;
            crossIndex.push({ index: i - 2, magnify: false }); // Crossing from -180 to +180 degrees.
          }
        }
        angleSum += angleDif;
      }
      // Track whether vertices occur on each side of the prime meridian.
      if (!hasL || !hasR) {
        if (this._polygon[i] < 0) hasL = true;
        if (this._polygon[i] > 0) hasR = true;
      }
      // The closing vertex repeats the first vertex and must not affect the average.
      if (i != this._polygon.length - 2) {
        avgLat += this._polygon[i + 1] / this._polygon.length; // Accumulate the latitude average.
      }

      // Convert the vertex to root-tile coordinates.
      normalizedPolygon.push(1.0 - (east - this._polygon[i] * (PI_10 / 180.0)) / (east - west));
      normalizedPolygon.push(
        1.0 - (north - this._polygon[i + 1] * (PI_10 / 180.0)) / (north - south),
      );
    } // Initial normalization is complete; the remaining stages run in order.

    // Compute each crossing edge's intersection with the antimeridian.
    const intersectionPoint: Array<Point> = [];
    for (let i = 0; i < crossIndex.length; i++) {
      const x1 = this._polygon[crossIndex[i].index];
      const y1 = this._polygon[crossIndex[i].index + 1];
      if (crossIndex[i].magnify) {
        const x2 = this._polygon[crossIndex[i].index + 2] + 360;
        const y2 = this._polygon[crossIndex[i].index + 3];
        intersectionPoint.push(calIntersectionWithX({ x: x1, y: y1 }, { x: x2, y: y2 }, 180));
      } else {
        const x2 = this._polygon[crossIndex[i].index + 2] - 360;
        const y2 = this._polygon[crossIndex[i].index + 3];
        console.log("x1:" + x1, "y1" + y1 + "x2" + x2 + "y2" + y2);
        intersectionPoint.push(calIntersectionWithX({ x: x1, y: y1 }, { x: x2, y: y2 }, -180));
      }
    }

    // A total wrapped longitude change near 360 degrees means the polygon encloses a pole.
    if (Math.abs(Math.abs(angleSum) - 360) < ANGLE_ACCURATE) {
      if (crossIndex.length === 0) {
        throw Error("四叉树构建出错：多边形包含极点，但却没有跨越180°经线");
      }
      // Crossing edge selected for insertion of the polar bridge.
      let selectedCrossIndex: number = 0;
      // The two middle bridge vertices use antimeridian longitude and near-pole latitude.
      let point1: Point;
      let point2: Point;
      if (avgLat >= 0) {
        // In the north, bridge from the crossing with the greatest intersection latitude.
        for (let i = 1; i < crossIndex.length; i++) {
          if (intersectionPoint[i].y > intersectionPoint[selectedCrossIndex].y)
            selectedCrossIndex = i;
        }

        if (crossIndex[selectedCrossIndex].magnify) {
          // Rightward crossing: bridge through +180 and then -180 degrees.
          point1 = { x: 180, y: 89.5 };
          point2 = { x: -180, y: 89.5 };
        } else {
          // Leftward crossing: bridge through -180 and then +180 degrees.
          point1 = { x: -180, y: 89.5 };
          point2 = { x: 180, y: 89.5 };
        }
      } else {
        // In the south, bridge from the crossing with the lowest intersection latitude.
        for (let i = 1; i < crossIndex.length; i++) {
          if (intersectionPoint[i].y < intersectionPoint[selectedCrossIndex].y)
            selectedCrossIndex = i;
        }
        if (crossIndex[selectedCrossIndex].magnify) {
          // Rightward crossing: bridge through +180 and then -180 degrees.
          point1 = { x: 180, y: -89.5 };
          point2 = { x: -180, y: -89.5 };
        } else {
          // Leftward crossing: bridge through -180 and then +180 degrees.
          point1 = { x: -180, y: -89.5 };
          point2 = { x: 180, y: -89.5 };
        }
      }
      // Insert four bridge vertices, represented by eight scalar values.
      console.log(point1);
      console.log(point2);
      normalizedPolygon.splice(
        crossIndex[selectedCrossIndex].index + 2,
        0,
        ...[
          1.0 - (east - point1.x * (PI_10 / 180.0)) / (east - west),
          1.0 -
            (north - intersectionPoint[selectedCrossIndex].y * (PI_10 / 180.0)) / (north - south),
          1.0 - (east - point1.x * (PI_10 / 180.0)) / (east - west),
          1.0 - (north - point1.y * (PI_10 / 180.0)) / (north - south),
          1.0 - (east - point2.x * (PI_10 / 180.0)) / (east - west),
          1.0 - (north - point2.y * (PI_10 / 180.0)) / (north - south),
          1.0 - (east - point2.x * (PI_10 / 180.0)) / (east - west),
          1.0 -
            (north - intersectionPoint[selectedCrossIndex].y * (PI_10 / 180.0)) / (north - south),
        ],
      );
      // The polar bridge resolves only the selected crossing. Remaining crossings
      // continue through the split stage below after their shifted indices are recalibrated.
      const standardIndex = crossIndex[selectedCrossIndex].index; // Insertion offset.
      crossIndex.splice(selectedCrossIndex, 1); // Remove the consumed crossing.
      intersectionPoint.splice(selectedCrossIndex, 1); // Remove its intersection.
      for (let i = 0; i < crossIndex.length; i++) {
        if (crossIndex[i].index > standardIndex) crossIndex[i].index = crossIndex[i].index + 8;
      }
      console.log(normalizedPolygon);
    }
    // Polar bridging is complete. Split any remaining antimeridian crossings into polygons.

    // Valid non-polar crossings occur in pairs; retain the polygon unchanged when
    // the crossing count is odd. Otherwise, alternate vertices between the base
    // polygon and its antimeridian-wrapped counterpart for root construction.
    const polygons: Array<Array<number>> = [];
    if (crossIndex.length % 2 !== 0) {
      polygons.push(normalizedPolygon);
      console.warn("穿越点数为奇数，数据处理异常。");
      console.warn(crossIndex);
    } else if (crossIndex.length === 0) {
      polygons.push(normalizedPolygon);
    } else {
      console.log(intersectionPoint);
      let flag = -1;
      const oriPolygon: Array<number> = [];
      const clipPolygon: Array<number> = [];
      for (let i = 0; i < normalizedPolygon.length; i = i + 2) {
        // Crossing indices are ordered. At each crossing, append the intersection
        // vertices and switch the polygon receiving subsequent vertices.
        if (flag + 1 < crossIndex.length && i - 2 === crossIndex[flag + 1].index) {
          if (flag % 2 !== 0) {
            oriPolygon.push(
              ...[
                1.0 - (east - intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
                1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south),
              ],
            );
            clipPolygon.push(
              ...[
                1.0 - (east - -intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
                1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south),
              ],
            );
          } else {
            clipPolygon.push(
              ...[
                1.0 - (east - intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
                1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south),
              ],
            );
            oriPolygon.push(
              ...[
                1.0 - (east - -intersectionPoint[flag + 1].x * (PI_10 / 180.0)) / (east - west),
                1.0 - (north - intersectionPoint[flag + 1].y * (PI_10 / 180.0)) / (north - south),
              ],
            );
          }
          flag++;
        }
        if (flag % 2 !== 0) {
          oriPolygon.push(...[normalizedPolygon[i], normalizedPolygon[i + 1]]);
        } else {
          clipPolygon.push(...[normalizedPolygon[i], normalizedPolygon[i + 1]]);
        }
      }
      // Close each polygon when its final vertex does not already repeat the first.
      if (
        oriPolygon.length !== 0 &&
        (Math.abs(oriPolygon[0] - oriPolygon[oriPolygon.length - 2]) > DEFAULT_ACCURATE ||
          Math.abs(oriPolygon[1] - oriPolygon[oriPolygon.length - 1]) > DEFAULT_ACCURATE)
      ) {
        oriPolygon.push(oriPolygon[0]);
        oriPolygon.push(oriPolygon[1]);
      }
      if (
        clipPolygon.length !== 0 &&
        (Math.abs(clipPolygon[0] - clipPolygon[clipPolygon.length - 2]) > DEFAULT_ACCURATE ||
          Math.abs(clipPolygon[1] - clipPolygon[clipPolygon.length - 1]) > DEFAULT_ACCURATE)
      ) {
        clipPolygon.push(clipPolygon[0]);
        clipPolygon.push(clipPolygon[1]);
      }
      polygons.push(oriPolygon);
      polygons.push(clipPolygon);
      console.log(polygons);
    }

    buildPolygonRoots(tilingScheme, polygons, hasL, hasR, {
      roots: this._roots,
      rootXYLs: this._rootXYLs,
      incrementRootCount: (count) => {
        this._rootNum += count;
      },
    });
    this.calBoundingBox();
  }

  private initArea(tilingScheme: TilingScheme, area: GeographicClipArea) {
    this._tilingScheme = tilingScheme;
    this._polygon = [];
    this._rootNum = 0;
    this._rootXYLs = [];
    this._realRootLevel = [];
    this._roots = [];
    this._areaRoots = [];
    this._boundingSpheres = [];
    this._currentBoundingSpheres = [];
    this._areaMode = true;

    buildAreaRoots(tilingScheme, area, {
      roots: this._areaRoots,
      rootXYLs: this._rootXYLs,
      incrementRootCount: (count) => {
        this._rootNum += count;
      },
    });

    this.calAreaBoundingBox();
  }

  /** Returns visible tiles at `level` using a newly allocated result by default. */
  getTilesByLevel(level: number, result: Array<NodeInfo> = []) {
    return this.findTilesByLevel(level, result);
  }

  /** Queries tile--plate index entries at an explicit source-tile level. */
  queryTilesAtLevel(level: number, result: Array<NodeInfo> = []) {
    return this.getTilesByLevel(level, result);
  }

  /**
   * Returns visible tiles at `level` whose tile spheres intersect the supplied
   * bounding sphere.
   */
  getTilesInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo> = [],
  ) {
    return this.findTilesByLevelInBoundingSphere(level, boundingSphere, result);
  }

  /** Queries candidate entries for a reconstructed-frame bounding sphere. */
  queryTilesInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo> = [],
  ) {
    return this.getTilesInBoundingSphere(level, boundingSphere, result);
  }

  /** Returns tiles at the processor's effective root detail level. */
  getRootTiles(result: Array<NodeInfo> = []) {
    return this.findTilesAtRoot(result);
  }

  /** Appends visible tiles at `level` to the caller-owned result array. */
  findTilesByLevel(level: number, result: Array<NodeInfo>) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        this._areaRoots[i].getTileInfoByLevel(level, subResult);
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      this._roots[i].getTileInfoByLevel(level, subResult);
      result.push(...subResult);
    }
    return result;
  }

  /**
   * Appends visible tiles intersecting `boundingSphere` to a caller-owned
   * result array.
   */
  findTilesByLevelInBoundingSphere(
    level: number,
    boundingSphere: BoundingSphere,
    result: Array<NodeInfo>,
  ) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        this._areaRoots[i].getTileInfoByLevelInBoundingSphere(level, boundingSphere, subResult);
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      this._roots[i].getTileInfoByLevelInBoundingSphere(level, boundingSphere, subResult);
      result.push(...subResult);
    }
    return result;
  }

  /** Appends tiles at the effective root detail level to `result`. */
  findTilesAtRoot(result: Array<NodeInfo>) {
    if (this._areaMode) {
      for (let i = 0; i < this.rootNum; i++) {
        const subResult: NodeInfo[] = [];
        const level = this._realRootLevel[i] > 3 ? this._realRootLevel[i] : 3;
        this._areaRoots[i].getTileInfoByLevel(level, subResult);
        result.push(...subResult);
      }
      return result;
    }

    for (let i = 0; i < this.rootNum; i++) {
      const subResult: NodeInfo[] = [];
      const level = this._realRootLevel[i] > 3 ? this._realRootLevel[i] : 3;
      this._roots[i].getTileInfoByLevel(level, subResult);
      result.push(...subResult);
      console.log("level" + this._realRootLevel[i]);
    }
    return result;
  }

  /** Recomputes legacy root extents and their model-space bounding spheres. */
  calBoundingBox() {
    this._rectangle = [];
    this._realRootLevel = [];
    const extents = findLegacyBoundingExtents(this._roots, this.rootNum, {
      rectangles: this._rectangle,
      levels: this._realRootLevel,
      complete: true,
    });
    if (!extents.complete) {
      return;
    }
    this.rebuildBoundingSpheres();
  }

  private calAreaBoundingBox() {
    this._rectangle = [];
    this._realRootLevel = [];
    findAreaBoundingExtents(this._areaRoots, this.rootNum, {
      rectangles: this._rectangle,
      levels: this._realRootLevel,
      complete: true,
    });
    this.rebuildBoundingSpheres();
  }

  private rebuildBoundingSpheres() {
    this._boundingSpheres = createBoundingSpheres(this._rectangle, this._tilingScheme);
    this.updateBoundingSpheres(Matrix4.IDENTITY);
  }

  /** Updates current bounding spheres after applying a rigid model transform. */
  updateBoundingSpheres(modelMatrix: Matrix4 = Matrix4.IDENTITY) {
    this._currentBoundingSpheres = transformBoundingSpheres(this._boundingSpheres, modelMatrix);
    return this._currentBoundingSpheres;
  }

  /** Returns whether any current processor extent intersects `boundingSphere`. */
  intersectsCurrentBoundingSphere(boundingSphere: BoundingSphere) {
    return this._currentBoundingSpheres.some((currentSphere) =>
      boundingSpheresIntersect(currentSphere, boundingSphere),
    );
  }

  /** Rebuilds when the provider's tiling-scheme class or ellipsoid radii change. */
  updateProvider(provider: ImageryProvider) {
    if (
      getTilingSchemeReferenceKey(provider.tilingScheme) ===
      getTilingSchemeReferenceKey(this._tilingScheme)
    ) {
      return;
    } else {
      this.init(provider.tilingScheme, this._sourceGeometry);
    }
  }
  /** Rebuilds the tree with new geographic clipping geometry. */
  updatePolygon(polygon: Array<number> | GeographicClipArea) {
    this.init(this._tilingScheme, polygon);
  }

  /** Cesium tiling scheme used to build and traverse the tree. */
  get tilingScheme() {
    return this._tilingScheme;
  }
  /** Number of visible level-zero root nodes. */
  get rootNum() {
    return this._rootNum;
  }
  /** Coordinates of visible level-zero root nodes. */
  get rootXYLs() {
    return this._rootXYLs;
  }
  /** Legacy flat-polygon roots; empty when the area API is active. */
  get roots() {
    return this._roots;
  }

  /** Legacy flat geographic polygon, or an empty array in area mode. */
  get polygon() {
    return this._polygon;
  }

  /** Effective geographic extent rectangles used for spatial filtering. */
  get rectangle() {
    return this._rectangle;
  }

  /** Untransformed model-space bounding spheres for the processor extents. */
  get boundingSpheres() {
    return this._boundingSpheres;
  }

  /** Bounding spheres after the latest model-matrix update. */
  get currentBoundingSpheres() {
    return this._currentBoundingSpheres;
  }
}

/** Correctly spelled alias for `QuadTreeTileProcesser`. */
export { QuadTreeTileProcesser as QuadTreeTileProcessor };
export type {
  ClipPolygon,
  GeographicClipArea,
  NodeInfo,
  NormalizedClipArea,
  TileClipArea,
  TileXYL,
} from "./types.js";

/** Describes how a tile intersects the clipping geometry. */
export enum TileClipMode {
  /** The clipping geometry does not cover the tile. */
  NONE_DISPLAY,
  /** The clipping geometry covers the complete tile. */
  FULL_DISPLAY,
  /** The tile is partially covered and requires clipping. */
  NEED_CLIP,
}

/** Identifies a tile by its horizontal index, vertical index, and level. */
export interface TileXYL {
  /** Zero-based horizontal tile index. */
  x: number;
  /** Zero-based vertical tile index. */
  y: number;
  /** Zero-based imagery level. */
  l: number;
}

/** A flat exterior ring with optional flat interior rings. */
export interface ClipPolygon {
  /** Flat coordinate pairs describing the exterior ring. */
  exterior: Array<number>;
  /** Optional flat coordinate pairs describing interior rings. */
  interiors?: Array<Array<number>>;
}

/** A polygon or multipolygon clipping area. */
export interface TileClipArea {
  /** Polygon parts included in this clipping area. */
  polygons: ClipPolygon[];
}

/**
 * A clipping area whose coordinates are longitude/latitude pairs in degrees.
 * Rings should be closed by repeating their first coordinate pair.
 */
export type GeographicClipArea = TileClipArea;

/**
 * A clipping area in tile-local coordinates, where both axes normally span
 * the inclusive range from 0 to 1.
 */
export type NormalizedClipArea = TileClipArea;

/** Tile selection data returned by the processor traversal methods. */
export interface NodeInfo {
  /** Coordinates of the selected imagery tile. */
  tileXYL: TileXYL;
  /** `null` means the complete tile is visible and requires no clipping. */
  polygon: Array<number> | null;
  /** Preserves multipolygons and interior rings when area clipping is used. */
  clipArea?: NormalizedClipArea | null;
}

import type { TileClipArea } from "rtl-tile-plate-quadtree";

/** Coordinate order used when interpreting GPML position lists. */
export type CoordinateOrder = "auto" | "lat-lon" | "lon-lat";
/** Rendering classification inferred from a GPlates feature. */
export type RenderIntent = "area" | "line-like" | "unknown";
/** Controls whether polygon geometry follows classification or is always filled. */
export type PolygonRenderIntentMode = "classified" | "all-polygons-area";

/** Geographic longitude/latitude pair in degrees. */
export type Position = [longitude: number, latitude: number];

/** Optional GPML valid-time interval in millions of years ago (Ma). */
export interface ParsedGpmlTime {
  /** Oldest valid age in millions of years ago (Ma). */
  begin?: number;
  /** Youngest valid age in millions of years ago (Ma). */
  end?: number;
}

/** Parsed polygon with one exterior ring and zero or more interior rings. */
export interface ParsedGpmlPolygon {
  /** Closed exterior ring in longitude/latitude order. */
  exterior: Position[];
  /** Closed interior rings in longitude/latitude order. */
  interiors: Position[][];
}

/** Polygon geometry and the GPML property from which it was read. */
export interface ParsedGpmlGeometry {
  /** GPML property that supplied the geometry. */
  propertyName: string;
  /** Normalized geometry discriminator. */
  geometryType: "Polygon";
  /** Parsed polygon coordinates. */
  polygon: ParsedGpmlPolygon;
}

/** Normalized representation of one GPML feature member. */
export interface ParsedGpmlFeature {
  /** Stable feature identifier within the parsed document. */
  id: string;
  /** Zero-based feature-member position in the source document. */
  featureMemberIndex: number;
  /** Optional human-readable feature name. */
  name?: string;
  /** GPML feature element name without its namespace prefix. */
  featureType: string;
  /** Reconstruction plate identifier when present. */
  reconstructionPlateId?: number;
  /** Conjugate plate identifier when present. */
  conjugatePlateId?: number;
  /** Optional geological validity interval. */
  validTime?: ParsedGpmlTime;
  /** Polygon geometries parsed from the feature. */
  geometries: ParsedGpmlGeometry[];
  /** Shapefile attributes embedded in the feature. */
  attributes: Record<string, string | number>;
  /** Fill classification inferred for rendering. */
  renderIntent: RenderIntent;
  /** Classification override applied during parsing, when any. */
  renderIntentOverride?: PolygonRenderIntentMode;
}

/** Feature geometry normalized for reconstruction and quadtree clipping. */
export interface FeaturePolygonData {
  /** Stable feature identifier within its plate. */
  featureId: string;
  /** Reconstruction plate identifier. */
  plateId: string;
  /** First exterior ring as interleaved longitude/latitude degrees. */
  lonlats: number[];
  /** Complete polygon and interior-ring geometry. */
  clipArea: TileClipArea;
  /** Whether the feature should be rendered as a filled area. */
  renderIntent: RenderIntent;
  /** Geological validity interval in millions of years ago (Ma). */
  time: {
    /** Historical spelling retained for compatibility; this is the begin age. */
    begine: number;
    /** Youngest valid age in millions of years ago (Ma). */
    end: number;
  };
  /** Optional metadata preserved from the GPML source. */
  source?: {
    /** GPML feature type. */
    featureType?: string;
    /** Identifier before duplicate members were disambiguated. */
    originalFeatureId?: string;
    /** Zero-based feature-member position in the source document. */
    featureMemberIndex?: number;
    /** GPML properties that supplied polygon geometry. */
    propertyNames?: string[];
    /** Human-readable feature name. */
    name?: string;
    /** Number of polygon parts in the feature. */
    polygonCount?: number;
    /** Number of interior rings in the feature. */
    interiorCount?: number;
    /** Shapefile attributes embedded in the feature. */
    attributes?: Record<string, string | number>;
  };
}

/** Counts and classifications collected while importing a feature source. */
export interface FeatureImportDiagnostics {
  /** Feature members found in the parsed source. */
  totalFeatures: number;
  /** Feature members converted to normalized records. */
  totalImportedFeatures: number;
  /** Imported features classified as filled areas. */
  areaFeatureCount: number;
  /** Imported features classified as line-like. */
  lineLikeFeatureCount: number;
  /** Imported features without a known render classification. */
  unknownFeatureCount: number;
  /** Polygon parts found across imported features. */
  polygonCount: number;
  /** Polygon parts containing at least one interior ring. */
  polygonsWithHoles: number;
  /** Interior rings found across imported features. */
  interiorRingCount: number;
  /** Imported features containing more than one polygon part. */
  multiPolygonFeatureCount: number;
  /** Imported features excluded from the filled-area rendering path. */
  skippedFromFillFeatureCount: number;
  /** Polygon classification mode used for the import. */
  polygonRenderIntent: PolygonRenderIntentMode;
  /** Excluded polygon features grouped by source feature type. */
  skippedPolygonFeatureTypes: Record<string, number>;
  /** Features promoted to areas by the all-polygons override. */
  staticPolygonAreaOverrideCount: number;
  /** Source identifiers shared by more than one feature member. */
  duplicateOriginalFeatureIdCount: number;
  /** Additional feature members using duplicated source identifiers. */
  duplicateFeatureMemberCount: number;
  /** Imported records renamed to disambiguate duplicated identifiers. */
  renamedDuplicateFeatureIdCount: number;
}

/** Imported features together with diagnostics for the complete source. */
export interface FeatureLoadResult {
  /** Normalized feature records. */
  items: FeaturePolygonData[];
  /** Diagnostics covering the complete imported source. */
  diagnostics: FeatureImportDiagnostics;
}

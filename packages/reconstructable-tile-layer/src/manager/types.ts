import type { Ellipsoid, ImageryProvider, Matrix4, Primitive, Rectangle } from "cesium";
import type { AnchorPlateId } from "rtl-finite-rotation";
import type { NodeInfo, QuadTreeTileProcessor, TileClipArea } from "rtl-tile-plate-quadtree";
import type {
  CesiumTileProcessor,
  CesiumTileProcessorStats,
  TileImageAsset,
} from "rtl-webgl-tile-processor";

import type {
  FeatureImportDiagnostics,
  PolygonRenderIntentMode,
  RenderIntent,
} from "../gplates/index.js";
import type {
  RenderRectangleSubdivision,
  SimpleGeoReconstructBenchmarkObserver,
} from "../renderRectangleSubdivision.js";

/** Legacy JSON feature shape retained for source compatibility. */
export interface PaleoItem {
  /** Source feature type. */
  FeatureType: string;
  /** Source feature identifier. */
  FeatureID: string;
  /** Reconstruction plate identifier. */
  PlateID: string;
  /** Geological validity interval. */
  ValidTime: LegacyPaleoValidTime;
  /** Polygon geometry associated with the plate feature. */
  Polygon: LegacyPaleoPolygon[];
}

/** Polygon in the legacy JSON feature shape. */
export interface LegacyPaleoPolygon {
  /** Ordered polygon positions. */
  PosList: LegacyPaleoPosition[];
}

/** Geographic position in the legacy JSON feature shape. */
export interface LegacyPaleoPosition {
  /** Latitude in degrees. */
  Latitude: number;
  /** Longitude in degrees. */
  Longitude: number;
}

/** Geological validity interval in the legacy JSON feature shape. */
export interface LegacyPaleoValidTime {
  /** Oldest valid age in millions of years ago (Ma). */
  Begin: number;
  /** Youngest valid age in millions of years ago (Ma). */
  End: number;
}

/** A polygon feature prepared for plate reconstruction and tile clipping. */
export interface PaleoData {
  /** Reconstruction plate identifier. */
  plateId: string;
  /** First exterior ring as interleaved longitude/latitude degrees. */
  lonlats: number[];
  /** Stable feature identifier within its plate. */
  featureId: string;
  /** Polygon and interior-ring geometry in geographic coordinates. */
  clipArea: TileClipArea;
  /** Whether the parsed geometry should be rendered as a filled area. */
  renderIntent: RenderIntent;
  /** Valid geological age interval, in millions of years ago (Ma). */
  time: {
    /** Historical spelling retained for compatibility; this is the begin age. */
    begine: number;
    /** Youngest valid age in millions of years ago (Ma). */
    end: number;
  };
  /** Optional metadata preserved from the source feature. */
  source?: {
    /** GPML feature type. */
    featureType?: string;
    /** Identifier before duplicate feature members were disambiguated. */
    originalFeatureId?: string;
    /** Zero-based feature-member position in the source document. */
    featureMemberIndex?: number;
    /** GPML properties that supplied polygon geometry. */
    propertyNames?: string[];
    /** Human-readable source feature name. */
    name?: string;
    /** Number of polygon parts imported for this feature. */
    polygonCount?: number;
    /** Number of interior rings imported for this feature. */
    interiorCount?: number;
    /** Shapefile attributes embedded in the GPML feature. */
    attributes?: Record<string, string | number>;
  };
}

/** Runtime record for one rendered composite tile. */
export type TilePrimitiveRecord = {
  /** Stable composite tile identifier. */
  tileId: string;
  /** Retained processed image owned by this record. */
  imageAsset: TileImageAsset;
  /** Cesium primitives generated for the tile. */
  primitives: Primitive[];
  /** Imagery coordinates of the source tile. */
  tileXYL: NodeInfo["tileXYL"];
  /** Clipping areas merged into the composite tile. */
  clipAreas: TileClipArea[];
  /** Whether clipping can be skipped for the complete tile. */
  coversFullTile: boolean;
  /** Source feature identifiers contributing to the tile. */
  sourceFeatureIds: string[];
  /** Reconstruction plate identifier. */
  plateId: string;
  /** Geological validity interval shared by the composite. */
  time: PaleoData["time"];
};

/** Runtime quadtree and primitive state for one source polygon. */
export type PolygonQuadTreeRecord = {
  /** Normalized source feature. */
  info: PaleoData;
  /** Quadtree used to select imagery tiles for the feature. */
  quadTree: QuadTreeTileProcessor;
  /** Generated tile records keyed by composite tile ID. */
  primitives: Record<string, TilePrimitiveRecord>;
};

/** Internal work item after source features have been merged by output tile. */
export type CompositeTileTask = {
  tileId: string;
  tileXYL: NodeInfo["tileXYL"];
  clipAreas: TileClipArea[];
  coversFullTile: boolean;
  sourceFeatureIds: string[];
  plateId: string;
  time: PaleoData["time"];
};

/** Internal foreground/background task partition. */
export type TileTaskPartition = {
  currentVisibleTasks: CompositeTileTask[];
  prewarmTasks: CompositeTileTask[];
};

export type PlateMatrixMap = Map<string, Matrix4>;

/** Cumulative reconstruction, rendering, and resource statistics. */
export type GeoTileStats = {
  /** Version of this statistics object shape. */
  statsSchemaVersion: number;
  /** Feature-to-tile tasks before compatible tasks are merged. */
  sourceTaskCount: number;
  /** Tile tasks after compatible feature contributions are merged. */
  compositeTaskCount: number;
  /** Distinct source imagery tiles referenced by the latest task set. */
  uniqueRawTileCount: number;
  /** Total source feature contributions across composite tasks. */
  sourceFeatureContributionCount: number;
  /** Total clipping areas across composite tasks. */
  clipAreaCount: number;
  /** Total polygon parts across clipping areas. */
  clipPolygonCount: number;
  /** Total interior rings across clipping polygons. */
  interiorRingCount: number;
  /** Largest source-feature count in one composite task. */
  maxSourceFeaturesPerComposite: number;
  /** Mean source-feature count per composite task. */
  avgSourceFeaturesPerComposite: number;
  /** Largest clipping-polygon count in one composite task. */
  maxClipPolygonsPerComposite: number;
  /** Mean clipping-polygon count per composite task. */
  avgClipPolygonsPerComposite: number;
  /** @deprecated Use maxClipPolygonsPerComposite. */
  maxPolygonsPerComposite: number;
  /** @deprecated Use avgClipPolygonsPerComposite. */
  avgPolygonsPerComposite: number;
  /** Tasks selected for the manager's current age. */
  currentVisibleTaskCount: number;
  /** Tasks selected for background prewarming. */
  prewarmTaskCount: number;
  /** Duration of the latest primitive reveal operation in milliseconds. */
  lastRevealMs: number;
  /** Records visible during the latest age update. */
  lastAgeVisibleRecordCount: number;
  /** Records hidden during the latest age update. */
  lastAgeHiddenRecordCount: number;
  /** Loaded records skipped by the latest baked 2D rebuild. */
  last2DRebuildSkippedCount: number;
  /** Composite tile records currently retained by the manager. */
  loadedCompositeTileCount: number;
  /** Composite tile requests currently pending. */
  pendingCompositeTileCount: number;
  /** Cesium primitives currently owned by composite tile records. */
  primitiveCount: number;
  /** Owned primitives whose Cesium `ready` flag is true. */
  readyPrimitiveCount: number;
  /** Owned primitives whose Cesium `show` flag is true. */
  shownPrimitiveCount: number;
  /** Cumulative primitives created by this manager. */
  primitiveCreatedCount: number;
  /** Cumulative primitives removed by this manager. */
  primitiveRemovedCount: number;
  /** Distinct processed image assets retained by tile records. */
  retainedImageAssetCount: number;
  /** Estimated uncompressed RGBA bytes for retained tile images. */
  estimatedTextureRgbaBytes: number;
  /** Rectangle parts represented by currently owned primitives. */
  renderRectanglePartCount: number;
  /** Duration of the latest tile-task collection in milliseconds. */
  lastTaskCollectionMs: number;
  /** Diagnostics from the latest feature import. */
  importDiagnostics?: FeatureImportDiagnostics;
};

/** Result counters for the most recent tile-generation request. */
export type TileGenerationReport = {
  /** Version of this report shape. */
  reportSchemaVersion: number;
  /** Monotonic identifier for the generation request. */
  generationId: number;
  /** Total tasks selected for the generation request. */
  selectedTaskCount: number;
  /** Foreground tasks matching the requested age. */
  currentVisibleTaskCount: number;
  /** Background tasks selected for prewarming. */
  prewarmTaskCount: number;
  /** Foreground tasks completed successfully. */
  currentVisibleCompletedCount: number;
  /** Foreground tasks that failed. */
  currentVisibleFailedCount: number;
  /** Background prewarm tasks completed successfully. */
  prewarmCompletedCount: number;
  /** Background prewarm tasks that failed. */
  prewarmFailedCount: number;
  /** Tasks cancelled because the generation became stale. */
  cancelledTaskCount: number;
  /** Whether all background prewarm work has settled. */
  backgroundComplete: boolean;
  /** Processor statistics captured after foreground work completed. */
  foregroundProcessorStats: CesiumTileProcessorStats | null;
};

/** Controls how plate transforms are applied to Cesium primitives. */
export type PrimitiveTransformMode = "dynamic3D" | "bakedInstance";

export type PlateMatrixEntry = {
  plateItem: PlateQuadTreeGroup;
  modelMatrix: Matrix4;
};

/** Quadtree records grouped by reconstruction plate. */
export type PlateQuadTreeGroup = {
  /** Reconstruction plate identifier. */
  plateId: string;
  /** Feature records keyed by stable feature identifier. */
  polygonQuadTrees: Map<string, PolygonQuadTreeRecord>;
};

/** Feature source URL and optional GPML polygon classification behavior. */
export interface FeatureSourceConfig {
  /** URL of the GPML, GPMLZ, XML, JSON, or uploaded blob source. */
  url: string;
  /** Optional override for polygon fill classification. */
  polygonRenderIntent?: PolygonRenderIntentMode;
}

/** Resolved feature and rotation URLs used during initialization. */
export interface ResolvedFeatureFiles {
  /** Effective polygon fill classification behavior. */
  polygonRenderIntent?: PolygonRenderIntentMode;
  /** Resolved feature source URL. */
  polygon: string;
  /** Resolved rotation source URLs. */
  rots: string[];
}

interface SimpleGeoReconstructManagerBaseOptions {
  /** Imagery provider whose tiles will be reconstructed. */
  provider: ImageryProvider;
  /** Plate ID used as the fixed rotation reference. Use null for recursive roots. */
  anchorPlateId?: AnchorPlateId;
  /**
   * Legacy combined source configuration.
   * @deprecated Use featureSource and rotationSources.
   */
  files?: ResolvedFeatureFiles;
  /** GPML, GPMLZ, XML, custom JSON, or blob URL containing feature polygons. */
  featureSource?: string | FeatureSourceConfig;
  /** One or more GPlates ROT file URLs. */
  rotationSources?: string[];
  /** Initial geological age in millions of years ago (Ma). Defaults to 0. */
  initialAge?: number;
  /** Initial transform strategy. Defaults to dynamic3D. */
  primitiveTransformMode?: PrimitiveTransformMode;
  /** Ellipsoid shared by imagery, rotation, and geometry calculations. */
  referenceEllipsoid?: Ellipsoid;
  /** Maximum concurrent imagery tile requests. Defaults to 64. */
  tileRequestConcurrency?: number;
  /** Number of primitives created before yielding to the next frame. Defaults to 32. */
  primitiveBatchSize?: number;
  /** Optional rectangle subdivision used to control rendered geometry density. */
  renderRectangleSubdivision?: RenderRectangleSubdivision;
  /** Optional low-level timing observer intended for diagnostics and benchmarks. */
  benchmarkObserver?: SimpleGeoReconstructBenchmarkObserver;
}

/**
 * Legacy constructor options retained as an interface so downstream projects
 * can continue to extend or augment it.
 */
export interface SimpleGeoReconstructManagerConstructorOptions
  extends SimpleGeoReconstructManagerBaseOptions {
  /**
   * Tile processor used for reprojection. The caller owns and destroys it.
   * @deprecated Use the `processor` option through `SimpleGeoReconstructManagerOptions`.
   */
  processer: CesiumTileProcessor;
  /** Correctly spelled alias accepted when both option names are supplied. */
  processor?: CesiumTileProcessor;
}

/** Preferred constructor options using the correctly spelled processor name. */
export interface SimpleGeoReconstructManagerProcessorOptions
  extends SimpleGeoReconstructManagerBaseOptions {
  /** Tile processor used for reprojection. The caller owns and destroys it. */
  processor: CesiumTileProcessor;
  /** @deprecated Use processor. */
  processer?: CesiumTileProcessor;
}

/** Options accepted by SimpleGeoReconstructManager. */
export type SimpleGeoReconstructManagerOptions =
  | SimpleGeoReconstructManagerConstructorOptions
  | SimpleGeoReconstructManagerProcessorOptions;

/** Paper-aligned name for the existing manager option contract. */
export type ReconstructableTileLayerOptions = SimpleGeoReconstructManagerOptions;

/** Controls automatic fine-tile selection for the current view. */
export interface ViewFineTileLoadOptions {
  /** Explicit view rectangle; defaults to the current Cesium camera view. */
  viewRectangle?: Rectangle;
  /** Geological age in Ma; defaults to the manager's current age. */
  age?: number;
  /** Desired projected tile width/height in CSS pixels. Defaults to 256. */
  targetTileScreenSize?: number;
  /** Upper bound used to reduce overly expensive raw-tile selections. */
  maxRawViewTileCount?: number;
  /** Minimum allowed imagery level. */
  minLevel?: number;
  /** Maximum allowed imagery level. */
  maxLevel?: number;
}

/** Reason a fine-tile request completed without loading tiles. */
export type ViewFineTileLoadSkipReason = "no-view-rectangle" | "not-ready" | "stale-age";

/** Summary returned by a view-based fine-tile request. */
export interface ViewFineTileLoadResult {
  /** Imagery level selected for the request. */
  level: number;
  /** Composite tiles newly loaded by the request. */
  loadedCount: number;
  /** Composite tasks selected before cache and cancellation checks. */
  taskCount: number;
  /** Reason no load was attempted, when applicable. */
  skippedReason?: string;
}

/** Options used when switching primitive transform strategies. */
export interface SetPrimitiveTransformModeOptions {
  /** Remove existing primitives before rebuilding them. Defaults to true. */
  removeBeforeBuild?: boolean;
}

/** Paper-aligned name for a normalized polygonal plate-domain feature. */
export type PlateDomainFeature = PaleoData;

/** Paper-aligned name for the feature-source configuration. */
export type PlateDomainSourceConfig = FeatureSourceConfig;

/** Paper-aligned name for one retained processed tile and its scene objects. */
export type ProcessedTileRecord = TilePrimitiveRecord;

/** Paper-aligned name for one plate-domain quadtree record. */
export type PlateDomainQuadtreeRecord = PolygonQuadTreeRecord;

/** Paper-aligned name for quadtree records grouped by plate identifier. */
export type PlateDomainQuadtreeGroup = PlateQuadTreeGroup;

/** Runtime statistics for a Reconstructable Tile Layer. */
export type ReconstructableTileLayerStats = GeoTileStats;

/** Completion counters for one composite reconstruction-task generation. */
export type ReconstructionTaskReport = TileGenerationReport;

/** Options for view-aware source-tile selection and refinement. */
export type ViewAwareTileLoadOptions = ViewFineTileLoadOptions;

/** Result of view-aware source-tile selection and refinement. */
export type ViewAwareTileLoadResult = ViewFineTileLoadResult;

/** Reason a view-aware refinement request did not load source tiles. */
export type ViewAwareTileLoadSkipReason = ViewFineTileLoadSkipReason;

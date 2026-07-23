import {
  BoundingSphere,
  Cartographic,
  Cartesian3,
  type Ellipsoid,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  ImageryProvider,
  Material,
  Matrix4,
  Primitive,
  PrimitiveCollection,
  Rectangle,
  RectangleGeometry,
  SceneMode,
  Viewer,
} from "cesium";
import { RotationOperator, type AnchorPlateId } from "plates-rotation-operator";
import {
  NodeInfo,
  QuadTreeTileProcesser,
  type TileClipArea,
} from "polygon-tile-quadtree";
import {
  CesiumTileProcesser,
  type CesiumTileProcesserStats,
  type TileImageAsset,
} from "tile-processer-webgl";
import {
  loadFeaturePolygonDataWithDiagnostics,
  type FeatureImportDiagnostics,
  type PolygonRenderIntentMode,
  type RenderIntent,
} from "./gplates";
import {
  MeasuredRectangleGeometry,
  subdivideRenderRectangle,
  type RenderRectangleSubdivision,
  type SimpleGeoReconstructBenchmarkObserver,
} from "./renderRectangleSubdivision";

const DEFAULT_TILE_REQUEST_CONCURRENCY = 64;
const DEFAULT_PRIMITIVE_BATCH_SIZE = 32;
const DEFAULT_VIEW_TARGET_TILE_SCREEN_SIZE = 256;
const DEFAULT_VIEW_MAX_RAW_TILE_COUNT = 128;
const DEFAULT_VIEW_MAX_LEVEL = 18;
const RECTANGLE_SAMPLE_EPSILON = 1e-10;
const GEO_TILE_STATS_SCHEMA_VERSION = 3;
const TILE_GENERATION_REPORT_SCHEMA_VERSION = 1;
const IDENTITY_MODEL_MATRIX = Matrix4.clone(Matrix4.IDENTITY);

async function runStreamingWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(
    Math.max(1, Math.floor(concurrency)),
    items.length
  );

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) {
          return;
        }
        await worker(items[currentIndex], currentIndex);
      }
    })
  );
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function now() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeInteger(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function createFrameRenderScheduler(viewer: Viewer, isCurrent: () => boolean) {
  let renderScheduled = false;

  return () => {
    if (renderScheduled) {
      return;
    }
    renderScheduled = true;

    void waitForNextFrame().then(() => {
      renderScheduled = false;
      if (isCurrent()) {
        viewer.scene.requestRender();
      }
    });
  };
}

export interface PaleoItem {
  /** 瑕佺礌绫诲瀷锛宻cotese */
  FeatureType: string;
  /** 瑕佺礌ID */
  FeatureID: string;
  /** 鏉垮潡ID */
  PlateID: string;
  /** 瑕佺礌瀛樻椿鏃堕棿 */
  ValidTime: ValidTime;
  /** 鏉垮潡鐨刾olygon淇℃伅 */
  Polygon: Polygon[];
}

interface Polygon {
  PosList: PosList[];
}

interface PosList {
  Latitude: number;
  Longitude: number;
}

interface ValidTime {
  Begin: number;
  End: number;
}

export interface PaleoData {
  plateId: string;
  lonlats: number[];
  featureId: string;
  clipArea: TileClipArea;
  renderIntent: RenderIntent;
  time: {
    begine: number;
    end: number;
  };
  source?: {
    featureType?: string;
    originalFeatureId?: string;
    featureMemberIndex?: number;
    propertyNames?: string[];
    name?: string;
    polygonCount?: number;
    interiorCount?: number;
    attributes?: Record<string, string | number>;
  };
}

type TilePrimitiveRecord = {
  tileId: string;
  imageAsset: TileImageAsset;
  primitives: Primitive[];
  tileXYL: NodeInfo["tileXYL"];
  clipAreas: TileClipArea[];
  coversFullTile: boolean;
  sourceFeatureIds: string[];
  plateId: string;
  time: PaleoData["time"];
};

type PolygonQuadTreeRecord = {
  info: PaleoData;
  quadTree: QuadTreeTileProcesser;
  primitives: Record<string, TilePrimitiveRecord>;
};

type CompositeTileTask = {
  tileId: string;
  tileXYL: NodeInfo["tileXYL"];
  clipAreas: TileClipArea[];
  coversFullTile: boolean;
  sourceFeatureIds: string[];
  plateId: string;
  time: PaleoData["time"];
};

type TileTaskPartition = {
  currentVisibleTasks: CompositeTileTask[];
  prewarmTasks: CompositeTileTask[];
};

type PlateMatrixMap = Map<string, Matrix4>;

export type GeoTileStats = {
  statsSchemaVersion: number;
  sourceTaskCount: number;
  compositeTaskCount: number;
  uniqueRawTileCount: number;
  sourceFeatureContributionCount: number;
  clipAreaCount: number;
  clipPolygonCount: number;
  interiorRingCount: number;
  maxSourceFeaturesPerComposite: number;
  avgSourceFeaturesPerComposite: number;
  maxClipPolygonsPerComposite: number;
  avgClipPolygonsPerComposite: number;
  /** @deprecated Use maxClipPolygonsPerComposite. */
  maxPolygonsPerComposite: number;
  /** @deprecated Use avgClipPolygonsPerComposite. */
  avgPolygonsPerComposite: number;
  currentVisibleTaskCount: number;
  prewarmTaskCount: number;
  lastRevealMs: number;
  lastAgeVisibleRecordCount: number;
  lastAgeHiddenRecordCount: number;
  last2DRebuildSkippedCount: number;
  loadedCompositeTileCount: number;
  pendingCompositeTileCount: number;
  primitiveCount: number;
  readyPrimitiveCount: number;
  shownPrimitiveCount: number;
  primitiveCreatedCount: number;
  primitiveRemovedCount: number;
  retainedImageAssetCount: number;
  estimatedTextureRgbaBytes: number;
  renderRectanglePartCount: number;
  lastTaskCollectionMs: number;
  importDiagnostics?: FeatureImportDiagnostics;
};

export type TileGenerationReport = {
  reportSchemaVersion: number;
  generationId: number;
  selectedTaskCount: number;
  currentVisibleTaskCount: number;
  prewarmTaskCount: number;
  currentVisibleCompletedCount: number;
  currentVisibleFailedCount: number;
  prewarmCompletedCount: number;
  prewarmFailedCount: number;
  cancelledTaskCount: number;
  backgroundComplete: boolean;
  foregroundProcessorStats: CesiumTileProcesserStats | null;
};

export type PrimitiveTransformMode = "dynamic3D" | "bakedInstance";

type PlateMatrixEntry = {
  plateItem: PlateQuadTreeGroup;
  modelMatrix: Matrix4;
};

export type PlateQuadTreeGroup = {
  plateId: string;
  polygonQuadTrees: Map<string, PolygonQuadTreeRecord>;
};

export interface FeatureSourceConfig {
  url: string;
  polygonRenderIntent?: PolygonRenderIntentMode;
}

export interface ResolvedFeatureFiles {
  polygonRenderIntent?: PolygonRenderIntentMode;
  polygon: string;
  rots: string[];
}

export interface SimpleGeoReconstructManagerConstructorOptions {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  anchorPlateId?: AnchorPlateId;
  files?: ResolvedFeatureFiles;
  featureSource?: string | FeatureSourceConfig;
  rotationSources?: string[];
  initialAge?: number;
  primitiveTransformMode?: PrimitiveTransformMode;
  referenceEllipsoid?: Ellipsoid;
  tileRequestConcurrency?: number;
  primitiveBatchSize?: number;
  renderRectangleSubdivision?: RenderRectangleSubdivision;
  benchmarkObserver?: SimpleGeoReconstructBenchmarkObserver;
}

export interface ViewFineTileLoadOptions {
  viewRectangle?: Rectangle;
  age?: number;
  targetTileScreenSize?: number;
  maxRawViewTileCount?: number;
  minLevel?: number;
  maxLevel?: number;
}

export interface ViewFineTileLoadResult {
  level: number;
  loadedCount: number;
  taskCount: number;
  skippedReason?: string;
}

function resolveFeatureFiles(
  options: SimpleGeoReconstructManagerConstructorOptions
): ResolvedFeatureFiles {
  const source = options.featureSource;
  const sourceConfig = typeof source === "string" ? { url: source } : source;
  const polygon = sourceConfig?.url ?? options.files?.polygon;
  const rots = options.rotationSources ?? options.files?.rots;

  if (!polygon) {
    throw new Error(
      "SimpleGeoReconstructManager requires a feature source URL."
    );
  }
  if (!rots || rots.length === 0) {
    throw new Error(
      "SimpleGeoReconstructManager requires at least one ROT URL."
    );
  }

  return {
    polygon,
    rots,
    polygonRenderIntent:
      sourceConfig?.polygonRenderIntent ?? options.files?.polygonRenderIntent,
  };
}

export class SimpleGeoReconstructManager {
  private _provider: ImageryProvider;
  processer: CesiumTileProcesser;
  rotationOperator: RotationOperator;
  private _files: ResolvedFeatureFiles;
  private _referenceEllipsoid: Ellipsoid;
  paleoData: PaleoData[] = [];
  allPaleoData: PaleoData[] = [];
  // key涓簆lateID锛屽叾鍐呴儴鐨凪ap涓璳ey涓篺eatureID
  plates: Map<string, PlateQuadTreeGroup> = new Map<
    string,
    PlateQuadTreeGroup
  >();

  private _ready = false;
  private _tileListCache = new Map<string, NodeInfo[]>();
  private _rotationMatrixCache = new Map<string, Matrix4>();
  private _compositeTileRecords = new Map<string, TilePrimitiveRecord>();
  private _geoTileStats: GeoTileStats = {
    statsSchemaVersion: GEO_TILE_STATS_SCHEMA_VERSION,
    sourceTaskCount: 0,
    compositeTaskCount: 0,
    uniqueRawTileCount: 0,
    sourceFeatureContributionCount: 0,
    clipAreaCount: 0,
    clipPolygonCount: 0,
    interiorRingCount: 0,
    maxSourceFeaturesPerComposite: 0,
    avgSourceFeaturesPerComposite: 0,
    maxClipPolygonsPerComposite: 0,
    avgClipPolygonsPerComposite: 0,
    maxPolygonsPerComposite: 0,
    avgPolygonsPerComposite: 0,
    currentVisibleTaskCount: 0,
    prewarmTaskCount: 0,
    lastRevealMs: 0,
    lastAgeVisibleRecordCount: 0,
    lastAgeHiddenRecordCount: 0,
    last2DRebuildSkippedCount: 0,
    loadedCompositeTileCount: 0,
    pendingCompositeTileCount: 0,
    primitiveCount: 0,
    readyPrimitiveCount: 0,
    shownPrimitiveCount: 0,
    primitiveCreatedCount: 0,
    primitiveRemovedCount: 0,
    retainedImageAssetCount: 0,
    estimatedTextureRgbaBytes: 0,
    renderRectanglePartCount: 0,
    lastTaskCollectionMs: 0,
    importDiagnostics: undefined,
  };
  private _lastGenerationReport: TileGenerationReport | null = null;
  private _primitiveCreatedCount = 0;
  private _primitiveRemovedCount = 0;
  private _generationToken = 0;
  private _ageUpdateToken = 0;
  private _primitiveRebuildToken = 0;
  private _pendingTileTokens = new Map<string, number>();
  private _currentAge = 0;
  private _transformMode: PrimitiveTransformMode = "dynamic3D";
  private _boundViewer: Viewer | null = null;
  private _sceneModeCleanup: (() => void) | null = null;
  private _tileRequestConcurrency = DEFAULT_TILE_REQUEST_CONCURRENCY;
  private _primitiveBatchSize = DEFAULT_PRIMITIVE_BATCH_SIZE;
  private _tileRootPrimitiveCollection: PrimitiveCollection | null = null;
  private _platePrimitiveCollections = new Map<string, PrimitiveCollection>();
  private _renderRectangleSubdivision: RenderRectangleSubdivision = {
    mode: "none",
  };
  private _benchmarkObserver?: SimpleGeoReconstructBenchmarkObserver;

  constructor(data: SimpleGeoReconstructManagerConstructorOptions) {
    this._provider = data.provider;
    this.processer = data.processer;
    this._files = resolveFeatureFiles(data);
    this._referenceEllipsoid =
      data.referenceEllipsoid ?? data.provider.tilingScheme.ellipsoid;
    this.rotationOperator = new RotationOperator({
      anchorPlateId: data.anchorPlateId,
      referenceEllipsoid: this._referenceEllipsoid,
    });
    this._currentAge = data.initialAge ?? 0;
    this._transformMode = data.primitiveTransformMode ?? "dynamic3D";
    this._tileRequestConcurrency =
      data.tileRequestConcurrency ?? DEFAULT_TILE_REQUEST_CONCURRENCY;
    this._primitiveBatchSize =
      data.primitiveBatchSize ?? DEFAULT_PRIMITIVE_BATCH_SIZE;
    this._renderRectangleSubdivision = data.renderRectangleSubdivision ?? {
      mode: "none",
    };
    this._benchmarkObserver = data.benchmarkObserver;
  }

  get ready() {
    return this._ready;
  }

  get referenceEllipsoid() {
    return this._referenceEllipsoid;
  }

  getGeoTileStats(): GeoTileStats {
    const records = Array.from(this._compositeTileRecords.values());
    const primitives = records.flatMap((record) => record.primitives);
    const retainedAssets = new Set(records.map((record) => record.imageAsset));
    const estimatedTextureRgbaBytes = Array.from(retainedAssets).reduce(
      (total, asset) => total + asset.width * asset.height * 4,
      0
    );

    return {
      ...this._geoTileStats,
      loadedCompositeTileCount: this._compositeTileRecords.size,
      pendingCompositeTileCount: this._pendingTileTokens.size,
      primitiveCount: primitives.length,
      readyPrimitiveCount: primitives.filter((primitive) => primitive.ready)
        .length,
      shownPrimitiveCount: primitives.filter((primitive) => primitive.show)
        .length,
      primitiveCreatedCount: this._primitiveCreatedCount,
      primitiveRemovedCount: this._primitiveRemovedCount,
      retainedImageAssetCount: retainedAssets.size,
      estimatedTextureRgbaBytes,
      renderRectanglePartCount: primitives.length,
    };
  }

  getStats() {
    return this.getGeoTileStats();
  }

  getLastGenerationReport(): TileGenerationReport | null {
    if (!this._lastGenerationReport) {
      return null;
    }
    return {
      ...this._lastGenerationReport,
      foregroundProcessorStats: this._lastGenerationReport
        .foregroundProcessorStats
        ? { ...this._lastGenerationReport.foregroundProcessorStats }
        : null,
    };
  }

  async getPaleoDataFlatten(url: string) {
    return loadFeaturePolygonDataWithDiagnostics(url, {
      polygonRenderIntent: this._files.polygonRenderIntent,
    });
  }

  async init() {
    this._ready = false;
    this.plates.clear();
    this._tileListCache.clear();
    this._rotationMatrixCache.clear();
    this._compositeTileRecords.clear();
    this._lastGenerationReport = null;
    this._primitiveCreatedCount = 0;
    this._primitiveRemovedCount = 0;

    const loadResult = await this.getPaleoDataFlatten(this._files.polygon);
    this.allPaleoData = loadResult.items;
    this.paleoData = loadResult.items.filter(
      (item) => item.renderIntent === "area"
    );
    this._geoTileStats.importDiagnostics = loadResult.diagnostics;
    this.paleoData.forEach((item) => {
      if (!this.plates.get(item.plateId)) {
        this.plates.set(item.plateId, {
          plateId: item.plateId,
          polygonQuadTrees: new Map<string, PolygonQuadTreeRecord>(),
        });
      }
      const plateGroup = this.plates.get(item.plateId);
      if (plateGroup?.polygonQuadTrees.has(item.featureId)) {
        if (isDeepTimeGeoDebugEnabled()) {
          console.warn("[DeepTimeGeo] duplicate featureId collision", {
            plateId: item.plateId,
            featureId: item.featureId,
            source: item.source,
          });
        }
        return;
      }
      plateGroup?.polygonQuadTrees.set(item.featureId, {
        info: item,
        quadTree: new QuadTreeTileProcesser(
          this._provider.tilingScheme,
          item.clipArea
        ),
        primitives: {},
      });
    });

    await this.rotationOperator.init(this._files.rots);
    this._ready = true;
  }

  async generateTilePrimitivesOnLevelN(viewer: Viewer, level: number) {
    if (!this._ready) {
      return;
    }
    await this.executeTileGeneration(
      viewer,
      this.collectTileTasks("level", level)
    );
  }

  async loadTilesOnLevel(viewer: Viewer, level: number) {
    return this.generateTilePrimitivesOnLevelN(viewer, level);
  }

  async loadFineTilesInView(
    viewer: Viewer,
    options?: ViewFineTileLoadOptions
  ): Promise<ViewFineTileLoadResult>;
  async loadFineTilesInView(
    viewer: Viewer,
    level: number,
    options?: ViewFineTileLoadOptions
  ): Promise<ViewFineTileLoadResult>;
  async loadFineTilesInView(
    viewer: Viewer,
    levelOrOptions: number | ViewFineTileLoadOptions = {},
    options: ViewFineTileLoadOptions = {}
  ): Promise<ViewFineTileLoadResult> {
    if (typeof levelOrOptions === "number") {
      return this.loadFineTilesInViewAtLevel(viewer, levelOrOptions, options);
    }

    const resolvedOptions = levelOrOptions;
    const viewRectangle = this.resolveFineTileViewRectangle(
      viewer,
      resolvedOptions
    );
    if (!viewRectangle) {
      return this.createFineTileLoadResult(-1, 0, 0, "no-view-rectangle");
    }

    const level = this.resolveFineViewLevel(
      viewer,
      viewRectangle,
      resolvedOptions
    );
    return this.loadTilesInViewAtResolvedLevel(
      viewer,
      level,
      viewRectangle,
      resolvedOptions
    );
  }

  async loadFineTilesInViewAtLevel(
    viewer: Viewer,
    level: number,
    options: ViewFineTileLoadOptions = {}
  ): Promise<ViewFineTileLoadResult> {
    const viewRectangle = this.resolveFineTileViewRectangle(viewer, options);
    if (!viewRectangle) {
      return this.createFineTileLoadResult(-1, 0, 0, "no-view-rectangle");
    }

    return this.loadTilesInViewAtResolvedLevel(
      viewer,
      this.clampFineViewLevel(level, options),
      viewRectangle,
      options
    );
  }

  private async loadTilesInViewAtResolvedLevel(
    viewer: Viewer,
    level: number,
    viewRectangle: Rectangle,
    options: ViewFineTileLoadOptions
  ): Promise<ViewFineTileLoadResult> {
    if (!this._ready) {
      return this.createFineTileLoadResult(level, 0, 0, "not-ready");
    }

    const usingCurrentAge = options.age === undefined;
    const age = options.age ?? this._currentAge;
    const viewBoundingSphere =
      this.createViewBoundingSphereFromRectangle(viewRectangle);
    const plateMatrices = await this.getPlateMatrixEntries(age);
    if (usingCurrentAge && age !== this._currentAge) {
      return this.createFineTileLoadResult(level, 0, 0, "stale-age");
    }

    this.updateQuadTreeBoundingSpheres(plateMatrices);
    const tasks = await this.collectFineTileTasksInView(
      level,
      viewBoundingSphere,
      age
    );
    if (usingCurrentAge && age !== this._currentAge) {
      return this.createFineTileLoadResult(level, 0, tasks.length, "stale-age");
    }

    const loadedCount = await this.executeTileGeneration(viewer, tasks);
    return this.createFineTileLoadResult(level, loadedCount, tasks.length);
  }

  async generateTilePrimitivesAtRoot(viewer: Viewer) {
    if (!this._ready) {
      return;
    }
    await this.executeTileGeneration(viewer, this.collectTileTasks("root"));
  }

  async loadTilesAtRoot(viewer: Viewer) {
    return this.generateTilePrimitivesAtRoot(viewer);
  }

  async updateAge(age: number) {
    if (!this._ready) {
      return;
    }

    this._currentAge = age;
    const updateToken = ++this._ageUpdateToken;
    const visibleRecords = this.getVisibleRecordsAtAge(age);
    const matrixByPlate = await this.getPlateMatrixMapForRecords(
      visibleRecords,
      age
    );
    if (updateToken !== this._ageUpdateToken) {
      return;
    }

    this.updateAgeRecordStats(age);

    if (this._transformMode === "bakedInstance") {
      if (this._boundViewer) {
        await this.rebuildLoadedPrimitives(this._boundViewer, matrixByPlate, {
          removeBeforeBuild: false,
        });
      }
      return;
    }

    this.applyDynamicVisibilityAndMatrices(matrixByPlate, age);
    this._boundViewer?.scene.requestRender();
  }

  async setAge(age: number) {
    return this.updateAge(age);
  }

  bindSceneModeSync(viewer: Viewer) {
    this.unbindSceneModeSync();
    this._boundViewer = viewer;

    const removeMorphStart = viewer.scene.morphStart.addEventListener(
      (
        _transitioner: unknown,
        _previousMode: SceneMode,
        targetMode: SceneMode
      ) => {
        if (targetMode !== SceneMode.SCENE3D) {
          void this.setPrimitiveTransformMode(viewer, "bakedInstance", {
            removeBeforeBuild: true,
          });
        }
      }
    );
    const removeMorphComplete = viewer.scene.morphComplete.addEventListener(
      (
        _transitioner: unknown,
        _previousMode: SceneMode,
        targetMode: SceneMode
      ) => {
        void this.setPrimitiveTransformMode(
          viewer,
          targetMode === SceneMode.SCENE3D ? "dynamic3D" : "bakedInstance",
          {
            removeBeforeBuild: false,
          }
        );
      }
    );

    this._sceneModeCleanup = () => {
      removeMorphStart();
      removeMorphComplete();
      if (this._boundViewer === viewer) {
        this._boundViewer = null;
      }
    };

    void this.syncPrimitiveTransformMode(viewer);
    return this._sceneModeCleanup;
  }

  unbindSceneModeSync() {
    this._sceneModeCleanup?.();
    this._sceneModeCleanup = null;
  }

  async syncPrimitiveTransformMode(viewer: Viewer) {
    return this.setPrimitiveTransformMode(
      viewer,
      viewer.scene.mode === SceneMode.SCENE3D ? "dynamic3D" : "bakedInstance",
      {
        removeBeforeBuild: viewer.scene.mode !== SceneMode.SCENE3D,
      }
    );
  }

  async setPrimitiveTransformMode(
    viewer: Viewer,
    mode: PrimitiveTransformMode,
    options: { removeBeforeBuild?: boolean } = {}
  ) {
    this._boundViewer = viewer;
    if (this._transformMode === mode) {
      return;
    }

    this._transformMode = mode;
    this._generationToken++;
    this._pendingTileTokens.clear();

    const rebuildToken = ++this._primitiveRebuildToken;
    const age = this._currentAge;
    const removeBeforeBuild = options.removeBeforeBuild ?? true;
    if (removeBeforeBuild) {
      this.removePrimitiveInstances(viewer);
    }

    const visibleRecords = this.getVisibleRecordsAtAge(age);
    const matrixByPlate = await this.getPlateMatrixMapForRecords(
      visibleRecords,
      age
    );
    this.updateAgeRecordStats(age);
    await this.rebuildLoadedPrimitives(viewer, matrixByPlate, {
      age,
      mode,
      rebuildToken,
      removeBeforeBuild: false,
    });
  }

  private getOrCreateTileRootPrimitiveCollection(
    viewer: Viewer
  ): PrimitiveCollection {
    if (
      this._tileRootPrimitiveCollection &&
      viewer.scene.primitives.contains(this._tileRootPrimitiveCollection)
    ) {
      return this._tileRootPrimitiveCollection;
    }

    this._platePrimitiveCollections.clear();
    const rootCollection = viewer.scene.primitives.add(
      new PrimitiveCollection()
    ) as PrimitiveCollection;
    this._tileRootPrimitiveCollection = rootCollection;
    return rootCollection;
  }

  private getOrCreatePlatePrimitiveCollection(viewer: Viewer, plateId: string) {
    const rootCollection = this.getOrCreateTileRootPrimitiveCollection(viewer);
    const existingCollection = this._platePrimitiveCollections.get(plateId);
    if (
      existingCollection &&
      !existingCollection.isDestroyed() &&
      rootCollection.contains(existingCollection)
    ) {
      return existingCollection;
    }

    this._platePrimitiveCollections.delete(plateId);
    const sortedExistingPlateIds = Array.from(
      this._platePrimitiveCollections.keys()
    ).sort(comparePlateIds);
    const insertIndex = sortedExistingPlateIds.findIndex(
      (existingPlateId) => comparePlateIds(plateId, existingPlateId) < 0
    );
    const plateCollection = new PrimitiveCollection();
    rootCollection.add(
      plateCollection,
      insertIndex === -1 ? sortedExistingPlateIds.length : insertIndex
    );
    this._platePrimitiveCollections.set(plateId, plateCollection);
    return plateCollection;
  }

  private addTilePrimitiveToScene(
    viewer: Viewer,
    plateId: string,
    primitive: Primitive
  ) {
    return this.getOrCreatePlatePrimitiveCollection(viewer, plateId).add(
      primitive
    ) as Primitive;
  }

  private addTilePrimitivesToScene(
    viewer: Viewer,
    plateId: string,
    primitives: Primitive[]
  ) {
    return primitives.map((primitive) =>
      this.addTilePrimitiveToScene(viewer, plateId, primitive)
    );
  }

  private removeTilePrimitiveCollections(viewer: Viewer) {
    const rootCollection = this._tileRootPrimitiveCollection;
    if (
      rootCollection &&
      !rootCollection.isDestroyed() &&
      viewer.scene.primitives.contains(rootCollection)
    ) {
      viewer.scene.primitives.remove(rootCollection);
    } else {
      this._platePrimitiveCollections.forEach((plateCollection) => {
        if (!plateCollection.isDestroyed()) {
          plateCollection.removeAll();
        }
      });
    }

    this._tileRootPrimitiveCollection = null;
    this._platePrimitiveCollections.clear();
  }

  private clearTilePrimitiveCollectionReferences() {
    this._tileRootPrimitiveCollection = null;
    this._platePrimitiveCollections.clear();
  }

  private applyDynamicVisibilityAndMatrices(
    matrixByPlate: PlateMatrixMap,
    age: number
  ) {
    this._compositeTileRecords.forEach((tileRecord) => {
      if (tileRecord.primitives.length === 0) {
        return;
      }

      if (!this.isVisibleAtTime(tileRecord.time, age)) {
        tileRecord.primitives.forEach((primitive) => {
          primitive.show = false;
        });
        return;
      }

      const modelMatrix =
        matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
      tileRecord.primitives.forEach((primitive) => {
        primitive.modelMatrix = modelMatrix;
        primitive.show = true;
      });
    });
  }

  private requestRevealRender(viewer: Viewer) {
    const scene = viewer.scene;
    let removePostRender: (() => void) | undefined;

    removePostRender = scene.postRender.addEventListener(() => {
      removePostRender?.();
      scene.requestRender();
    });
    scene.requestRender();
  }

  private async revealLoadedPrimitivesForAge(
    viewer: Viewer,
    age: number,
    generationToken: number
  ) {
    const revealStart = now();
    const visibleRecords = this.getVisibleRecordsAtAge(age).filter(
      (tileRecord) => tileRecord.primitives.length > 0
    );
    const matrixByPlate =
      this._transformMode === "dynamic3D"
        ? await this.getPlateMatrixMapForRecords(visibleRecords, age)
        : new Map<string, Matrix4>();

    if (generationToken !== this._generationToken || age !== this._currentAge) {
      return;
    }

    this.updateAgeRecordStats(age);
    if (this._transformMode === "dynamic3D") {
      this.applyDynamicVisibilityAndMatrices(matrixByPlate, age);
    } else {
      this._compositeTileRecords.forEach((tileRecord) => {
        const visible = this.isVisibleAtTime(tileRecord.time, age);
        tileRecord.primitives.forEach((primitive) => {
          primitive.show = visible;
        });
      });
    }

    this.patchGeoTileStats({
      lastRevealMs: now() - revealStart,
    });
    this.requestRevealRender(viewer);
  }

  async updateProvider(viewer: Viewer, provider: ImageryProvider) {
    if (!this._ready) {
      return;
    }

    this._boundViewer = viewer;
    this._provider = provider;
    this._generationToken++;
    this._pendingTileTokens.clear();
    this.processer.clearBuffer();
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        polygonItem.quadTree.updateProvider(provider);
      });
    });
    this._tileListCache.clear();
    this.removeAllPrimitives(viewer);
    viewer.scene.requestRender();
  }

  async setProvider(viewer: Viewer, provider: ImageryProvider) {
    return this.updateProvider(viewer, provider);
  }

  clearAllTiles(viewer: Viewer) {
    this._boundViewer = viewer;
    this._generationToken++;
    this._primitiveRebuildToken++;
    this._pendingTileTokens.clear();
    this.processer.clearBuffer();
    this.removeAllPrimitives(viewer);
    viewer.scene.requestRender();
  }

  clear(viewer: Viewer) {
    this.clearAllTiles(viewer);
  }

  destroy(viewer?: Viewer) {
    const targetViewer = viewer ?? this._boundViewer;
    this.unbindSceneModeSync();
    this._ready = false;
    this._generationToken++;
    this._ageUpdateToken++;
    this._primitiveRebuildToken++;
    this._pendingTileTokens.clear();
    this._tileListCache.clear();
    this._rotationMatrixCache.clear();
    this.processer.clearBuffer();

    if (targetViewer) {
      this.removeAllPrimitives(targetViewer);
      targetViewer.scene.requestRender();
    } else {
      this.releaseAllTileAssets();
    }
  }

  private collectTileTasks(mode: "level" | "root", level?: number) {
    const collectionStart = now();
    const taskMap = new Map<string, CompositeTileTask>();
    const uniqueRawTileIds = new Set<string>();
    let sourceTaskCount = 0;

    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        const tiles = this.getTilesForPolygon(polygonItem, mode, level);
        tiles.forEach((tileInfo) => {
          if (
            this.appendCompositeTileTask(
              taskMap,
              uniqueRawTileIds,
              polygonItem,
              tileInfo
            )
          ) {
            sourceTaskCount++;
          }
        });
      });
    });

    const tasks = Array.from(taskMap.values());
    this.updateGeoTileStats(
      tasks,
      sourceTaskCount,
      uniqueRawTileIds.size,
      now() - collectionStart
    );
    this._benchmarkObserver?.onStageOperation(
      "task-gen",
      collectionStart,
      now()
    );
    return tasks;
  }

  private async collectFineTileTasksInView(
    level: number,
    viewBoundingSphere: BoundingSphere,
    age: number
  ) {
    const collectionStart = now();
    const taskMap = new Map<string, CompositeTileTask>();
    const uniqueRawTileIds = new Set<string>();
    let sourceTaskCount = 0;

    for (const plateItem of this.plates.values()) {
      let modernViewBoundingSphere: BoundingSphere | null = null;

      for (const polygonItem of plateItem.polygonQuadTrees.values()) {
        if (
          !polygonItem.quadTree.intersectsCurrentBoundingSphere(
            viewBoundingSphere
          )
        ) {
          continue;
        }

        if (!modernViewBoundingSphere) {
          modernViewBoundingSphere =
            await this.rotateBoundingSphereToModernCoordinates(
              viewBoundingSphere,
              plateItem.plateId,
              age
            );
        }

        const tiles: NodeInfo[] = [];
        polygonItem.quadTree.findTilesByLevelInBoundingSphere(
          level,
          modernViewBoundingSphere,
          tiles
        );
        tiles.forEach((tileInfo) => {
          if (
            this.appendCompositeTileTask(
              taskMap,
              uniqueRawTileIds,
              polygonItem,
              tileInfo
            )
          ) {
            sourceTaskCount++;
          }
        });
      }
    }

    const tasks = Array.from(taskMap.values());
    this.updateGeoTileStats(
      tasks,
      sourceTaskCount,
      uniqueRawTileIds.size,
      now() - collectionStart
    );
    this._benchmarkObserver?.onStageOperation(
      "task-gen",
      collectionStart,
      now()
    );
    return tasks;
  }

  private appendCompositeTileTask(
    taskMap: Map<string, CompositeTileTask>,
    uniqueRawTileIds: Set<string>,
    polygonItem: PolygonQuadTreeRecord,
    tileInfo: NodeInfo
  ) {
    const tileId = this.getCompositeTileId(polygonItem.info, tileInfo);
    const pendingTask = taskMap.get(tileId);
    if (
      this._compositeTileRecords.has(tileId) ||
      this._pendingTileTokens.has(tileId) ||
      pendingTask?.sourceFeatureIds.includes(polygonItem.info.featureId)
    ) {
      return false;
    }

    uniqueRawTileIds.add(this.getRawTileId(tileInfo));
    let task = pendingTask;
    if (!task) {
      task = {
        tileId,
        tileXYL: tileInfo.tileXYL,
        clipAreas: [],
        coversFullTile: false,
        sourceFeatureIds: [],
        plateId: polygonItem.info.plateId,
        time: polygonItem.info.time,
      };
      taskMap.set(tileId, task);
    }

    task.sourceFeatureIds.push(polygonItem.info.featureId);
    if (tileInfo.clipArea) {
      task.clipAreas.push(tileInfo.clipArea);
    } else if (tileInfo.polygon) {
      task.clipAreas.push({
        polygons: [
          {
            exterior: tileInfo.polygon,
          },
        ],
      });
    } else {
      task.coversFullTile = true;
    }
    return true;
  }

  private partitionTasksByAge(
    tasks: CompositeTileTask[],
    age: number
  ): TileTaskPartition {
    const currentVisibleTasks: CompositeTileTask[] = [];
    const prewarmTasks: CompositeTileTask[] = [];

    tasks.forEach((task) => {
      if (this.isVisibleAtTime(task.time, age)) {
        currentVisibleTasks.push(task);
      } else {
        prewarmTasks.push(task);
      }
    });

    return { currentVisibleTasks, prewarmTasks };
  }

  private clearPendingTileTokensForGeneration(generationToken: number) {
    Array.from(this._pendingTileTokens.entries()).forEach(([tileId, token]) => {
      if (token === generationToken) {
        this._pendingTileTokens.delete(tileId);
      }
    });
  }

  private async executeTileGeneration(
    viewer: Viewer,
    tasks: CompositeTileTask[]
  ) {
    if (tasks.length === 0) {
      this.patchGeoTileStats({
        currentVisibleTaskCount: 0,
        prewarmTaskCount: 0,
        lastRevealMs: 0,
      });
      this._lastGenerationReport = {
        reportSchemaVersion: TILE_GENERATION_REPORT_SCHEMA_VERSION,
        generationId: this._generationToken,
        selectedTaskCount: 0,
        currentVisibleTaskCount: 0,
        prewarmTaskCount: 0,
        currentVisibleCompletedCount: 0,
        currentVisibleFailedCount: 0,
        prewarmCompletedCount: 0,
        prewarmFailedCount: 0,
        cancelledTaskCount: 0,
        backgroundComplete: true,
        foregroundProcessorStats: this.processer.getPoolStats(),
      };
      return 0;
    }

    this._boundViewer = viewer;
    const loadAge = this._currentAge;
    const generationToken = ++this._generationToken;
    const provider = this._provider;
    const { currentVisibleTasks, prewarmTasks } = this.partitionTasksByAge(
      tasks,
      loadAge
    );
    const scheduleRender = createFrameRenderScheduler(
      viewer,
      () => generationToken === this._generationToken
    );
    let addedPrimitiveCount = 0;
    const generationReport: TileGenerationReport = {
      reportSchemaVersion: TILE_GENERATION_REPORT_SCHEMA_VERSION,
      generationId: generationToken,
      selectedTaskCount: tasks.length,
      currentVisibleTaskCount: currentVisibleTasks.length,
      prewarmTaskCount: prewarmTasks.length,
      currentVisibleCompletedCount: 0,
      currentVisibleFailedCount: 0,
      prewarmCompletedCount: 0,
      prewarmFailedCount: 0,
      cancelledTaskCount: 0,
      backgroundComplete: prewarmTasks.length === 0,
      foregroundProcessorStats: null,
    };
    this._lastGenerationReport = generationReport;

    this.patchGeoTileStats({
      currentVisibleTaskCount: currentVisibleTasks.length,
      prewarmTaskCount: prewarmTasks.length,
      lastRevealMs: 0,
    });

    tasks.forEach((task) => {
      this._pendingTileTokens.set(task.tileId, generationToken);
    });

    const processTasks = async (
      phaseTasks: CompositeTileTask[],
      phase: "currentVisible" | "prewarm",
      createAgeSpecificPrimitive: boolean
    ) => {
      let loadedCount = 0;
      await runStreamingWithConcurrency(
        phaseTasks,
        this._tileRequestConcurrency,
        async (task) => {
          let imageAsset: TileImageAsset | null = null;
          let outcome: "completed" | "failed" | "cancelled" = "failed";
          try {
            if (generationToken !== this._generationToken) {
              outcome = "cancelled";
              return;
            }

            imageAsset = await this.getReprojectedTileImageAsset(
              task,
              provider
            );
            if (!imageAsset) {
              return;
            }

            if (
              generationToken !== this._generationToken ||
              this._pendingTileTokens.get(task.tileId) !== generationToken ||
              this._compositeTileRecords.has(task.tileId)
            ) {
              imageAsset.release();
              imageAsset = null;
              outcome = "cancelled";
              return;
            }

            const shouldCreatePrimitive =
              this._transformMode === "dynamic3D" || createAgeSpecificPrimitive;
            let primitives: Primitive[] = [];

            if (shouldCreatePrimitive) {
              const modelMatrix = createAgeSpecificPrimitive
                ? await this.getCachedModelMatrix(task.plateId, loadAge)
                : IDENTITY_MODEL_MATRIX;
              if (generationToken !== this._generationToken) {
                imageAsset.release();
                imageAsset = null;
                outcome = "cancelled";
                return;
              }

              primitives = this.addTilePrimitivesToScene(
                viewer,
                task.plateId,
                this.createTilePrimitives(
                  task.tileId,
                  task,
                  imageAsset.source,
                  modelMatrix,
                  false,
                  this._transformMode
                )
              );

              addedPrimitiveCount += primitives.length;
              if (addedPrimitiveCount % this._primitiveBatchSize === 0) {
                viewer.scene.requestRender();
              } else {
                scheduleRender();
              }
            }

            this._compositeTileRecords.set(task.tileId, {
              tileId: task.tileId,
              imageAsset,
              primitives,
              tileXYL: task.tileXYL,
              clipAreas: task.clipAreas,
              coversFullTile: task.coversFullTile,
              sourceFeatureIds: task.sourceFeatureIds,
              plateId: task.plateId,
              time: task.time,
            });
            imageAsset = null;
            loadedCount++;
            outcome = "completed";
          } catch (error) {
            imageAsset?.release();
            console.warn("Failed to create tile primitive.", error);
          } finally {
            if (outcome === "cancelled") {
              generationReport.cancelledTaskCount++;
            } else if (phase === "currentVisible") {
              if (outcome === "completed") {
                generationReport.currentVisibleCompletedCount++;
              } else {
                generationReport.currentVisibleFailedCount++;
              }
            } else if (outcome === "completed") {
              generationReport.prewarmCompletedCount++;
            } else {
              generationReport.prewarmFailedCount++;
            }
            if (this._pendingTileTokens.get(task.tileId) === generationToken) {
              this._pendingTileTokens.delete(task.tileId);
            }
          }
        }
      );
      return loadedCount;
    };

    const visibleLoadedCount = await processTasks(
      currentVisibleTasks,
      "currentVisible",
      true
    );
    if (
      visibleLoadedCount > 0 &&
      generationToken === this._generationToken &&
      loadAge === this._currentAge
    ) {
      await this.revealLoadedPrimitivesForAge(viewer, loadAge, generationToken);
    }
    // Capture the processor at the exact foreground boundary. Sampling only
    // after the public Promise resolves can already include prewarm activity.
    generationReport.foregroundProcessorStats = this.processer.getPoolStats();

    if (generationToken !== this._generationToken) {
      this.clearPendingTileTokensForGeneration(generationToken);
      generationReport.backgroundComplete = true;
    } else if (prewarmTasks.length > 0) {
      void processTasks(prewarmTasks, "prewarm", false)
        .then(() => {
          if (generationToken === this._generationToken) {
            viewer.scene.requestRender();
          }
        })
        .catch((error) => {
          this.clearPendingTileTokensForGeneration(generationToken);
          console.warn("Failed to prewarm tile primitives.", error);
        })
        .finally(() => {
          generationReport.backgroundComplete = true;
        });
    } else if (
      addedPrimitiveCount > 0 &&
      generationToken === this._generationToken
    ) {
      viewer.scene.requestRender();
    }

    return visibleLoadedCount;
  }

  private async getReprojectedTileImageAsset(
    tile: Pick<TilePrimitiveRecord, "tileXYL" | "clipAreas" | "coversFullTile">,
    provider: ImageryProvider
  ): Promise<TileImageAsset | null> {
    if (!tile.coversFullTile && tile.clipAreas.length > 0) {
      return this.processer.reprojectMultiClippedTileAreaImage(
        tile.tileXYL.x,
        tile.tileXYL.y,
        tile.tileXYL.l,
        tile.clipAreas,
        provider
      );
    }
    return this.processer.reprojectTileImage(
      tile.tileXYL.x,
      tile.tileXYL.y,
      tile.tileXYL.l,
      provider
    );
  }

  private getTilesForPolygon(
    polygonItem: PolygonQuadTreeRecord,
    mode: "level" | "root",
    level?: number
  ) {
    const cacheKey = [
      polygonItem.info.featureId,
      this.getTilingSchemeKey(),
      mode,
      level ?? "root",
    ].join(":");
    const cachedTiles = this._tileListCache.get(cacheKey);
    if (cachedTiles) {
      return cachedTiles;
    }

    const tiles: NodeInfo[] = [];
    if (mode === "level") {
      polygonItem.quadTree.findTilesByLevel(level ?? 0, tiles);
    } else {
      polygonItem.quadTree.findTilesAtRoot(tiles);
    }
    this._tileListCache.set(cacheKey, tiles);
    return tiles;
  }

  private getCompositeTileId(
    info: PaleoData,
    tileInfo: Pick<NodeInfo, "tileXYL">
  ) {
    return [
      info.plateId,
      info.time.begine,
      info.time.end,
      this.getRawTileId(tileInfo),
    ].join(":");
  }

  private getRawTileId(tileInfo: Pick<NodeInfo, "tileXYL">) {
    return `${tileInfo.tileXYL.x}/${tileInfo.tileXYL.y}/${tileInfo.tileXYL.l}`;
  }

  private updateGeoTileStats(
    tasks: CompositeTileTask[],
    sourceTaskCount: number,
    uniqueRawTileCount: number,
    taskCollectionMs: number
  ) {
    const sourceFeatureCounts = tasks.map(
      (task) => task.sourceFeatureIds.length
    );
    const clipPolygonCounts = tasks.map((task) =>
      task.clipAreas.reduce(
        (count, clipArea) => count + clipArea.polygons.length,
        0
      )
    );
    const clipAreaCount = tasks.reduce(
      (count, task) => count + task.clipAreas.length,
      0
    );
    const clipPolygonCount = clipPolygonCounts.reduce(
      (count, taskCount) => count + taskCount,
      0
    );
    const interiorRingCount = tasks.reduce(
      (count, task) =>
        count +
        task.clipAreas.reduce(
          (areaCount, clipArea) =>
            areaCount +
            clipArea.polygons.reduce(
              (polygonCount, polygon) =>
                polygonCount + (polygon.interiors?.length ?? 0),
              0
            ),
          0
        ),
      0
    );
    const totalSourceFeatureCount = sourceFeatureCounts.reduce(
      (sum, count) => sum + count,
      0
    );

    this._geoTileStats = {
      ...this._geoTileStats,
      sourceTaskCount,
      compositeTaskCount: tasks.length,
      uniqueRawTileCount,
      sourceFeatureContributionCount: totalSourceFeatureCount,
      clipAreaCount,
      clipPolygonCount,
      interiorRingCount,
      maxSourceFeaturesPerComposite:
        sourceFeatureCounts.length > 0 ? Math.max(...sourceFeatureCounts) : 0,
      avgSourceFeaturesPerComposite:
        tasks.length > 0 ? totalSourceFeatureCount / tasks.length : 0,
      maxClipPolygonsPerComposite:
        clipPolygonCounts.length > 0 ? Math.max(...clipPolygonCounts) : 0,
      avgClipPolygonsPerComposite:
        tasks.length > 0 ? clipPolygonCount / tasks.length : 0,
      maxPolygonsPerComposite:
        clipPolygonCounts.length > 0 ? Math.max(...clipPolygonCounts) : 0,
      avgPolygonsPerComposite:
        tasks.length > 0 ? clipPolygonCount / tasks.length : 0,
      lastTaskCollectionMs: taskCollectionMs,
      statsSchemaVersion: GEO_TILE_STATS_SCHEMA_VERSION,
    };

    if (isDeepTimeGeoDebugEnabled()) {
      console.debug("[DeepTimeGeo] tile tasks", this._geoTileStats);
    }
  }

  private patchGeoTileStats(stats: Partial<GeoTileStats>) {
    this._geoTileStats = {
      ...this._geoTileStats,
      ...stats,
      statsSchemaVersion: GEO_TILE_STATS_SCHEMA_VERSION,
    };
  }

  private createTilePrimitives(
    tileId: string,
    tileInfo: Pick<NodeInfo, "tileXYL">,
    image: string | HTMLCanvasElement,
    modelMatrix = IDENTITY_MODEL_MATRIX,
    visible = true,
    transformMode = this._transformMode
  ) {
    const parentRectangle = this._provider.tilingScheme.tileXYToRectangle(
      tileInfo.tileXYL.x,
      tileInfo.tileXYL.y,
      tileInfo.tileXYL.l
    );
    const parts = subdivideRenderRectangle(
      parentRectangle,
      this._renderRectangleSubdivision
    );
    // All parts share one material, so the controlled experiment changes only
    // rectangle extent and Primitive topology, not retained image resources.
    const appearance = new EllipsoidSurfaceAppearance({
      flat: true,
      material: this.createImageMaterial(image),
      renderState: {
        depthTest: {
          enabled: false,
        },
      },
    });

    return parts.map((part, partIndex) => {
      const geometry =
        this._benchmarkObserver ||
        this._renderRectangleSubdivision.mode !== "none"
          ? new MeasuredRectangleGeometry({
              ellipsoid: this._provider.tilingScheme.ellipsoid,
              part,
              observer: this._benchmarkObserver,
            })
          : new RectangleGeometry({
              ellipsoid: this._provider.tilingScheme.ellipsoid,
              rectangle: part.rectangle,
            });
      const primitive = new Primitive({
        geometryInstances: new GeometryInstance({
          id: parts.length === 1 ? tileId : `${tileId}:part-${partIndex}`,
          modelMatrix:
            transformMode === "bakedInstance"
              ? modelMatrix
              : IDENTITY_MODEL_MATRIX,
          geometry,
        }),
        modelMatrix:
          transformMode === "dynamic3D" ? modelMatrix : IDENTITY_MODEL_MATRIX,
        // Synchronous creation is the behavior under test in Action 2.
        asynchronous: false,
        appearance,
      });
      primitive.show = visible;
      this._primitiveCreatedCount++;
      return primitive;
    });
  }

  private createImageMaterial(image: string | HTMLCanvasElement) {
    return new Material({
      fabric: {
        type: "Image",
        uniforms: {
          image,
        },
      },
    });
  }

  private createFineTileLoadResult(
    level: number,
    loadedCount: number,
    taskCount: number,
    skippedReason?: string
  ): ViewFineTileLoadResult {
    return {
      level,
      loadedCount,
      taskCount,
      skippedReason,
    };
  }

  private resolveFineTileViewRectangle(
    viewer: Viewer,
    options: ViewFineTileLoadOptions
  ) {
    return (
      options.viewRectangle ??
      viewer.camera.computeViewRectangle(this._provider.tilingScheme.ellipsoid)
    );
  }

  private getFineViewLevelBounds(options: ViewFineTileLoadOptions) {
    const providerMaxLevel =
      this._provider.maximumLevel ?? DEFAULT_VIEW_MAX_LEVEL;
    const minLevel = Math.max(0, normalizeInteger(options.minLevel ?? 0, 0));
    const configuredMaxLevel = normalizeInteger(
      options.maxLevel ?? providerMaxLevel,
      DEFAULT_VIEW_MAX_LEVEL
    );
    const maxLevel = Math.max(minLevel, configuredMaxLevel);

    return { minLevel, maxLevel };
  }

  private clampFineViewLevel(level: number, options: ViewFineTileLoadOptions) {
    const { minLevel, maxLevel } = this.getFineViewLevelBounds(options);
    return clampNumber(normalizeInteger(level, minLevel), minLevel, maxLevel);
  }

  private resolveFineViewLevel(
    viewer: Viewer,
    viewRectangle: Rectangle,
    options: ViewFineTileLoadOptions
  ) {
    const { minLevel, maxLevel } = this.getFineViewLevelBounds(options);
    const targetTileScreenSize = Math.max(
      1,
      options.targetTileScreenSize ?? DEFAULT_VIEW_TARGET_TILE_SCREEN_SIZE
    );
    const maxRawViewTileCount = Math.max(
      1,
      normalizeInteger(
        options.maxRawViewTileCount ?? DEFAULT_VIEW_MAX_RAW_TILE_COUNT,
        DEFAULT_VIEW_MAX_RAW_TILE_COUNT
      )
    );
    const metersPerPixel = this.estimateViewMetersPerPixel(
      viewer,
      viewRectangle
    );

    let resolvedLevel = minLevel;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let level = minLevel; level <= maxLevel; level++) {
      const tileMeters = this.estimateTileLongSideMetersAtLevel(
        viewRectangle,
        level
      );
      if (!Number.isFinite(tileMeters) || tileMeters <= 0) {
        continue;
      }

      const tileScreenSize = tileMeters / metersPerPixel;
      const score = Math.abs(Math.log(tileScreenSize / targetTileScreenSize));
      if (score < bestScore) {
        bestScore = score;
        resolvedLevel = level;
      }
    }

    while (
      resolvedLevel > minLevel &&
      this.estimateRawViewTileCount(viewRectangle, resolvedLevel) >
        maxRawViewTileCount
    ) {
      resolvedLevel--;
    }

    return resolvedLevel;
  }

  private estimateViewMetersPerPixel(viewer: Viewer, viewRectangle: Rectangle) {
    const canvas = viewer.scene.canvas;
    const canvasWidth = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const canvasHeight = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const center = Rectangle.center(viewRectangle);
    const widthMeters = this.measureLongitudeSpanMeters(
      center.longitude,
      center.latitude,
      Rectangle.computeWidth(viewRectangle)
    );
    const heightMeters = this.measureLatitudeSpanMeters(
      center.longitude,
      viewRectangle.south,
      viewRectangle.north
    );
    const metersPerPixel = Math.max(
      widthMeters / canvasWidth,
      heightMeters / canvasHeight
    );

    if (Number.isFinite(metersPerPixel) && metersPerPixel > 0) {
      return metersPerPixel;
    }

    const cameraHeight = Math.max(0, viewer.camera.positionCartographic.height);
    return Math.max(1, cameraHeight / Math.max(canvasWidth, canvasHeight));
  }

  private estimateTileLongSideMetersAtLevel(
    viewRectangle: Rectangle,
    level: number
  ) {
    const tilingScheme = this._provider.tilingScheme;
    const tilingRectangle = tilingScheme.rectangle;
    const viewCenter = Rectangle.center(viewRectangle);
    const center = new Cartographic(
      clampNumber(
        viewCenter.longitude,
        tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON
      ),
      clampNumber(
        viewCenter.latitude,
        tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON
      )
    );
    const tileXY = tilingScheme.positionToTileXY(center, level) as
      | { x: number; y: number }
      | undefined;
    if (!tileXY) {
      return 0;
    }

    const tileRectangle = tilingScheme.tileXYToRectangle(
      tileXY.x,
      tileXY.y,
      level
    );
    const tileCenter = Rectangle.center(tileRectangle);
    const widthMeters = this.measureLongitudeSpanMeters(
      tileCenter.longitude,
      tileCenter.latitude,
      Rectangle.computeWidth(tileRectangle)
    );
    const heightMeters = this.measureLatitudeSpanMeters(
      tileCenter.longitude,
      tileRectangle.south,
      tileRectangle.north
    );

    return Math.max(widthMeters, heightMeters);
  }

  private estimateRawViewTileCount(viewRectangle: Rectangle, level: number) {
    const tilingScheme = this._provider.tilingScheme;
    const tilingRectangle = tilingScheme.rectangle;
    const xTileCount = tilingScheme.getNumberOfXTilesAtLevel(level);
    const yTileCount = tilingScheme.getNumberOfYTilesAtLevel(level);
    const maxTileCount = xTileCount * yTileCount;
    const north = clampNumber(
      viewRectangle.north,
      tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON
    );
    const south = clampNumber(
      viewRectangle.south,
      tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON
    );
    if (north <= south) {
      return maxTileCount;
    }

    let totalTileCount = 0;
    this.getLongitudeSegments(viewRectangle).forEach((segment) => {
      const west = clampNumber(
        segment.west + RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON
      );
      const east = clampNumber(
        segment.east - RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
        tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON
      );
      if (east < west) {
        return;
      }

      const northwest = tilingScheme.positionToTileXY(
        new Cartographic(west, north),
        level
      ) as { x: number; y: number } | undefined;
      const southeast = tilingScheme.positionToTileXY(
        new Cartographic(east, south),
        level
      ) as { x: number; y: number } | undefined;
      if (!northwest || !southeast) {
        return;
      }

      totalTileCount +=
        (Math.abs(southeast.x - northwest.x) + 1) *
        (Math.abs(southeast.y - northwest.y) + 1);
    });

    if (totalTileCount > 0) {
      return Math.min(maxTileCount, totalTileCount);
    }

    const tilingWidth = Rectangle.computeWidth(tilingRectangle);
    const tilingHeight = Rectangle.computeHeight(tilingRectangle);
    const viewWidth = Math.min(
      Rectangle.computeWidth(viewRectangle),
      tilingWidth
    );
    const viewHeight = Math.min(
      Rectangle.computeHeight(viewRectangle),
      tilingHeight
    );
    const estimatedX = Math.ceil(viewWidth / (tilingWidth / xTileCount));
    const estimatedY = Math.ceil(viewHeight / (tilingHeight / yTileCount));
    return Math.min(maxTileCount, Math.max(1, estimatedX * estimatedY));
  }

  private getLongitudeSegments(viewRectangle: Rectangle) {
    const tilingRectangle = this._provider.tilingScheme.rectangle;
    const tilingWidth = Rectangle.computeWidth(tilingRectangle);
    if (Rectangle.computeWidth(viewRectangle) >= tilingWidth - 1e-9) {
      return [
        {
          west: tilingRectangle.west,
          east: tilingRectangle.east,
        },
      ];
    }

    if (viewRectangle.west <= viewRectangle.east) {
      return [
        {
          west: Math.max(viewRectangle.west, tilingRectangle.west),
          east: Math.min(viewRectangle.east, tilingRectangle.east),
        },
      ];
    }

    return [
      {
        west: Math.max(viewRectangle.west, tilingRectangle.west),
        east: tilingRectangle.east,
      },
      {
        west: tilingRectangle.west,
        east: Math.min(viewRectangle.east, tilingRectangle.east),
      },
    ];
  }

  private measureLongitudeSpanMeters(
    centerLongitude: number,
    latitude: number,
    longitudeWidth: number
  ) {
    const ellipsoid = this._provider.tilingScheme.ellipsoid;
    const width = Math.min(Math.abs(longitudeWidth), Math.PI * 2);
    if (width >= Math.PI * 2 - 1e-9) {
      return (
        Math.PI * 2 * ellipsoid.maximumRadius * Math.abs(Math.cos(latitude))
      );
    }

    const halfWidth = width / 2;
    return Cartesian3.distance(
      Cartesian3.fromRadians(
        centerLongitude - halfWidth,
        latitude,
        0,
        ellipsoid
      ),
      Cartesian3.fromRadians(
        centerLongitude + halfWidth,
        latitude,
        0,
        ellipsoid
      )
    );
  }

  private measureLatitudeSpanMeters(
    centerLongitude: number,
    south: number,
    north: number
  ) {
    const ellipsoid = this._provider.tilingScheme.ellipsoid;
    return Cartesian3.distance(
      Cartesian3.fromRadians(centerLongitude, south, 0, ellipsoid),
      Cartesian3.fromRadians(centerLongitude, north, 0, ellipsoid)
    );
  }

  private createViewBoundingSphereFromRectangle(viewRectangle: Rectangle) {
    const ellipsoid = this._provider.tilingScheme.ellipsoid;
    const centerCartographic = Rectangle.center(viewRectangle);
    const center = Cartesian3.fromRadians(
      centerCartographic.longitude,
      centerCartographic.latitude,
      0,
      ellipsoid
    );
    const samplePositions = Rectangle.subsample(viewRectangle, ellipsoid);
    const radius = samplePositions.reduce(
      (maxDistance, position) =>
        Math.max(maxDistance, Cartesian3.distance(center, position)),
      0
    );

    return new BoundingSphere(center, radius);
  }

  private async rotateBoundingSphereToModernCoordinates(
    boundingSphere: BoundingSphere,
    plateId: string,
    age: number
  ) {
    const modernCenter = await this.rotationOperator.rotatePointToModern(
      boundingSphere.center,
      plateId,
      age
    );

    return new BoundingSphere(
      modernCenter ?? Cartesian3.clone(boundingSphere.center),
      boundingSphere.radius
    );
  }

  private updateQuadTreeBoundingSpheres(plateMatrices: PlateMatrixEntry[]) {
    const matrixByPlate = new Map(
      plateMatrices.map(({ plateItem, modelMatrix }) => [
        plateItem.plateId,
        modelMatrix,
      ])
    );

    this.plates.forEach((plateItem) => {
      const modelMatrix =
        matrixByPlate.get(plateItem.plateId) ?? IDENTITY_MODEL_MATRIX;
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        polygonItem.quadTree.updateBoundingSpheres(modelMatrix);
      });
    });
  }

  private async getCachedModelMatrix(plateId: string, age: number) {
    const anchorKey = this.rotationOperator.anchorPlateId ?? "auto";
    const cacheKey = `${anchorKey}:${plateId}:${age}`;
    const cachedMatrix = this._rotationMatrixCache.get(cacheKey);
    if (cachedMatrix) {
      return cachedMatrix;
    }

    const modelMatrix = await this.rotationOperator.getRotateMatrix(
      plateId,
      age
    );
    const matrix4 = modelMatrix
      ? Matrix4.fromRotation(modelMatrix)
      : Matrix4.clone(Matrix4.IDENTITY);
    this._rotationMatrixCache.set(cacheKey, matrix4);
    return matrix4;
  }

  private async getPlateMatrixEntries(age: number) {
    return Promise.all(
      Array.from(this.plates.values()).map(async (plateItem) => ({
        plateItem,
        modelMatrix: await this.getCachedModelMatrix(plateItem.plateId, age),
      }))
    );
  }

  private async getPlateMatrixMapForRecords(
    records: TilePrimitiveRecord[],
    age: number
  ): Promise<PlateMatrixMap> {
    const plateIds = Array.from(
      new Set(records.map((record) => record.plateId))
    );
    const entries = await Promise.all(
      plateIds.map(
        async (plateId) =>
          [plateId, await this.getCachedModelMatrix(plateId, age)] as const
      )
    );
    return new Map(entries);
  }

  private getVisibleRecordsAtAge(age: number) {
    return this.getAllTilePrimitiveRecords().filter((tileRecord) =>
      this.isVisibleAtTime(tileRecord.time, age)
    );
  }

  private updateAgeRecordStats(age: number) {
    let visibleCount = 0;
    let hiddenCount = 0;

    this._compositeTileRecords.forEach((tileRecord) => {
      if (this.isVisibleAtTime(tileRecord.time, age)) {
        visibleCount++;
      } else {
        hiddenCount++;
      }
    });

    this.patchGeoTileStats({
      lastAgeVisibleRecordCount: visibleCount,
      lastAgeHiddenRecordCount: hiddenCount,
    });
  }

  private async rebuildLoadedPrimitives(
    viewer: Viewer,
    matrixByPlate: PlateMatrixMap,
    options: {
      age?: number;
      mode?: PrimitiveTransformMode;
      rebuildToken?: number;
      removeBeforeBuild: boolean;
    }
  ) {
    const rebuildToken = options.rebuildToken ?? ++this._primitiveRebuildToken;
    const mode = options.mode ?? this._transformMode;
    const age = options.age ?? this._currentAge;

    // Remove old primitives before 2D/CV morphs so Cesium never sees stale
    // non-identity model matrices during MORPHING frames.
    if (options.removeBeforeBuild) {
      this.removePrimitiveInstances(viewer);
    }

    if (
      rebuildToken !== this._primitiveRebuildToken ||
      mode !== this._transformMode ||
      age !== this._currentAge
    ) {
      return;
    }

    if (!options.removeBeforeBuild) {
      this.removePrimitiveInstances(viewer);
    }

    if (mode === "bakedInstance") {
      await this.rebuildBakedVisiblePrimitives(viewer, matrixByPlate, age, {
        rebuildToken,
        mode,
      });
      return;
    }

    this.patchGeoTileStats({
      last2DRebuildSkippedCount: 0,
    });

    let addedCount = 0;
    for (const tileRecord of this._compositeTileRecords.values()) {
      const visible = this.isVisibleAtTime(tileRecord.time, age);
      const modelMatrix = visible
        ? matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX
        : IDENTITY_MODEL_MATRIX;
      if (
        rebuildToken !== this._primitiveRebuildToken ||
        mode !== this._transformMode ||
        age !== this._currentAge
      ) {
        return;
      }

      const primitives = this.createTilePrimitives(
        tileRecord.tileId,
        tileRecord,
        tileRecord.imageAsset.source,
        modelMatrix,
        visible,
        mode
      );
      tileRecord.primitives = this.addTilePrimitivesToScene(
        viewer,
        tileRecord.plateId,
        primitives
      );

      addedCount += primitives.length;
      if (addedCount % this._primitiveBatchSize === 0) {
        viewer.scene.requestRender();
        await waitForNextFrame();
      }
    }

    if (addedCount > 0) {
      viewer.scene.requestRender();
    }
  }

  private async rebuildBakedVisiblePrimitives(
    viewer: Viewer,
    matrixByPlate: PlateMatrixMap,
    age: number,
    options: {
      rebuildToken: number;
      mode: PrimitiveTransformMode;
    }
  ) {
    const visibleRecords = this.getVisibleRecordsAtAge(age);
    const visibleRecordIds = new Set(
      visibleRecords.map((tileRecord) => tileRecord.tileId)
    );

    this.patchGeoTileStats({
      last2DRebuildSkippedCount:
        this._compositeTileRecords.size - visibleRecords.length,
    });

    // In baked mode, invisible records keep their cached image assets but do
    // not get geometry rebuilt for an age where they cannot be displayed.
    this._compositeTileRecords.forEach((tileRecord) => {
      if (!visibleRecordIds.has(tileRecord.tileId)) {
        tileRecord.primitives = [];
      }
    });

    let addedCount = 0;
    for (const tileRecord of visibleRecords) {
      const modelMatrix =
        matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
      if (
        options.rebuildToken !== this._primitiveRebuildToken ||
        options.mode !== this._transformMode ||
        age !== this._currentAge
      ) {
        return;
      }

      const primitives = this.createTilePrimitives(
        tileRecord.tileId,
        tileRecord,
        tileRecord.imageAsset.source,
        modelMatrix,
        false,
        options.mode
      );
      tileRecord.primitives = this.addTilePrimitivesToScene(
        viewer,
        tileRecord.plateId,
        primitives
      );

      addedCount += primitives.length;
      if (addedCount % this._primitiveBatchSize === 0) {
        await waitForNextFrame();
      }
    }

    const revealStart = now();
    visibleRecords.forEach((tileRecord) => {
      tileRecord.primitives.forEach((primitive) => {
        primitive.show = true;
      });
    });
    this.patchGeoTileStats({
      lastRevealMs: now() - revealStart,
    });

    this.requestRevealRender(viewer);
  }

  private removePrimitiveInstances(viewer: Viewer) {
    if (this._tileRootPrimitiveCollection) {
      this._platePrimitiveCollections.forEach((plateCollection) => {
        if (!plateCollection.isDestroyed()) {
          plateCollection.removeAll();
        }
      });
    }

    this.getAllTilePrimitiveRecords().forEach((tileRecord) => {
      this._primitiveRemovedCount += tileRecord.primitives.length;
      tileRecord.primitives.forEach((primitive) => {
        if (viewer.scene.primitives.contains(primitive)) {
          viewer.scene.primitives.remove(primitive);
        }
      });
      tileRecord.primitives = [];
    });
  }

  private isVisibleAtTime(time: PaleoData["time"], age: number) {
    return age <= time.begine && age >= time.end;
  }

  private getAllTilePrimitiveRecords() {
    return Array.from(this._compositeTileRecords.values());
  }

  private removeAllPrimitives(viewer: Viewer) {
    this.removeTilePrimitiveCollections(viewer);
    this._compositeTileRecords.forEach((tileRecord) => {
      this._primitiveRemovedCount += tileRecord.primitives.length;
      tileRecord.primitives = [];
      tileRecord.imageAsset.release();
    });
    this._compositeTileRecords.clear();
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        polygonItem.primitives = {};
      });
    });
  }

  private releaseAllTileAssets() {
    this.clearTilePrimitiveCollectionReferences();
    this._compositeTileRecords.forEach((tileRecord) => {
      tileRecord.primitives = [];
      tileRecord.imageAsset.release();
    });
    this._compositeTileRecords.clear();
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        polygonItem.primitives = {};
      });
    });
  }

  private getTilingSchemeKey() {
    const tilingScheme = this._provider.tilingScheme;
    return [
      tilingScheme.constructor.name,
      getEllipsoidKey(tilingScheme.ellipsoid),
    ].join(":");
  }
}

function getEllipsoidKey(ellipsoid: Ellipsoid) {
  const { x, y, z } = ellipsoid.radii;
  return `${x},${y},${z}`;
}

function comparePlateIds(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);

  if (leftIsNumeric && rightIsNumeric && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isDeepTimeGeoDebugEnabled() {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("deepTimeGeoDebug") === "1"
  );
}

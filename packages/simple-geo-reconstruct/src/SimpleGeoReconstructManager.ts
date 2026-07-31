import {
  BoundingSphere,
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
import { RotationOperator } from "plates-rotation-operator";
import { QuadTreeTileProcessor, type NodeInfo } from "polygon-tile-quadtree";
import type { CesiumTileProcessor, TileImageAsset } from "tile-processer-webgl";
import { loadFeaturePolygonDataWithDiagnostics } from "./gplates/index.js";
import {
  MeasuredRectangleGeometry,
  subdivideRenderRectangle,
  type RenderRectangleSubdivision,
  type SimpleGeoReconstructBenchmarkObserver,
} from "./renderRectangleSubdivision.js";
import { resolveFeatureFiles, resolveTileProcessor } from "./manager/options.js";
import {
  comparePlateIds,
  createFrameRenderScheduler,
  DEFAULT_PRIMITIVE_BATCH_SIZE,
  DEFAULT_TILE_REQUEST_CONCURRENCY,
  GEO_TILE_STATS_SCHEMA_VERSION,
  getEllipsoidKey,
  IDENTITY_MODEL_MATRIX,
  isDeepTimeGeoDebugEnabled,
  now,
  runStreamingWithConcurrency,
  TILE_GENERATION_REPORT_SCHEMA_VERSION,
  waitForNextFrame,
} from "./manager/runtime.js";
import type {
  CompositeTileTask,
  GeoTileStats,
  PaleoData,
  PlateMatrixEntry,
  PlateMatrixMap,
  PlateQuadTreeGroup,
  PolygonQuadTreeRecord,
  PrimitiveTransformMode,
  ResolvedFeatureFiles,
  SetPrimitiveTransformModeOptions,
  SimpleGeoReconstructManagerOptions,
  TileGenerationReport,
  TilePrimitiveRecord,
  TileTaskPartition,
  ViewFineTileLoadOptions,
  ViewFineTileLoadResult,
} from "./manager/types.js";
import {
  clampFineViewLevel,
  createFineTileLoadResult,
  createViewBoundingSphereFromRectangle,
  resolveFineTileViewRectangle,
  resolveFineViewLevel,
} from "./manager/viewLevel.js";

export type {
  FeatureSourceConfig,
  GeoTileStats,
  LegacyPaleoPolygon,
  LegacyPaleoPosition,
  LegacyPaleoValidTime,
  PaleoData,
  PaleoItem,
  PlateQuadTreeGroup,
  PolygonQuadTreeRecord,
  PrimitiveTransformMode,
  ResolvedFeatureFiles,
  SetPrimitiveTransformModeOptions,
  SimpleGeoReconstructManagerConstructorOptions,
  SimpleGeoReconstructManagerOptions,
  SimpleGeoReconstructManagerProcessorOptions,
  TileGenerationReport,
  TilePrimitiveRecord,
  ViewFineTileLoadOptions,
  ViewFineTileLoadResult,
  ViewFineTileLoadSkipReason,
} from "./manager/types.js";

/**
 * Coordinates GPlates feature loading, plate rotations, tile reprojection, and
 * Cesium primitive lifecycle management.
 *
 * Call init before loading tiles. The manager clears assets owned by generated
 * primitives, but the caller retains ownership of the injected tile processor
 * and must destroy that processor separately after destroying the manager.
 */
export class SimpleGeoReconstructManager {
  private _provider: ImageryProvider;
  /**
   * Tile processor used by this manager.
   * @deprecated Use processor. This misspelled property remains for compatibility.
   */
  processer: CesiumTileProcessor;
  /** Rotation data and plate-transform service used by this manager. */
  rotationOperator: RotationOperator;
  private _files: ResolvedFeatureFiles;
  private _referenceEllipsoid: Ellipsoid;
  /** Area features accepted by the reconstruction rendering path. */
  paleoData: PaleoData[] = [];
  /** All parsed features, including non-area features excluded from rendering. */
  allPaleoData: PaleoData[] = [];
  /** Mutable runtime records grouped first by plate ID and then by feature ID. */
  plates: Map<string, PlateQuadTreeGroup> = new Map<string, PlateQuadTreeGroup>();

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

  /**
   * Creates and initializes a ready manager in one asynchronous operation.
   * The caller still owns the supplied processor and Cesium viewer.
   */
  static async create(
    options: SimpleGeoReconstructManagerOptions,
  ): Promise<SimpleGeoReconstructManager> {
    const manager = new SimpleGeoReconstructManager(options);
    await manager.init();
    return manager;
  }

  /** Creates an uninitialized manager. Call init before requesting tiles. */
  constructor(data: SimpleGeoReconstructManagerOptions) {
    this._provider = data.provider;
    this.processer = resolveTileProcessor(data);
    this._files = resolveFeatureFiles(data);
    this._referenceEllipsoid = data.referenceEllipsoid ?? data.provider.tilingScheme.ellipsoid;
    this.rotationOperator = new RotationOperator({
      anchorPlateId: data.anchorPlateId,
      referenceEllipsoid: this._referenceEllipsoid,
    });
    this._currentAge = data.initialAge ?? 0;
    this._transformMode = data.primitiveTransformMode ?? "dynamic3D";
    this._tileRequestConcurrency = data.tileRequestConcurrency ?? DEFAULT_TILE_REQUEST_CONCURRENCY;
    this._primitiveBatchSize = data.primitiveBatchSize ?? DEFAULT_PRIMITIVE_BATCH_SIZE;
    this._renderRectangleSubdivision = data.renderRectangleSubdivision ?? {
      mode: "none",
    };
    this._benchmarkObserver = data.benchmarkObserver;
  }

  /** Preferred, correctly spelled access to the injected tile processor. */
  get processor() {
    return this.processer;
  }

  /** Whether feature and rotation sources have finished initializing. */
  get ready() {
    return this._ready;
  }

  /** Ellipsoid shared by the provider, rotations, and generated geometry. */
  get referenceEllipsoid() {
    return this._referenceEllipsoid;
  }

  /**
   * Returns a snapshot of current tile, primitive, cache, and import metrics.
   * @deprecated Use getStats.
   */
  getGeoTileStats(): GeoTileStats {
    const records = Array.from(this._compositeTileRecords.values());
    const primitives = records.flatMap((record) => record.primitives);
    const retainedAssets = new Set(records.map((record) => record.imageAsset));
    const estimatedTextureRgbaBytes = Array.from(retainedAssets).reduce(
      (total, asset) => total + asset.width * asset.height * 4,
      0,
    );

    return {
      ...this._geoTileStats,
      loadedCompositeTileCount: this._compositeTileRecords.size,
      pendingCompositeTileCount: this._pendingTileTokens.size,
      primitiveCount: primitives.length,
      readyPrimitiveCount: primitives.filter((primitive) => primitive.ready).length,
      shownPrimitiveCount: primitives.filter((primitive) => primitive.show).length,
      primitiveCreatedCount: this._primitiveCreatedCount,
      primitiveRemovedCount: this._primitiveRemovedCount,
      retainedImageAssetCount: retainedAssets.size,
      estimatedTextureRgbaBytes,
      renderRectanglePartCount: primitives.length,
    };
  }

  /** Returns a snapshot of current tile, primitive, cache, and import metrics. */
  getStats() {
    return this.getGeoTileStats();
  }

  /** Returns a defensive copy of the most recent tile-generation report. */
  getLastGenerationReport(): TileGenerationReport | null {
    if (!this._lastGenerationReport) {
      return null;
    }
    return {
      ...this._lastGenerationReport,
      foregroundProcessorStats: this._lastGenerationReport.foregroundProcessorStats
        ? { ...this._lastGenerationReport.foregroundProcessorStats }
        : null,
    };
  }

  /** Loads and normalizes one feature source using this manager's import mode. */
  async getPaleoDataFlatten(url: string) {
    return loadFeaturePolygonDataWithDiagnostics(url, {
      polygonRenderIntent: this._files.polygonRenderIntent,
    });
  }

  /**
   * Loads feature and ROT sources and builds the per-feature quadtrees.
   * Call this exactly once before requesting tiles, or call it again to reload
   * the configured sources after clearing rendered content.
   */
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
    this.paleoData = loadResult.items.filter((item) => item.renderIntent === "area");
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
        quadTree: new QuadTreeTileProcessor(this._provider.tilingScheme, item.clipArea),
        primitives: {},
      });
    });

    await this.rotationOperator.init(this._files.rots);
    this._ready = true;
  }

  /**
   * Generates every relevant tile at an explicit imagery level.
   * @deprecated Use loadTilesOnLevel.
   */
  async generateTilePrimitivesOnLevelN(viewer: Viewer, level: number) {
    if (!this._ready) {
      return;
    }
    await this.executeTileGeneration(viewer, this.collectTileTasks("level", level));
  }

  /** Loads every relevant tile at an explicit imagery level. */
  async loadTilesOnLevel(viewer: Viewer, level: number) {
    return this.generateTilePrimitivesOnLevelN(viewer, level);
  }

  /**
   * Loads fine tiles intersecting the current or supplied view rectangle.
   * When no level is supplied, a level is selected from the projected tile size.
   */
  async loadFineTilesInView(
    viewer: Viewer,
    options?: ViewFineTileLoadOptions,
  ): Promise<ViewFineTileLoadResult>;
  async loadFineTilesInView(
    viewer: Viewer,
    level: number,
    options?: ViewFineTileLoadOptions,
  ): Promise<ViewFineTileLoadResult>;
  async loadFineTilesInView(
    viewer: Viewer,
    levelOrOptions: number | ViewFineTileLoadOptions = {},
    options: ViewFineTileLoadOptions = {},
  ): Promise<ViewFineTileLoadResult> {
    if (typeof levelOrOptions === "number") {
      return this.loadFineTilesInViewAtLevel(viewer, levelOrOptions, options);
    }

    const resolvedOptions = levelOrOptions;
    const viewRectangle = resolveFineTileViewRectangle(viewer, this._provider, resolvedOptions);
    if (!viewRectangle) {
      return createFineTileLoadResult(-1, 0, 0, "no-view-rectangle");
    }

    const level = resolveFineViewLevel(viewer, this._provider, viewRectangle, resolvedOptions);
    return this.loadTilesInViewAtResolvedLevel(viewer, level, viewRectangle, resolvedOptions);
  }

  /** Loads view-intersecting tiles at an explicit, clamped imagery level. */
  async loadFineTilesInViewAtLevel(
    viewer: Viewer,
    level: number,
    options: ViewFineTileLoadOptions = {},
  ): Promise<ViewFineTileLoadResult> {
    const viewRectangle = resolveFineTileViewRectangle(viewer, this._provider, options);
    if (!viewRectangle) {
      return createFineTileLoadResult(-1, 0, 0, "no-view-rectangle");
    }

    return this.loadTilesInViewAtResolvedLevel(
      viewer,
      clampFineViewLevel(level, this._provider, options),
      viewRectangle,
      options,
    );
  }

  private async loadTilesInViewAtResolvedLevel(
    viewer: Viewer,
    level: number,
    viewRectangle: Rectangle,
    options: ViewFineTileLoadOptions,
  ): Promise<ViewFineTileLoadResult> {
    if (!this._ready) {
      return createFineTileLoadResult(level, 0, 0, "not-ready");
    }

    const usingCurrentAge = options.age === undefined;
    const age = options.age ?? this._currentAge;
    const viewBoundingSphere = createViewBoundingSphereFromRectangle(this._provider, viewRectangle);
    const plateMatrices = await this.getPlateMatrixEntries(age);
    if (usingCurrentAge && age !== this._currentAge) {
      return createFineTileLoadResult(level, 0, 0, "stale-age");
    }

    this.updateQuadTreeBoundingSpheres(plateMatrices);
    const tasks = await this.collectFineTileTasksInView(level, viewBoundingSphere, age);
    if (usingCurrentAge && age !== this._currentAge) {
      return createFineTileLoadResult(level, 0, tasks.length, "stale-age");
    }

    const loadedCount = await this.executeTileGeneration(viewer, tasks);
    return createFineTileLoadResult(level, loadedCount, tasks.length);
  }

  /**
   * Generates the adaptive root tiles for every feature.
   * @deprecated Use loadTilesAtRoot.
   */
  async generateTilePrimitivesAtRoot(viewer: Viewer) {
    if (!this._ready) {
      return;
    }
    await this.executeTileGeneration(viewer, this.collectTileTasks("root"));
  }

  /** Loads the adaptive root tiles for every feature. */
  async loadTilesAtRoot(viewer: Viewer) {
    return this.generateTilePrimitivesAtRoot(viewer);
  }

  /**
   * Updates primitive visibility and transforms for a geological age in Ma.
   * @deprecated Use setAge.
   */
  async updateAge(age: number) {
    if (!this._ready) {
      return;
    }

    this._currentAge = age;
    const updateToken = ++this._ageUpdateToken;
    const visibleRecords = this.getVisibleRecordsAtAge(age);
    const matrixByPlate = await this.getPlateMatrixMapForRecords(visibleRecords, age);
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

  /** Updates primitive visibility and transforms for a geological age in Ma. */
  async setAge(age: number) {
    return this.updateAge(age);
  }

  /**
   * Keeps primitive transform mode synchronized with Cesium scene-mode changes.
   * Returns the listener cleanup callback; destroy also removes this binding.
   */
  bindSceneModeSync(viewer: Viewer) {
    this.unbindSceneModeSync();
    this._boundViewer = viewer;

    const removeMorphStart = viewer.scene.morphStart.addEventListener(
      (_transitioner: unknown, _previousMode: SceneMode, targetMode: SceneMode) => {
        if (targetMode !== SceneMode.SCENE3D) {
          void this.setPrimitiveTransformMode(viewer, "bakedInstance", {
            removeBeforeBuild: true,
          });
        }
      },
    );
    const removeMorphComplete = viewer.scene.morphComplete.addEventListener(
      (_transitioner: unknown, _previousMode: SceneMode, targetMode: SceneMode) => {
        void this.setPrimitiveTransformMode(
          viewer,
          targetMode === SceneMode.SCENE3D ? "dynamic3D" : "bakedInstance",
          {
            removeBeforeBuild: false,
          },
        );
      },
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

  /** Removes listeners installed by bindSceneModeSync. */
  unbindSceneModeSync() {
    this._sceneModeCleanup?.();
    this._sceneModeCleanup = null;
  }

  /** Immediately selects the transform strategy required by the viewer mode. */
  async syncPrimitiveTransformMode(viewer: Viewer) {
    return this.setPrimitiveTransformMode(
      viewer,
      viewer.scene.mode === SceneMode.SCENE3D ? "dynamic3D" : "bakedInstance",
      {
        removeBeforeBuild: viewer.scene.mode !== SceneMode.SCENE3D,
      },
    );
  }

  /** Rebuilds loaded primitives using the requested transform strategy. */
  async setPrimitiveTransformMode(
    viewer: Viewer,
    mode: PrimitiveTransformMode,
    options: SetPrimitiveTransformModeOptions = {},
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
    const matrixByPlate = await this.getPlateMatrixMapForRecords(visibleRecords, age);
    this.updateAgeRecordStats(age);
    await this.rebuildLoadedPrimitives(viewer, matrixByPlate, {
      age,
      mode,
      rebuildToken,
      removeBeforeBuild: false,
    });
  }

  private getOrCreateTileRootPrimitiveCollection(viewer: Viewer): PrimitiveCollection {
    if (
      this._tileRootPrimitiveCollection &&
      viewer.scene.primitives.contains(this._tileRootPrimitiveCollection)
    ) {
      return this._tileRootPrimitiveCollection;
    }

    this._platePrimitiveCollections.clear();
    const rootCollection = viewer.scene.primitives.add(
      new PrimitiveCollection(),
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
    const sortedExistingPlateIds = Array.from(this._platePrimitiveCollections.keys()).sort(
      comparePlateIds,
    );
    const insertIndex = sortedExistingPlateIds.findIndex(
      (existingPlateId) => comparePlateIds(plateId, existingPlateId) < 0,
    );
    const plateCollection = new PrimitiveCollection();
    rootCollection.add(
      plateCollection,
      insertIndex === -1 ? sortedExistingPlateIds.length : insertIndex,
    );
    this._platePrimitiveCollections.set(plateId, plateCollection);
    return plateCollection;
  }

  private addTilePrimitiveToScene(viewer: Viewer, plateId: string, primitive: Primitive) {
    return this.getOrCreatePlatePrimitiveCollection(viewer, plateId).add(primitive) as Primitive;
  }

  private addTilePrimitivesToScene(viewer: Viewer, plateId: string, primitives: Primitive[]) {
    return primitives.map((primitive) => this.addTilePrimitiveToScene(viewer, plateId, primitive));
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

  private applyDynamicVisibilityAndMatrices(matrixByPlate: PlateMatrixMap, age: number) {
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

      const modelMatrix = matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
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

  private async revealLoadedPrimitivesForAge(viewer: Viewer, age: number, generationToken: number) {
    const revealStart = now();
    const visibleRecords = this.getVisibleRecordsAtAge(age).filter(
      (tileRecord) => tileRecord.primitives.length > 0,
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

  /**
   * Replaces the imagery provider and invalidates provider-specific tile state.
   * @deprecated Use setProvider.
   */
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

  /** Replaces the imagery provider and clears provider-specific rendered tiles. */
  async setProvider(viewer: Viewer, provider: ImageryProvider) {
    return this.updateProvider(viewer, provider);
  }

  /**
   * Removes generated primitives and clears tile processor caches.
   * @deprecated Use clear.
   */
  clearAllTiles(viewer: Viewer) {
    this._boundViewer = viewer;
    this._generationToken++;
    this._primitiveRebuildToken++;
    this._pendingTileTokens.clear();
    this.processer.clearBuffer();
    this.removeAllPrimitives(viewer);
    viewer.scene.requestRender();
  }

  /** Clears generated primitives while keeping feature and rotation data ready. */
  clear(viewer: Viewer) {
    this.clearAllTiles(viewer);
  }

  /**
   * Releases manager-owned listeners, primitive references, and image assets.
   * This does not destroy the injected processor or viewer; their owner must do
   * so after this method returns. Pass the viewer when it was not previously bound.
   */
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
          if (this.appendCompositeTileTask(taskMap, uniqueRawTileIds, polygonItem, tileInfo)) {
            sourceTaskCount++;
          }
        });
      });
    });

    const tasks = Array.from(taskMap.values());
    this.updateGeoTileStats(tasks, sourceTaskCount, uniqueRawTileIds.size, now() - collectionStart);
    this._benchmarkObserver?.onStageOperation("task-gen", collectionStart, now());
    return tasks;
  }

  private async collectFineTileTasksInView(
    level: number,
    viewBoundingSphere: BoundingSphere,
    age: number,
  ) {
    const collectionStart = now();
    const taskMap = new Map<string, CompositeTileTask>();
    const uniqueRawTileIds = new Set<string>();
    let sourceTaskCount = 0;

    for (const plateItem of this.plates.values()) {
      let modernViewBoundingSphere: BoundingSphere | null = null;

      for (const polygonItem of plateItem.polygonQuadTrees.values()) {
        if (!polygonItem.quadTree.intersectsCurrentBoundingSphere(viewBoundingSphere)) {
          continue;
        }

        if (!modernViewBoundingSphere) {
          modernViewBoundingSphere = await this.rotateBoundingSphereToModernCoordinates(
            viewBoundingSphere,
            plateItem.plateId,
            age,
          );
        }

        const tiles: NodeInfo[] = [];
        polygonItem.quadTree.findTilesByLevelInBoundingSphere(
          level,
          modernViewBoundingSphere,
          tiles,
        );
        tiles.forEach((tileInfo) => {
          if (this.appendCompositeTileTask(taskMap, uniqueRawTileIds, polygonItem, tileInfo)) {
            sourceTaskCount++;
          }
        });
      }
    }

    const tasks = Array.from(taskMap.values());
    this.updateGeoTileStats(tasks, sourceTaskCount, uniqueRawTileIds.size, now() - collectionStart);
    this._benchmarkObserver?.onStageOperation("task-gen", collectionStart, now());
    return tasks;
  }

  private appendCompositeTileTask(
    taskMap: Map<string, CompositeTileTask>,
    uniqueRawTileIds: Set<string>,
    polygonItem: PolygonQuadTreeRecord,
    tileInfo: NodeInfo,
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

  private partitionTasksByAge(tasks: CompositeTileTask[], age: number): TileTaskPartition {
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

  private async executeTileGeneration(viewer: Viewer, tasks: CompositeTileTask[]) {
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
    const { currentVisibleTasks, prewarmTasks } = this.partitionTasksByAge(tasks, loadAge);
    const scheduleRender = createFrameRenderScheduler(
      viewer,
      () => generationToken === this._generationToken,
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
      createAgeSpecificPrimitive: boolean,
    ) => {
      let loadedCount = 0;
      await runStreamingWithConcurrency(phaseTasks, this._tileRequestConcurrency, async (task) => {
        let imageAsset: TileImageAsset | null = null;
        let outcome: "completed" | "failed" | "cancelled" = "failed";
        try {
          if (generationToken !== this._generationToken) {
            outcome = "cancelled";
            return;
          }

          imageAsset = await this.getReprojectedTileImageAsset(task, provider);
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
                this._transformMode,
              ),
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
      });
      return loadedCount;
    };

    const visibleLoadedCount = await processTasks(currentVisibleTasks, "currentVisible", true);
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
    } else if (addedPrimitiveCount > 0 && generationToken === this._generationToken) {
      viewer.scene.requestRender();
    }

    return visibleLoadedCount;
  }

  private async getReprojectedTileImageAsset(
    tile: Pick<TilePrimitiveRecord, "tileXYL" | "clipAreas" | "coversFullTile">,
    provider: ImageryProvider,
  ): Promise<TileImageAsset | null> {
    if (!tile.coversFullTile && tile.clipAreas.length > 0) {
      return this.processer.reprojectMultiClippedTileAreaImage(
        tile.tileXYL.x,
        tile.tileXYL.y,
        tile.tileXYL.l,
        tile.clipAreas,
        provider,
      );
    }
    return this.processer.reprojectTileImage(
      tile.tileXYL.x,
      tile.tileXYL.y,
      tile.tileXYL.l,
      provider,
    );
  }

  private getTilesForPolygon(
    polygonItem: PolygonQuadTreeRecord,
    mode: "level" | "root",
    level?: number,
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

  private getCompositeTileId(info: PaleoData, tileInfo: Pick<NodeInfo, "tileXYL">) {
    return [info.plateId, info.time.begine, info.time.end, this.getRawTileId(tileInfo)].join(":");
  }

  private getRawTileId(tileInfo: Pick<NodeInfo, "tileXYL">) {
    return `${tileInfo.tileXYL.x}/${tileInfo.tileXYL.y}/${tileInfo.tileXYL.l}`;
  }

  private updateGeoTileStats(
    tasks: CompositeTileTask[],
    sourceTaskCount: number,
    uniqueRawTileCount: number,
    taskCollectionMs: number,
  ) {
    const sourceFeatureCounts = tasks.map((task) => task.sourceFeatureIds.length);
    const clipPolygonCounts = tasks.map((task) =>
      task.clipAreas.reduce((count, clipArea) => count + clipArea.polygons.length, 0),
    );
    const clipAreaCount = tasks.reduce((count, task) => count + task.clipAreas.length, 0);
    const clipPolygonCount = clipPolygonCounts.reduce((count, taskCount) => count + taskCount, 0);
    const interiorRingCount = tasks.reduce(
      (count, task) =>
        count +
        task.clipAreas.reduce(
          (areaCount, clipArea) =>
            areaCount +
            clipArea.polygons.reduce(
              (polygonCount, polygon) => polygonCount + (polygon.interiors?.length ?? 0),
              0,
            ),
          0,
        ),
      0,
    );
    const totalSourceFeatureCount = sourceFeatureCounts.reduce((sum, count) => sum + count, 0);

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
      avgSourceFeaturesPerComposite: tasks.length > 0 ? totalSourceFeatureCount / tasks.length : 0,
      maxClipPolygonsPerComposite:
        clipPolygonCounts.length > 0 ? Math.max(...clipPolygonCounts) : 0,
      avgClipPolygonsPerComposite: tasks.length > 0 ? clipPolygonCount / tasks.length : 0,
      maxPolygonsPerComposite: clipPolygonCounts.length > 0 ? Math.max(...clipPolygonCounts) : 0,
      avgPolygonsPerComposite: tasks.length > 0 ? clipPolygonCount / tasks.length : 0,
      lastTaskCollectionMs: taskCollectionMs,
      statsSchemaVersion: GEO_TILE_STATS_SCHEMA_VERSION,
    };

    if (isDeepTimeGeoDebugEnabled()) {
      // eslint-disable-next-line no-console -- Explicitly enabled import diagnostics.
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
    transformMode = this._transformMode,
  ) {
    const parentRectangle = this._provider.tilingScheme.tileXYToRectangle(
      tileInfo.tileXYL.x,
      tileInfo.tileXYL.y,
      tileInfo.tileXYL.l,
    );
    const parts = subdivideRenderRectangle(parentRectangle, this._renderRectangleSubdivision);
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
        this._benchmarkObserver || this._renderRectangleSubdivision.mode !== "none"
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
          modelMatrix: transformMode === "bakedInstance" ? modelMatrix : IDENTITY_MODEL_MATRIX,
          geometry,
        }),
        modelMatrix: transformMode === "dynamic3D" ? modelMatrix : IDENTITY_MODEL_MATRIX,
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

  private async rotateBoundingSphereToModernCoordinates(
    boundingSphere: BoundingSphere,
    plateId: string,
    age: number,
  ) {
    const modernCenter = await this.rotationOperator.rotatePointToModern(
      boundingSphere.center,
      plateId,
      age,
    );

    return new BoundingSphere(
      modernCenter ?? Cartesian3.clone(boundingSphere.center),
      boundingSphere.radius,
    );
  }

  private updateQuadTreeBoundingSpheres(plateMatrices: PlateMatrixEntry[]) {
    const matrixByPlate = new Map(
      plateMatrices.map(({ plateItem, modelMatrix }) => [plateItem.plateId, modelMatrix]),
    );

    this.plates.forEach((plateItem) => {
      const modelMatrix = matrixByPlate.get(plateItem.plateId) ?? IDENTITY_MODEL_MATRIX;
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

    const modelMatrix = await this.rotationOperator.getRotateMatrix(plateId, age);
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
      })),
    );
  }

  private async getPlateMatrixMapForRecords(
    records: TilePrimitiveRecord[],
    age: number,
  ): Promise<PlateMatrixMap> {
    const plateIds = Array.from(new Set(records.map((record) => record.plateId)));
    const entries = await Promise.all(
      plateIds.map(
        async (plateId) => [plateId, await this.getCachedModelMatrix(plateId, age)] as const,
      ),
    );
    return new Map(entries);
  }

  private getVisibleRecordsAtAge(age: number) {
    return this.getAllTilePrimitiveRecords().filter((tileRecord) =>
      this.isVisibleAtTime(tileRecord.time, age),
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
    },
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
        ? (matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX)
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
        mode,
      );
      tileRecord.primitives = this.addTilePrimitivesToScene(viewer, tileRecord.plateId, primitives);

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
    },
  ) {
    const visibleRecords = this.getVisibleRecordsAtAge(age);
    const visibleRecordIds = new Set(visibleRecords.map((tileRecord) => tileRecord.tileId));

    this.patchGeoTileStats({
      last2DRebuildSkippedCount: this._compositeTileRecords.size - visibleRecords.length,
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
      const modelMatrix = matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
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
        options.mode,
      );
      tileRecord.primitives = this.addTilePrimitivesToScene(viewer, tileRecord.plateId, primitives);

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
    return [tilingScheme.constructor.name, getEllipsoidKey(tilingScheme.ellipsoid)].join(":");
  }
}

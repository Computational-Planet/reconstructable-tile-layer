import {
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  ImageryProvider,
  Material,
  Matrix4,
  Primitive,
  RectangleGeometry,
  SceneMode,
  Viewer,
} from "cesium";
import { RotationOperator } from "plates-rotation-operator";
import {
  NodeInfo,
  QuadTreeTileProcesser,
  type TileClipArea,
} from "polygon-tile-quadtree";
import { CesiumTileProcesser, type TileImageAsset } from "tile-processer-webgl";
import {
  loadFeaturePolygonDataWithDiagnostics,
  type FeatureImportDiagnostics,
  type PolygonRenderIntentMode,
  type RenderIntent,
} from "./gplates";

const TILE_REQUEST_CONCURRENCY = 64;
const PRIMITIVE_BATCH_SIZE = 32;
const GEO_TILE_STATS_SCHEMA_VERSION = 1;
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

function createFrameRenderScheduler(
  viewer: Viewer,
  isCurrent: () => boolean
) {
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
  /** 要素类型，scotese */
  FeatureType: string;
  /** 要素ID */
  FeatureID: string;
  /** 板块ID */
  PlateID: string;
  /** 要素存活时间 */
  ValidTime: ValidTime;
  /** 板块的polygon信息 */
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
  featureId: string; // 要素id（从文件获取）
  plateId: string; // 板块id（从文件获取）
  lonlats: number[];
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
  primitive: Primitive | null;
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

type GeoTileStats = {
  statsSchemaVersion: number;
  sourceTaskCount: number;
  compositeTaskCount: number;
  uniqueRawTileCount: number;
  maxPolygonsPerComposite: number;
  avgPolygonsPerComposite: number;
  importDiagnostics?: FeatureImportDiagnostics;
};

type PrimitiveTransformMode = "dynamic3D" | "bakedInstance";

type PlateMatrixEntry = {
  plateItem: PlateQuadTreeGroup;
  modelMatrix: Matrix4;
};

export type PlateQuadTreeGroup = {
  plateId: string;
  polygonQuadTrees: Map<string, PolygonQuadTreeRecord>;
};

export interface SimpleGeoReconstructManagerConstructorOptions {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  files: {
    polygonRenderIntent?: PolygonRenderIntentMode;
    polygon: string; // 多边形的路径
    rots: string[];
  };
}

export class SimpleGeoReconstructManager {
  private _provider: ImageryProvider;
  processer: CesiumTileProcesser;
  rotationOperator: RotationOperator = new RotationOperator();
  private _files: {
    polygonRenderIntent?: PolygonRenderIntentMode;
    polygon: string; // 多边形的路径
    rots: string[];
  };
  paleoData: PaleoData[] = [];
  allPaleoData: PaleoData[] = [];
  // key为plateID，其内部的Map中key为featureID
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
    maxPolygonsPerComposite: 0,
    avgPolygonsPerComposite: 0,
    importDiagnostics: undefined,
  };
  private _generationToken = 0;
  private _ageUpdateToken = 0;
  private _primitiveRebuildToken = 0;
  private _pendingTileTokens = new Map<string, number>();
  private _currentAge = 0;
  private _transformMode: PrimitiveTransformMode = "dynamic3D";
  private _boundViewer: Viewer | null = null;
  private _sceneModeCleanup: (() => void) | null = null;

  constructor(data: SimpleGeoReconstructManagerConstructorOptions) {
    this._provider = data.provider;
    this.processer = data.processer;
    this._files = data.files;
  }

  get ready() {
    return this._ready;
  }

  getGeoTileStats() {
    return {
      ...this._geoTileStats,
      loadedCompositeTileCount: this._compositeTileRecords.size,
      pendingCompositeTileCount: this._pendingTileTokens.size,
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

  async generateTilePrimitivesAtRoot(viewer: Viewer) {
    if (!this._ready) {
      return;
    }
    await this.executeTileGeneration(viewer, this.collectTileTasks("root"));
  }

  async updateAge(age: number) {
    if (!this._ready) {
      return;
    }

    this._currentAge = age;
    const updateToken = ++this._ageUpdateToken;
    const plateMatrices = await this.getPlateMatrixEntries(age);
    if (updateToken !== this._ageUpdateToken) {
      return;
    }

    if (this._transformMode === "bakedInstance") {
      if (this._boundViewer) {
        await this.rebuildLoadedPrimitives(this._boundViewer, plateMatrices, {
          removeBeforeBuild: false,
        });
      }
      return;
    }

    this.applyDynamicPrimitiveMatrices(plateMatrices, age);
  }

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
      }
    );
    const removeMorphComplete = viewer.scene.morphComplete.addEventListener(
      (_transitioner: unknown, _previousMode: SceneMode, targetMode: SceneMode) => {
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

    const plateMatrices = await this.getPlateMatrixEntries(age);
    await this.rebuildLoadedPrimitives(viewer, plateMatrices, {
      age,
      mode,
      rebuildToken,
      removeBeforeBuild: false,
    });
  }

  private applyDynamicPrimitiveMatrices(
    plateMatrices: PlateMatrixEntry[],
    age: number
  ) {
    const matrixByPlate = new Map(
      plateMatrices.map(({ plateItem, modelMatrix }) => [
        plateItem.plateId,
        modelMatrix,
      ])
    );

    this._compositeTileRecords.forEach((tileRecord) => {
      if (!tileRecord.primitive) {
        return;
      }
      tileRecord.primitive.modelMatrix =
        matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
      tileRecord.primitive.show = this.isVisibleAtTime(tileRecord.time, age);
    });
  }

  async updateProvider(viewer: Viewer, provider: ImageryProvider) {
    if (!this._ready) {
      return;
    }

    this._boundViewer = viewer;
    const sameTilingScheme = this.isSameTilingSchemeType(
      this._provider,
      provider
    );
    this._provider = provider;
    const updateToken = ++this._generationToken;
    this._pendingTileTokens.clear();
    this.processer.clearBuffer();

    if (!sameTilingScheme) {
      this.plates.forEach((plateItem) => {
        plateItem.polygonQuadTrees.forEach((polygonItem) => {
          polygonItem.quadTree.updateProvider(provider);
        });
      });
      this._tileListCache.clear();
      this.removeAllPrimitives(viewer);
      viewer.scene.requestRender();
      return;
    }

    await this.refreshPrimitiveMaterials(viewer, provider, updateToken);
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

  private collectTileTasks(mode: "level" | "root", level?: number) {
    const taskMap = new Map<string, CompositeTileTask>();
    const uniqueRawTileIds = new Set<string>();
    let sourceTaskCount = 0;

    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        const tiles = this.getTilesForPolygon(polygonItem, mode, level);
        tiles.forEach((tileInfo) => {
          const tileId = this.getCompositeTileId(polygonItem.info, tileInfo);
          const pendingTask = taskMap.get(tileId);
          if (
            this._compositeTileRecords.has(tileId) ||
            this._pendingTileTokens.has(tileId) ||
            pendingTask?.sourceFeatureIds.includes(polygonItem.info.featureId)
          ) {
            return;
          }

          sourceTaskCount++;
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
        });
      });
    });

    const tasks = Array.from(taskMap.values());
    this.updateGeoTileStats(tasks, sourceTaskCount, uniqueRawTileIds.size);
    return tasks;
  }

  private async executeTileGeneration(viewer: Viewer, tasks: CompositeTileTask[]) {
    if (tasks.length === 0) {
      return;
    }

    this._boundViewer = viewer;
    const generationToken = ++this._generationToken;
    const scheduleRender = createFrameRenderScheduler(
      viewer,
      () => generationToken === this._generationToken
    );
    let addedCount = 0;

    tasks.forEach((task) => {
      this._pendingTileTokens.set(task.tileId, generationToken);
    });

    await runStreamingWithConcurrency(
      tasks,
      TILE_REQUEST_CONCURRENCY,
      async (task) => {
        let imageAsset: TileImageAsset | null = null;
        try {
          if (generationToken !== this._generationToken) {
            return;
          }

          imageAsset = await this.getReprojectedTileImageAsset(
            task,
            this._provider
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
            return;
          }

          const modelMatrix = await this.getCachedModelMatrix(
            task.plateId,
            this._currentAge
          );
          if (generationToken !== this._generationToken) {
            imageAsset.release();
            imageAsset = null;
            return;
          }

          const primitive = viewer.scene.primitives.add(
            this.createTilePrimitive(
              task.tileId,
              task,
              imageAsset.source,
              modelMatrix,
              this.isVisibleAtTime(task.time, this._currentAge),
              this._transformMode
            )
          );
          this._compositeTileRecords.set(task.tileId, {
            tileId: task.tileId,
            imageAsset,
            primitive,
            tileXYL: task.tileXYL,
            clipAreas: task.clipAreas,
            coversFullTile: task.coversFullTile,
            sourceFeatureIds: task.sourceFeatureIds,
            plateId: task.plateId,
            time: task.time,
          });
          imageAsset = null;

          addedCount++;
          if (addedCount % PRIMITIVE_BATCH_SIZE === 0) {
            viewer.scene.requestRender();
          } else {
            scheduleRender();
          }
        } catch (error) {
          imageAsset?.release();
          console.warn("Failed to create tile primitive.", error);
        } finally {
          if (this._pendingTileTokens.get(task.tileId) === generationToken) {
            this._pendingTileTokens.delete(task.tileId);
          }
        }
      }
    );

    if (addedCount > 0 && generationToken === this._generationToken) {
      viewer.scene.requestRender();
    }
  }

  private async refreshPrimitiveMaterials(
    viewer: Viewer,
    provider: ImageryProvider,
    updateToken: number
  ) {
    const tileRecords = this.getAllTilePrimitiveRecords();
    const scheduleRender = createFrameRenderScheduler(
      viewer,
      () => updateToken === this._generationToken
    );
    let updatedCount = 0;

    await runStreamingWithConcurrency(
      tileRecords,
      TILE_REQUEST_CONCURRENCY,
      async (record) => {
        let imageAsset: TileImageAsset | null = null;
        try {
          if (updateToken !== this._generationToken) {
            return;
          }

          imageAsset = await this.getReprojectedTileImageAsset(record, provider);
          if (!imageAsset) {
            return;
          }
          if (updateToken !== this._generationToken) {
            imageAsset.release();
            imageAsset = null;
            return;
          }

          const previousAsset = record.imageAsset;
          record.imageAsset = imageAsset;
          if (record.primitive) {
            this.applyImageMaterial(record.primitive, imageAsset.source);
          }
          previousAsset.release();
          imageAsset = null;

          updatedCount++;
          if (updatedCount % PRIMITIVE_BATCH_SIZE === 0) {
            viewer.scene.requestRender();
          } else {
            scheduleRender();
          }
        } catch (error) {
          imageAsset?.release();
          console.warn("Failed to refresh tile material.", error);
        }
      }
    );

    if (updatedCount > 0 && updateToken === this._generationToken) {
      viewer.scene.requestRender();
    }
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

  private getCompositeTileId(info: PaleoData, tileInfo: Pick<NodeInfo, "tileXYL">) {
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
    uniqueRawTileCount: number
  ) {
    const polygonCounts = tasks.map((task) =>
      task.coversFullTile ? task.sourceFeatureIds.length : task.clipAreas.length
    );
    const totalPolygonCount = polygonCounts.reduce((sum, count) => sum + count, 0);
    this._geoTileStats = {
      statsSchemaVersion: GEO_TILE_STATS_SCHEMA_VERSION,
      sourceTaskCount,
      compositeTaskCount: tasks.length,
      uniqueRawTileCount,
      maxPolygonsPerComposite:
        polygonCounts.length > 0 ? Math.max(...polygonCounts) : 0,
      avgPolygonsPerComposite:
        tasks.length > 0 ? totalPolygonCount / tasks.length : 0,
      importDiagnostics: this._geoTileStats.importDiagnostics,
    };

    if (isDeepTimeGeoDebugEnabled()) {
      console.debug("[DeepTimeGeo] tile tasks", this._geoTileStats);
    }
  }

  private createTilePrimitive(
    tileId: string,
    tileInfo: Pick<NodeInfo, "tileXYL">,
    image: string | HTMLCanvasElement,
    modelMatrix = IDENTITY_MODEL_MATRIX,
    visible = true,
    transformMode = this._transformMode
  ) {
    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        id: tileId,
        modelMatrix:
          transformMode === "bakedInstance" ? modelMatrix : IDENTITY_MODEL_MATRIX,
        geometry: new RectangleGeometry({
          rectangle: this._provider.tilingScheme.tileXYToRectangle(
            tileInfo.tileXYL.x,
            tileInfo.tileXYL.y,
            tileInfo.tileXYL.l
          ),
        }),
      }),
      modelMatrix:
        transformMode === "dynamic3D" ? modelMatrix : IDENTITY_MODEL_MATRIX,
      asynchronous: false, // 关闭异步加载，确保每一帧中图元已显示完整
      appearance: new EllipsoidSurfaceAppearance({
        material: this.createImageMaterial(image),
        renderState: {
          depthTest: {
            // 不需要深度检测，互相完全覆盖
            enabled: false,
          },
        },
      }),
    });
    primitive.show = visible;
    return primitive;
  }

  private applyImageMaterial(primitive: Primitive, image: string | HTMLCanvasElement) {
    const applyStart = now();
    primitive.appearance.material = this.createImageMaterial(image);
    this.processer.recordMaterialApplyMs(now() - applyStart);
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

  private async getCachedModelMatrix(plateId: string, age: number) {
    const cacheKey = `${plateId}:${age}`;
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

  private async rebuildLoadedPrimitives(
    viewer: Viewer,
    plateMatrices: PlateMatrixEntry[],
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
    const matrixByPlate = new Map(
      plateMatrices.map(({ plateItem, modelMatrix }) => [
        plateItem.plateId,
        modelMatrix,
      ])
    );

    // 进入 2D/CV 前先移除旧 Primitive，避免 MORPHING 帧检查到非 identity modelMatrix。
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

    let addedCount = 0;
    for (const tileRecord of this._compositeTileRecords.values()) {
      const modelMatrix =
        matrixByPlate.get(tileRecord.plateId) ?? IDENTITY_MODEL_MATRIX;
      const visible = this.isVisibleAtTime(tileRecord.time, age);
      if (
        rebuildToken !== this._primitiveRebuildToken ||
        mode !== this._transformMode ||
        age !== this._currentAge
      ) {
        return;
      }

      const primitive = this.createTilePrimitive(
        tileRecord.tileId,
        tileRecord,
        tileRecord.imageAsset.source,
        modelMatrix,
        visible,
        mode
      );
      tileRecord.primitive = viewer.scene.primitives.add(primitive);

      addedCount++;
      if (addedCount % PRIMITIVE_BATCH_SIZE === 0) {
        viewer.scene.requestRender();
        await waitForNextFrame();
      }
    }

    if (addedCount > 0) {
      viewer.scene.requestRender();
    }
  }

  private removePrimitiveInstances(viewer: Viewer) {
    this.getAllTilePrimitiveRecords().forEach((tileRecord) => {
      if (tileRecord.primitive) {
        viewer.scene.primitives.remove(tileRecord.primitive);
        tileRecord.primitive = null;
      }
    });
  }

  private isVisibleAtTime(time: PaleoData["time"], age: number) {
    return age <= time.begine && age >= time.end;
  }

  private getAllTilePrimitiveRecords() {
    return Array.from(this._compositeTileRecords.values());
  }

  private removeAllPrimitives(viewer: Viewer) {
    this._compositeTileRecords.forEach((tileRecord) => {
      if (tileRecord.primitive) {
        viewer.scene.primitives.remove(tileRecord.primitive);
        tileRecord.primitive = null;
      }
      tileRecord.imageAsset.release();
    });
    this._compositeTileRecords.clear();
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        polygonItem.primitives = {};
      });
    });
  }

  private isSameTilingSchemeType(
    previousProvider: ImageryProvider,
    nextProvider: ImageryProvider
  ) {
    return (
      previousProvider.tilingScheme.constructor ===
      nextProvider.tilingScheme.constructor
    );
  }

  private getTilingSchemeKey() {
    return this._provider.tilingScheme.constructor.name;
  }
}

function isDeepTimeGeoDebugEnabled() {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("deepTimeGeoDebug") === "1"
  );
}

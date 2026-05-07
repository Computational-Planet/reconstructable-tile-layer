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
import { NodeInfo, QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { CesiumTileProcesser } from "tile-processer-webgl";

const TILE_TASK_CONCURRENCY = 8;
const PRIMITIVE_BATCH_SIZE = 32;
const IDENTITY_MODEL_MATRIX = Matrix4.clone(Matrix4.IDENTITY);

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) {
          return;
        }
        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );

  return results;
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
  time: {
    begine: number;
    end: number;
  };
}

type TilePrimitiveRecord = {
  tileId: string;
  imageURL: string;
  primitive: Primitive | null;
  tileXYL: NodeInfo["tileXYL"];
  polygon: Array<number> | null;
};

type PolygonQuadTreeRecord = {
  info: PaleoData;
  quadTree: QuadTreeTileProcesser;
  primitives: Record<string, TilePrimitiveRecord>;
};

type TileTask = {
  tileId: string;
  tileInfo: NodeInfo;
  polygonItem: PolygonQuadTreeRecord;
};

type PreparedTileTask = TileTask & {
  primitive: Primitive;
  imageURL: string;
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
    polygon: string; // 多边形的路径
    rots: string[];
  };
}

export class SimpleGeoReconstructManager {
  private _provider: ImageryProvider;
  processer: CesiumTileProcesser;
  rotationOperator: RotationOperator = new RotationOperator();
  private _files: {
    polygon: string; // 多边形的路径
    rots: string[];
  };
  paleoData: PaleoData[] = [];
  // key为plateID，其内部的Map中key为featureID
  plates: Map<string, PlateQuadTreeGroup> = new Map<
    string,
    PlateQuadTreeGroup
  >();

  private _ready = false;
  private _tileListCache = new Map<string, NodeInfo[]>();
  private _rotationMatrixCache = new Map<string, Matrix4>();
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

  async getPaleoDataFlatten(url: string) {
    const res: PaleoData[] = [];
    const polygons: PaleoItem[] = await (await fetch(url)).json();

    polygons.forEach((item) => {
      res.push({
        featureId: item.FeatureID,
        plateId: item.PlateID,
        lonlats: item.Polygon[0].PosList.flatMap((pos) => [
          pos.Longitude,
          pos.Latitude,
        ]),
        time: {
          begine: item.ValidTime.Begin,
          end: item.ValidTime.End,
        },
      });
    });
    return res;
  }

  async init() {
    this._ready = false;
    this.plates.clear();
    this._tileListCache.clear();
    this._rotationMatrixCache.clear();

    this.paleoData = await this.getPaleoDataFlatten(this._files.polygon);
    this.paleoData.forEach((item) => {
      if (!this.plates.get(item.plateId)) {
        this.plates.set(item.plateId, {
          plateId: item.plateId,
          polygonQuadTrees: new Map<string, PolygonQuadTreeRecord>(),
        });
      }
      this.plates.get(item.plateId)?.polygonQuadTrees.set(item.featureId, {
        info: item,
        quadTree: new QuadTreeTileProcesser(
          this._provider.tilingScheme,
          item.lonlats
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
    plateMatrices.forEach(({ plateItem, modelMatrix }) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        const visible = this.isVisibleAtAge(polygonItem.info, age);
        Object.values(polygonItem.primitives).forEach((tileRecord) => {
          if (!tileRecord.primitive) {
            return;
          }
          tileRecord.primitive.modelMatrix = modelMatrix;
          tileRecord.primitive.show = visible;
        });
      });
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
    const tasks: TileTask[] = [];
    const taskIds = new Set<string>();

    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        const tiles = this.getTilesForPolygon(polygonItem, mode, level);
        tiles.forEach((tileInfo) => {
          const tileId = this.getTileId(polygonItem.info.featureId, tileInfo);
          if (
            polygonItem.primitives[tileId] ||
            this._pendingTileTokens.has(tileId) ||
            taskIds.has(tileId)
          ) {
            return;
          }
          taskIds.add(tileId);
          tasks.push({ tileId, tileInfo, polygonItem });
        });
      });
    });

    return tasks;
  }

  private async executeTileGeneration(viewer: Viewer, tasks: TileTask[]) {
    if (tasks.length === 0) {
      return;
    }

    this._boundViewer = viewer;
    const generationToken = ++this._generationToken;
    tasks.forEach((task) => {
      this._pendingTileTokens.set(task.tileId, generationToken);
    });

    try {
      const preparedTiles = await runWithConcurrency(
        tasks,
        TILE_TASK_CONCURRENCY,
        (task) => this.prepareTilePrimitive(task, generationToken)
      );
      if (generationToken !== this._generationToken) {
        return;
      }
      await this.addPreparedTiles(
        viewer,
        preparedTiles.filter(
          (preparedTile): preparedTile is PreparedTileTask => !!preparedTile
        ),
        generationToken
      );
    } finally {
      tasks.forEach((task) => {
        if (this._pendingTileTokens.get(task.tileId) === generationToken) {
          this._pendingTileTokens.delete(task.tileId);
        }
      });
    }
  }

  private async prepareTilePrimitive(task: TileTask, generationToken: number) {
    if (generationToken !== this._generationToken) {
      return null;
    }

    const imageURL = await this.getReprojectedTileImageURL(
      task.tileInfo,
      this._provider
    );
    if (!imageURL || generationToken !== this._generationToken) {
      return null;
    }

    return {
      ...task,
      imageURL,
      primitive: this.createTilePrimitive(
        task.tileId,
        task.tileInfo,
        imageURL,
        await this.getCachedModelMatrix(
          task.polygonItem.info.plateId,
          this._currentAge
        ),
        this.isVisibleAtAge(task.polygonItem.info, this._currentAge),
        this._transformMode
      ),
    };
  }

  private async addPreparedTiles(
    viewer: Viewer,
    preparedTiles: PreparedTileTask[],
    generationToken: number
  ) {
    let addedCount = 0;

    for (const preparedTile of preparedTiles) {
      if (generationToken !== this._generationToken) {
        return;
      }
      if (preparedTile.polygonItem.primitives[preparedTile.tileId]) {
        continue;
      }

      const primitive = viewer.scene.primitives.add(preparedTile.primitive);
      preparedTile.polygonItem.primitives[preparedTile.tileId] = {
        tileId: preparedTile.tileId,
        imageURL: preparedTile.imageURL,
        primitive,
        tileXYL: preparedTile.tileInfo.tileXYL,
        polygon: preparedTile.tileInfo.polygon,
      };

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

  private async refreshPrimitiveMaterials(
    viewer: Viewer,
    provider: ImageryProvider,
    updateToken: number
  ) {
    const tileRecords = this.getAllTilePrimitiveRecords();
    await runWithConcurrency(tileRecords, TILE_TASK_CONCURRENCY, async (record) => {
      if (updateToken !== this._generationToken) {
        return;
      }
      const imageURL = await this.getReprojectedTileImageURL(record, provider);
      if (!imageURL || updateToken !== this._generationToken) {
        return;
      }
      record.imageURL = imageURL;
      if (record.primitive) {
        record.primitive.appearance.material = this.createImageMaterial(imageURL);
      }
    });
    if (updateToken === this._generationToken) {
      viewer.scene.requestRender();
    }
  }

  private async getReprojectedTileImageURL(
    tile: Pick<NodeInfo, "tileXYL" | "polygon">,
    provider: ImageryProvider
  ) {
    if (tile.polygon) {
      return this.processer.reprojectClippedTile(
        tile.tileXYL.x,
        tile.tileXYL.y,
        tile.tileXYL.l,
        tile.polygon,
        provider
      );
    }
    return this.processer.reprojectTile(
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

  private getTileId(featureId: string, tileInfo: NodeInfo) {
    return `${featureId}-${tileInfo.tileXYL.x}/${tileInfo.tileXYL.y}/${tileInfo.tileXYL.l}`;
  }

  private createTilePrimitive(
    tileId: string,
    tileInfo: Pick<NodeInfo, "tileXYL">,
    imageURL: string,
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
        material: this.createImageMaterial(imageURL),
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

  private createImageMaterial(imageURL: string) {
    return new Material({
      fabric: {
        type: "Image",
        uniforms: {
          image: imageURL,
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
    for (const plateItem of this.plates.values()) {
      const modelMatrix =
        matrixByPlate.get(plateItem.plateId) ?? IDENTITY_MODEL_MATRIX;
      for (const polygonItem of plateItem.polygonQuadTrees.values()) {
        const visible = this.isVisibleAtAge(polygonItem.info, age);
        for (const tileRecord of Object.values(polygonItem.primitives)) {
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
            tileRecord.imageURL,
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

  private isVisibleAtAge(info: PaleoData, age: number) {
    return age <= info.time.begine && age >= info.time.end;
  }

  private getAllTilePrimitiveRecords() {
    const records: TilePrimitiveRecord[] = [];
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        records.push(...Object.values(polygonItem.primitives));
      });
    });
    return records;
  }

  private removeAllPrimitives(viewer: Viewer) {
    this.plates.forEach((plateItem) => {
      plateItem.polygonQuadTrees.forEach((polygonItem) => {
        Object.values(polygonItem.primitives).forEach((tileRecord) => {
          if (tileRecord.primitive) {
            viewer.scene.primitives.remove(tileRecord.primitive);
            tileRecord.primitive = null;
          }
        });
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

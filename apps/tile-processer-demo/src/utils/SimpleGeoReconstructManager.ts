import { Color, EllipsoidSurfaceAppearance, GeometryInstance, ImageryProvider, Material, Matrix4, Primitive, PrimitiveCollection, RectangleGeometry, Viewer } from "cesium";
import { RotationOperator } from "plates-rotation-operator";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { NodeInfo } from "polygon-tile-quadtree";
import { CesiumTileProcesser } from "tile-processer-webgl";

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
  //id: string; // 一个不重复的随机id，由单个多边形独有
  featureId: string; // 要素id（从文件获取）
  plateId: string; // 板块id（从文件获取）
  lonlats: number[];
  //positions: Cartesian3[];
  time: {
    begine: number;
    end: number;
  };
  //color: Color;
}



export type PlateQuadTreeGroup = {
  plateId: string;
  polygonQuadTrees: Map<string, { info: PaleoData, quadTree: QuadTreeTileProcesser, primitives: Record<string, Primitive> }>
}

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
  plates: Map<string, PlateQuadTreeGroup> = new Map<string, PlateQuadTreeGroup>;

  private _ready = false;

  constructor(data: SimpleGeoReconstructManagerConstructorOptions) {
    this._provider = data.provider;
    this.processer = data.processer;
    this._files = data.files;
  }

  async getPaleoDataFlatten(url: string) {
    const res: PaleoData[] = [];

    // 从json读取多边形
    const polygons: PaleoItem[] = await (await fetch(url)).json();
    console.log(polygons.length);
    polygons.map((item) => {
      res.push({
        // id: nanoid(),
        featureId: item.FeatureID,
        plateId: item.PlateID,
        /* positions: item.Polygon[0].PosList.map((pos) =>
          Cartesian3.fromDegrees(pos.Longitude, pos.Latitude),
        ), */
        lonlats: item.Polygon[0].PosList.flatMap((pos) => [
          pos.Longitude,
          pos.Latitude,
        ]),
        time: {
          begine: item.ValidTime.Begin,
          end: item.ValidTime.End,
        },
        // color: colors[item.PlateID],
      });
    });
    return res;
  }
  async init() {
    // 读取板块多边形数据
    this.paleoData = await this.getPaleoDataFlatten(this._files.polygon);
    // 按PlateID分类，为每个板块的每个多边形构建板块四叉树
    this.paleoData.map((item) => {
      if (!this.plates.get(item.plateId)) {
        this.plates.set(item.plateId, {
          plateId: item.plateId,
          polygonQuadTrees: new Map<string, { info: PaleoData, quadTree: QuadTreeTileProcesser, primitives: Record<string, Primitive> }>()
        })
      }
      this.plates.get(item.plateId)?.polygonQuadTrees.set(item.featureId, {
        info: item, quadTree: new QuadTreeTileProcesser(
          this._provider.tilingScheme,
          item.lonlats,
        ), primitives: {}
      })
    });
    // 获取旋转数据，构建旋转算子
    this.rotationOperator.init(this._files.rots);
    this._ready = true;
  }

  async generateTilePrimitivesOnLevelN(viewer: Viewer, level: number) {
    this.plates.forEach((plateItem, id) => {
      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        const tiles: NodeInfo[] = [];
        polygonItem.quadTree.findTilesByLevel(level, tiles);
        tiles.forEach(async (tileInfo) => {
          const tileId = polygonItem.info.featureId + `-${tileInfo.tileXYL.x}/${tileInfo.tileXYL.y}/${tileInfo.tileXYL.l}`;
          const tilePrimitive = new Primitive({
            geometryInstances: new GeometryInstance({
              id: tileId,
              geometry: new RectangleGeometry({
                rectangle: this._provider.tilingScheme.tileXYToRectangle(
                  tileInfo.tileXYL.x,
                  tileInfo.tileXYL.y,
                  tileInfo.tileXYL.l
                ),
              }),
            }),
            asynchronous: false, // 关闭异步加载，确保每一帧中图元已显示完整
            appearance: new EllipsoidSurfaceAppearance({
              //aboveGround: true,
              material: Material.fromType("Color", {
                color: new Color(0.0, 0.0, 0.0, 0.0),
              }),
              renderState: {
                depthTest: {
                  // 不需要深度检测，互相完全覆盖
                  enabled: false,
                },
              },
            }),
          });
          if (tileInfo.polygon) {
            const imageURL = await this.processer.reprojectClippedTile(tileInfo.tileXYL.x, tileInfo.tileXYL.y, tileInfo.tileXYL.l, tileInfo.polygon, this._provider);
            if (tilePrimitive) {
              tilePrimitive.appearance.material = new Material({
                fabric: {
                  type: "Image",
                  uniforms: {
                    image: imageURL,
                  },
                },
              });
            }
          }
          else {
            const imageURL = await this.processer.reprojectTile(tileInfo.tileXYL.x, tileInfo.tileXYL.y, tileInfo.tileXYL.l, this._provider);
            if (tilePrimitive) {
              tilePrimitive.appearance.material = new Material({
                fabric: {
                  type: "Image",
                  uniforms: {
                    image: imageURL,
                  },
                },
              });
            }
          }
          polygonItem.primitives[tileId] = viewer.scene.primitives.add(tilePrimitive);
        })
      })
    });
  }

  async generateTilePrimitivesAtRoot(viewer: Viewer) {
    this.plates.forEach((plateItem, id) => {
      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        const tiles: NodeInfo[] = [];
        polygonItem.quadTree.findTilesAtRoot(tiles);
        console.log(tiles)
        tiles.forEach(async (tileInfo) => {
          const tileId = polygonItem.info.featureId + `-${tileInfo.tileXYL.x}/${tileInfo.tileXYL.y}/${tileInfo.tileXYL.l}`;
          const tilePrimitive = new Primitive({
            geometryInstances: new GeometryInstance({
              id: tileId,
              geometry: new RectangleGeometry({
                rectangle: this._provider.tilingScheme.tileXYToRectangle(
                  tileInfo.tileXYL.x,
                  tileInfo.tileXYL.y,
                  tileInfo.tileXYL.l
                ),
              }),
            }),
            asynchronous: false, // 关闭异步加载，确保每一帧中图元已显示完整
            appearance: new EllipsoidSurfaceAppearance({
              //aboveGround: true,
              material: Material.fromType("Color", {
                color: new Color(0.0, 0.0, 0.0, 0.0),
              }),
              renderState: {
                depthTest: {
                  // 不需要深度检测，互相完全覆盖
                  enabled: false,
                },
              },
            }),
          });
          if (tileInfo.polygon) {
            const imageURL = await this.processer.reprojectClippedTile(tileInfo.tileXYL.x, tileInfo.tileXYL.y, tileInfo.tileXYL.l, tileInfo.polygon, this._provider);
            if (tilePrimitive) {
              tilePrimitive.appearance.material = new Material({
                fabric: {
                  type: "Image",
                  uniforms: {
                    image: imageURL,
                  },
                },
              });
            }
          }
          else {
            const imageURL = await this.processer.reprojectTile(tileInfo.tileXYL.x, tileInfo.tileXYL.y, tileInfo.tileXYL.l, this._provider);
            if (tilePrimitive) {
              tilePrimitive.appearance.material = new Material({
                fabric: {
                  type: "Image",
                  uniforms: {
                    image: imageURL,
                  },
                },
              });
            }
          }
          polygonItem.primitives[tileId] = viewer.scene.primitives.add(tilePrimitive);
        })
      })
    });
  }

  async updateAge(age: number) {
    this.plates.forEach(async (plateItem, id) => {
      const modelMatrix = await this.rotationOperator.getRotateMatrix(plateItem.plateId, age);

      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        const visible = (age <= polygonItem.info.time.begine && age >= polygonItem.info.time.end) ? true : false;
        Object.values(polygonItem.primitives).forEach((tilePrimitive) => {
          tilePrimitive.modelMatrix = modelMatrix
            ? Matrix4.fromRotation(modelMatrix)
            : Matrix4.IDENTITY;
          tilePrimitive.show = visible;
        })
      })
    });
  }
  async updateProvider(viewer: Viewer, provider: ImageryProvider) {
    this._provider = provider;
    this.plates.forEach(async (plateItem, id) => {
      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        polygonItem.quadTree.updateProvider(provider);
      })
    });
    this.processer.clearBuffer();
    this.plates.forEach(async (plateItem, id) => {
      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        Object.values(polygonItem.primitives).forEach((tilePrimitive) => {
          viewer.scene.primitives.remove(tilePrimitive);
        })
      })
    });
  }
  clearAllTiles(viewer: Viewer) {
    this.processer.clearBuffer();
    this.plates.forEach(async (plateItem, id) => {
      plateItem.polygonQuadTrees.forEach((polygonItem, id) => {
        Object.values(polygonItem.primitives).forEach((tilePrimitive) => {
          viewer.scene.primitives.remove(tilePrimitive);
        })
      })
    });
  }
}


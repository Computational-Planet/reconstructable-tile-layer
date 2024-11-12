import { ImageryProvider, ImageryTypes } from "cesium";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { CustomTileManager } from "./CustomTileManager";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { NodeInfo } from "polygon-tile-quadtree/dist/typings/QuadTreeTileNode";

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
  polygonTileQuadTree: QuadTreeTileProcesser | undefined;
  //color: Color;
}

export interface TilePrimitivesManagerConstructorOptions {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  files: {
    polygon: string; // 多边形的路径
    //rots: string[];
  };
}

export class TilePrimitivesManager {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  private _files: {
    polygon: string; // 多边形的路径
    //rots: string[];
  };
  paleoData: PaleoData[] = [];
  private _ready = false;

  constructor(data: TilePrimitivesManagerConstructorOptions) {
    this.provider = data.provider;
    this.processer = data.processer;
    this._files = data.files;
  }

  async init() {
    this.paleoData = await this.getPaleoDataFlatten(this.files.polygon);
    this.paleoData.map((item) => {
      item.polygonTileQuadTree = new QuadTreeTileProcesser(
        this.provider.tilingScheme,
        item.lonlats,
      );
    });
    console.log(this.paleoData);
    this._ready = true;
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
        polygonTileQuadTree: undefined,
        // color: colors[item.PlateID],
      });
    });

    return res;
  }

  async loadAllPolygonOnLevel3Tile(tileManager: CustomTileManager) {
    this.paleoData.map((item) => {
      if (
        item.time.end <= 0 &&
        //item.plateId === "514" &&
        item.polygonTileQuadTree
      ) {
        const infoArray: Array<NodeInfo> = [];
        item.polygonTileQuadTree.findTilesByLevel(3, infoArray);

        console.log(infoArray.length);
        infoArray.forEach(async (data) => {
          if (data.polygon) {
            tileManager.generateClippedReprojTile(
              `${item.featureId}-${data.tileXYL.x}/${data.tileXYL.y}/${data.tileXYL.l}`,
              this.provider,
              data.tileXYL.x,
              data.tileXYL.y,
              data.tileXYL.l,
              this.processer,
              data.polygon
            );
          } else {
            tileManager.generateReprojTile(
              `${item.featureId}-${data.tileXYL.x}/${data.tileXYL.y}/${data.tileXYL.l}`,
              this.provider,
              data.tileXYL.x,
              data.tileXYL.y,
              data.tileXYL.l,
              this.processer
            );
          }
        });
      }
    });
  }

  get ready() {
    return this._ready;
  }
  get files() {
    return this._files;
  }
}

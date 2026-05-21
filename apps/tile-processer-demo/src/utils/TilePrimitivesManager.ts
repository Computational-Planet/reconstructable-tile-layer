import { ImageryProvider } from "cesium";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { CustomTileManager } from "./CustomTileManager";
import {
  NodeInfo,
  QuadTreeTileProcesser,
  type TileClipArea,
} from "polygon-tile-quadtree";
import {
  loadFeaturePolygonData,
  type PolygonRenderIntentMode,
} from "./gplates";

export interface PaleoData {
  featureId: string;
  plateId: string;
  lonlats: number[];
  clipArea: TileClipArea;
  renderIntent: "area" | "line-like" | "unknown";
  time: {
    begine: number;
    end: number;
  };
  polygonTileQuadTree: QuadTreeTileProcesser | undefined;
}

export interface TilePrimitivesManagerConstructorOptions {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  files: {
    polygonRenderIntent?: PolygonRenderIntentMode;
    // Supports legacy JSON plus GPML / GPMLZ feature files.
    polygon: string;
  };
}

export class TilePrimitivesManager {
  provider: ImageryProvider;
  processer: CesiumTileProcesser;
  private _files: {
    polygonRenderIntent?: PolygonRenderIntentMode;
    polygon: string;
  };
  paleoData: PaleoData[] = [];
  private _ready = false;

  constructor(data: TilePrimitivesManagerConstructorOptions) {
    this.provider = data.provider;
    this.processer = data.processer;
    this._files = data.files;
  }

  async init() {
    this.paleoData = await this.getPaleoDataFlatten(this._files.polygon);
    this.paleoData.forEach((item) => {
      item.polygonTileQuadTree = new QuadTreeTileProcesser(
        this.provider.tilingScheme,
        item.clipArea,
      );
    });
    console.log(this.paleoData);
    this._ready = true;
  }

  async getPaleoDataFlatten(url: string) {
    const items = await loadFeaturePolygonData(url, {
      polygonRenderIntent: this._files.polygonRenderIntent,
    });
    return items
      .filter((item) => item.renderIntent === "area")
      .map((item) => ({
        ...item,
        polygonTileQuadTree: undefined,
      }));
  }

  async loadAllPolygonOnLevel3Tile(tileManager: CustomTileManager) {
    this.paleoData.forEach((item) => {
      if (
        item.time.end <= 0 &&
        // item.plateId === "514" &&
        item.polygonTileQuadTree
      ) {
        const infoArray: Array<NodeInfo> = [];
        item.polygonTileQuadTree.findTilesByLevel(3, infoArray);

        console.log(infoArray.length);
        infoArray.forEach(async (data) => {
          if (data.clipArea) {
            tileManager.generateClippedAreaReprojTile(
              `${item.featureId}-${data.tileXYL.x}/${data.tileXYL.y}/${data.tileXYL.l}`,
              this.provider,
              data.tileXYL.x,
              data.tileXYL.y,
              data.tileXYL.l,
              this.processer,
              data.clipArea,
            );
          } else if (data.polygon) {
            tileManager.generateClippedReprojTile(
              `${item.featureId}-${data.tileXYL.x}/${data.tileXYL.y}/${data.tileXYL.l}`,
              this.provider,
              data.tileXYL.x,
              data.tileXYL.y,
              data.tileXYL.l,
              this.processer,
              data.polygon,
            );
          } else {
            tileManager.generateReprojTile(
              `${item.featureId}-${data.tileXYL.x}/${data.tileXYL.y}/${data.tileXYL.l}`,
              this.provider,
              data.tileXYL.x,
              data.tileXYL.y,
              data.tileXYL.l,
              this.processer,
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

import clsx from "clsx";
import { CSSProperties, useContext, useEffect, useState } from "react";
import "./index.css";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { Button } from "qhw-ui-demo";
import { TilePrimitivesManager } from "../../utils/TilePrimitivesManager";
import { SimpleGeoReconstructManager } from "../../utils/SimpleGeoReconstructManager";
import {
  GeographicTilingScheme,
  ImageryProvider,
  IonImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";
import { DefaultProvider } from "../../App";

const MapProvider: Record<string, ImageryProvider> = {
  "arcgis-nature": new WebMapTileServiceImageryProvider({
    url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS", //只填写URL也可以加载
    tileMatrixSetID: "1",
    layer: "World_Imagery", //图层名，用于在Cesium中记录该图层的名称
    style: "default", //默认可省略
    format: "image/jpeg", //瓦片格式，可从xml获取
    maximumLevel: 18, //最大缩放层级。不影响图片加载，但是不约束它会导致Cesium频繁请求不存在的瓦片，产生很多报错
    tilingScheme: new WebMercatorTilingScheme({}),
  }),
  "mars-4326": new UrlTemplateImageryProvider({
    url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg", // Mars
    tilingScheme: new GeographicTilingScheme(), //必须有，这个是切片方案，必须根据球体创建正确的切片方案
  }),
  "gaode-street": new UrlTemplateImageryProvider({
    url: "http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    tilingScheme: new WebMercatorTilingScheme({}),
  }),
  "tianditu-imagery": new UrlTemplateImageryProvider({
    url:
      "http://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=" +
      "cfdad1c8c7fd85b64434b4c5d4c47672",
    tilingScheme: new WebMercatorTilingScheme(), //告知Cesium，该地图服务采用Web墨卡托切片方案
    maximumLevel: 18, //最大缩放层级。不是告诉地图服务器，而是告诉Cesium的。
  }),
  "cesium-night": await IonImageryProvider.fromAssetId(3812, {
    accessToken:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4MTIzMzM3ZS1lNWEyLTRmNTAtYmI2Zi1hNjBlZTA3YTAyN2UiLCJpZCI6MTM1ODMzLCJpYXQiOjE2ODI1ODIzNjl9.04HzJGnDmmXKRbSzdhvE7epR9ny1xibwFRIZ1ipOM6Y",
  }),
  /* "bing-map": // 有bug，有待研究
      await IonImageryProvider.fromAssetId(2, { accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4MTIzMzM3ZS1lNWEyLTRmNTAtYmI2Zi1hNjBlZTA3YTAyN2UiLCJpZCI6MTM1ODMzLCJpYXQiOjE2ODI1ODIzNjl9.04HzJGnDmmXKRbSzdhvE7epR9ny1xibwFRIZ1ipOM6Y" }), */
};

type DeepTimeGeoPanelProps = {
  style?: CSSProperties;
  className?: string;
};

function DeepTimeGeoPanel(props: DeepTimeGeoPanelProps) {
  const { style: userStyle, className /* ,viewerRef, tileProcesserRef */ } =
    props;

  const [age, setAge] = useState<number>(0);
  const [level, setLevel] = useState<number>(3);
  const [mapProviderIndex, setMapProviderIndex] =
    useState<string>("arcgis-nature");
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  //const { viewerRef, tileManager } = context;
  const {
    viewerRef,
    tilePrimitivesManagerRef,
    tileManagerRef,
    tileProcesserRef,
    simpleGeoReconstructManagerRef,
  } = context;

  useEffect(() => {
    let disposed = false;
    let unbindSceneModeSync: (() => void) | undefined;
    let getGeoTileStats:
      | (() => ReturnType<SimpleGeoReconstructManager["getGeoTileStats"]>)
      | undefined;

    if (tileProcesserRef.current) {
      const manager = new SimpleGeoReconstructManager({
        provider: MapProvider["arcgis-nature"],
        processer: tileProcesserRef.current,
        files: {
          //polygon: "/geo/Matthews++/test/shapes_coasts.gpmlz",
          //polygon:"/geo/Matthews++/test/Global_EarthByte_GPlates_PresentDay_Coastlines.gpmlz",
          polygon:
            "/geo/Matthews++/test/shapes_static_polygons_Merdith_et_al.gpml",
          rots: [
            "geo/Matthews++/test/1000_0_rotfile_20240725.rot",
            "geo/Matthews++/test/1800_1000_rotfile_20240725.rot",
          ],
        },
      });
      simpleGeoReconstructManagerRef.current = manager;
      getGeoTileStats = () => manager.getGeoTileStats();
      window.__geoTileStats = getGeoTileStats;

      manager.init().then(() => {
        if (disposed) {
          return;
        }
        if (viewerRef.current) {
          unbindSceneModeSync = manager.bindSceneModeSync(viewerRef.current);
        }
      });
    }
    return () => {
      disposed = true;
      unbindSceneModeSync?.();
      if (viewerRef.current) {
        simpleGeoReconstructManagerRef.current?.clearAllTiles(
          viewerRef.current,
        );
      }
      if (window.__geoTileStats === getGeoTileStats) {
        delete window.__geoTileStats;
      }
      simpleGeoReconstructManagerRef.current?.unbindSceneModeSync();
      simpleGeoReconstructManagerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
      simpleGeoReconstructManagerRef.current.updateProvider(
        viewerRef.current,
        MapProvider[mapProviderIndex],
      );
    }
  }, [mapProviderIndex]);

  useEffect(() => {
    if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
      simpleGeoReconstructManagerRef.current.updateAge(age).then(() => {
        viewerRef.current?.scene.requestRender();
      });
    }
  }, [age]);
  //const tileManager = useRef<CustomTileManager | null>();

  return (
    <div className={clsx(className)} style={{ ...userStyle }}>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (tileProcesserRef.current) {
              const tilePrimitivesManager = new TilePrimitivesManager({
                provider: DefaultProvider,
                processer: tileProcesserRef.current,
                files: {
                  polygon:
                    "/geo/Matthews++/test/Global_EarthByte_GPlates_PresentDay_Coastlines.gpmlz",
                },
              });
              tilePrimitivesManager.init();
              tilePrimitivesManagerRef.current = tilePrimitivesManager;
            }
          }}
        >
          Load Polygons
        </Button>
        <Button
          onClick={() => {
            if (tilePrimitivesManagerRef.current && tileManagerRef.current) {
              tilePrimitivesManagerRef.current.loadAllPolygonOnLevel3Tile(
                tileManagerRef.current,
              );
            }
          }}
        >
          Load All Level 3 Tiles
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={async () => {
            if (simpleGeoReconstructManagerRef.current) {
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  -100,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  0,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  100,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  200,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  300,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  400,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  500,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  600,
                ),
              );
              console.log(
                await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix(
                  "514",
                  700,
                ),
              );
            }
          }}
        >
          Rotation Test
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={async () => {
            if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
              simpleGeoReconstructManagerRef.current.generateTilePrimitivesOnLevelN(
                viewerRef.current,
                level,
              );
            }
          }}
        >
          NEW Load All Tiles On Lv {level}
        </Button>
        <input
          type="number"
          defaultValue={3}
          min={MapProvider[mapProviderIndex].minimumLevel}
          max={MapProvider[mapProviderIndex].maximumLevel}
          onChange={(e) => {
            setLevel(Number(e.target.value));
          }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={async () => {
            if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
              simpleGeoReconstructManagerRef.current.generateTilePrimitivesAtRoot(
                viewerRef.current,
              );
            }
          }}
        >
          NEW Load All Tiles At Root
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <input
          type="range"
          min={0}
          max={1800}
          value={age}
          style={{ width: "80%" }}
          onChange={(e) => {
            setAge(Number(e.target.value));
          }}
        ></input>
        <input
          type="number"
          min={0}
          max={1800}
          value={age}
          onChange={(e) => {
            setAge(Number(e.target.value));
          }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <select
          onChange={(e) => {
            setMapProviderIndex(e.target.value);
          }}
        >
          <option value="arcgis-nature">arcgis-nature(3857)</option>
          <option value="mars-4326">mars-4326(4326)</option>
          <option value="gaode-street">gaode-street(3857)</option>
          <option value="tianditu-imagery">tianditu-imagery(3857)</option>
          <option value="cesium-night">cesium-night(3857)</option>
          {/* <option value="bing-map">bing-map(3857)</option> */}
        </select>
      </div>
    </div>
  );
}

export default DeepTimeGeoPanel;

import { useEffect, useRef, useState } from "react";
import {
  Color,
  GeographicTilingScheme,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";
import { DrawerCard, LeftDrawer, RightToolBar } from "qhw-ui-demo";

import "./App.css";
import {
  CesiumTileProcesser,
  type TileImageOutputType,
} from "tile-processer-webgl";
import { TileClipperPanel } from "./components/TileClipperPanel";
import CesiumRefContext from "./contexts/CesiumRefContext";
import { CustomTileManager } from "./utils/CustomTileManager";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { RightToolBarContent } from "./components/RightToolBarContent";
import GeoInfoBox from "./components/GeoInfoBox";
import { TilePrimitivesManager } from "./utils/TilePrimitivesManager";
import { DeepTimeGeoPanel } from "./components/DeepTimeGeoPanel";
import { SimpleGeoReconstructManager } from "./utils/SimpleGeoReconstructManager";

const DEMO_TILE_OUTPUT_TYPE: TileImageOutputType = "canvas";

declare global {
  interface Window {
    __tileStats?: () => ReturnType<CesiumTileProcesser["getPoolStats"]>;
    __geoTileStats?: () => ReturnType<
      SimpleGeoReconstructManager["getGeoTileStats"]
    >;
  }
}

function App() {
  const container = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tileManagerRef = useRef<CustomTileManager | null>();
  const tileProcesserRef = useRef<CesiumTileProcesser>();
  const quadTreeTileProcesserRef = useRef<QuadTreeTileProcesser>();
  const tilePrimitivesManagerRef = useRef<TilePrimitivesManager>();
  const simpleGeoReconstructManagerRef = useRef<SimpleGeoReconstructManager>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (container.current) {
      viewerRef.current = new Viewer(container.current, {
        baseLayerPicker: false,
        baseLayer: false,
        //baseLayer: new ImageryLayer(DefaultProvider),
        animation: false,
        fullscreenButton: false,
        geocoder: false,
        infoBox: false,
        homeButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: true,
        requestRenderMode: true, // 可以使用scene.requestRender()来手动控制渲染的时机
        maximumRenderTimeChange: Infinity,
        useBrowserRecommendedResolution: false,
        orderIndependentTranslucency: false,
        contextOptions: {
          webgl: {
            alpha: true,
          },
        },
      });
      //去除Cesium标识
      const creditContainer = viewerRef.current.cesiumWidget
        .creditContainer as HTMLDivElement;
      creditContainer.style.display = "none";
      //初始化球体
      const scene = viewerRef.current.scene;
      scene.fog.density = 0.0001; // 雾气中水分含量
      scene.globe.enableLighting = false;
      scene.moon.show = false;
      scene.sun.show = false;
      scene.skyBox.show = false;
      //scene.backgroundColor = Color.fromCssColorString("#9EDCFFFF");
      scene.globe.baseColor = Color.fromCssColorString("#C4C4C4FF");
      setReady(true);
    }

    return () => {
      viewerRef.current?.destroy();
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const processer = new CesiumTileProcesser({
      slotCount: 4,
      outputType: DEMO_TILE_OUTPUT_TYPE,
    });
    tileProcesserRef.current = processer;

    const getTileStats = () => processer.getPoolStats();
    window.__tileStats = getTileStats;

    void processer
      .reprojectTileImage(0, 0, 0, DefaultProvider)
      .then((asset) => asset?.release());

    return () => {
      if (window.__tileStats === getTileStats) {
        delete window.__tileStats;
      }
      tileProcesserRef.current?.destroy();
      tileProcesserRef.current = undefined;
    };
  }, []);

  return (
    <CesiumRefContext.Provider
      value={{
        viewerRef,
        tileProcesserRef,
        tileManagerRef,
        quadTreeTileProcesserRef,
        tilePrimitivesManagerRef,
        simpleGeoReconstructManagerRef,
      }}
    >
      <div className={"control-bar"}></div>
      <div ref={container} className={"cesium-container"}></div>
      {/* 在viewer初始化完毕后再加载相关组件，防止组件初始化失败 */}
      {ready && (
        <>
          <LeftDrawer>
            <DrawerCard className={"custom-card"} title="TILE CLIPPER">
              <TileClipperPanel />
            </DrawerCard>
            <DrawerCard className={"custom-card"} title="DEEP TIME GEO">
              <DeepTimeGeoPanel />
            </DrawerCard>
          </LeftDrawer>
          <RightToolBar style={{ bottom: 70 }}>
            <RightToolBarContent />
          </RightToolBar>
          <GeoInfoBox />
        </>
      )}
    </CesiumRefContext.Provider>
  );
}

/* export const DefaultProvider = new WebMapTileServiceImageryProvider({
  url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS", //只填写URL也可以加载
  tileMatrixSetID: "1",
  layer: "World_Imagery", //图层名，用于在Cesium中记录该图层的名称
  style: "default", //默认可省略
  format: "image/jpeg", //瓦片格式，可从xml获取
  maximumLevel: 18, //最大缩放层级。不影响图片加载，但是不约束它会导致Cesium频繁请求不存在的瓦片，产生很多报错
  tilingScheme: new WebMercatorTilingScheme({}),
}); */

export const DefaultProvider = new UrlTemplateImageryProvider({
  url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg", // Mars
  tilingScheme: new GeographicTilingScheme(), //必须有，这个是切片方案，必须根据球体创建正确的切片方案
});

/* export const DefaultProvider = new UrlTemplateImageryProvider({
  url: "https://alpha.deep-time.org/tms/Scotese2018/54326/{z}/{x}/{reverseY}.png",
}); */

console.log("tileXYToNativeRectangle-0/0/0&1/0/0");
console.log(DefaultProvider.tilingScheme.tileXYToNativeRectangle(0, 0, 0));
console.log(DefaultProvider.tilingScheme.tileXYToNativeRectangle(1, 0, 0));
console.log("tileXYToRectangle-0/0/0&1/0/0");
console.log(DefaultProvider.tilingScheme.tileXYToRectangle(0, 0, 0));
console.log(DefaultProvider.tilingScheme.tileXYToRectangle(1, 0, 0));

export default App;

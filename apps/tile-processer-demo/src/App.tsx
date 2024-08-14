import { useEffect, useRef, useState } from "react";
import {
  Color,
  ImageryLayer,
  Viewer,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";
import { DrawerCard, LeftDrawer, RightToolBar } from "qhw-ui-demo";

import "./App.css";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { TileClipperPanel } from "./components/TileClipperPanel";
import CesiumRefContext from "./contexts/CesiumRefContext";
import { CustomTileManager } from "./utils/CustomTileManager";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { RightToolBarContent } from "./components/RightToolBarContent";
import GeoInfoBox from "./components/GeoInfoBox";
import { TilePrimitivesManager } from "./utils/TilePrimitivesManager";
import { DeepTimeGeoPanel } from "./components/DeepTimeGeoPanel";

function App() {
  const container = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tileManagerRef = useRef<CustomTileManager | null>();
  const tileProcesserRef = useRef<CesiumTileProcesser>();
  const quadTreeTileProcesserRef = useRef<QuadTreeTileProcesser>();
  const tilePrimitivesManagerRef = useRef<TilePrimitivesManager>();
  const [ready, setReady] = useState(false);
  const glcanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (container.current) {
      viewerRef.current = new Viewer(container.current, {
        baseLayerPicker: false,
        // baseLayer: false,
        baseLayer: new ImageryLayer(DefaultProvider),
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
    if (glcanvas.current) {
      tileProcesserRef.current = new CesiumTileProcesser(glcanvas.current, {
        provider: DefaultProvider,
      });
      tileProcesserRef.current.reprojectTile(0, 0, 0);
    }

    return () => {};
  }, []);

  return (
    <CesiumRefContext.Provider
      value={{
        viewerRef,
        tileProcesserRef,
        tileManagerRef,
        quadTreeTileProcesserRef,
        tilePrimitivesManagerRef,
      }}
    >
      <div className={"control-bar"}></div>
      <div ref={container} className={"cesium-container"}></div>
      <canvas
        id="glcanvas"
        width="256"
        height="256"
        ref={glcanvas}
        style={{ position: "fixed", right: 0, top: 0 }}
      >
        你的浏览器似乎不支持或者禁用了 HTML5 <code>&lt;canvas&gt;</code> 元素。
      </canvas>
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

export const DefaultProvider = new WebMapTileServiceImageryProvider({
  url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS", //只填写URL也可以加载
  tileMatrixSetID: "1",
  layer: "World_Imagery", //图层名，用于在Cesium中记录该图层的名称
  style: "default", //默认可省略
  format: "image/jpeg", //瓦片格式，可从xml获取
  maximumLevel: 18, //最大缩放层级。不影响图片加载，但是不约束它会导致Cesium频繁请求不存在的瓦片，产生很多报错
  tilingScheme: new WebMercatorTilingScheme({}),
});

/* export const DefaultProvider = new UrlTemplateImageryProvider({
  url: "http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
}); */

export default App;

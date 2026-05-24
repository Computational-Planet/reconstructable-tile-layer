import { Color, Viewer } from "cesium";

export function createViewer(container: HTMLElement) {
  const viewer = new Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    sceneModePicker: true,
    selectionIndicator: false,
    shouldAnimate: true,
    timeline: false,
    useBrowserRecommendedResolution: false,
    orderIndependentTranslucency: false,
    contextOptions: {
      webgl: {
        alpha: true,
      },
    },
  });

  const creditContainer = viewer.cesiumWidget.creditContainer as HTMLDivElement;
  creditContainer.style.display = "none";

  const { scene } = viewer;
  scene.fog.density = 0.0001;
  scene.globe.enableLighting = false;
  scene.globe.baseColor = Color.fromCssColorString("#c9d0d6");
  scene.moon.show = false;
  scene.sun.show = false;
  scene.skyBox.show = false;

  return viewer;
}

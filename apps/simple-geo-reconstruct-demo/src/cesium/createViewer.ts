import {
  Color,
  DynamicAtmosphereLightingType,
  ShadowMode,
  Viewer,
} from "cesium";

export const DEFAULT_GLOBE_BASE_COLOR = "#2f343b";

export function applyGlobeBaseColor(viewer: Viewer, color: string) {
  viewer.scene.globe.baseColor = Color.fromCssColorString(color);
  viewer.scene.requestRender();
}

function disableDecorativeSceneEffects(viewer: Viewer) {
  const { scene } = viewer;
  const controller = scene.screenSpaceCameraController;

  // Keep the scene visually plain so reconstructed tile imagery is the focus.
  scene.backgroundColor = Color.fromCssColorString("#000000");
  scene.fog.enabled = false;
  scene.atmosphere.dynamicLighting = DynamicAtmosphereLightingType.NONE;
  scene.atmosphere.lightIntensity = 0;
  scene.atmosphere.brightnessShift = -1;
  scene.atmosphere.saturationShift = -1;
  scene.globe.enableLighting = false;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.atmosphereLightIntensity = 0;
  scene.globe.atmosphereBrightnessShift = -1;
  scene.globe.atmosphereSaturationShift = -1;
  scene.globe.shadows = ShadowMode.DISABLED;
  scene.moon.show = false;
  scene.sun.show = false;
  scene.sunBloom = false;
  scene.skyBox.show = false;
  scene.skyAtmosphere.show = false;
  scene.shadowMap.enabled = false;
  scene.postProcessStages.fxaa.enabled = false;
  viewer.shadows = false;

  controller.inertiaSpin = 0;
  controller.inertiaTranslate = 0;
  controller.inertiaZoom = 0;
  controller.bounceAnimationTime = 0;
}

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
    shadows: false,
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

  disableDecorativeSceneEffects(viewer);
  applyGlobeBaseColor(viewer, DEFAULT_GLOBE_BASE_COLOR);
  viewer.scene.morphStart.addEventListener(() =>
    disableDecorativeSceneEffects(viewer),
  );
  viewer.scene.morphComplete.addEventListener(() =>
    disableDecorativeSceneEffects(viewer),
  );

  return viewer;
}

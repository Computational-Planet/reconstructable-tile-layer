/** Creates and normalizes the Cesium viewer used by the demo. */
import {
  Color,
  DynamicAtmosphereLightingType,
  Ellipsoid,
  ShadowMode,
  Viewer,
} from "cesium";

export const DEFAULT_GLOBE_BASE_COLOR = "#2f343b";
export const GPLATES_MEAN_EARTH_RADIUS_METERS = 6371009;

export type DemoEllipsoidConfig = {
  ellipsoid: Ellipsoid;
};

export const DEMO_ELLIPSOID_CONFIG: DemoEllipsoidConfig = {
  // GPlates/pyGPlates reconstruction math is sphere based; use a meter-scale
  // sphere so Cesium rendering keeps normal Earth-sized camera distances.
  ellipsoid: new Ellipsoid(
    GPLATES_MEAN_EARTH_RADIUS_METERS,
    GPLATES_MEAN_EARTH_RADIUS_METERS,
    GPLATES_MEAN_EARTH_RADIUS_METERS,
  ),
};

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
  if (scene.moon) {
    scene.moon.show = false;
  }
  if (scene.sun) {
    scene.sun.show = false;
  }
  scene.sunBloom = false;
  if (scene.skyBox) {
    scene.skyBox.show = false;
  }
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = false;
  }
  scene.shadowMap.enabled = false;
  scene.postProcessStages.fxaa.enabled = false;
  viewer.shadows = false;

  controller.inertiaSpin = 0;
  controller.inertiaTranslate = 0;
  controller.inertiaZoom = 0;
  controller.bounceAnimationTime = 0;
}

export function createViewer(
  container: HTMLElement,
  config: DemoEllipsoidConfig = DEMO_ELLIPSOID_CONFIG,
) {
  Ellipsoid.default = config.ellipsoid;

  const viewer = new Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    ellipsoid: config.ellipsoid,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    sceneModePicker: false,
    selectionIndicator: false,
    shadows: false,
    shouldAnimate: true,
    timeline: false,
    useBrowserRecommendedResolution: false,
    orderIndependentTranslucency: false,
    contextOptions: {
      webgl: {
        alpha: true,
        preserveDrawingBuffer: true,
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

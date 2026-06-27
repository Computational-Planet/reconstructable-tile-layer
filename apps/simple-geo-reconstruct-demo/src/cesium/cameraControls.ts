/** Manages camera, viewport, and scene metadata helpers for experiments. */
import {
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  OrthographicFrustum,
  Rectangle,
  SceneMode,
  type Viewer,
} from "cesium";

import type {
  ExperimentCamera3D,
  ExperimentOutputConfig,
  ExperimentProjection,
  ExperimentViewConfig,
  ExperimentViewMode,
  GeographicExtent,
} from "../experiment";
import type { ProviderKey, UrlTemplateProviderConfig } from "./providers";

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function renderViewerFrame(viewer: Viewer) {
  viewer.resize();
  viewer.scene.requestRender();
  await waitForNextPaint();
  viewer.render();
  await waitForNextPaint();
}

export function getSceneModeName(mode: SceneMode) {
  if (mode === SceneMode.SCENE2D) {
    return "SCENE2D";
  }
  if (mode === SceneMode.SCENE3D) {
    return "SCENE3D";
  }
  if (mode === SceneMode.COLUMBUS_VIEW) {
    return "COLUMBUS_VIEW";
  }
  return "MORPHING";
}

export function getExperimentViewMode(mode: SceneMode): ExperimentViewMode {
  if (mode === SceneMode.SCENE2D) {
    return "2D_RECTANGULAR";
  }
  return "3D_GLOBE";
}

export function getExperimentProjection(
  mode: SceneMode,
  providerKey: ProviderKey,
  customProviderConfig: UrlTemplateProviderConfig,
): ExperimentProjection {
  if (mode === SceneMode.SCENE3D) {
    return "OrthographicGlobe";
  }
  if (
    providerKey === "arcgis-world-imagery" ||
    providerKey === "gmrt-topography-wms-3857" ||
    (providerKey === "custom-url-template" &&
      customProviderConfig.tilingSchemeKey === "web-mercator")
  ) {
    return "WebMercator";
  }
  return "PlateCarree";
}

export function rectangleToDegrees(rectangle: Rectangle): GeographicExtent {
  return {
    west: CesiumMath.toDegrees(rectangle.west),
    south: CesiumMath.toDegrees(rectangle.south),
    east: CesiumMath.toDegrees(rectangle.east),
    north: CesiumMath.toDegrees(rectangle.north),
  };
}

export function getCentralMeridian(extent: GeographicExtent | undefined) {
  if (!extent) {
    return 0;
  }

  return (extent.west + extent.east) / 2;
}

export function validateExtent(extent: GeographicExtent) {
  if (
    !Number.isFinite(extent.west) ||
    !Number.isFinite(extent.south) ||
    !Number.isFinite(extent.east) ||
    !Number.isFinite(extent.north)
  ) {
    return "Extent values must be valid numbers.";
  }
  if (extent.west < -180 || extent.east > 180 || extent.west >= extent.east) {
    return "Extent longitude must satisfy -180 <= west < east <= 180.";
  }
  if (
    extent.south < -90 ||
    extent.north > 90 ||
    extent.south >= extent.north
  ) {
    return "Extent latitude must satisfy -90 <= south < north <= 90.";
  }
  return "";
}

export function validateCamera3D(camera3D: ExperimentCamera3D) {
  if (
    !Number.isFinite(camera3D.targetLon) ||
    !Number.isFinite(camera3D.targetLat) ||
    !Number.isFinite(camera3D.range) ||
    !Number.isFinite(camera3D.heading) ||
    !Number.isFinite(camera3D.pitch) ||
    !Number.isFinite(camera3D.roll)
  ) {
    return "Camera pose values must be valid numbers.";
  }
  if (camera3D.targetLon < -180 || camera3D.targetLon > 180) {
    return "Camera target longitude must be between -180 and 180.";
  }
  if (camera3D.targetLat < -90 || camera3D.targetLat > 90) {
    return "Camera target latitude must be between -90 and 90.";
  }
  if (camera3D.range <= 0) {
    return "Camera range must be greater than 0.";
  }
  return "";
}

export function validateOutputConfig(output: ExperimentOutputConfig) {
  if (
    !Number.isInteger(output.width) ||
    !Number.isInteger(output.height) ||
    !Number.isFinite(output.pixelRatio)
  ) {
    return "Output width, height, and pixel ratio must be valid numbers.";
  }
  if (output.width < 1 || output.height < 1) {
    return "Output width and height must be greater than 0.";
  }
  if (output.pixelRatio <= 0 || output.pixelRatio > 4) {
    return "Pixel ratio must be greater than 0 and no larger than 4.";
  }
  return "";
}

export function applySceneMode(viewer: Viewer, viewMode: ExperimentViewMode) {
  if (viewMode === "2D_RECTANGULAR") {
    if (viewer.scene.mode !== SceneMode.SCENE2D) {
      viewer.scene.morphTo2D(0);
    }
  } else if (viewer.scene.mode !== SceneMode.SCENE3D) {
    viewer.scene.morphTo3D(0);
  }

  viewer.resize();
  viewer.scene.requestRender();
}

export function applyExtentView(viewer: Viewer, extent: GeographicExtent) {
  const error = validateExtent(extent);
  if (error) {
    throw new Error(error);
  }

  applySceneMode(viewer, "2D_RECTANGULAR");
  viewer.camera.setView({
    destination: Rectangle.fromDegrees(
      extent.west,
      extent.south,
      extent.east,
      extent.north,
    ),
  });
  viewer.scene.requestRender();
}

export function applyPoseView(viewer: Viewer, camera3D: ExperimentCamera3D) {
  const error = validateCamera3D(camera3D);
  if (error) {
    throw new Error(error);
  }

  applySceneMode(viewer, "3D_GLOBE");
  if (camera3D.orthographic) {
    viewer.camera.switchToOrthographicFrustum();
  } else {
    viewer.camera.switchToPerspectiveFrustum();
  }

  const target = Cartesian3.fromDegrees(
    camera3D.targetLon,
    camera3D.targetLat,
    0,
    viewer.scene.globe.ellipsoid,
  );
  viewer.camera.lookAt(
    target,
    new HeadingPitchRange(
      CesiumMath.toRadians(camera3D.heading),
      CesiumMath.toRadians(camera3D.pitch),
      camera3D.range,
    ),
  );
  if (camera3D.roll !== 0) {
    viewer.camera.twistRight(CesiumMath.toRadians(camera3D.roll));
  }
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
}

export function applyExperimentView(
  viewer: Viewer,
  config: ExperimentViewConfig,
) {
  if (config.viewMode === "2D_RECTANGULAR") {
    applyExtentView(viewer, config.extent);
    return;
  }

  applyPoseView(viewer, config.camera3D);
}

export function isOrthographicCamera(viewer: Viewer) {
  return viewer.camera.frustum instanceof OrthographicFrustum;
}

export function makeAppliedOutputSize(
  output: ExperimentViewConfig["output"],
): ExperimentOutputConfig {
  return {
    ...output,
    width: Math.round(output.width),
    height: Math.round(output.height),
  };
}

import { describe, expect, it, vi } from "vitest";
import {
  Camera,
  Cartesian2,
  Cartesian3,
  Ellipsoid,
  GeographicProjection,
  Matrix4,
  OrthographicFrustum,
  PerspectiveFrustum,
  SceneMode,
  type Scene,
  type Viewer,
} from "cesium";

import {
  applyCameraPreset,
  applyExperimentView,
  applySceneMode,
  getCentralMeridian,
} from "./cameraControls";
import { createDefaultExperimentViewConfig, EXPERIMENT_VIEW_PRESETS } from "../experiment/defaults";
import {
  createExperimentExportInfo,
  type ExperimentExportContext,
} from "../experiment/exportConfig";
import { parseImportedExperimentConfig } from "../experiment/importConfig";
import type { ExperimentViewPreset } from "../experiment/types";
import { getServicePreset } from "./providers";

function createCameraViewer(width = 1280, height = 720) {
  const ellipsoid = new Ellipsoid(6371009, 6371009, 6371009);
  const scene = {
    mode: SceneMode.SCENE3D,
    canvas: { clientWidth: width, clientHeight: height, width, height },
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    mapProjection: new GeographicProjection(ellipsoid),
    globe: { ellipsoid, pickWorldCoordinates: () => undefined },
    requestRender: vi.fn(),
    morphTo3D: vi.fn(),
    morphTo2D: vi.fn(),
  };
  // 使用真实 Cesium Camera 验证极点姿态和投影几何，不需要 WebGL 或开发服务器。
  const camera = new Camera(scene as unknown as Scene);
  const viewer = { scene, camera, resize: vi.fn(), resolutionScale: 1 } as unknown as Viewer;
  return viewer;
}

function createExportContext(viewer: Viewer): ExperimentExportContext {
  return {
    viewer,
    age: 0,
    serviceConfig: getServicePreset("gplates-topography-4326"),
    debugEnabled: false,
    experimentViewConfig: createDefaultExperimentViewConfig(),
    featurePresetKey: "custom",
    featureUrl: "",
    globeBaseColor: "#000000",
    graticuleEnabled: false,
    initialized: false,
    level: 0,
    manager: null,
    polygonRenderIntent: "all-polygons-area",
    primitiveTransformMode: "dynamic3D",
    providerKey: "gplates-topography-4326",
    referencePolygonColor: "#ffffff",
    referencePolygonKey: "off",
    rotationAnchorMode: "default",
    anchorPlateId: "0",
    rotationFiles: [],
    rotPresetKey: "custom",
    stats: null,
    status: "",
    webglProcessor: null,
  };
}

describe("3D camera projections", () => {
  it.each([true, false])("preserves graticule visibility in experiment JSON (%s)", (enabled) => {
    const context = createExportContext(createCameraViewer());
    context.graticuleEnabled = enabled;
    const info = createExperimentExportInfo(context, new Date("2026-01-01T00:00:00Z"), "grid-test");
    expect(info.layers.graticule).toBe(enabled);
    expect(
      parseImportedExperimentConfig(JSON.parse(JSON.stringify(info))).graticuleEnabled,
    ).toBe(enabled);
  });

  it("accepts historical configs without a graticule flag and ignores non-boolean flags", () => {
    for (const layers of [undefined, {}, { graticule: "false" }]) {
      expect(parseImportedExperimentConfig({ schemaVersion: 1, layers }).graticuleEnabled).toBeUndefined();
    }
  });

  it("switches the existing globe's frustum without morphing or moving the camera", () => {
    const viewer = createCameraViewer();
    const position = Cartesian3.clone(viewer.camera.positionWC);
    const direction = Cartesian3.clone(viewer.camera.directionWC);
    for (const mode of ["3D_ORTHOGRAPHIC", "3D_GLOBE", "3D_ORTHOGRAPHIC"] as const) {
      applySceneMode(viewer, mode);
      expect(viewer.camera.frustum).toBeInstanceOf(
        mode === "3D_ORTHOGRAPHIC" ? OrthographicFrustum : PerspectiveFrustum,
      );
      expect(viewer.scene.mode).toBe(SceneMode.SCENE3D);
      expect(viewer.camera.positionWC).toEqual(position);
      expect(viewer.camera.directionWC).toEqual(direction);
    }
    expect(viewer.scene.morphTo3D).not.toHaveBeenCalled();
    expect(viewer.scene.morphTo2D).not.toHaveBeenCalled();
  });

  for (const orthographic of [true, false]) {
    for (const [width, height] of [
      [1280, 720],
      [720, 1280],
    ]) {
      it.each(Object.keys(EXPERIMENT_VIEW_PRESETS) as ExperimentViewPreset[])(
        `%s is centered and the entire globe fits at ${width}×${height}, orthographic=${orthographic}`,
        (preset) => {
          const viewer = createCameraViewer(width, height);
          const pose = applyCameraPreset(viewer, preset, orthographic);
          const ellipsoid = viewer.scene.globe.ellipsoid;
          const expectedCenter = Cartesian3.fromDegrees(
            pose.targetLon,
            pose.targetLat,
            0,
            ellipsoid,
          );
          const center = viewer.camera.pickEllipsoid(
            new Cartesian2(width / 2, height / 2),
            ellipsoid,
          );
          expect(center).toBeDefined();
          expect(Cartesian3.distance(center!, expectedCenter)).toBeLessThan(0.001);
          expect(viewer.camera.transform).toEqual(Matrix4.IDENTITY);
          const frustum = viewer.camera.frustum;
          if (frustum instanceof OrthographicFrustum) {
            expect(Math.min(frustum.width, frustum.width / frustum.aspectRatio)).toBeGreaterThan(
              ellipsoid.maximumRadius * 2,
            );
          } else {
            expect(frustum).toBeInstanceOf(PerspectiveFrustum);
            const perspective = frustum as PerspectiveFrustum;
            const angularRadius = Math.asin(
              ellipsoid.maximumRadius / Cartesian3.magnitude(viewer.camera.positionWC),
            );
            expect(angularRadius).toBeLessThan(perspective.fovy / 2);
            expect(angularRadius).toBeLessThan(
              Math.atan(Math.tan(perspective.fovy / 2) * perspective.aspectRatio),
            );
          }

          const context = createExportContext(viewer);
          context.experimentViewConfig.camera3D = pose;
          const info = createExperimentExportInfo(
            context,
            new Date("2026-01-01T00:00:00Z"),
            "camera-test",
          );
          expect(info.viewMode).toBe(orthographic ? "3D_ORTHOGRAPHIC" : "3D_GLOBE");
          expect(info.projection).toBe(orthographic ? "OrthographicGlobe" : "PerspectiveGlobe");
          if (preset === "antimeridian") expect(Math.abs(info.centralMeridian)).toBeCloseTo(180);
          const imported = parseImportedExperimentConfig(
            JSON.parse(JSON.stringify(info)),
          ).experimentViewConfig!;
          const restored = createCameraViewer(width, height);
          applyExperimentView(restored, { ...context.experimentViewConfig, ...imported });
          expect(
            Cartesian3.distance(restored.camera.positionWC, viewer.camera.positionWC),
          ).toBeLessThan(0.001);
          expect(
            Cartesian3.distance(restored.camera.directionWC, viewer.camera.directionWC),
          ).toBeLessThan(1e-8);
          expect(restored.camera.frustum.constructor).toBe(viewer.camera.frustum.constructor);
        },
      );
    }
  }

  it("migrates historical orthographic configs while preserving 2D configs", () => {
    const camera3D = { ...createDefaultExperimentViewConfig().camera3D, orthographic: true };
    expect(
      parseImportedExperimentConfig({ schemaVersion: 1, viewMode: "3D_GLOBE", camera3D })
        .experimentViewConfig?.viewMode,
    ).toBe("3D_ORTHOGRAPHIC");
    expect(
      parseImportedExperimentConfig({ schemaVersion: 1, viewMode: "2D_RECTANGULAR", camera3D })
        .experimentViewConfig?.viewMode,
    ).toBe("2D_RECTANGULAR");
    const imported = parseImportedExperimentConfig({
      schemaVersion: 1,
      viewMode: "3D_ORTHOGRAPHIC",
      camera3D: { ...camera3D, orthographic: false },
    }).experimentViewConfig!;
    expect(imported.camera3D?.orthographic).toBe(true);
  });

  it("treats the explicit projection as authoritative when applying a view", () => {
    const viewer = createCameraViewer();
    const config = createDefaultExperimentViewConfig();
    applyExperimentView(viewer, { ...config, viewMode: "3D_ORTHOGRAPHIC" });
    expect(viewer.camera.frustum).toBeInstanceOf(OrthographicFrustum);
    applyExperimentView(viewer, {
      ...config,
      viewMode: "3D_GLOBE",
      camera3D: { ...config.camera3D, orthographic: true },
    });
    expect(viewer.camera.frustum).toBeInstanceOf(PerspectiveFrustum);
  });

  it("keeps dateline-crossing extents centered on the antimeridian", () => {
    expect(getCentralMeridian({ west: 170, east: -170, south: -30, north: 30 })).toBe(180);
    expect(getCentralMeridian({ west: -180, east: 180, south: -90, north: 90 })).toBe(0);
  });
});

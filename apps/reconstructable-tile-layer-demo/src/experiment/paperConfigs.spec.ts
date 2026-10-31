import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  Cartesian3,
  Ellipsoid,
  Math as CesiumMath,
  OrthographicFrustum,
  GeographicProjection,
  ImageryLayerCollection,
  PrimitiveCollection,
  Rectangle,
  SceneMode,
  type Viewer,
} from "cesium";
import type { WebGLTileProcessor } from "reconstructable-tile-layer/processor";
import { LayerController } from "../layers/LayerController";
import { exportLayerDefinitions } from "../layers/serialization";
import { useExperimentIO as createExperimentIO } from "../hooks/useExperimentIO";
import { createDefaultExperimentViewConfig } from "./defaults";
import { createExperimentExportInfo } from "./exportConfig";
import { parseImportedExperimentConfig } from "./importConfig";
import type { ExperimentExportInfo } from "./types";

type PaperConfig = Pick<
  ExperimentExportInfo,
  | "schemaVersion"
  | "caseId"
  | "modelName"
  | "timeMa"
  | "viewMode"
  | "camera3D"
  | "extent"
  | "sources"
  | "layerStack"
> & {
  output: { width: number; height: number; pixelRatio: number };
  layers: Pick<ExperimentExportInfo["layers"], "graticule" | "backgroundColor">;
  render: Pick<
    ExperimentExportInfo["render"],
    "level" | "polygonRenderIntent" | "primitiveTransformMode" | "debugEnabled"
  >;
};
const configurations = Object.entries(
  import.meta.glob<PaperConfig>("../../../../paper_configs/**/*.json", {
    eager: true,
    import: "default",
  }),
);

function setup() {
  const primitives = new PrimitiveCollection();
  const imageryLayers = new ImageryLayerCollection();
  const viewer = {
    imageryLayers,
    scene: {
      primitives,
      globe: { ellipsoid: Ellipsoid.WGS84 },
      requestRender: vi.fn(),
    },
    isDestroyed: () => false,
  } as unknown as Viewer;
  const controller = new LayerController(viewer, {} as WebGLTileProcessor);
  const options = {
    layerControllerRef: { current: controller },
    viewerRef: { current: null },
    experimentViewConfig: createDefaultExperimentViewConfig(),
    onImportSources: vi.fn(() => controller.restore([])),
    applyImportedFeatureSource: vi.fn(),
    applyImportedRotationSources: vi.fn(),
    setAge: vi.fn(),
    setAppliedOutputSize: vi.fn(),
    setServiceConfig: vi.fn(),
    setDebugEnabled: vi.fn(),
    setExperimentViewConfig: vi.fn(),
    setGlobeBaseColor: vi.fn(),
    setGraticuleEnabled: vi.fn(),
    setLevel: vi.fn(),
    setPolygonRenderIntent: vi.fn(),
    setPrimitiveTransformMode: vi.fn(),
    setProviderKey: vi.fn(),
    setReferencePolygonColor: vi.fn(),
    setReferencePolygonKey: vi.fn(),
    setRotationAnchorMode: vi.fn(),
    setAnchorPlateIdInput: vi.fn(),
    setStatus: vi.fn(),
  };
  // 导入不需要 WebGL；控制器和 Cesium 集合保持真实，网络与渲染在手动加载时发生。
  const io = createExperimentIO(options as unknown as Parameters<typeof createExperimentIO>[0]);
  return {
    controller,
    options,
    io,
    dispose() {
      controller.destroy();
      imageryLayers.destroy();
      primitives.destroy();
    },
  };
}

describe("repository paper figure configurations", () => {
  it("covers the current manuscript panels and their loading helper", () => {
    expect(configurations.map(([file]) => file).sort()).toEqual([
      "../../../../paper_configs/case/Figure_5a_0Ma_L4.json",
      "../../../../paper_configs/case/Figure_5b_132Ma_L4.json",
      "../../../../paper_configs/case/Figure_5c_120Ma_L4.json",
      "../../../../paper_configs/case/Figure_5d_100Ma_L4.json",
      "../../../../paper_configs/case/Figure_6a_120Ma_Local_L4.json",
      "../../../../paper_configs/case/Figure_6b_120Ma_Local_View_L8.json",
      "../../../../paper_configs/case/Figure_6c_120Ma_Coverage_Overview.json",
      "../../../../paper_configs/case/Figure_7a_120Ma_Zahirovic2022_L4.json",
      "../../../../paper_configs/case/Figure_7b_120Ma_Seton2012_L4.json",
      "../../../../paper_configs/case/steps/Figure_6c_Load_Local_First.json",
      "../../../../paper_configs/evaluation/Figure_8a_RTL_Global2D_120Ma.json",
      "../../../../paper_configs/evaluation/Figure_8b_RTL_Orthographic_0_0_120Ma.json",
      "../../../../paper_configs/evaluation/Figure_8c_RTL_Orthographic_180_0_120Ma.json",
      "../../../../paper_configs/evaluation/Figure_8d_RTL_NorthPole_120Ma.json",
      "../../../../paper_configs/evaluation/Figure_8e_RTL_SouthPole_120Ma.json",
      "../../../../paper_configs/evaluation/Figure_9b_RTL_Overlap2D_120Ma.json",
    ]);
    for (const [file, config] of configurations) {
      expect(config.caseId).toBe(
        file
          .split("/")
          .pop()!
          .replace(/\.json$/, ""),
      );
    }
  });

  it.each(configurations)(
    "imports and round trips %s without manual layer creation",
    async (_file, config) => {
      const { controller, options, io, dispose } = setup();
      try {
        await io.handleImportExperimentConfig({
          name: _file,
          text: async () => JSON.stringify(config),
        } as File);
        expect(options.setStatus.mock.lastCall?.[0]).toContain(
          `${config.layerStack.length} layers restored`,
        );
        const saved = exportLayerDefinitions(controller.definitions);
        expect(saved).toEqual(config.layerStack);
        // 本地栅格保留“重选文件”状态；导入不得误报已加载或丢失隐藏图层。
        for (const [index, layer] of config.layerStack.entries()) {
          expect(controller.snapshot.layers[index].status).toBe(
            layer.source.kind === "service" ? "unloaded" : "needs-file",
          );
          expect(controller.snapshot.layers[index].mode).toBe(layer.mode);
        }
        expect(options.setAge).toHaveBeenCalledWith(config.timeMa);
        expect(options.setLevel).toHaveBeenCalledWith(config.render.level);
        expect(options.setServiceConfig).toHaveBeenCalledWith(config.sources.serviceConfig);
        expect(options.setReferencePolygonKey).toHaveBeenCalledWith(
          config.sources.gplatesReferencePolygonKey,
        );
        expect(options.applyImportedFeatureSource).toHaveBeenCalledWith(
          config.sources.featureUrl,
          config.sources.featurePresetKey,
        );
        expect(options.applyImportedRotationSources).toHaveBeenCalledWith(
          config.sources.rotUrls,
          config.sources.rotationPresetKey,
        );
        expect(options.setExperimentViewConfig.mock.lastCall?.[0]).toMatchObject({
          caseId: config.caseId,
          viewMode: config.viewMode,
          extent: config.extent,
          output: config.output,
          ...(config.camera3D ? { camera3D: config.camera3D } : {}),
        });

        for (const url of [
          config.sources.featureUrl,
          ...config.sources.rotUrls,
          config.sources.gplatesReferencePolygonUrl,
          ...config.layerStack.flatMap((layer) => [
            layer.model?.featureUrl,
            ...(layer.model?.rotationUrls ?? []),
          ]),
        ]) {
          if (url?.startsWith("/"))
            expect(existsSync(new URL(`../../public${url}`, import.meta.url)), url).toBe(true);
        }
        expect(config).not.toHaveProperty("stats");
        expect(config.render).not.toHaveProperty("status");

        const imported = parseImportedExperimentConfig(config);
        // 导出使用真实配置构造器，仅替代本轮不运行的相机和 Canvas。
        const extent = config.extent!;
        const camera3D = config.camera3D;
        const is3D = config.viewMode !== "2D_RECTANGULAR";
        const viewer = {
          resolutionScale: config.output.pixelRatio,
          camera: {
            computeViewRectangle: () =>
              Rectangle.fromDegrees(extent.west, extent.south, extent.east, extent.north),
            positionCartographic: {
              longitude: 0,
              latitude: 0,
              height: 10000000,
            },
            pickEllipsoid: () =>
              Cartesian3.fromDegrees(camera3D?.targetLon ?? 0, camera3D?.targetLat ?? 0),
            heading: CesiumMath.toRadians(camera3D?.heading ?? 0),
            pitch: CesiumMath.toRadians(camera3D?.pitch ?? 0),
            roll: CesiumMath.toRadians(camera3D?.roll ?? 0),
            frustum: is3D ? new OrthographicFrustum() : {},
          },
          scene: {
            mode: is3D ? SceneMode.SCENE3D : SceneMode.SCENE2D,
            globe: { ellipsoid: Ellipsoid.WGS84 },
            mapProjection: new GeographicProjection(),
            canvas: {
              clientWidth: config.output.width,
              clientHeight: config.output.height,
              width: config.output.width * config.output.pixelRatio,
              height: config.output.height * config.output.pixelRatio,
            },
          },
        } as unknown as Viewer;
        const exported = createExperimentExportInfo(
          {
            viewer,
            age: config.timeMa,
            layerStack: controller.definitions,
            experimentViewConfig: {
              ...createDefaultExperimentViewConfig(),
              ...imported.experimentViewConfig,
              camera3D: {
                ...createDefaultExperimentViewConfig().camera3D,
                ...imported.experimentViewConfig?.camera3D,
              },
              extent,
              output: config.output,
            },
            serviceConfig: config.sources.serviceConfig!,
            providerKey: config.sources.providerKey,
            featurePresetKey: config.sources.featurePresetKey,
            featureUrl: config.sources.featureUrl,
            referencePolygonColor: config.sources.gplatesReferencePolygonColor,
            referencePolygonKey: config.sources.gplatesReferencePolygonKey,
            rotationAnchorMode: config.sources.rotationAnchorMode,
            anchorPlateId: config.sources.anchorPlateId,
            rotationFiles: config.sources.rotUrls,
            rotPresetKey: config.sources.rotationPresetKey,
            globeBaseColor: config.layers.backgroundColor,
            graticuleEnabled: config.layers.graticule,
            initialized: true,
            level: config.render.level,
            polygonRenderIntent: imported.polygonRenderIntent!,
            primitiveTransformMode: imported.primitiveTransformMode!,
            debugEnabled: config.render.debugEnabled,
            manager: null,
            stats: null,
            status: "",
            webglProcessor: null,
          },
          new Date("2026-10-31T00:00:00Z"),
          config.caseId,
        );
        const restored = parseImportedExperimentConfig(JSON.parse(JSON.stringify(exported)));
        expect(restored.layerStack).toEqual(saved);
        expect(restored.age).toBe(config.timeMa);
        expect(restored.serviceConfig).toEqual(config.sources.serviceConfig);
        expect(restored.referencePolygonKey).toBe(config.sources.gplatesReferencePolygonKey);
        expect(restored.experimentViewConfig?.extent).toEqual(config.extent);
        expect(restored.experimentViewConfig?.output).toEqual(config.output);
        expect(restored.experimentViewConfig?.viewMode).toBe(config.viewMode);
        if (camera3D) expect(restored.experimentViewConfig?.camera3D).toEqual(camera3D);
      } finally {
        dispose();
      }
    },
  );

  it("keeps the current layers when a configuration fails validation", async () => {
    const { controller, options, io, dispose } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const config = configurations[0][1];
      controller.restore(config.layerStack);
      const before = controller.definitions;
      for (const invalid of [
        { ...config, layerStack: undefined },
        {
          ...config,
          layerStack: [{ ...config.layerStack[0], loadMode: "guess" }],
        },
        {
          ...config,
          layerStack: [
            {
              ...config.layerStack[0],
              source: { kind: "service", config: {} },
            },
          ],
        },
      ]) {
        await io.handleImportExperimentConfig({
          name: "invalid.json",
          text: async () => JSON.stringify(invalid),
        } as File);
        expect(options.onImportSources).not.toHaveBeenCalled();
        expect(controller.definitions).toEqual(before);
      }
    } finally {
      error.mockRestore();
      dispose();
    }
  });
});

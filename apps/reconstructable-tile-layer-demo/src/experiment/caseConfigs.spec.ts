import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  Ellipsoid,
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

type CaseConfig = Pick<
  ExperimentExportInfo,
  | "schemaVersion"
  | "caseId"
  | "modelName"
  | "timeMa"
  | "viewMode"
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
const cases = Object.entries(
  import.meta.glob<CaseConfig>("../../../../case_configs/**/*.json", {
    eager: true,
    import: "default",
  }),
);

function setup() {
  const primitives = new PrimitiveCollection();
  const imageryLayers = new ImageryLayerCollection();
  const viewer = {
    imageryLayers,
    scene: { primitives, globe: { ellipsoid: Ellipsoid.WGS84 }, requestRender: vi.fn() },
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

describe("repository case configurations", () => {
  it("covers all case groups and records view loading explicitly", () => {
    expect(cases).toHaveLength(25);
    expect(
      cases.filter(([, config]) => config.layerStack[0].loadMode === "view").map(([file]) => file),
    ).toEqual(["../../../../case_configs/case3/Case3_120Ma_Load_by_View.json"]);
  });

  it.each(cases)(
    "imports and round trips %s without manual layer creation",
    async (_file, config) => {
      const { controller, options, io, dispose } = setup();
      try {
        await io.handleImportExperimentConfig({
          name: _file,
          text: async () => JSON.stringify(config),
        } as File);
        expect(options.setStatus.mock.lastCall?.[0]).toContain("1 layers restored");
        const saved = exportLayerDefinitions(controller.definitions);
        expect(saved).toEqual(config.layerStack);
        expect(controller.snapshot.layers[0].status).toBe("unloaded");
        expect(controller.snapshot.layers[0].mode).toBe("reconstructable");
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
        });

        for (const url of [
          config.sources.featureUrl,
          ...config.sources.rotUrls,
          config.sources.gplatesReferencePolygonUrl,
        ]) {
          if (url?.startsWith("/"))
            expect(existsSync(new URL(`../../public${url}`, import.meta.url)), url).toBe(true);
        }
        expect(config).not.toHaveProperty("stats");
        expect(config.render).not.toHaveProperty("status");

        const imported = parseImportedExperimentConfig(config);
        // 导出使用真实配置构造器，仅替代本轮不运行的相机和 Canvas。
        const extent = config.extent!;
        const viewer = {
          resolutionScale: config.output.pixelRatio,
          camera: {
            computeViewRectangle: () =>
              Rectangle.fromDegrees(extent.west, extent.south, extent.east, extent.north),
            positionCartographic: { longitude: 0, latitude: 0, height: 10000000 },
            heading: 0,
            pitch: 0,
            roll: 0,
            frustum: {},
          },
          scene: {
            mode: SceneMode.SCENE2D,
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
          new Date("2026-10-23T00:00:00Z"),
          config.caseId,
        );
        const restored = parseImportedExperimentConfig(JSON.parse(JSON.stringify(exported)));
        expect(restored.layerStack).toEqual(saved);
        expect(restored.age).toBe(config.timeMa);
        expect(restored.serviceConfig).toEqual(config.sources.serviceConfig);
        expect(restored.referencePolygonKey).toBe(config.sources.gplatesReferencePolygonKey);
        expect(restored.experimentViewConfig?.extent).toEqual(config.extent);
        expect(restored.experimentViewConfig?.output).toEqual(config.output);
      } finally {
        dispose();
      }
    },
  );

  it("keeps the current layers when a configuration fails validation", async () => {
    const { controller, options, io, dispose } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const config = cases[0][1];
      controller.restore(config.layerStack);
      const before = controller.definitions;
      for (const invalid of [
        { ...config, layerStack: undefined },
        { ...config, layerStack: [{ ...config.layerStack[0], loadMode: "guess" }] },
        {
          ...config,
          layerStack: [{ ...config.layerStack[0], source: { kind: "service", config: {} } }],
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

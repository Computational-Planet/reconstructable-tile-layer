import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Ellipsoid,
  CustomDataSource,
  ColorMaterialProperty,
  ConstantProperty,
  DataSourceCollection,
  GeoJsonDataSource,
  JulianDate,
  PinBuilder,
  ImageryLayer,
  ImageryLayerCollection,
  PrimitiveCollection,
  UrlTemplateImageryProvider,
  type Viewer,
} from "cesium";
import type { WebGLTileProcessor } from "reconstructable-tile-layer/processor";
import { ReconstructableTileLayer } from "reconstructable-tile-layer";
import { emptyTileServiceConfig } from "../cesium/tileServiceConfig";
import { LayerController } from "./LayerController";
import type { LayerDefinition, NewLayer } from "./types";
import { parseGeoJson, type LocalGeoJsonDescriptor } from "../vector/geojson";

const config = { ...emptyTileServiceConfig(), url: "https://example.com/{z}/{x}/{y}.png" };
const ordinary: NewLayer = {
  name: "Ordinary imagery",
  mode: "static",
  source: { kind: "service", config },
  visible: true,
  opacity: 1,
  ageRange: null,
  loadMode: "level",
  level: 2,
};

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

function setup() {
  // 使用真实 Cesium 集合验证生命周期与排序；不需要 WebGL 或任何瓦片网络请求。
  const imageryLayers = new ImageryLayerCollection();
  const primitives = new PrimitiveCollection();
  const dataSources = new DataSourceCollection();
  const viewer = {
    imageryLayers,
    dataSources,
    clock: { currentTime: JulianDate.now() },
    flyTo: vi.fn(async () => true),
    scene: { primitives, globe: { ellipsoid: Ellipsoid.WGS84 }, requestRender: vi.fn() },
    isDestroyed: () => false,
  } as unknown as Viewer;
  const clearProvider = vi.fn();
  const processor = { clearProvider } as unknown as WebGLTileProcessor;
  const controller = new LayerController(viewer, processor);
  cleanup.push(() => {
    controller.destroy();
    imageryLayers.destroy();
    dataSources.destroy();
    primitives.destroy();
  });
  return { controller, imageryLayers, primitives, clearProvider, dataSources, viewer };
}

describe("saved reconstruction loading", () => {
  it("dispatches the saved mode, records explicit overrides, and replays the result", async () => {
    // 只替代 RTL 的耗时入口，验证真实控制器如何调用库和更新可导出的定义。
    vi.spyOn(ReconstructableTileLayer.prototype, "initialize").mockResolvedValue();
    vi.spyOn(ReconstructableTileLayer.prototype, "bindSceneModeSync").mockReturnValue(() => {});
    vi.spyOn(ReconstructableTileLayer.prototype, "setReconstructionAge").mockResolvedValue();
    vi.spyOn(ReconstructableTileLayer.prototype, "destroy").mockImplementation(() => {});
    const clear = vi
      .spyOn(ReconstructableTileLayer.prototype, "clear")
      .mockImplementation(() => {});
    const levelLoad = vi
      .spyOn(ReconstructableTileLayer.prototype, "loadSourceTilesAtLevel")
      .mockResolvedValue();
    const viewLoad = vi
      .spyOn(ReconstructableTileLayer.prototype, "refineTilesForView")
      .mockResolvedValue({ level: 4, loadedCount: 0, taskCount: 0 });
    const { controller, viewer } = setup();
    const model = {
      name: "Test model",
      featureUrl: "/plates.gpml",
      featureLabel: "plates.gpml",
      rotationUrls: ["/model.rot"],
      rotationLabels: ["model.rot"],
      anchorPlateId: "0",
    };
    controller.restore([
      { ...ordinary, id: "case", mode: "reconstructable", model, loadMode: "view" },
    ]);
    await controller.load("case");
    expect(viewLoad).toHaveBeenCalledWith(viewer, { minLevel: 2 });
    expect(levelLoad).not.toHaveBeenCalled();
    expect(controller.definitions[0].loadMode).toBe("view");
    await controller.load("case", 4);
    expect(levelLoad).toHaveBeenLastCalledWith(viewer, 4);
    expect(controller.definitions[0]).toMatchObject({ loadMode: "level", level: 4 });
    expect(() => controller.update("case", { level: 20 })).toThrow(/service range/);
    expect(controller.definitions[0].level).toBe(4);
    await controller.load("case");
    expect(levelLoad).toHaveBeenCalledTimes(2);
    await controller.load("case", 4, true);
    expect(controller.definitions[0]).toMatchObject({ loadMode: "view", level: 4 });
    expect(clear).toHaveBeenCalledTimes(2);
    const saved = controller.definitions;
    controller.restore(saved);
    await controller.load("case");
    expect(viewLoad).toHaveBeenCalledTimes(3);
    expect(controller.snapshot.layers[0].status).toBe("ready");
  });

  it("selects view levels within the provider range without validating the unused fixed level", async () => {
    vi.spyOn(ReconstructableTileLayer.prototype, "initialize").mockResolvedValue();
    vi.spyOn(ReconstructableTileLayer.prototype, "bindSceneModeSync").mockReturnValue(() => {});
    vi.spyOn(ReconstructableTileLayer.prototype, "setReconstructionAge").mockResolvedValue();
    vi.spyOn(ReconstructableTileLayer.prototype, "destroy").mockImplementation(() => {});
    const viewLoad = vi
      .spyOn(ReconstructableTileLayer.prototype, "refineTilesForView")
      .mockResolvedValue({ level: 5, loadedCount: 0, taskCount: 0 });
    const { controller, viewer } = setup();
    const provider = new UrlTemplateImageryProvider({
      url: config.url,
      minimumLevel: 5,
      maximumLevel: 7,
    });
    const id = (await controller.add(
      {
        ...ordinary,
        mode: "reconstructable",
        loadMode: "view",
        level: 2,
        model: {
          name: "Model",
          featureUrl: "/plates.gpml",
          featureLabel: "plates",
          rotationUrls: ["/model.rot"],
          rotationLabels: ["rot"],
          anchorPlateId: "0",
        },
      },
      { provider, release: () => {} },
    ))!;
    await controller.load(id);
    expect(viewLoad).toHaveBeenCalledWith(viewer, { minLevel: 5 });
    expect(controller.snapshot.layers[0].status).toBe("ready");
    await controller.load(id, 2, false);
    expect(controller.snapshot.layers[0].message).toContain("L5–L7");
    expect(controller.definitions[0].loadMode).toBe("view");
  });
});

const vectorData = parseGeoJson(
  JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "point",
        properties: {},
        geometry: { type: "Point", coordinates: [10, 20] },
      },
      {
        type: "Feature",
        id: "line",
        properties: { "stroke-opacity": 0.8 },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [10, 10],
          ],
        },
      },
      {
        type: "Feature",
        id: "polygon",
        properties: { "fill-opacity": 0.4, "stroke-opacity": 0.6 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0],
            ],
          ],
        },
      },
    ],
  }),
);
const descriptor: LocalGeoJsonDescriptor = {
  schemaVersion: 1,
  format: "geojson",
  coordinates: "WGS84-longitude-latitude",
  file: { name: "mixed.geojson", size: 400, lastModified: 1, requiresReselect: true },
  summary: vectorData.summary,
};
const vector: NewLayer = {
  ...ordinary,
  name: "Mixed vector",
  source: { kind: "geojson", descriptor },
};
const vectorSource = () => ({ geojson: vectorData.data, release: () => {} });

describe("native ordinary vectors", () => {
  it("preserves geometry and feature alpha while applying age/visibility/opacity; leaves imagery and reference sources alone", async () => {
    // 仅替代需 Canvas 的图钉绘制；几何、属性和 DataSource 集合使用真实 Cesium。
    vi.spyOn(PinBuilder.prototype, "fromColor").mockReturnValue({} as HTMLCanvasElement);
    const { controller, dataSources, viewer, imageryLayers, clearProvider } = setup();
    const reference = await dataSources.add(new CustomDataSource("reference"));
    await controller.add(ordinary);
    const id = (await controller.add(vector, vectorSource()))!;
    const source = dataSources.get(1) as GeoJsonDataSource;
    expect(source).toBeInstanceOf(GeoJsonDataSource);
    expect(source.entities.values).toHaveLength(3);
    const point = source.entities.getById("point")!,
      line = source.entities.getById("line")!,
      polygon = source.entities.getById("polygon")!;
    const time = viewer.clock.currentTime;
    const position = point.position!.getValue(time);
    for (const alpha of [0.5, 0, 0.25, 1]) {
      controller.update(id, { opacity: alpha });
      expect(point.billboard!.color!.getValue(time).alpha).toBeCloseTo(alpha);
      expect(line.polyline!.material!.getValue(time).color.alpha).toBeCloseTo(0.8 * alpha);
      expect(polygon.polygon!.material!.getValue(time).color.alpha).toBeCloseTo(0.4 * alpha);
      expect(polygon.polygon!.outlineColor!.getValue(time).alpha).toBeCloseTo(0.6 * alpha);
    }
    const fillColor = (polygon.polygon!.material as ColorMaterialProperty)
      .color as ConstantProperty;
    const colorChanged = vi.spyOn(fillColor, "setValue");
    controller.update(id, { name: "Renamed", ageRange: { youngestMa: 50, oldestMa: 100 } });
    expect(source.name).toBe("Renamed");
    expect(source.show).toBe(false);
    for (const age of [50, 100]) {
      controller.setAge(age);
      expect(source.show).toBe(true);
    }
    controller.setAge(101);
    expect(source.show).toBe(false);
    controller.update(id, { visible: false });
    controller.setAge(75);
    expect(source.show).toBe(false);
    expect(point.position!.getValue(time)).toEqual(position);
    expect(colorChanged).not.toHaveBeenCalled();
    await controller.load(id, 4);
    controller.clear(id);
    controller.move(id, "down");
    expect(controller.definitions.at(-1)?.id).toBe(id);
    expect(source.entities.values).toHaveLength(3);
    await controller.focus(id);
    expect(viewer.flyTo).toHaveBeenCalledWith(source, { duration: 0.5 });
    controller.remove(id);
    expect(dataSources.length).toBe(1);
    expect(dataSources.get(0)).toBe(reference);
    expect(source.entities.values).toHaveLength(0);
    expect(imageryLayers.length).toBe(1);
    expect(clearProvider).not.toHaveBeenCalled();
  });

  it.each(["remove", "restore", "destroy", "abort"])(
    "does not resurrect a GeoJSON load after %s",
    async (action) => {
      vi.spyOn(PinBuilder.prototype, "fromColor").mockReturnValue({} as HTMLCanvasElement);
      const { controller, dataSources } = setup();
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const original = GeoJsonDataSource.prototype.load;
      vi.spyOn(GeoJsonDataSource.prototype, "load").mockImplementationOnce(function (
        this: GeoJsonDataSource,
        data,
        options,
      ) {
        return gate.then(() => original.call(this, data, options));
      });
      const abort = new AbortController();
      const pending = controller.add(vector, vectorSource(), undefined, abort.signal);
      if (action === "remove") controller.remove(controller.snapshot.selectedId!);
      else if (action === "restore") controller.restore([]);
      else if (action === "destroy") controller.destroy();
      else abort.abort();
      finish();
      expect(await pending).toBeNull();
      expect(dataSources.length).toBe(0);
      expect(controller.snapshot.layers).toEqual([]);
    },
  );

  it("detaches a layer removed while DataSourceCollection.add is settling", async () => {
    vi.spyOn(PinBuilder.prototype, "fromColor").mockReturnValue({} as HTMLCanvasElement);
    const { controller, dataSources } = setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const original = dataSources.add.bind(dataSources);
    const add = vi
      .spyOn(dataSources, "add")
      .mockImplementationOnce((data) => gate.then(() => original(data)));
    const pending = controller.add(vector, vectorSource());
    await vi.waitFor(() => expect(add).toHaveBeenCalled());
    controller.remove(controller.snapshot.selectedId!);
    finish();
    expect(await pending).toBeNull();
    expect(dataSources.length).toBe(0);
  });

  it("restores the saved vector identity, range and opacity when the file is reselected", async () => {
    vi.spyOn(PinBuilder.prototype, "fromColor").mockReturnValue({} as HTMLCanvasElement);
    const { controller, dataSources } = setup();
    const saved = {
      ...vector,
      id: "saved",
      name: "Saved name",
      visible: false,
      opacity: 0.3,
      ageRange: { youngestMa: 10, oldestMa: 20 },
    };
    controller.restore([saved]);
    expect(dataSources.length).toBe(0);
    expect(controller.snapshot.layers[0].status).toBe("needs-file");
    const id = await controller.add(vector, vectorSource(), saved.id);
    expect(id).toBe(saved.id);
    expect(controller.definitions).toEqual([saved]);
    expect(dataSources.get(0).show).toBe(false);
    const polygon = dataSources.get(0).entities.getById("polygon")!;
    expect(polygon.polygon!.material!.getValue(JulianDate.now()).color.alpha).toBeCloseTo(0.12);
  });
});

describe("native ordinary imagery", () => {
  it("delegates to ImageryLayer and applies time/visibility/alpha without reordering or rebuilding", async () => {
    const { controller, imageryLayers, primitives, clearProvider } = setup();
    const id = (await controller.add(ordinary))!;
    const imagery = imageryLayers.get(0);
    expect(imagery).toBeInstanceOf(ImageryLayer);
    expect((primitives.get(0) as PrimitiveCollection).length).toBe(0);
    const moved = vi.fn();
    imageryLayers.layerMoved.addEventListener(moved);
    controller.update(id, { opacity: 0.35, ageRange: { youngestMa: 100, oldestMa: 150 } });
    expect(imagery.alpha).toBe(0.35);
    expect(imagery.show).toBe(false);
    for (const age of [100, 150]) {
      controller.setAge(age);
      expect(imagery.show).toBe(true);
    }
    controller.setAge(151);
    expect(imagery.show).toBe(false);
    controller.update(id, { visible: false });
    controller.setAge(125);
    expect(imagery.show).toBe(false);
    controller.update(id, { visible: true });
    expect(imagery.show).toBe(true);
    await controller.load(id, 8);
    controller.clear(id);
    expect(imageryLayers.get(0)).toBe(imagery);
    expect(imagery.isDestroyed()).toBe(false);
    expect(controller.snapshot.layers[0].level).toBe(2);
    expect(moved).not.toHaveBeenCalled();
    expect(clearProvider).not.toHaveBeenCalled();
  });

  it("reorders native imagery and releases each source only after detaching its layer", async () => {
    const { controller, imageryLayers, clearProvider } = setup();
    const background = imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({ url: config.url }),
    );
    const provider = new UrlTemplateImageryProvider({ url: config.url });
    const release = vi.fn(() => {
      expect(first.isDestroyed()).toBe(true);
      expect(imageryLayers.contains(first)).toBe(false);
    });
    const id = (await controller.add(ordinary, { provider, release }))!;
    const first = imageryLayers.get(1);
    const otherId = (await controller.add({ ...ordinary, name: "Second" }))!;
    const second = imageryLayers.get(2);
    controller.move(id, "up");
    expect(imageryLayers.get(2)).toBe(first);
    expect(controller.definitions.map((layer) => layer.id)).toEqual([otherId, id]);
    controller.remove(id);
    controller.remove(id);
    expect(release).toHaveBeenCalledTimes(1);
    expect(second.isDestroyed()).toBe(false);
    expect(imageryLayers.get(1)).toBe(second);
    controller.destroy();
    expect(second.isDestroyed()).toBe(true);
    expect(imageryLayers.length).toBe(1);
    expect(imageryLayers.get(0)).toBe(background);
    expect(background.isDestroyed()).toBe(false);
    expect(clearProvider).not.toHaveBeenCalled();
  });

  it("automatically restores ordinary services and preserves within-group order in mixed stacks", async () => {
    const { controller, imageryLayers } = setup();
    const definitions: LayerDefinition[] = [
      { ...ordinary, id: "rtl-a", mode: "reconstructable" },
      { ...ordinary, id: "native-a", visible: false, opacity: 0.25 },
      { ...ordinary, id: "rtl-b", mode: "reconstructable" },
      { ...ordinary, id: "native-b" },
    ];
    controller.restore(definitions);
    await vi.waitFor(() => {
      expect(controller.snapshot.layers.slice(0, 2).map((layer) => layer.status)).toEqual([
        "ready",
        "ready",
      ]);
    });
    expect(controller.definitions.map((layer) => layer.id)).toEqual([
      "native-a",
      "native-b",
      "rtl-a",
      "rtl-b",
    ]);
    expect(imageryLayers.length).toBe(2);
    expect(imageryLayers.get(0).show).toBe(false);
    expect(imageryLayers.get(0).alpha).toBe(0.25);
    expect(controller.snapshot.layers[2].status).toBe("unloaded");
    controller.move("native-b", "up");
    controller.move("rtl-a", "down");
    expect(controller.definitions.map((layer) => layer.id)).toEqual([
      "native-a",
      "native-b",
      "rtl-a",
      "rtl-b",
    ]);
    const added = await controller.add(ordinary);
    expect(controller.definitions.map((layer) => layer.id)).toEqual([
      "native-a",
      "native-b",
      added,
      "rtl-a",
      "rtl-b",
    ]);
  });

  it("does not resurrect an ordinary layer removed while addition settles", async () => {
    const { controller, imageryLayers } = setup();
    const release = vi.fn();
    const pending = controller.add(ordinary, {
      provider: new UrlTemplateImageryProvider({ url: config.url }),
      release,
    });
    controller.remove(controller.snapshot.selectedId!);
    expect(await pending).toBeNull();
    expect(imageryLayers.length).toBe(0);
    expect(controller.snapshot.layers).toEqual([]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

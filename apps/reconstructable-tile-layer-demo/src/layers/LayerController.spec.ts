import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Ellipsoid,
  ImageryLayer,
  ImageryLayerCollection,
  PrimitiveCollection,
  UrlTemplateImageryProvider,
  type Viewer,
} from "cesium";
import type { WebGLTileProcessor } from "rtl-webgl-tile-processor";
import { emptyTileServiceConfig } from "../cesium/tileServiceConfig";
import { LayerController } from "./LayerController";
import type { LayerDefinition, NewLayer } from "./types";

const config = { ...emptyTileServiceConfig(), url: "https://example.com/{z}/{x}/{y}.png" };
const ordinary: NewLayer = {
  name: "Ordinary imagery",
  mode: "static",
  source: { kind: "service", config },
  visible: true,
  opacity: 1,
  ageRange: null,
  level: 2,
};

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function setup() {
  // 使用真实 Cesium 集合验证生命周期与排序；不需要 WebGL 或任何瓦片网络请求。
  const imageryLayers = new ImageryLayerCollection();
  const primitives = new PrimitiveCollection();
  const viewer = {
    imageryLayers,
    scene: { primitives, globe: { ellipsoid: Ellipsoid.WGS84 }, requestRender: vi.fn() },
    isDestroyed: () => false,
  } as unknown as Viewer;
  const clearProvider = vi.fn();
  const processor = { clearProvider } as unknown as WebGLTileProcessor;
  const controller = new LayerController(viewer, processor);
  cleanup.push(() => {
    controller.destroy();
    imageryLayers.destroy();
    primitives.destroy();
  });
  return { controller, imageryLayers, primitives, clearProvider };
}

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

  it("automatically restores ordinary services and preserves within-group order from legacy mixed stacks", async () => {
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

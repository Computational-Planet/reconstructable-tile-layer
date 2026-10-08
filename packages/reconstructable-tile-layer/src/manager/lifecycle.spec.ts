import {
  GeographicTilingScheme,
  Matrix4,
  PrimitiveCollection,
  Rectangle,
  type ImageryProvider,
  type Viewer,
} from "cesium";
import type { CesiumTileProcessor } from "rtl-webgl-tile-processor";
import { expect, it, vi } from "vitest";
import { SimpleGeoReconstructManager } from "../SimpleGeoReconstructManager.js";

it("destroy during feature loading cannot resurrect a ready manager", async () => {
  const manager = new SimpleGeoReconstructManager({
    provider: { tilingScheme: new GeographicTilingScheme() } as ImageryProvider,
    processor: { clearBuffer: vi.fn() } as unknown as CesiumTileProcessor,
    featureSource: { url: "memory.json" },
    rotationSources: ["memory.rot"],
  });
  let finish!: (result: { items: never[]; diagnostics: undefined }) => void;
  const data = new Promise<{ items: never[]; diagnostics: undefined }>((resolve) => {
    finish = resolve;
  });
  // 只控制加载时序；初始化/销毁仍使用真实 manager 实现，不需要 WebGL。
  vi.spyOn(
    manager as unknown as { getPaleoDataFlatten: () => typeof data },
    "getPaleoDataFlatten",
  ).mockReturnValue(data);
  vi.spyOn(manager.rotationOperator, "init").mockResolvedValue(undefined);
  const pending = manager.initialize();
  manager.destroy();
  finish({ items: [], diagnostics: undefined });
  await pending;
  expect(manager.ready).toBe(false);
  expect(manager.plates.size).toBe(0);
});

it("source replacement invalidates pending view selection and primitive rebuilding", async () => {
  const provider = {
    tilingScheme: new GeographicTilingScheme(),
    rectangle: Rectangle.MAX_VALUE,
  } as ImageryProvider;
  const manager = new SimpleGeoReconstructManager({
    provider,
    processor: { clearBuffer: vi.fn() } as unknown as CesiumTileProcessor,
    featureSource: "memory.json",
    rotationSources: ["memory.rot"],
  });
  const internals = manager as unknown as {
    getPaleoDataFlatten: () => Promise<{ items: never[]; diagnostics: undefined }>;
    getPlateMatrixEntries: () => Promise<never[]>;
    getPlateMatrixMapForRecords: () => Promise<Map<string, Matrix4>>;
    removePrimitiveInstances: (viewer: Viewer) => void;
    executeTileGeneration: () => Promise<number>;
  };
  vi.spyOn(internals, "getPaleoDataFlatten").mockResolvedValue({
    items: [],
    diagnostics: undefined,
  });
  vi.spyOn(manager.rotationOperator, "init").mockResolvedValue(undefined);
  await manager.initialize();
  const viewer = {
    scene: { primitives: new PrimitiveCollection(), requestRender: vi.fn() },
  } as unknown as Viewer;
  let finishView!: (value: never[]) => void;
  let finishMode!: (value: Map<string, Matrix4>) => void;
  vi.spyOn(internals, "getPlateMatrixEntries").mockImplementation(
    () =>
      new Promise((resolve) => {
        finishView = resolve;
      }),
  );
  vi.spyOn(internals, "getPlateMatrixMapForRecords").mockImplementation(
    () =>
      new Promise((resolve) => {
        finishMode = resolve;
      }),
  );
  const remove = vi.spyOn(internals, "removePrimitiveInstances");
  const generate = vi.spyOn(internals, "executeTileGeneration");
  const rebuild = manager.setPrimitiveTransformMode(viewer, "bakedInstance");
  const view = manager.loadFineTilesInViewAtLevel(viewer, 0, {
    viewRectangle: Rectangle.fromDegrees(-10, -10, 10, 10),
  });
  await manager.setImageryProvider(viewer, provider);
  finishMode(new Map());
  finishView([]);
  await rebuild;
  expect((await view).skippedReason).toBe("stale-source");
  expect(generate).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
  manager.destroy(viewer);
});

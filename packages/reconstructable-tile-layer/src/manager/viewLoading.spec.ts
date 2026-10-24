import { GeographicTilingScheme, Rectangle, type ImageryProvider, type Viewer } from "cesium";
import { afterEach, expect, it, vi } from "vitest";
import { SimpleGeoReconstructManager } from "../SimpleGeoReconstructManager.js";
import type { TileProcessor } from "../processor.js";
import type { CompositeTileTask } from "./types.js";

afterEach(() => vi.restoreAllMocks());

async function setup() {
  const manager = new SimpleGeoReconstructManager({
    provider: { tilingScheme: new GeographicTilingScheme(), maximumLevel: 8 } as ImageryProvider,
    processor: {
      clearBuffer: vi.fn(),
      getPoolStats: vi.fn(() => ({})),
    } as unknown as TileProcessor,
    featureSource: "memory.json",
    rotationSources: ["memory.rot"],
  });
  // 避免网络与 WebGL，保留公开选级入口、视图球计算和任务查询的实际调用链。
  vi.spyOn(manager, "getPaleoDataFlatten").mockResolvedValue({
    items: [],
    diagnostics: undefined,
  } as never);
  vi.spyOn(manager.rotationOperator, "init").mockResolvedValue();
  await manager.initialize();
  const collect = vi
    .spyOn(
      manager as unknown as {
        collectFineTileTasksInView: (...args: unknown[]) => Promise<CompositeTileTask[]>;
      },
      "collectFineTileTasksInView",
    )
    .mockResolvedValue([]);
  const viewer = {
    scene: { canvas: { clientWidth: 1024, clientHeight: 512 } },
    camera: { computeViewRectangle: vi.fn(() => Rectangle.MAX_VALUE) },
  } as unknown as Viewer;
  return { manager, viewer, collect };
}

it("locks level 0 and a fine level independently of automatic preferences", async () => {
  const { manager, viewer, collect } = await setup();
  const preferences = { minLevel: 2, maxLevel: 3, maxRawViewTileCount: 1 };
  expect((await manager.refineTilesForView(viewer, { ...preferences, level: 0 })).level).toBe(0);
  expect(collect.mock.calls[0][0]).toBe(0);
  expect((await manager.refineTilesForView(viewer, { ...preferences, level: 8 })).level).toBe(8);
  expect(collect.mock.calls[1][0]).toBe(8);
});

it("accepts optional numeric variables and preserves third-argument options when undefined", async () => {
  const { manager, viewer, collect } = await setup();
  const options = { minLevel: 3, maxLevel: 3, viewRectangle: Rectangle.fromDegrees(0, 0, 10, 10) };
  let level: number | undefined;
  expect((await manager.refineTilesForView(viewer, level, options)).level).toBe(3);
  expect(viewer.camera.computeViewRectangle).not.toHaveBeenCalled();
  level = 0;
  expect((await manager.refineTilesForView(viewer, level, { ...options, level: 5 })).level).toBe(0);
  expect((await manager.loadFineTilesInView(viewer, undefined, options)).level).toBe(3);
  expect((await manager.loadFineTilesInViewAtLevel(viewer, 8, options)).level).toBe(8);
  expect(collect.mock.calls.map((call) => call[0])).toEqual([3, 0, 3, 8]);
});

it("automatically selects a level when neither argument nor options sets one", async () => {
  const { manager, viewer } = await setup();
  const auto = await manager.refineTilesForView(viewer);
  expect(auto.level).toBeGreaterThanOrEqual(0);
  expect(auto.level).toBeLessThan(8);
  expect(await manager.refineTilesForView(viewer, { level: undefined })).toEqual(auto);
});

it("rejects invalid fixed levels before requesting view tasks", async () => {
  const { manager, viewer, collect } = await setup();
  for (const level of [-1, 1.5, NaN, Infinity, 9]) {
    await expect(manager.refineTilesForView(viewer, { level })).rejects.toThrow(RangeError);
    await expect(manager.loadFineTilesInViewAtLevel(viewer, level)).rejects.toThrow(RangeError);
  }
  expect(collect).not.toHaveBeenCalled();
  expect(viewer.camera.computeViewRectangle).not.toHaveBeenCalled();
});

it("reports a missing camera footprint for both fixed and automatic selection", async () => {
  const { manager, viewer, collect } = await setup();
  vi.mocked(viewer.camera.computeViewRectangle).mockReturnValue(undefined);
  expect((await manager.refineTilesForView(viewer, { level: 0 })).skippedReason).toBe(
    "no-view-rectangle",
  );
  expect((await manager.refineTilesForView(viewer)).skippedReason).toBe("no-view-rectangle");
  expect(collect).not.toHaveBeenCalled();
});

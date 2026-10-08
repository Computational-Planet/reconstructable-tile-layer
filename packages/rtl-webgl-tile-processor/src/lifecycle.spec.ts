import type { ImageryProvider, ImageryTypes } from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CesiumTileProcesser } from "./cesium-tile-processer.js";

const rendering = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("./rendererPool.js", () => ({
  createRendererPool: () => ({
    width: 16,
    height: 16,
    vertexRowNum: 2,
    workers: [{ busy: false, render: rendering.render }],
    getStats: () => ({}),
    getContextInfo: () => ({}),
    destroy: () => {},
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const image = (name: string) => ({ name }) as unknown as ImageryTypes;
function processor(maxResultCacheSize?: number) {
  rendering.render.mockImplementation((job: { image: { name: string } }) => ({
    snapshotCanvas: { width: 16, height: 16, toDataURL: () => job.image.name },
    timing: {
      renderQueueWaitMs: 0,
      textureUploadMs: 0,
      drawMs: 0,
      copyToCanvasMs: 0,
      snapshotMs: 0,
      slotHoldMs: 0,
    },
  }));
  return new CesiumTileProcesser({ outputType: "dataUrl", maxResultCacheSize });
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("imagery provider backpressure", () => {
  it("retries undefined requests until a busy provider can accept the tile", async () => {
    vi.useFakeTimers();
    const instance = processor();
    const requestImage = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockResolvedValue(image("after-backpressure"));
    const provider = { requestImage } as unknown as ImageryProvider;
    const pending = instance.reprojectTileImage(0, 0, 2, provider);
    await vi.advanceTimersByTimeAsync(40);
    const asset = await pending;
    expect(asset?.source).toBe("after-backpressure");
    expect(requestImage).toHaveBeenCalledTimes(3);
    expect(instance.getPoolStats().imageRequestFailures).toBe(0);
    asset?.release();
    instance.destroy();
  });

  it.each(["clearBuffer", "destroy"] as const)(
    "stops deferred requests after %s",
    async (action) => {
      vi.useFakeTimers();
      const instance = processor();
      const requestImage = vi.fn().mockReturnValue(undefined);
      const provider = { requestImage } as unknown as ImageryProvider;
      const pending = instance.reprojectTileImage(0, 0, 2, provider);
      instance[action]();
      await vi.advanceTimersByTimeAsync(40);
      expect(await pending).toBeNull();
      expect(requestImage).toHaveBeenCalledTimes(1);
      expect(rendering.render).not.toHaveBeenCalled();
      instance.destroy();
    },
  );
});

describe("clear during asynchronous imagery work", () => {
  it("delivers retained results even when the result cache is disabled", async () => {
    const instance = processor(0);
    const provider = {
      requestImage: () => Promise.resolve(image("uncached")),
    } as unknown as ImageryProvider;
    const assets = await Promise.all([
      instance.reprojectTileImage(0, 0, 0, provider),
      instance.reprojectTileImage(0, 0, 0, provider),
    ]);
    expect(assets[0]?.source).toBe("uncached");
    expect(assets[1]).toBe(assets[0]);
    assets.forEach((asset) => asset?.release());
    instance.destroy();
  });
  it("does not render or expose an old result after the replacement is ready", async () => {
    const delayed = deferred<ImageryTypes>();
    const requestImage = vi
      .fn()
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValue(image("new"));
    const provider = { requestImage } as unknown as ImageryProvider;
    const instance = processor();
    const old = instance.reprojectTileImage(0, 0, 0, provider, "dataUrl");
    instance.clearBuffer();
    const current = await instance.reprojectTileImage(0, 0, 0, provider, "dataUrl");
    delayed.resolve(image("old"));
    expect(await old).toBeNull();
    expect(rendering.render).toHaveBeenCalledTimes(1);
    expect(instance.currentResult?.source).toBe("new");
    current?.release();
    instance.destroy();
    expect(instance.currentResult).toBeNull();
  });

  it("an old rejection does not evict the replacement's pending request", async () => {
    const first = deferred<ImageryTypes>();
    const second = deferred<ImageryTypes>();
    const requestImage = vi.fn().mockReturnValueOnce(first.promise).mockReturnValue(second.promise);
    const provider = { requestImage } as unknown as ImageryProvider;
    const instance = processor();
    const old = instance.reprojectTileImage(0, 0, 0, provider, "dataUrl");
    instance.clearBuffer();
    const current = instance.reprojectTileImage(0, 0, 0, provider, "dataUrl");
    first.reject(new Error("Old file closed"));
    expect(await old).toBeNull();
    const shared = instance.reprojectTileImage(0, 0, 0, provider, "dataUrl");
    expect(requestImage).toHaveBeenCalledTimes(2);
    second.resolve(image("replacement"));
    const assets = await Promise.all([current, shared]);
    expect(assets[0]?.source).toBe("replacement");
    expect(assets[1]).toBe(assets[0]);
    assets.forEach((asset) => asset?.release());
    instance.destroy();
  });
});

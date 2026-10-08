import { useEffect, useRef, useState } from "react";
import { Rectangle, Request } from "cesium";
import { createTileServiceProvider, type TileServiceConfig } from "../cesium/providers";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";

export function useServiceTileTest(config: TileServiceConfig) {
  const [result, setResult] = useState<{
    message: string;
    image?: string;
    loading?: boolean;
  } | null>(null);
  const pending = useRef<Request | null>(null);
  const generation = useRef(0);
  const signature = JSON.stringify(config);
  useEffect(() => {
    generation.current++;
    pending.current?.cancelFunction?.();
    setResult(null);
    return () => {
      generation.current++;
      pending.current?.cancelFunction?.();
    };
  }, [signature]);

  const test = async () => {
    const token = ++generation.current;
    const request = new Request({ throttle: false, throttleByServer: false });
    pending.current = request;
    setResult({ message: "Requesting a sample tile…", loading: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // 与 Apply 共用构造路径，测试真实图片解码和 Canvas 读取，不修改当前重建图层。
      const provider = createTileServiceProvider(config, DEMO_ELLIPSOID_CONFIG);
      const level = Math.max(config.minimumLevel, Math.min(2, config.maximumLevel ?? 2));
      const tile = provider.tilingScheme.positionToTileXY(
        Rectangle.center(provider.rectangle),
        level,
      );
      if (!tile) throw new Error("The configured coverage is outside this tiling scheme.");
      const imagePromise = provider.requestImage(tile.x, tile.y, level, request);
      if (!imagePromise)
        throw new Error("The tile request was deferred. Try again after other requests finish.");
      const image = await Promise.race([
        imagePromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            request.cancelFunction?.();
            reject(new Error("Tile request timed out after 20 seconds."));
          }, 20000);
        }),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.drawImage(image as CanvasImageSource, 0, 0, 128, 128);
      const data = canvas.toDataURL();
      if (image instanceof ImageBitmap) image.close();
      if (token === generation.current)
        setResult({
          message: `Tile readable · L${level} / X${tile.x} / Y${tile.y}. This checks one tile, not every level.`,
          image: data,
        });
    } catch (error) {
      if (token === generation.current)
        setResult({
          message: `Tile test failed: ${error instanceof Error ? error.message : String(error)} Check the endpoint, layer/grid settings and browser access (CORS).`,
        });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (pending.current === request) pending.current = null;
    }
  };
  return { result, test };
}

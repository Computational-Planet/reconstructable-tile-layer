import type { ImageryProvider } from "cesium";
import { ReconstructableTileLayer, type TileProcessor } from "reconstructable-tile-layer";
import { WebGLTileProcessor } from "rtl-webgl-tile-processor";
import { loadFiniteRotationRecords } from "rtl-gplates-source";
import { FiniteRotationInterpolator } from "rtl-finite-rotation";
import { PlateDomainTileQuadtree } from "rtl-tile-plate-quadtree";
import { openRasterSource } from "rtl-raster-source";
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

declare const provider: ImageryProvider;
// 不同发布产物的 class 私有字段不同，RTL 的公开结构契约仍应接受独立处理器。
const processor: TileProcessor = new WebGLTileProcessor({ outputType: "canvas" });
new ReconstructableTileLayer({
  provider,
  processor,
  featureSource: { url: "plates.gpmlz" },
  rotationSources: [],
});
await new FiniteRotationInterpolator().initializeFromRecords(
  await loadFiniteRotationRecords([new Blob(["1 0 90 0 0 0"])]),
);
declare const file: File;
const source = await openRasterSource(file);
const rasterProvider: ImageryProvider = await RasterImageryProvider.fromSource(source);
void [PlateDomainTileQuadtree, rasterProvider];

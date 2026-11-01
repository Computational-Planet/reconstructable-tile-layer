import type { ImageryProvider } from "cesium";
import {
  ReconstructableTileLayer,
  WebGLTileProcessor,
  type ReconstructableTileLayerOptions,
  type TileProcessor,
} from "reconstructable-tile-layer";
import {
  loadFiniteRotationRecords,
  type FeaturePolygonData,
} from "reconstructable-tile-layer/gplates";
import { FiniteRotationInterpolator } from "reconstructable-tile-layer/rotation";
import { PlateDomainTileQuadtree, type TileClipArea } from "reconstructable-tile-layer/quadtree";
import {
  WebGLTileProcessor as SubpathProcessor,
  type WebGLTileProcessorOptions,
} from "reconstructable-tile-layer/processor";

declare const provider: ImageryProvider;
declare const feature: FeaturePolygonData;
declare const area: TileClipArea;
const processorOptions: WebGLTileProcessorOptions = { outputType: "canvas" };
const processor: TileProcessor = new SubpathProcessor(processorOptions);
const options: ReconstructableTileLayerOptions = {
  provider,
  processor,
  featureSource: { url: "plates.gpmlz" },
  rotationSources: ["model.rot"],
};
const layer = new ReconstructableTileLayer(options);
const rotations = await loadFiniteRotationRecords([new Blob(["1 0 90 0 0 0"])]);
await new FiniteRotationInterpolator().initializeFromRecords(rotations);
void [layer, WebGLTileProcessor, PlateDomainTileQuadtree, feature, area];

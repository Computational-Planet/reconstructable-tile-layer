import { ImageryLayer } from "cesium";
import {
  ReconstructableTileLayer,
  type SimpleGeoReconstructManagerProcessorOptions,
} from "reconstructable-tile-layer";
import { openRasterSource } from "rtl-raster-source";
import { openNetCDFSource } from "rtl-raster-source/netcdf";
import { RasterImageryProvider } from "rtl-raster-imagery-provider";

// 类型检查直接使用发布入口，不能借用 monorepo 源码或重复 Cesium 类型。
export function connectRTL(
  options: Omit<SimpleGeoReconstructManagerProcessorOptions, "provider">,
  provider: RasterImageryProvider,
) {
  return ReconstructableTileLayer.create({ ...options, provider });
}

declare global {
  interface Window {
    runPackedTest: () => Promise<unknown>;
  }
}

window.runPackedTest = async () => {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const file = async (name: string) =>
    new File([await (await fetch(`/fixtures/${name}`)).blob()], name);
  const results: unknown[] = [];
  const tiff = await openRasterSource(await file("stripped-preview.tif"));
  try {
    const provider = await RasterImageryProvider.fromSource(tiff, { tileSize: 32 });
    const layer = new ImageryLayer(provider);
    assert(
      layer.imageryProvider === provider,
      "Published provider is a standard Cesium layer source",
    );
    const tile = await provider.requestImage(0, 0, 0);
    assert(tile?.width === 32, "Published TIFF decoder produces an image");
    layer.destroy();
    provider.destroy();
    results.push({ kind: "TIFF/Cesium provider", width: tiff.metadata.width });
  } finally {
    tiff.close();
  }
  for (const name of ["packed-record.nc", "grouped-grid.nc"]) {
    const dataset = await openNetCDFSource(await file(name));
    try {
      const variable = dataset.metadata.variables.find((v) => v.name.endsWith("packed"))!;
      // 分组变量的维度是完整路径；选择器应使用元数据，不把索引名称写死为 epoch。
      const layout = dataset.describeVariable(variable.name);
      const epoch = layout.selectors.find(
        (selector) => selector.dimension.split("/").pop() === "epoch",
      )!.dimension;
      assert(
        layout.longitude.name.endsWith("longitude"),
        "Published CF layout identifies longitude without guessing dimension names",
      );
      const slice = await dataset.selectSlice({
        variable: variable.name,
        indices: { [epoch]: 1 },
      });
      if (name === "grouped-grid.nc") {
        const coordinate = slice.metadata.slice!.selections![0].coordinate!;
        assert(
          coordinate.rawValue === 45 && coordinate.attributes.calendar === "noleap",
          "Selected model coordinate and calendar survive in source metadata",
        );
      }
      try {
        const original = (await slice.readWindow({ window: [1, 1, 2, 2] })).bands[0][0];
        assert(
          original === 111,
          "Packed NC3/NC4 public Worker reads the independently encoded value",
        );
        results.push({ kind: dataset.metadata.format, value: original });
      } finally {
        slice.close();
      }
    } finally {
      dataset.close();
    }
  }
  return results;
};

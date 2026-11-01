import { openNetCDFSource } from "../../../packages/rtl-raster-source/dist/netcdf/index.js";
import { RasterImageryProvider } from "../../../packages/rtl-raster-imagery-provider/dist/index.js";

export async function runDomainTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const results = [];
  // 预期存储值来自独立的 Python netCDF4 基准；测试不把已重建栅格再次旋转。
  const cases = [
    ["Map01_PALEOMAP_1deg_Holocene_0Ma.nc", "z", {}, [180, 90, 181, 91], -4920],
    ["Map23_PALEOMAP_1deg_Early_Cretaceous_100Ma.nc", "z", {}, [180, 90, 181, 91], 480],
    [
      "tas_CESM1.2-CAM5_deepmip-eocene-p1-x3_v1.0.mean.nc",
      "tas",
      { time: 0 },
      [72, 48, 73, 49],
      307.0730285644531,
    ],
    ["tos_CESM1.2-CAM5_deepmip-eocene-p1-x3_v1.0.mean.nc", "tos", { time: 0 }],
  ];
  for (const [name, variable, indices, window, expected] of cases) {
    const dataset = await openNetCDFSource(
      new File([await (await fetch(`/reference/${name}`)).blob()], name),
    );
    let source;
    let provider;
    try {
      if (variable === "tos") {
        await dataset.selectSlice({ variable, indices }).then(
          () => {
            throw new Error("Curvilinear input must be rejected");
          },
          (error) => {
            assert(error.code === "unsupported-grid", "Explicit curvilinear diagnostic");
            results.push({ name, result: "expected-unsupported-grid", message: error.message });
          },
        );
        continue;
      }
      source = await dataset.selectSlice({ variable, indices });
      const value = (await source.readWindow({ window })).bands[0][0];
      assert(value === expected, `${name}: raw value differs from independent oracle`);
      if (variable === "z") {
        assert(
          !dataset.metadata.variables.some((v) => v.name === "time"),
          "PaleoDEM is a file sequence, not a time-axis file",
        );
        assert(
          source.metadata.bands[0].units === undefined,
          "Do not fabricate file-level units from a publication",
        );
        assert(
          source.metadata.width === 361 && source.metadata.height === 181,
          "Preserve pole and duplicated seam samples",
        );
      } else {
        const time = dataset.metadata.variables.find((v) => v.name === "time");
        assert(
          time.attributes.calendar === "365_day" && String(time.attributes.units).includes("1950"),
          "Preserve climatology time origin",
        );
        assert(
          dataset.metadata.attributes.experiment === "deepmip-eocene-p1-x3",
          "Preserve geological experiment separately",
        );
      }
      provider = await RasterImageryProvider.fromSource(source, { tileSize: 32 });
      const tile = await provider.requestImage(0, 0, 0);
      const pixels = tile.getContext("2d").getImageData(0, 0, 32, 32).data;
      assert(
        pixels.some((v, i) => i % 4 === 3 && v > 0),
        "Domain source produces visible imagery",
      );
      results.push({
        name,
        result: "numeric-and-imagery-pass",
        shape: [source.metadata.height, source.metadata.width],
        value,
        units: source.metadata.bands[0].units ?? null,
        experiment: dataset.metadata.attributes.experiment ?? null,
      });
    } finally {
      provider?.destroy();
      source?.close();
      dataset.close();
    }
  }
  return results;
}

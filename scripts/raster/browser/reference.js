import { openNetCDFSource } from "../../../packages/rtl-raster-source/dist/netcdf/index.js";
import {
  openRasterSource,
  planGeographicRead,
  toPhysicalValue,
} from "../../../packages/rtl-raster-source/dist/index.js";
import { RasterImageryProvider } from "../../../packages/rtl-raster-imagery-provider/dist/index.js";
import { runDomainTests } from "./domain.js";

window.runDomainTests = runDomainTests;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const file = async (name) => new File([await (await fetch(`/reference/${name}`)).blob()], name);

window.runReferenceTests = async () => {
  const oracle = await (await fetch("/reference/reference-metadata.json")).json();
  const results = [];
  for (const [name, variable, indices] of [
    ["packed-record.nc", "packed", { epoch: 1 }],
    ["grouped-grid.nc", "ocean/packed", { "ocean/epoch": 1 }],
  ]) {
    const dataset = await openNetCDFSource(await file(name));
    try {
      const source = await dataset.selectSlice({ variable, indices });
      const raw = await source.readWindow({ window: [1, 0, 3, 3] });
      assert(
        JSON.stringify([...raw.bands[0]]) === JSON.stringify([110, 120, 111, 121, 112, 122]),
        `${name}: preserves spatial dimension order`,
      );
      if (name === "packed-record.nc") {
        const missing = await dataset.selectSlice({ variable, indices: { epoch: 0 } });
        const values = await missing.readWindow({ window: [0, 0, 3, 1] });
        assert(
          values.bands[0] instanceof Uint16Array &&
            values.bands[0][0] === 65535 &&
            values.bands[0][1] === 65534,
          "CF unsigned packed missing values",
        );
        assert(
          Number.isNaN(toPhysicalValue(values.bands[0][0], missing.metadata.bands[0])),
          "CF missing before scaling",
        );
        missing.close();
      } else {
        assert(
          dataset.metadata.variables.find((v) => v.name === "ocean/epoch").attributes.calendar ===
            "noleap",
          "Group calendar retained",
        );
      }
      dataset.close();
      await source.readWindow({ window: [0, 0, 1, 1] }).then(
        () => {
          throw new Error("Expected closed slice");
        },
        (error) => assert(error.code === "closed", "Dataset close invalidates slice"),
      );
      source.close();
      results.push({ name, variable, checked: true, closed: true });
    } finally {
      dataset.close();
    }
  }
  const cases = [
    ["ncep-air.mon.ltm.nc", "air", { time: 0 }],
    ["tos_O1_2001-2002.nc", "tos", { time: 12 }],
    ["sresa1b_ncar_ccsm3-example.nc", "tas", { time: 0 }],
    ["sresa1b_ncar_ccsm3-example.nc", "ua", { time: 0, plev: 8 }],
    ["ETOPO_2022_v1_15s_N00E000_surface.nc", "z", {}],
  ];
  for (const [name, variable, indices] of cases) {
    const dataset = await openNetCDFSource(await file(name));
    let source;
    let provider;
    try {
      source = await dataset.selectSlice({ variable, indices });
      const metadata = dataset.metadata.variables.find((v) => v.name === variable);
      const reference = oracle.datasets.find((d) => d.filename === name).variables[variable];
      const checked = [];
      for (const sample of reference.samples) {
        const selections = Object.fromEntries(
          metadata.dimensions
            .filter((d) => !["lat", "lon"].includes(d))
            .map((d) => [d, sample.indices[metadata.dimensions.indexOf(d)]]),
        );
        const selected = await dataset.selectSlice({ variable, indices: selections });
        try {
          const x = sample.indices[metadata.dimensions.indexOf("lon")];
          const y = sample.indices[metadata.dimensions.indexOf("lat")];
          const read = await selected.readWindow({ window: [x, y, x + 1, y + 1] });
          assert(
            read.bands[0][0] === sample.raw,
            `${name}/${variable}: ${read.bands[0][0]} != ${sample.raw}`,
          );
          checked.push({ indices: sample.indices, raw: read.bands[0][0] });
        } finally {
          selected.close();
        }
      }
      const plan = planGeographicRead(source.metadata, [-180, -80, 180, 80], 17, 11);
      const wrapped = await source.readWindow(plan);
      assert(wrapped.width === 17 && wrapped.height === 11, "Output grid size");
      for (const [column, row] of [
        [0, 0],
        [8, 5],
        [16, 10],
      ]) {
        const x = plan.sampleColumns[column];
        const y = plan.sampleRows[row];
        const raw = await source.readWindow({ window: [x, y, x + 1, y + 1] });
        assert(
          raw.bands[0][0] === wrapped.bands[0][row * 17 + column],
          "Geographic sample must map to original array",
        );
      }
      const abort = new AbortController();
      const pending = source.readWindow({
        window: [0, 0, source.metadata.width, source.metadata.height],
        width: 64,
        height: 64,
        signal: abort.signal,
      });
      abort.abort();
      await pending.then(
        () => {
          throw new Error("Expected cancellation");
        },
        (error) => assert(error.code === "aborted", "Cancellation code"),
      );
      await source.readWindow({ window: [0, 0, 1, 1] });
      provider = await RasterImageryProvider.fromSource(source, { tileSize: 32 });
      const tile = await provider.requestImage(0, 0, 0);
      assert(tile.width === 32, "Provider renders NetCDF");
      const alpha = tile.getContext("2d").getImageData(0, 0, 32, 32).data;
      assert(
        alpha.some((v, i) => i % 4 === 3 && v > 0),
        "Provider has visible scientific samples",
      );
      const first = await source.readWindow({ window: [0, 0, 1, 1] });
      results.push({
        name,
        variable,
        indices,
        format: source.metadata.format,
        shape: [source.metadata.height, source.metadata.width],
        bounds: source.metadata.bounds,
        calendar: dataset.metadata.variables.find((v) => v.name === "time")?.attributes.calendar,
        band: source.metadata.bands[0],
        firstRaw: first.bands[0][0],
        firstPhysical: toPhysicalValue(first.bands[0][0], source.metadata.bands[0]),
        checked,
        rendered: [tile.width, tile.height],
        cancelledAndRecovered: true,
      });
    } finally {
      provider?.destroy();
      source?.close();
      dataset.close();
    }
  }
  const tif = await openRasterSource(await file("ETOPO_2022_v1_15s_N00E000_surface.tif"));
  try {
    const value = (await tif.readWindow({ window: [1800, 1800, 1801, 1801] })).bands[0][0];
    const dataset = await openNetCDFSource(await file("ETOPO_2022_v1_15s_N00E000_surface.nc"));
    try {
      const nc = await dataset.selectSlice({ variable: "z" });
      const native = await nc.readWindow({ window: [1800, 1799, 1801, 1800] });
      assert(
        native.bands[0][0] === value,
        "ETOPO NetCDF and TIFF agree despite opposite latitude order",
      );
      nc.close();
    } finally {
      dataset.close();
    }
    assert(tif.metadata.crs.verticalEpsg === 3855, "Vertical CRS is retained");
    results.push({
      name: "ETOPO TIFF/NetCDF equivalence",
      value,
      verticalEpsg: tif.metadata.crs.verticalEpsg,
    });
  } finally {
    tif.close();
  }
  return results;
};

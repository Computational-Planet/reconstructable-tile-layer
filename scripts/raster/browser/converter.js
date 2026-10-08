import { createRasterConverter } from "../../../packages/rtl-raster-converter/dist/index.js";
import { openRasterSource } from "../../../packages/rtl-raster-source/dist/index.js";
import { openNetCDFSource } from "../../../packages/rtl-raster-source/dist/netcdf/index.js";

export async function runConverterTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const file = async (name) => new File([await (await fetch(`/reference/${name}`)).blob()], name);
  const assets = {
    js: "/gdal/gdal3.js",
    wasm: "/gdal/gdal3WebAssembly.wasm",
    data: "/gdal/gdal3WebAssembly.data",
  };
  const converter = await createRasterConverter({ assets });
  const results = [];
  const stages = [];
  try {
    const tiff = await file("ETOPO_2022_v1_15s_N00E000_surface.tif");
    const controller = new AbortController();
    await converter
      .toCOG(tiff, {
        signal: controller.signal,
        onProgress: ({ stage }) => {
          if (stage === "converting") controller.abort();
        },
      })
      .then(
        () => {
          throw new Error("Active conversion must cancel");
        },
        (error) => assert(error.code === "aborted", "Cancellation diagnostic"),
      );
    assert(!converter.busy, "Cancelled converter becomes reusable");
    const pending = converter.toCOG(tiff, { onProgress: ({ stage }) => stages.push(stage) });
    await converter.toCOG(tiff).then(
      () => {
        throw new Error("Concurrent job must reject");
      },
      (error) => assert(error.code === "busy", "Bounded conversion concurrency"),
    );
    const converted = await pending;
    const source = await openRasterSource(converted.blob);
    try {
      const value = (await source.readWindow({ window: [1800, 1800, 1801, 1801] })).bands[0][0];
      assert(value === -4509.830078125, "TIFF to COG retains independent ETOPO raw value");
      assert(
        source.metadata.crs.epsg === 4326 && source.metadata.crs.verticalEpsg === 3855,
        "Horizontal and vertical references survive conversion",
      );
      assert(source.metadata.bands[0].noData.includes(-99999), "TIFF NoData survives conversion");
      assert(
        converted.metadata.layout === "COG" && source.metadata.overviews.length > 0,
        "Tiled COG layout and overviews",
      );
      results.push({
        name: "ETOPO TIFF → COG, cancellation/recovery/concurrency",
        value,
        bytes: converted.blob.size,
        layout: converted.metadata.layout,
        overviews: source.metadata.overviews,
        stages,
      });
    } finally {
      source.close();
    }

    const noReference = await file("unreferenced.tif");
    await converter.toCOG(noReference).then(
      () => {
        throw new Error("Unknown georeference must reject");
      },
      (error) => assert(error.code === "invalid-input", "Explicit unreferenced TIFF diagnostic"),
    );
    const radians = Math.PI / 180;
    const northing = 6378137 * Math.log(Math.tan(Math.PI / 4 + radians));
    const reprojected = await converter.toCOG(noReference, {
      georeference: { epsg: 4326, transform: [-2, 1, 0, 2, 0, -1] },
      reproject: {
        epsg: 3857,
        bounds: [-2 * radians * 6378137, 0, 2 * radians * 6378137, northing],
        width: 4,
        height: 2,
        resampling: "nearest",
      },
    });
    const projectedSource = await openRasterSource(reprojected.blob);
    try {
      const values = Array.from(
        (await projectedSource.readWindow({ window: [0, 0, 4, 2] })).bands[0],
      );
      assert(projectedSource.metadata.crs.epsg === 3857, "Explicit target CRS is retained");
      assert(
        JSON.stringify(values) === JSON.stringify([0, 1, -999, 3, 4, 5, 6, 7]),
        "Nearest reprojection preserves numeric samples and NoData",
      );
      results.push({
        name: "Unreferenced TIFF rejection, explicit georeference and EPSG:3857 reprojection",
        values,
        target: projectedSource.metadata.crs,
        transform: projectedSource.metadata.transform,
      });
    } finally {
      projectedSource.close();
    }

    const cases = [
      {
        name: "Map23_PALEOMAP_1deg_Early_Cretaceous_100Ma.nc",
        variable: "z",
        indices: {},
        grid: { bounds: [-180, -90, 180, 90], width: 720, height: 360, resampling: "nearest" },
        window: [360, 180, 361, 181],
        expected: 480,
        layerRole: "paleo-snapshot",
        coordinateAgeMa: 100,
      },
      {
        name: "tas_CESM1.2-CAM5_deepmip-eocene-p1-x3_v1.0.mean.nc",
        variable: "tas",
        indices: { time: 0 },
        pixel: [72, 48],
        expected: 307.0730285644531,
        layerRole: "paleo-snapshot",
      },
      {
        name: "packed-record.nc",
        variable: "packed",
        indices: { epoch: 1 },
        pixel: [1, 1],
        expected: 328.65,
      },
      {
        name: "packed-record.nc",
        variable: "packed",
        indices: { epoch: 0 },
        pixel: [1, 0],
        expected: NaN,
      },
    ];
    // 原生 Gaussian 轴与其他工程样本按独立 Python 基准取样，不用转换器生成预期值。
    const oracle = await (await fetch("/reference/reference-metadata.json")).json();
    for (const [name, variable] of [
      ["ncep-air.mon.ltm.nc", "air"],
      ["tos_O1_2001-2002.nc", "tos"],
      ["sresa1b_ncar_ccsm3-example.nc", "tas"],
      ["ETOPO_2022_v1_15s_N00E000_surface.nc", "z"],
    ]) {
      const info = oracle.datasets.find((entry) => entry.filename === name).variables[variable];
      const center = info.samples[1];
      cases.push({
        name,
        variable,
        indices: info.dimensions.includes("time") ? { time: center.indices[0] } : {},
        pixel: center.indices.slice(-2).reverse(),
        expected: center.raw,
      });
    }
    for (const entry of cases) {
      const dataset = await openNetCDFSource(await file(entry.name));
      let slice;
      try {
        slice = await dataset.selectSlice({ variable: entry.variable, indices: entry.indices });
        const coordinates = slice.metadata.coordinates;
        const longitude = coordinates.x[entry.pixel?.[0] ?? 0];
        const latitude = coordinates.y[entry.pixel?.[1] ?? 0];
        const grid = entry.grid ?? {
          bounds: [longitude - 0.1, latitude - 0.1, longitude + 0.1, latitude + 0.1],
          width: 1,
          height: 1,
          resampling: "nearest",
        };
        const expected = entry.expected;
        const context = {
          layerRole: entry.layerRole ?? "reference",
          source: entry.name,
          coordinateAgeMa: entry.coordinateAgeMa ?? null,
          dataset: dataset.metadata.attributes,
        };
        const converted = await converter.toCOG(slice, { grid, provenance: context });
        const output = await openRasterSource(converted.blob);
        try {
          const value = (await output.readWindow({ window: entry.window ?? [0, 0, 1, 1] }))
            .bands[0][0];
          assert(
            Object.is(value, expected),
            `${entry.name}: output physical value matches source/oracle (${value} vs ${expected})`,
          );
          assert(output.metadata.crs.epsg === 4326, "Selected slice has geographic output CRS");
          assert(
            converted.metadata.bands[0].units === slice.metadata.bands[0].units,
            "Units survive VRT/COG transport without invention",
          );
          const provenance = JSON.parse(await converted.provenanceBlob.text());
          assert(
            provenance.source.slice.variable === entry.variable &&
              provenance.processing.grid.resampling === "nearest",
            "Original slice and explicit sampling preserved",
          );
          assert(
            provenance.context.layerRole === context.layerRole &&
              provenance.context.coordinateAgeMa === context.coordinateAgeMa,
            "Explicit application age and layer context survive export",
          );
          assert(
            provenance.context.dataset.experiment === dataset.metadata.attributes.experiment,
            "Original experiment stays separate from the time index",
          );
          assert(!slice.closed, "Converter borrows the source");
          results.push({
            name: `${entry.name} → COG`,
            value: Number.isNaN(value) ? "NaN" : value,
            units: converted.metadata.bands[0].units ?? null,
            bytes: converted.blob.size,
            layout: converted.metadata.layout,
            context: {
              layerRole: context.layerRole,
              coordinateAgeMa: context.coordinateAgeMa,
              experiment: dataset.metadata.attributes.experiment ?? null,
            },
          });
        } finally {
          output.close();
        }
      } finally {
        slice?.close();
        dataset.close();
      }
    }
    await converter
      .toCOG(tiff, {
        onProgress: ({ stage }) => {
          if (stage === "converting") converter.dispose();
        },
      })
      .then(
        () => {
          throw new Error("Disposal must stop an active conversion");
        },
        (error) => assert(error.code === "closed", "Active disposal diagnostic"),
      );
    assert(!converter.busy, "Disposal settles the active job");
    results.push({
      name: "Dispose active GDAL Worker and reject reuse",
      disposed: converter.disposed,
    });
    converter.dispose();
    converter.dispose();
    await converter.toCOG(tiff).then(
      () => {
        throw new Error("Disposed converter must reject");
      },
      (error) => assert(error.code === "closed", "Disposed converter diagnostic"),
    );
  } finally {
    converter.dispose();
  }
  return results;
}

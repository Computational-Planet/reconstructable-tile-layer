import { describe, expect, it } from "vitest";
import type { RasterSource } from "rtl-raster-source";
import { prepareSource } from "./prepare.js";

function source(): RasterSource {
  const values = new Int16Array([10, 20, -999, 30, 40, 50]);
  return {
    closed: false,
    metadata: {
      format: "netcdf3",
      width: 3,
      height: 2,
      crs: { epsg: 4326 },
      transform: null,
      coordinates: { x: [0, 10, 20], y: [10, 0], periodicX: false },
      bounds: [-5, -5, 25, 15],
      pixelInterpretation: "area",
      overviews: [],
      bands: [
        {
          name: "temperature & raw",
          dataType: "Int16",
          noData: [-999],
          validRange: [0, 500],
          scale: 0.5,
          offset: 273.15,
          units: "K",
        },
      ],
    },
    async readWindow(options) {
      const columns = options.sampleColumns!;
      const rows = options.sampleRows!;
      return {
        width: columns.length,
        height: rows.length,
        window: options.window,
        bands: [
          Int16Array.from(rows.flatMap((row) => columns.map((column) => values[row * 3 + column]))),
        ],
      };
    },
    close() {
      throw new Error("The converter must not close a borrowed source");
    },
  };
}

describe("scientific source export", () => {
  it("preserves missing values, applies physical scaling, and masks outside the source footprint", async () => {
    const files = await prepareSource(
      source(),
      { grid: { bounds: [-15, -15, 25, 15], width: 4, height: 3, resampling: "nearest" } },
      1024 * 1024,
      new AbortController().signal,
    );
    const raw = new DataView(await files[1].arrayBuffer());
    const values = Array.from({ length: 12 }, (_, i) => raw.getFloat64(i * 8, true));
    expect(values).toEqual([
      NaN,
      278.15,
      283.15,
      NaN,
      NaN,
      288.15,
      293.15,
      298.15,
      NaN,
      NaN,
      NaN,
      NaN,
    ]);
    const vrt = await files[0].text();
    expect(vrt).toContain("temperature &amp; raw");
    expect(vrt).toContain("<NoDataValue>nan</NoDataValue>");
    expect(vrt).toContain("<UnitType>K</UnitType>");
  });

  it("requires an explicit grid for rectilinear sources and rejects oversized allocations", async () => {
    await expect(
      prepareSource(source(), {}, 1024 * 1024, new AbortController().signal),
    ).rejects.toMatchObject({ code: "unsupported-grid" });
    await expect(
      prepareSource(
        source(),
        {
          grid: {
            bounds: [-180, -90, 180, 90],
            width: 100000,
            height: 100000,
            resampling: "nearest",
          },
        },
        1024 * 1024,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "resource-limit" });
  });
});

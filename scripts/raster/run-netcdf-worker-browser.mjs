import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { chromium } = requireDemo("playwright-core");
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const output = pathToFileURL(
  `${await mkdtemp(fileURLToPath(new URL("../../tmp/netcdf-worker-browser-", import.meta.url)))}/`,
);
const cases = [
  {
    file: "packed-record.nc",
    path: "packages/rtl-raster-source/test/fixtures/packed-record.nc",
    format: "netcdf3",
    variable: "packed",
    indices: { epoch: 1 },
    window: [1, 1, 2, 2],
    value: 111,
  },
  {
    file: "grouped-grid.nc",
    path: "packages/rtl-raster-source/test/fixtures/grouped-grid.nc",
    format: "netcdf4",
    variable: "ocean/packed",
    indices: { "ocean/epoch": 1 },
    window: [1, 1, 2, 2],
    value: 111,
  },
];
if (process.argv.includes("--domain")) {
  for (const [file, value] of [
    ["Map01_PALEOMAP_1deg_Holocene_0Ma.nc", -4920],
    ["Map23_PALEOMAP_1deg_Early_Cretaceous_100Ma.nc", 480],
  ]) {
    cases.push({
      file,
      path: `tmp/paleo-domain-review/${file}`,
      format: "netcdf4",
      variable: "z",
      indices: {},
      window: [180, 90, 181, 91],
      value,
    });
  }
}
// 直接托管包产物，保留入口 URL 参数；生产二次打包会掩盖入口被反向导入的问题。
await cp(
  new URL("../../packages/rtl-raster-source/dist/", import.meta.url),
  new URL("source/", output),
  { recursive: true },
);
await mkdir(new URL("fixtures/", output));
for (const item of cases)
  await writeFile(
    new URL(`fixtures/${item.file}`, output),
    await readFile(new URL(`../../${item.path}`, import.meta.url)),
  );
await writeFile(
  new URL("index.html", output),
  "<!doctype html><title>NetCDF Worker regression</title>",
);
const server = await startStaticBenchmarkServer(fileURLToPath(output), (line) =>
  process.stderr.write(`${line}\n`),
);
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(server.baseUrl);
  const results = await page.evaluate(async (fixtures) => {
    const { openNetCDFSource } = await import("/source/netcdf/index.js");
    const results = [];
    for (const query of ["", "?worker_file&type=module"]) {
      for (const fixture of fixtures) {
        let dataset;
        let source;
        const record = { file: fixture.file, query };
        try {
          const response = await fetch(`/fixtures/${fixture.file}`);
          const file = new File([await response.blob()], fixture.file);
          dataset = await openNetCDFSource(file, {
            signal: AbortSignal.timeout(30000),
            workerFactory: () =>
              new Worker(`/source/workers/netcdf.js${query}`, { type: "module" }),
          });
          if (dataset.metadata.format !== fixture.format) throw new Error("Unexpected format");
          record.values = [];
          for (let iteration = 0; iteration < 2; iteration++) {
            source = await dataset.selectSlice({
              variable: fixture.variable,
              indices: fixture.indices,
              signal: AbortSignal.timeout(30000),
            });
            const value = (
              await source.readWindow({
                window: fixture.window,
                signal: AbortSignal.timeout(30000),
              })
            ).bands[0][0];
            if (value !== fixture.value) throw new Error(`Unexpected raw value: ${value}`);
            record.values.push(value);
            source.close();
            if (dataset.closed) throw new Error("Closing a slice must preserve its dataset");
          }
          record.passed = true;
        } catch (error) {
          record.passed = false;
          record.error = error instanceof Error ? error.message : String(error);
        } finally {
          source?.close();
          dataset?.close();
        }
        results.push(record);
      }
    }
    return results;
  }, cases);
  await writeFile(
    new URL("evidence.json", output),
    JSON.stringify({ browser: browser.version(), cases: results }, null, 2),
  );
  for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
  process.stdout.write(`Evidence: ${fileURLToPath(new URL("evidence.json", output))}\n`);
  assert.equal(results.filter((result) => !result.passed).length, 0, "NetCDF Worker cases failed");
} finally {
  await browser?.close();
  await server.close();
}

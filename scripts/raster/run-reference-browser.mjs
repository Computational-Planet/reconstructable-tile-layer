import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { build } = await import(
  pathToFileURL(requireDemo.resolve("vite").replace(/index\.cjs$/, "dist/node/index.js")).href
);
const { chromium } = requireDemo("playwright-core");
const output = new URL("../../tmp/raster-reference-browser/", import.meta.url);
const domainMode = process.argv.includes("--domain");
const converterMode = process.argv.includes("--converter");
// Only a production build and temporary loopback static fixture service; no dev/HMR server.
await build({
  root: fileURLToPath(new URL("browser/", import.meta.url)),
  configFile: false,
  base: "./",
  resolve: {
    alias: {
      cesium: fileURLToPath(new URL("../../node_modules/cesium/Source/Cesium.js", import.meta.url)),
    },
  },
  worker: { format: "es" },
  build: { outDir: fileURLToPath(output), emptyOutDir: false, target: "es2022", minify: false },
  logLevel: "warn",
});
await mkdir(new URL("reference/", output), { recursive: true });
const manifest = JSON.parse(
  await readFile(
    new URL(
      domainMode ? "domain-reference-datasets.json" : "reference-datasets.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
if (converterMode) {
  manifest.push(
    ...JSON.parse(
      await readFile(new URL("domain-reference-datasets.json", import.meta.url), "utf8"),
    ),
  );
  const requireConverter = createRequire(
    new URL("../../packages/rtl-raster-converter/package.json", import.meta.url),
  );
  const gdalDirectory = new URL("./", pathToFileURL(requireConverter.resolve("gdal3.js")));
  await mkdir(new URL("gdal/", output), { recursive: true });
  for (const name of ["gdal3.js", "gdal3WebAssembly.wasm", "gdal3WebAssembly.data"])
    await copyFile(new URL(name, gdalDirectory), new URL(`gdal/${name}`, output));
  await copyFile(
    new URL("../../packages/rtl-raster-converter/test/fixtures/unreferenced.tif", import.meta.url),
    new URL("reference/unreferenced.tif", output),
  );
}
for (const name of [
  ...manifest.map((entry) => entry.filename),
  ...(domainMode ? [] : ["reference-metadata.json"]),
])
  await copyFile(
    new URL(
      `../../tmp/${domainMode || (converterMode && manifest.find((entry) => entry.filename === name)?.purpose) ? "paleo-domain-review" : "raster-reference-data"}/${name}`,
      import.meta.url,
    ),
    new URL(`reference/${name}`, output),
  );
for (const name of ["packed-record.nc", "grouped-grid.nc"])
  await copyFile(
    new URL(`../../packages/rtl-raster-source/test/fixtures/${name}`, import.meta.url),
    new URL(`reference/${name}`, output),
  );
const server = await startStaticBenchmarkServer(fileURLToPath(output), () => {});
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => process.stderr.write(`${error.stack}\n`));
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => typeof window.runReferenceTests === "function");
  const result = await page.evaluate(
    async ({ domain, converter }) => {
      let timeout;
      try {
        return await Promise.race([
          converter
            ? window.runConverterTests()
            : domain
              ? window.runDomainTests()
              : window.runReferenceTests(),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Reference tests exceeded their time limit")),
              converter ? 300000 : 180000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    },
    { domain: domainMode, converter: converterMode },
  );
  await writeFile(
    new URL(
      converterMode
        ? "converter-evidence.json"
        : domainMode
          ? "domain-evidence.json"
          : "evidence.json",
      output,
    ),
    JSON.stringify({ browser: browser.version(), datasets: result }, null, 2),
  );
  process.stdout.write(
    `Passed real-browser ${converterMode ? "converter" : domainMode ? "domain (including expected rejection)" : "reference"} tests for ${result.length} cases. Evidence: ${fileURLToPath(new URL(converterMode ? "converter-evidence.json" : domainMode ? "domain-evidence.json" : "evidence.json", output))}\n`,
  );
} finally {
  await browser?.close();
  await server.close();
}

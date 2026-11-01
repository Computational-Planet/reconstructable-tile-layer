import { copyFile, mkdir, writeFile } from "node:fs/promises";
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
const output = new URL("../../tmp/raster-orientation-browser/", import.meta.url);
// 只构建静态测试页；不启动前端开发服务器。
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
  build: {
    outDir: fileURLToPath(output),
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    rollupOptions: { input: fileURLToPath(new URL("browser/orientation.html", import.meta.url)) },
  },
  logLevel: "warn",
});
await mkdir(new URL("reference/", output), { recursive: true });
for (const [source, target] of [
  ["tmp/paleo-domain-review/Map01_PALEOMAP_1deg_Holocene_0Ma.nc", "paleodem.nc"],
  ["tmp/raster-demo-browser/paleodem-ui.cog.tif", "paleodem.cog.tif"],
  ["packages/rtl-raster-source/test/fixtures/rgb-mercator.tif", "rgb-mercator.tif"],
])
  await copyFile(
    new URL(`../../${source}`, import.meta.url),
    new URL(`reference/${target}`, output),
  );
const server = await startStaticBenchmarkServer(fileURLToPath(output), () => {});
const evidence = { cases: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  evidence.browser = browser.version();
  const page = await browser.newPage();
  page.on("pageerror", (error) => evidence.errors.push(error.stack));
  await page.goto(`${server.baseUrl}/orientation.html`);
  await page.waitForFunction(() => typeof window.runOrientationTests === "function");
  evidence.cases = await page.evaluate(() => window.runOrientationTests());
  process.stdout.write(`Passed ${evidence.cases.length} raster orientation cases.\n`);
} catch (error) {
  evidence.failure = error.stack;
  throw error;
} finally {
  await writeFile(new URL("evidence.json", output), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.close();
}

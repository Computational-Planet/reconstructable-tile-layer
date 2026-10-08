import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";
import { showLocalRasterSettings } from "./demo-source-panel.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { chromium } = requireDemo("playwright-core");
const output = new URL("../../tmp/source-panel-browser/", import.meta.url);
await mkdir(output, { recursive: true });
// 只托管生产构建作自动化测试，不启动或接管用户的开发服务器。
const server = await startStaticBenchmarkServer(
  fileURLToPath(new URL("../../apps/reconstructable-tile-layer-demo/dist/", import.meta.url)),
  () => {},
);
const evidence = { cases: [], errors: [] };
let browser;
let page;
const record = (name) => {
  evidence.cases.push(name);
  process.stdout.write(`PASS ${name}\n`);
};
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  evidence.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => evidence.errors.push(error.stack));
  await page.route("**/*", async (route) => {
    if (!route.request().url().startsWith(server.baseUrl)) return route.abort();
    if (/\/cesium\/Cesium\.js(?:\?|$)/.test(route.request().url())) {
      const response = await route.fetch();
      return route.fulfill({
        response,
        body: `${await response.text()}\n;const originalPanelRender = Cesium.Scene.prototype.render; Cesium.Scene.prototype.render = function(...args) { window.__panelScene = this; return originalPanelRender.apply(this, args); };`,
      });
    }
    return route.continue();
  });
  const waitStatus = async (text) =>
    page.waitForFunction(
      (expected) =>
        document.querySelector('[data-testid="raster-status"]')?.textContent.includes(expected),
      text,
      { timeout: 120000 },
    );
  const apply = page.getByRole("button", { name: "Apply source", exact: true });
  const load = page.getByRole("button", { name: "Load Tiles By Level", exact: true });
  const active = page.getByTestId("active-source");
  const applyService = async () => {
    await apply.click();
    await page.waitForFunction(() =>
      document.querySelector(".status")?.textContent.includes("Source applied."),
    );
    assert(await load.isEnabled());
    assert(await page.getByLabel("Service URL").isVisible());
  };
  const screenshot = async (name) => {
    await page.locator(".control-panel").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({ path: fileURLToPath(new URL(name, output)) });
  };
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => !!window.__panelScene && !!window.__tileProcesserStats);
  await page
    .getByLabel("Feature source", { exact: true })
    .selectOption("seton-2012-static-polygons-gpmlz");
  await page.getByLabel("Rotation source", { exact: true }).selectOption("seton-2012-rot");
  assert.equal(await apply.count(), 1);
  assert(await apply.isEnabled());
  assert(await load.isDisabled());
  assert.equal(await page.getByRole("button", { name: "Init Reconstruction Manager" }).count(), 0);
  const modelBox = await page
    .getByRole("region", { name: "Plate model", exact: true })
    .boundingBox();
  const sourceBox = await page
    .getByRole("region", { name: "Imagery data source", exact: true })
    .boundingBox();
  const reconstructionBox = await page
    .getByRole("region", { name: "Reconstruction", exact: true })
    .boundingBox();
  assert(modelBox.y < sourceBox.y && sourceBox.y < reconstructionBox.y);
  await screenshot("01-service-config.png");
  await applyService();
  assert((await active.innerText()).includes("GPlates Topography (4326)"));
  record("Ordered workflow and one-click initial tile-service apply");

  await showLocalRasterSettings(page);
  assert((await active.innerText()).includes("GPlates Topography (4326)"));
  assert(await load.isEnabled());
  assert(await apply.isDisabled());
  assert((await page.locator("#source-apply-help").innerText()).includes("Choose a local"));
  await page
    .getByLabel("Local raster file", { exact: true })
    .setInputFiles(
      fileURLToPath(
        new URL(
          "../../tmp/paleo-domain-review/Map01_PALEOMAP_1deg_Holocene_0Ma.nc",
          import.meta.url,
        ),
      ),
    );
  await waitStatus("Select a variable");
  assert(await apply.isDisabled());
  assert((await page.locator("#source-apply-help").innerText()).includes("Read selected slice"));
  await page.getByRole("button", { name: "Read selected slice", exact: true }).click();
  await waitStatus("Slice ready");
  assert((await page.getByTestId("raster-summary").innerText()).includes("L0–L2"));
  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  assert(await apply.isDisabled());
  assert((await page.locator("#source-apply-help").innerText()).includes("Confirm"));
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await screenshot("02-local-config.png");
  await apply.click();
  await waitStatus("Modern source bound");
  assert.equal(await page.locator("details.source-settings").getAttribute("open"), null);
  assert((await active.innerText()).includes("Map01_PALEOMAP"));
  assert.equal(await page.getByLabel("Tile level", { exact: true }).inputValue(), "2");
  assert.equal(await page.getByLabel("Tile level", { exact: true }).getAttribute("max"), "2");
  record("Service stays active while editing; NetCDF readiness and L2 defaults are explained");
  await load.click();
  await page.waitForFunction(
    () => {
      const stats = window.__simpleGeoReconstructStats?.();
      return (
        document.querySelector(".status")?.textContent.includes("Level 2 tiles loaded") &&
        stats?.primitiveCount > 0 &&
        stats.primitiveCount === stats.readyPrimitiveCount
      );
    },
    null,
    { timeout: 180000 },
  );
  await page.getByLabel("Reconstruction age in Ma").fill("100");
  assert((await active.innerText()).includes("reconstruction: 100 Ma"));
  await screenshot("03-local-reconstruction.png");
  record("Real PaleoDEM NetCDF loads L2 reconstruction tiles through the unified source panel");

  await page.getByLabel("Imagery source type").selectOption("tile-service");
  assert((await active.innerText()).includes("Map01_PALEOMAP"));
  await page
    .getByLabel("Fill from example", { exact: true })
    .selectOption("gplates-topography-3857");
  assert((await active.innerText()).includes("Map01_PALEOMAP"));
  await applyService();
  assert((await active.innerText()).includes("GPlates Topography (3857)"));
  assert.equal(await page.getByTestId("raster-applied").count(), 0);
  assert.equal(await page.evaluate(() => window.__simpleGeoReconstructStats().primitiveCount), 0);
  record("Local-to-service apply replaces the source and clears old reconstruction tiles");

  await page.getByRole("button", { name: "Model settings", exact: true }).click();
  await page.getByLabel("Rotation anchor", { exact: true }).selectOption("custom");
  await page.getByLabel("Anchor plate ID", { exact: true }).fill("701");
  assert(await load.isDisabled());
  assert((await active.innerText()).includes("Plate model changed"));
  await applyService();
  assert(!(await active.innerText()).includes("Plate model changed"));
  await page.getByLabel("Rotation anchor", { exact: true }).selectOption("default");
  await applyService();
  await page.getByRole("button", { name: "Model settings", exact: true }).click();
  record("Changed plate model blocks new tile loads until the unified apply binds it");

  await page.getByLabel("Fill from example", { exact: true }).selectOption("custom-url-template");
  await page
    .getByLabel("Service URL", { exact: true })
    .fill(`${server.baseUrl}/tiles/Gplates_Topography/{z}/{x}/{y}.png`);
  assert((await active.innerText()).includes("GPlates Topography (3857)"));
  await applyService();
  assert((await active.innerText()).includes("URL template"));
  record("Custom URL-template service uses the same configure/apply workflow");

  await showLocalRasterSettings(page);
  assert((await page.getByTestId("raster-file").innerText()).includes("Map01_PALEOMAP"));
  await page.getByLabel("Raster coordinate use").selectOption("reference-only");
  await apply.click();
  await waitStatus("Reference layer displayed");
  assert(await load.isDisabled());
  assert((await page.locator("#reconstruction-help").innerText()).includes("fixed coordinates"));
  assert.equal(await page.evaluate(() => window.__panelScene.globe.imageryLayers.length), 1);
  record("Returning to a local file retains its selection; reference mode explains direct display");

  await showLocalRasterSettings(page);
  await page.getByLabel("Raster coordinate use").selectOption("paleo-snapshot");
  assert(await apply.isDisabled());
  await page.getByLabel("Snapshot display age").fill("0");
  await page.getByLabel("Snapshot age source").fill("PALEOMAP Holocene 0 Ma file");
  await apply.click();
  await waitStatus("Snapshot displayed");
  assert(await load.isDisabled());
  await page.getByLabel("Reconstruction age in Ma").fill("100");
  assert((await active.innerText()).includes("hidden at current age"));
  assert.equal(
    await page.evaluate(() => window.__panelScene.globe.imageryLayers.get(0).show),
    false,
  );
  await page.getByLabel("Reconstruction age in Ma").fill("0");
  assert.equal(
    await page.evaluate(() => window.__panelScene.globe.imageryLayers.get(0).show),
    true,
  );
  record("Snapshot age requirements and visibility remain distinct from reconstruction");

  // 在线表单可能尚未填完，不能因此破坏已应用本地数据的导出/导入。
  await page.getByLabel("Imagery source type").selectOption("tile-service");
  await page.getByLabel("Fill from example", { exact: true }).selectOption("custom-url-template");
  await page.getByLabel("Service URL", { exact: true }).fill("");
  assert(await apply.isDisabled());
  await page.getByLabel("Imagery source type").selectOption("local-raster");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export info", exact: true }).click();
  const download = await downloading;
  const config = fileURLToPath(new URL("source-panel-experiment.json", output));
  await download.saveAs(config);
  await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(config);
  await page.waitForFunction(() =>
    document.querySelector(".status")?.textContent.includes("Reselect the local file"),
  );
  assert.equal(await page.getByLabel("Imagery source type").inputValue(), "local-raster");
  assert((await active.innerText()).includes("No source applied"));
  assert(await load.isDisabled());
  record(
    "Local experiment import works with an unfinished online draft and requires local-file reselection",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("04-narrow-layout.png");
  assert(
    await page.locator(".control-panel").evaluate((node) => node.scrollWidth <= node.clientWidth),
  );
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(evidence.errors, []);
  record("Narrow-screen panel has no horizontal overflow; no uncaught browser errors");
} catch (error) {
  evidence.failure = error.stack;
  if (page)
    await page.screenshot({ path: fileURLToPath(new URL("failure.png", output)) }).catch(() => {});
  throw error;
} finally {
  await writeFile(new URL("results.json", output), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.close();
}

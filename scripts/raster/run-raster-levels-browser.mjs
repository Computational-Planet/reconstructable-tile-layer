import { showLocalRasterSettings, applyRasterAndReopenSettings } from "./demo-source-panel.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { chromium } = requireDemo("playwright-core");
const output = new URL("../../tmp/raster-levels-browser/", import.meta.url);
await mkdir(output, { recursive: true });
// 仅测试已构建的 Demo；临时静态服务和浏览器均在 finally 中关闭。
const server = await startStaticBenchmarkServer(
  fileURLToPath(new URL("../../apps/reconstructable-tile-layer-demo/dist/", import.meta.url)),
  (message) => process.stderr.write(`${message}\n`),
);
const evidence = { browser: "", cases: [], errors: [] };
let browser;
let page;
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  evidence.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => evidence.errors.push(error.stack));
  await page.route("**/*", async (route) => {
    if (!route.request().url().startsWith(server.baseUrl)) return route.abort();
    if (/\/cesium\/Cesium\.js(?:\?|$)/.test(route.request().url())) {
      const response = await route.fetch();
      return route.fulfill({
        response,
        body: `${await response.text()}\n;const renderForLevels = Cesium.Scene.prototype.render; Cesium.Scene.prototype.render = function(...args) { window.__levelScene = this; return renderForLevels.apply(this, args); };`,
      });
    }
    return route.continue();
  });
  const raster = page.getByRole("region", { name: "Imagery data source", exact: true });
  const waitStatus = async (expected) => {
    await page.waitForFunction(
      (text) => document.querySelector('[data-testid="raster-status"]')?.textContent.includes(text),
      expected,
      { timeout: 120000 },
    );
    await showLocalRasterSettings(page, true);
  };
  const state = () =>
    page.evaluate(() => {
      const primitives = [];
      const visit = (collection) => {
        for (let index = 0; index < collection.length; index++) {
          const item = collection.get(index);
          if (typeof item.get === "function" && typeof item.length === "number") visit(item);
          else if (item.appearance?.material?.uniforms?.image) {
            for (const id of item._instanceIds ?? [item.geometryInstances?.id]) {
              const parts = String(id).split(":");
              primitives.push({
                plate: parts[0],
                tile: parts[3],
                level: Number(parts[3].split("/")[2]),
                show: item.show,
                matrix: Array.from(item.modelMatrix),
              });
            }
          }
        }
      };
      visit(window.__levelScene.primitives);
      return {
        primitives,
        processor: window.__tileProcesserStats(),
        manager: window.__simpleGeoReconstructStats?.(),
      };
    });
  const load = async (name, level) => {
    assert.equal(await page.getByLabel("Tile level", { exact: true }).inputValue(), String(level));
    const start = performance.now();
    await page.getByRole("button", { name: "Load Tiles By Level", exact: true }).click();
    await page.waitForFunction(
      (expected) => {
        const stats = window.__simpleGeoReconstructStats?.();
        return (
          document
            .querySelector(".status")
            ?.textContent.includes(`Level ${expected} tiles loaded`) &&
          stats?.primitiveCount > 0 &&
          stats.readyPrimitiveCount === stats.primitiveCount
        );
      },
      level,
      { timeout: 180000 },
    );
    const result = await state();
    assert(result.primitives.length > 0);
    assert(
      result.primitives.every((item) => item.level === level),
      "Actual primitives must use the requested level without silent clamping",
    );
    assert.equal(
      result.processor.imageRequestFailures,
      0,
      "Busy providers must not leave failed tiles",
    );
    const record = {
      name,
      level,
      elapsedMs: Math.round(performance.now() - start),
      primitiveCount: result.manager.primitiveCount,
      sourceTiles: new Set(result.primitives.map((item) => item.tile)).size,
      deferredAttempts: result.processor.imageRequestUndefined,
    };
    evidence.cases.push(record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return result;
  };
  const apply = async () => {
    await applyRasterAndReopenSettings(page);
    await waitStatus("Modern source bound");
  };

  await page.goto(server.baseUrl);
  await page.waitForFunction(() => !!window.__levelScene && !!window.__tileProcesserStats);
  await page
    .getByLabel("Feature source", { exact: true })
    .selectOption("seton-2012-static-polygons-gpmlz");
  await page.getByLabel("Rotation source", { exact: true }).selectOption("seton-2012-rot");
  await page.getByLabel("Reconstruction age in Ma").fill("0");
  await showLocalRasterSettings(page);
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
  await raster.getByRole("button", { name: "Read selected slice", exact: true }).click();
  await waitStatus("Slice ready");
  assert((await page.getByTestId("raster-levels").innerText()).includes("L0–L2"));
  await page.getByLabel("Raster color range").selectOption("manual");
  await page.getByLabel("Raster minimum").fill("-8000");
  await page.getByLabel("Raster maximum").fill("6000");
  await applyRasterAndReopenSettings(page);
  await waitStatus("Reference layer displayed");
  const api = await page.evaluate(async () => {
    const provider = window.__levelScene.globe.imageryLayers.get(0).imageryProvider;
    window.__levelExpectedTiles = new Map();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const image = await provider.requestImage(x, y, 2);
        window.__levelExpectedTiles.set(
          `${x}/${y}/2`,
          image.getContext("2d").getImageData(0, 0, 256, 256).data,
        );
      }
    }
    const tile = await provider.requestImage(2, 2, 2);
    let rejected = false;
    try {
      await provider.requestImage(4, 4, 3);
    } catch (error) {
      rejected = error instanceof RangeError;
    }
    const finer = await provider.constructor.fromSource(provider.source, {
      maximumLevel: 3,
      style: { kind: "single-band", band: 0, domain: [-8000, 6000] },
    });
    try {
      const fineTile = await finer.requestImage(4, 4, 3);
      return {
        native: provider.nativeMaximumLevel,
        maximum: provider.maximumLevel,
        recommended: provider.recommendedReconstructionLevel,
        rejected,
        pixel: [...tile.getContext("2d").getImageData(0, 0, 1, 1).data],
        finePixel: [...fineTile.getContext("2d").getImageData(0, 0, 1, 1).data],
        raw: (await provider.source.readWindow({ window: [180, 90, 181, 91] })).bands[0][0],
      };
    } finally {
      finer.destroy();
    }
  });
  assert.deepEqual(api, {
    native: 1,
    maximum: 2,
    recommended: 2,
    rejected: true,
    pixel: [56, 56, 56, 255],
    finePixel: [56, 56, 56, 255],
    raw: -4920,
  });
  evidence.cases.push({
    name: "PaleoDEM L2 and explicit L3 sampling preserve independently checked values",
    ...api,
  });

  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await apply();
  assert.equal(await page.getByLabel("Tile level", { exact: true }).getAttribute("max"), "2");
  await page.getByLabel("Tile level", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Load Tiles By Level", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".status")?.textContent.includes("Local raster supports L0–L2"),
  );
  assert.equal((await state()).primitives.length, 0);
  await page.getByLabel("Tile level", { exact: true }).fill("2");
  await load("Direct PaleoDEM NetCDF at recommended L2", 2);
  const alignment = await page.evaluate(async () => {
    const primitives = [];
    const visit = (collection) => {
      for (let i = 0; i < collection.length; i++) {
        const item = collection.get(i);
        if (typeof item.get === "function" && typeof item.length === "number") visit(item);
        else if (item.show && item.appearance?.material?.uniforms?.image) primitives.push(item);
      }
    };
    visit(window.__levelScene.primitives);
    const verifiedTiles = new Set();
    let checkedPixels = 0;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    for (const primitive of primitives) {
      const id = String(primitive._instanceIds?.[0] ?? primitive.geometryInstances?.id);
      const tile = id.split(":")[3];
      if (verifiedTiles.has(tile)) continue;
      const expected = window.__levelExpectedTiles.get(tile);
      if (!expected) throw new Error(`Missing reference tile ${tile}`);
      // 检查真正交给 Cesium 图元的裁剪纹理，而非只核对 Provider 的原始输出。
      let image = primitive.appearance.material.uniforms.image;
      if (typeof image === "string") {
        const loaded = new Image();
        loaded.src = image;
        await loaded.decode();
        image = loaded;
      }
      context.clearRect(0, 0, 256, 256);
      context.drawImage(image, 0, 0);
      const actual = context.getImageData(0, 0, 256, 256).data;
      let opaqueSamples = 0;
      for (let y = 7; y < 250; y += 13) {
        for (let x = 7; x < 250; x += 13) {
          const offset = 4 * (y * 256 + x);
          if (actual[offset + 3] !== 255) continue;
          for (let band = 0; band < 3; band++) {
            if (Math.abs(actual[offset + band] - expected[offset + band]) > 2) {
              throw new Error(
                `Scene texture ${id} at ${x},${y}: actual ${actual[offset + band]}, expected ${expected[offset + band]}`,
              );
            }
          }
          opaqueSamples++;
          checkedPixels++;
        }
      }
      if (opaqueSamples >= 12) verifiedTiles.add(tile);
    }
    window.__levelExpectedTiles.clear();
    return { checkedPixels, verifiedTiles: [...verifiedTiles] };
  });
  assert.equal(alignment.verifiedTiles.length, 16, "Check scene textures in all L2 tiles");
  assert(alignment.checkedPixels > 1000);
  evidence.cases.push({
    name: "0 Ma scene textures align with all 16 geographic source tiles",
    ...alignment,
  });
  await page.screenshot({ path: fileURLToPath(new URL("paleodem-l2-at-0ma.png", output)) });
  await page.getByLabel("Reconstruction age in Ma").fill("100");
  await page.waitForFunction(() => {
    const visit = (collection) => {
      for (let i = 0; i < collection.length; i++) {
        const item = collection.get(i);
        if (typeof item.get === "function" && visit(item)) return true;
        if (
          item.show &&
          item._instanceIds?.some((id) => String(id).startsWith("701:")) &&
          Math.abs(item.modelMatrix[1]) > 1e-6
        )
          return true;
      }
      return false;
    };
    return visit(window.__levelScene.primitives);
  });
  await page.screenshot({ path: fileURLToPath(new URL("paleodem-l2-at-100ma.png", output)) });
  evidence.cases.push({ name: "L2 NetCDF source remains visible and rotates at 100 Ma" });

  await page
    .getByLabel("Local raster file", { exact: true })
    .setInputFiles(
      fileURLToPath(
        new URL(
          "../../tmp/raster-reference-data/ETOPO_2022_v1_15s_N00E000_surface.tif",
          import.meta.url,
        ),
      ),
    );
  await waitStatus("File ready");
  assert((await page.getByTestId("raster-levels").innerText()).includes("L0–L4"));
  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await apply();
  assert.equal(await page.getByLabel("Tile level", { exact: true }).getAttribute("max"), "4");
  await load("ETOPO TIFF at recommended L3", 3);
  await page.evaluate(() => {
    const scene = window.__levelScene;
    scene.camera.setView({ destination: window.Cesium.Rectangle.fromDegrees(4, -9, 5, -8) });
    scene.requestRender();
  });
  await page.getByRole("button", { name: "Load Tiles By View Sphere", exact: true }).click();
  await page.waitForFunction(
    () =>
      /(?:Loaded|No new).*view tiles at level 4/.test(
        document.querySelector(".status")?.textContent ?? "",
      ),
    null,
    { timeout: 120000 },
  );
  const viewState = await state();
  assert(viewState.primitives.some((item) => item.level === 4));
  assert.equal(viewState.processor.imageRequestFailures, 0);
  evidence.cases.push({
    name: "ETOPO view loading refines to L4 within current view",
    primitiveCount: viewState.manager.primitiveCount,
  });
  await raster.getByRole("button", { name: "Remove local raster", exact: true }).click();
  assert.deepEqual(evidence.errors, []);
  process.stdout.write(`Passed ${evidence.cases.length} raster level cases.\n`);
} catch (error) {
  evidence.failure = error.stack;
  if (page && !page.isClosed()) {
    evidence.failureState = await page
      .evaluate(() => ({
        status: document.querySelector(".status")?.textContent,
        raster: document.querySelector('[data-testid="raster-status"]')?.textContent,
        manager: window.__simpleGeoReconstructStats?.(),
        processor: window.__tileProcesserStats?.(),
      }))
      .catch(() => null);
    await page.screenshot({ path: fileURLToPath(new URL("failure.png", output)) }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(new URL("evidence.json", output), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.close();
}

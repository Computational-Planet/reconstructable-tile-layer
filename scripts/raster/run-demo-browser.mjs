import { showLocalRasterSettings, applyRasterAndReopenSettings } from "./demo-source-panel.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { chromium } = requireDemo("playwright-core");
const dist = new URL("../../apps/reconstructable-tile-layer-demo/dist/", import.meta.url);
const output = new URL("../../tmp/raster-demo-browser/", import.meta.url);
await mkdir(output, { recursive: true });
// 仅托管已有生产产物；测试结束关闭静态服务，不运行 Vite dev/watch/HMR。
const server = await startStaticBenchmarkServer(fileURLToPath(dist), (line) =>
  process.stderr.write(`${line}\n`),
);
let browser;
let page;
const evidence = {
  browser: "",
  environment: {
    platform: platform(),
    architecture: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    systemMemoryBytes: totalmem(),
    measurement:
      "Single headless UI run; action timings include automation and paint waits, not a throughput benchmark. JS heap snapshots exclude Worker/WASM/GPU memory and are not peak memory.",
  },
  timings: [],
  cases: [],
  errors: [],
  externalRequests: [],
};
const timed = async (step, action, details = {}) => {
  const started = performance.now();
  try {
    return await action();
  } finally {
    evidence.timings.push({ step, elapsedMs: Math.round(performance.now() - started), ...details });
  }
};
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  evidence.browser = browser.version();
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => evidence.errors.push(error.stack));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.startsWith(server.baseUrl)) {
      evidence.externalRequests.push(url);
      return route.abort();
    }
    if (/\/cesium\/Cesium\.js(?:\?|$)/.test(url)) {
      const response = await route.fetch();
      // 只观察真实 Cesium Scene；不替换任何栅格、渲染或旋转算法。
      return route.fulfill({
        response,
        body: `${await response.text()}\n;const renderForRasterTest = Cesium.Scene.prototype.render; Cesium.Scene.prototype.render = function(...args) { window.__rasterTestScene = this; return renderForRasterTest.apply(this, args); };`,
      });
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__rasterTestWorkers = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.record = { url: String(url), terminated: false };
        window.__rasterTestWorkers.push(this.record);
      }
      terminate() {
        this.record.terminated = true;
        return super.terminate();
      }
    };
  });
  const raster = page.getByRole("region", { name: "Imagery data source", exact: true });
  const waitStatus = async (text) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-testid="raster-status"]')?.textContent?.includes(expected),
      text,
      { timeout: 120000 },
    );
    await showLocalRasterSettings(page, true);
  };
  const file = (directory, name) =>
    fileURLToPath(new URL(`../../${directory}/${name}`, import.meta.url));
  const upload = async (path) => {
    await showLocalRasterSettings(page);
    await timed(
      "Open or replace local file",
      async () => {
        await page.getByLabel("Local raster file", { exact: true }).setInputFiles(path);
        await waitStatus(/\.tiff?$/i.test(path) ? "File ready" : "Select a variable");
      },
      { file: path.split(/[\\/]/).at(-1), bytes: (await stat(path)).size },
    );
  };
  const readSlice = () =>
    timed("Read selected NetCDF slice", async () => {
      await raster.getByRole("button", { name: "Read selected slice", exact: true }).click();
      await waitStatus("Slice ready");
    });
  const loadTiles = () =>
    timed("Load level-0 reconstruction tiles until primitives are ready", async () => {
      // 保留既有 L0 基准；实际推荐 L2/L3 与视野 L4 另由 run-raster-levels-browser 验证。
      await page.getByLabel("Tile level", { exact: true }).fill("0");
      await page.getByRole("button", { name: "Load Tiles By Level", exact: true }).click();
      await page.waitForFunction(
        () => {
          const stats = window.__simpleGeoReconstructStats?.();
          return (
            document.querySelector(".status")?.textContent.includes("Level 0 tiles loaded") &&
            stats?.primitiveCount > 0 &&
            stats.readyPrimitiveCount === stats.primitiveCount
          );
        },
        null,
        { timeout: 120000 },
      );
    });
  const heapSnapshot = () =>
    page.evaluate(() => {
      const memory = performance.memory;
      return memory
        ? {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          }
        : null;
    });
  const state = () =>
    page.evaluate(() => {
      const scene = window.__rasterTestScene;
      const layers = scene.globe.imageryLayers;
      return {
        layers: Array.from({ length: layers.length }, (_, i) => ({
          show: layers.get(i).show,
          name: layers.get(i).imageryProvider.source?.metadata.name,
        })),
        processor: window.__tileProcesserStats?.(),
        manager: window.__simpleGeoReconstructStats?.(),
      };
    });
  const download = async (button, filename) => {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const item = await event;
    const path = new URL(filename, output);
    await item.saveAs(fileURLToPath(path));
    return path;
  };
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => !!window.__rasterTestScene && !!window.__tileProcesserStats);
  assert.equal((await state()).layers.length, 0);
  evidence.jsHeapAtStartup = await heapSnapshot();
  const baselineRequests = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  assert(
    !baselineRequests.some((url) => /hdf5_hl|netcdf-/.test(url)),
    "Optional engines must not load at startup",
  );

  for (const [name, age, value] of [
    ["Map01_PALEOMAP_1deg_Holocene_0Ma.nc", 0, -4920],
    ["Map23_PALEOMAP_1deg_Early_Cretaceous_100Ma.nc", 100, 480],
  ]) {
    await upload(file("tmp/paleo-domain-review", name));
    await readSlice();
    await page.getByLabel("Raster coordinate use").selectOption("paleo-snapshot");
    await page.getByLabel("Snapshot display age").fill(String(age));
    await page
      .getByLabel("Snapshot age source")
      .fill(
        "Scotese & Wright 2018 published file sequence, nominal age in filename; DOI 10.5281/zenodo.5460860",
      );
    await timed(
      "Apply PaleoDEM snapshot and obtain first root image",
      async () => {
        await applyRasterAndReopenSettings(page);
        await waitStatus("Snapshot displayed");
        await page.evaluate(() =>
          window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider.requestImage(0, 0, 0),
        );
      },
      { file: name, ageMa: age },
    );
    const actual = await page.evaluate(async () => {
      const source = window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider.source;
      return {
        value: (await source.readWindow({ window: [180, 90, 181, 91] })).bands[0][0],
        units: source.metadata.bands[0].units ?? null,
      };
    });
    assert.equal(actual.value, value);
    assert.equal(actual.units, null);
    const atAge = await state();
    assert.equal(atAge.layers.length, 1);
    assert.equal(atAge.layers[0].show, true);
    assert.equal(
      atAge.processor.totalRequests,
      0,
      "Paleo snapshots must never go through RTL reprojection",
    );
    await page.getByLabel("Reconstruction age in Ma").fill(String(age + 1));
    await page.waitForFunction(() => !window.__rasterTestScene.globe.imageryLayers.get(0).show);
    await page.getByLabel("Reconstruction age in Ma").fill(String(age));
    await page.waitForFunction(() => window.__rasterTestScene.globe.imageryLayers.get(0).show);
    evidence.cases.push({
      case: "PaleoDEM age-specific ordinary Cesium layer",
      name,
      age,
      ...actual,
      processorRequests: atAge.processor.totalRequests,
    });
    if (age === 100)
      await page.screenshot({ path: fileURLToPath(new URL("paleodem-100ma.png", output)) });
  }
  const excludedRaw = await page.evaluate(async () => {
    const provider = window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider;
    window.__rasterTestPreviousProvider = provider;
    const { coordinates } = provider.source.metadata;
    const closest = (values, target) =>
      values.reduce(
        (best, value, i) => (Math.abs(value - target) < Math.abs(values[best] - target) ? i : best),
        0,
      );
    const x = closest(coordinates.x, -180 + 180 / 256),
      y = closest(coordinates.y, 90 - 90 / 256);
    window.__rasterTestExcludedWindow = [x, y, x + 1, y + 1];
    return (await provider.source.readWindow({ window: window.__rasterTestExcludedWindow }))
      .bands[0][0];
  });
  await page.getByLabel("Raster color range").selectOption("manual");
  await page.getByLabel("Raster minimum").fill("-8000");
  await page.getByLabel("Raster maximum").fill("6000");
  await page.getByLabel("Raster color ramp").selectOption("blue-brown");
  await page.getByLabel("Raster additional NoData").fill(String(excludedRaw));
  await applyRasterAndReopenSettings(page);
  await page.waitForFunction(
    () =>
      window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider.style.additionalNoData
        ?.length === 1,
  );
  const styled = await page.evaluate(async () => {
    const provider = window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider;
    const tile = await provider.requestImage(0, 0, 0);
    return {
      alpha: tile.getContext("2d").getImageData(0, 0, 1, 1).data[3],
      raw: (await provider.source.readWindow({ window: window.__rasterTestExcludedWindow }))
        .bands[0][0],
      originalNoData: provider.source.metadata.bands[0].noData.map(String),
      oldDestroyed: window.__rasterTestPreviousProvider.isDestroyed(),
      sourceClosed: provider.source.closed,
    };
  });
  assert.equal(styled.alpha, 0);
  assert.equal(styled.raw, excludedRaw);
  assert.deepEqual(styled.originalNoData, ["NaN"]);
  assert.equal(styled.oldDestroyed, true);
  assert.equal(styled.sourceClosed, false);
  evidence.cases.push({
    case: "Style replacement and display-only NoData retain original scientific values",
    ...styled,
  });
  const exportPath = await download("Export info", "paleodem-experiment.json");
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(exported.sources.localRaster.context.displayAgeMa, 100);
  assert.equal(exported.sources.localRaster.file.requiresReselect, true);
  assert.equal(exported.sources.localRaster.source.slice.variable, "z");
  assert.deepEqual(exported.sources.localRaster.source.bands[0].noData, ["NaN"]);
  assert(!JSON.stringify(exported.sources.localRaster).includes("blob:"));
  assert.equal(exported.layers.rtlLayer, "off");

  await upload(
    file("tmp/paleo-domain-review", "tas_CESM1.2-CAM5_deepmip-eocene-p1-x3_v1.0.mean.nc"),
  );
  await page.getByLabel("NetCDF variable").selectOption("tas");
  await page.getByLabel("time index", { exact: true }).fill("1");
  await readSlice();
  assert((await raster.innerText()).includes("365_day"));
  assert((await raster.innerText()).includes("1950"));
  assert.equal(await page.getByLabel("Raster coordinate use").inputValue(), "reference-only");
  await page
    .getByLabel("Raster geological experiment")
    .fill("DeepMIP Eocene p1 x3; CESM1.2-CAM5 v1.0; monthly climatology");
  await applyRasterAndReopenSettings(page);
  await waitStatus("Reference layer displayed");
  const deepmip = await page.evaluate(() => {
    const metadata =
      window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider.source.metadata;
    return { slice: metadata.slice, units: metadata.bands[0].units };
  });
  assert.equal(deepmip.slice.indices.time, 1);
  assert.equal(deepmip.units, "K");
  assert.equal(deepmip.slice.selections[0].coordinate.attributes.calendar, "365_day");
  assert(String(deepmip.slice.selections[0].coordinate.attributes.units).includes("1950"));
  evidence.cases.push({
    case: "DeepMIP original model-time index and geological experiment separated",
    ...deepmip,
  });

  await upload(
    file("tmp/paleo-domain-review", "tos_CESM1.2-CAM5_deepmip-eocene-p1-x3_v1.0.mean.nc"),
  );
  await page.getByLabel("NetCDF variable").selectOption("tos");
  assert((await raster.getByRole("alert").textContent()).includes("curvilinear"));
  assert(
    await raster.getByRole("button", { name: "Read selected slice", exact: true }).isDisabled(),
  );
  assert.equal((await state()).layers.length, 0);
  evidence.cases.push({ case: "DeepMIP curvilinear tos explicitly rejected by UI" });

  // 导入描述不能恢复已经失效的本地文件；实际 File 必须重新选择。
  await page
    .locator('input[type="file"][accept=".json,application/json"]')
    .setInputFiles(fileURLToPath(exportPath));
  await page.waitForFunction(() => document.body.textContent.includes("Reselect the local file"));
  assert.equal(await page.locator('[data-testid="raster-file"]').count(), 0);
  assert.equal((await state()).layers.length, 0);
  evidence.cases.push({ case: "Experiment reimport requires local file reselection" });

  process.stdout.write(
    "PaleoDEM / DeepMIP / COG UI paths passed; testing modern reconstruction.\n",
  );
  await page
    .getByLabel("Feature source", { exact: true })
    .selectOption("seton-2012-static-polygons-gpmlz");
  await page.getByLabel("Rotation source", { exact: true }).selectOption("seton-2012-rot");
  await page.getByLabel("Reconstruction age in Ma").fill("0");
  await upload(file("tmp/raster-reference-data", "ETOPO_2022_v1_15s_N00E000_surface.tif"));
  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await page
    .getByLabel("Raster source citation")
    .fill(
      "ETOPO 2022 v1, DOI 10.25921/fd45-gt74; present-day relief transported as a scalar field",
    );
  await page
    .getByLabel("Raster reference frame")
    .fill(
      "Modern geographic coordinates; Seton et al. 2012 static polygons and rotations; anchor 0",
    );
  await applyRasterAndReopenSettings(page);
  await waitStatus("Modern source bound");
  await page.getByLabel("Tile level", { exact: true }).fill("0");
  await loadTiles();
  const modernState = await state();
  assert.equal(modernState.layers.length, 0, "Modern data must use RTL primitives");
  assert(modernState.manager.primitiveCount > 0);
  assert(modernState.processor.renderedJobCount > 0);
  const primitives = () =>
    page.evaluate(() => {
      const items = [];
      const visit = (collection) => {
        for (let i = 0; i < collection.length; i++) {
          const item = collection.get(i);
          if (typeof item.get === "function" && typeof item.length === "number") visit(item);
          else if (item.appearance?.material?.uniforms?.image)
            items.push({
              ids: item._instanceIds ?? [item.geometryInstances?.id],
              matrix: Array.from(item.modelMatrix),
              show: item.show,
            });
        }
      };
      visit(window.__rasterTestScene.primitives);
      return items;
    });
  const modernPrimitives = await primitives();
  const africa0 = modernPrimitives.find(
    (item) => item.ids.some((id) => String(id).startsWith("701:")) && item.show,
  );
  assert(africa0, `Expected an African plate primitive: ${JSON.stringify(modernPrimitives)}`);
  assert.deepEqual(africa0.matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const ageChangeStarted = performance.now();
  await page.getByLabel("Reconstruction age in Ma").fill("100");
  await page.waitForFunction(() => {
    const root = window.__rasterTestScene.primitives;
    const visit = (c) => {
      for (let i = 0; i < c.length; i++) {
        const p = c.get(i);
        if (typeof p.get === "function" && visit(p)) return true;
        if (
          p._instanceIds?.some((id) => String(id).startsWith("701:")) &&
          Math.abs(p.modelMatrix[1]) > 1e-6
        )
          return true;
      }
      return false;
    };
    return visit(root);
  });
  const paleoPrimitives = await primitives();
  evidence.timings.push({
    step: "Change modern reconstruction age from 0 to 100 Ma",
    elapsedMs: Math.round(performance.now() - ageChangeStarted),
  });
  const africa100 = paleoPrimitives.find(
    (item) => item.ids.some((id) => String(id).startsWith("701:")) && item.show,
  );
  assert(africa100, "African source remains visible at 100 Ma");
  // 独立 Rodrigues 公式，对照真实 ROT 的 701→001；001→000 在该模型为恒等旋转。
  const rotText = await readFile(
    new URL(
      "../../apps/reconstructable-tile-layer-demo/public/rotations/Seton_etal_ESR2012_2012.1.rot",
      import.meta.url,
    ),
    "utf8",
  );
  const row = rotText.split(/\r?\n/).find((line) => /^701\s+100\.0\s/.test(line));
  assert(row);
  const numbers = row.trim().split(/\s+/).slice(0, 6).map(Number);
  assert.equal(numbers[5], 1);
  const radians = Math.PI / 180;
  const [lat, lon, angle] = numbers.slice(2, 5).map((value) => value * radians);
  const axis = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const rotate = (vector) => {
    const dot = axis.reduce((sum, value, index) => sum + value * vector[index], 0);
    const cross = [
      axis[1] * vector[2] - axis[2] * vector[1],
      axis[2] * vector[0] - axis[0] * vector[2],
      axis[0] * vector[1] - axis[1] * vector[0],
    ];
    return vector.map(
      (value, index) =>
        value * Math.cos(angle) +
        cross[index] * Math.sin(angle) +
        axis[index] * dot * (1 - Math.cos(angle)),
    );
  };
  const expectedColumns = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map(rotate);
  const matrixError = Math.max(
    ...expectedColumns.flatMap((column, i) =>
      column.map((value, j) => Math.abs(value - africa100.matrix[i * 4 + j])),
    ),
  );
  assert(matrixError < 1e-10, `Independent finite-rotation discrepancy ${matrixError}`);
  await page.evaluate(() => {
    const scene = window.__rasterTestScene;
    scene.camera.setView({ destination: window.Cesium.Rectangle.fromDegrees(-20, -35, 30, 15) });
    scene.requestRender();
  });
  await page.screenshot({ path: fileURLToPath(new URL("etopo-seton-100ma.png", output)) });
  const modernExport = JSON.parse(
    await readFile(await download("Export info", "etopo-reconstruction.json"), "utf8"),
  );
  assert.equal(modernExport.sources.localRaster.context.model.anchorPlateId, "0");
  assert(modernExport.sources.localRaster.context.model.plateDomains.url.includes("Seton"));
  assert(modernExport.sources.localRaster.context.model.rotations[0].url.includes("Seton"));
  evidence.cases.push({
    case: "ETOPO modern raster → Seton 2012 matched static domains/ROT → actual Cesium RTL primitives",
    primitiveCount: modernState.manager.primitiveCount,
    renderJobs: modernState.processor.renderedJobCount,
    plate: 701,
    age: 100,
    rotRow: row,
    maxMatrixError: matrixError,
    scientificMeaning:
      "Transport of present-day scalar values; not a prediction of paleo topography",
  });

  await upload(file("tmp/raster-reference-data", "ETOPO_2022_v1_15s_N00E000_surface.nc"));
  await page.getByLabel("NetCDF variable").selectOption("z");
  await readSlice();
  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await applyRasterAndReopenSettings(page);
  await waitStatus("Modern source bound");
  await loadTiles();
  const ncState = await state();
  assert.equal(ncState.manager.primitiveCount, modernState.manager.primitiveCount);
  evidence.cases.push({
    case: "Modern ETOPO NetCDF4 selected slice → actual RTL reconstruction",
    variable: "z",
    primitiveCount: ncState.manager.primitiveCount,
  });

  // 同一个 0 Ma PaleoDEM 可显式作为现代瓦片源；时间轴改变目标年龄，不按源年龄隐藏。
  await upload(file("tmp/paleo-domain-review", "Map01_PALEOMAP_1deg_Holocene_0Ma.nc"));
  await page.getByLabel("NetCDF variable").selectOption("z");
  await readSlice();
  await page.getByLabel("Reconstruction age in Ma").fill("0");
  await page.getByLabel("Raster coordinate use").selectOption("modern-reconstructable");
  await page.getByLabel("Data use the present-day frame", { exact: false }).check();
  await page.getByLabel("Raster color range").selectOption("manual");
  await page.getByLabel("Raster minimum").fill("-8000");
  await page.getByLabel("Raster maximum").fill("6000");
  await page.getByLabel("Raster color ramp").selectOption("blue-brown");
  await applyRasterAndReopenSettings(page);
  await waitStatus("Modern source bound");
  assert.equal(
    (await state()).layers.length,
    0,
    "0 Ma source must enter RTL, not snapshot imagery",
  );
  await loadTiles();
  const timeline = [];
  const requestsBeforeTimeline = (await state()).processor.totalRequests;
  for (const age of [0, 50, 100, 0]) {
    await page.getByLabel("Reconstruction age in Ma").fill(String(age));
    await page.waitForFunction(
      ({ age, previousMatrix }) => {
        const visit = (collection) => {
          for (let i = 0; i < collection.length; i++) {
            const item = collection.get(i);
            if (typeof item.get === "function" && typeof item.length === "number") {
              if (visit(item)) return true;
            } else if (
              item.show &&
              item._instanceIds?.some((id) => String(id).startsWith("701:"))
            ) {
              const matrix = Array.from(item.modelMatrix);
              return age === 0
                ? matrix.every(
                    (value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) < 1e-12,
                  )
                : previousMatrix.some((value, index) => Math.abs(matrix[index] - value) > 1e-6);
            }
          }
          return false;
        };
        return visit(window.__rasterTestScene.primitives);
      },
      { age, previousMatrix: timeline.at(-1)?.matrix ?? [] },
    );
    const items = await primitives();
    const africa = items.find(
      (item) => item.show && item.ids.some((id) => String(id).startsWith("701:")),
    );
    assert(africa, `PaleoDEM source should remain visible on plate 701 at ${age} Ma`);
    const visibleCount = items.filter((item) => item.show).length;
    assert(visibleCount > 0);
    assert.equal((await state()).layers.length, 0);
    if (age === 100) {
      const error = Math.max(
        ...expectedColumns.flatMap((column, i) =>
          column.map((value, j) => Math.abs(value - africa.matrix[i * 4 + j])),
        ),
      );
      assert(error < 1e-10, `PaleoDEM finite-rotation discrepancy ${error}`);
      await page.evaluate(() => {
        const scene = window.__rasterTestScene;
        scene.camera.setView({
          destination: window.Cesium.Cartesian3.fromDegrees(20, 15, 24000000),
        });
        scene.requestRender();
      });
      await page.screenshot({
        path: fileURLToPath(new URL("paleodem-0ma-reconstructed-at-100ma.png", output)),
      });
    }
    timeline.push({ age, visibleCount, matrix: africa.matrix });
  }
  assert.equal((await state()).processor.totalRequests, requestsBeforeTimeline);
  const paleoModernExport = JSON.parse(
    await readFile(await download("Export info", "paleodem-0ma-reconstruction.json"), "utf8"),
  );
  assert.equal(paleoModernExport.sources.localRaster.context.role, "modern-reconstructable");
  assert.equal(paleoModernExport.sources.localRaster.context.coordinateEpoch, "present-day");
  assert.equal(paleoModernExport.sources.localRaster.context.displayAgeMa, null);
  assert.equal(paleoModernExport.sources.localRaster.source.slice.variable, "z");
  evidence.cases.push({
    case: "PaleoDEM 0 Ma local NetCDF → RTL → 0/50/100/0 Ma timeline with visible rotated primitives",
    name: "Map01_PALEOMAP_1deg_Holocene_0Ma.nc",
    primitiveCount: (await state()).manager.primitiveCount,
    plate: 701,
    timeline,
  });
  process.stdout.write("PaleoDEM 0 Ma source follows the RTL timeline at 0, 50 and 100 Ma.\n");

  await page
    .getByLabel("Rotation source", { exact: true })
    .selectOption("zahirovic-2022-optimised-mantle-rot");
  await waitStatus("Plate model settings changed");
  assert(await page.getByRole("button", { name: "Load Tiles By Level", exact: true }).isDisabled());
  assert.equal((await state()).processor.resultBufferSize, 0);
  assert.equal((await primitives()).length, 0);
  evidence.cases.push({
    case: "Changing model invalidates local reconstruction and releases generated primitives/caches",
  });
  await raster.getByRole("button", { name: "Remove local raster", exact: true }).click();

  await upload(file("packages/rtl-raster-source/test/fixtures", "rgb-mercator.tif"));
  await page.getByLabel("Raster color mode").selectOption("rgb");
  await page.getByLabel("Raster color range").selectOption("manual");
  await page.getByLabel("Raster minimum").fill("0");
  await page.getByLabel("Raster maximum").fill("255");
  await applyRasterAndReopenSettings(page);
  await waitStatus("Reference layer displayed");
  const mercator = await page.evaluate(async () => {
    const provider = window.__rasterTestScene.globe.imageryLayers.get(0).imageryProvider;
    const tile = await provider.requestImage(0, 0, 0);
    const pixel = (x, y) => [...tile.getContext("2d").getImageData(x, y, 1, 1).data];
    return {
      epsg: provider.source.metadata.crs.epsg,
      globeRadius: provider.tilingScheme.ellipsoid.maximumRadius,
      north: provider.rectangle.north,
      red: pixel(32, 64),
      cyan: pixel(32, 192),
    };
  });
  assert.equal(mercator.epsg, 3857);
  assert.equal(mercator.globeRadius, 6371009);
  assert(Math.abs(mercator.north - Math.atan(Math.sinh(Math.PI / 2))) < 1e-12);
  assert.deepEqual(mercator.red, [255, 0, 0, 255]);
  assert.deepEqual(mercator.cyan, [0, 255, 255, 255]);
  evidence.cases.push({
    case: "Independent EPSG:3857 RGB fixture on GPlates sphere; CRS radius and axis orientation",
    ...mercator,
  });
  await raster.getByRole("button", { name: "Remove local raster", exact: true }).click();

  await page
    .locator('input[type="file"][accept=".gpml,.gpmlz,.json,.xml"]')
    .setInputFiles(
      file(
        "apps/reconstructable-tile-layer-demo/public/features",
        "Seton_etal_ESR2012_StaticPolygons.1.gpmlz",
      ),
    );
  await page
    .locator('input[type="file"][accept=".rot,.txt"]')
    .setInputFiles(
      file(
        "apps/reconstructable-tile-layer-demo/public/rotations",
        "Seton_etal_ESR2012_2012.1.rot",
      ),
    );
  const localModelExport = await download("Export info", "local-model-experiment.json");
  const localModel = JSON.parse(await readFile(localModelExport, "utf8"));
  assert.equal(localModel.sources.featureUrl, "");
  assert.deepEqual(localModel.sources.rotUrls, []);
  assert.equal(
    localModel.sources.localModelFiles.feature,
    "Seton_etal_ESR2012_StaticPolygons.1.gpmlz",
  );
  assert(!JSON.stringify(localModel).includes("blob:"));
  await page
    .locator('input[type="file"][accept=".json,application/json"]')
    .setInputFiles(fileURLToPath(localModelExport));
  await page.waitForFunction(() =>
    document.body.textContent.includes("Reselect the local plate-domain/ROT files"),
  );
  await page
    .getByRole("region", { name: "Plate model", exact: true })
    .getByRole("button", { name: "Model settings", exact: true })
    .click();
  assert.equal(await page.getByLabel("Feature URL", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("ROT URLs", { exact: true }).inputValue(), "");
  evidence.cases.push({
    case: "Uploaded plate-domain/ROT configuration retains file descriptions and requires reselection",
  });

  const activeScientificWorkers = await page.evaluate(() =>
    window.__rasterTestWorkers.filter(
      (worker) => /\/(?:netcdf|worker)-/.test(worker.url) && !worker.terminated,
    ),
  );
  assert.deepEqual(activeScientificWorkers, []);
  evidence.workers = await page.evaluate(() => window.__rasterTestWorkers);
  evidence.jsHeapAfterRemoval = await heapSnapshot();
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.externalRequests, []);
  await page.screenshot({ path: fileURLToPath(new URL("final-ui.png", output)), fullPage: false });
  process.stdout.write(`Passed ${evidence.cases.length} production Demo cases.\n`);
} catch (error) {
  evidence.failure = error.stack;
  if (page && !page.isClosed()) {
    evidence.failureState = await page
      .evaluate(() => ({
        rasterStatus: document.querySelector('[data-testid="raster-status"]')?.textContent,
        status: document.querySelector(".status")?.textContent,
        manager: window.__simpleGeoReconstructStats?.(),
        processor: window.__tileProcesserStats?.(),
      }))
      .catch(() => null);
    await page
      .screenshot({ path: fileURLToPath(new URL("failure-ui.png", output)) })
      .catch(() => {});
  }
  throw error;
} finally {
  await writeFile(new URL("evidence.json", output), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.close();
}

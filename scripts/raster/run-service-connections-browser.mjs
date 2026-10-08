import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";
import { openDisclosure } from "./demo-source-panel.mjs";

const requireDemo = createRequire(
  new URL("../../apps/reconstructable-tile-layer-demo/package.json", import.meta.url),
);
const { chromium } = requireDemo("playwright-core");
const output = new URL("../../tmp/service-connections-browser/", import.meta.url);
await mkdir(output, { recursive: true });
const tile = await readFile(
  new URL(
    "../../apps/reconstructable-tile-layer-demo/public/tiles/Gplates_Topography/0/0/0.png",
    import.meta.url,
  ),
);
// 只托管生产构建；使用可重复的图片响应验证 Cesium 的实际请求，不启动开发服务器。
const server = await startStaticBenchmarkServer(
  fileURLToPath(new URL("../../apps/reconstructable-tile-layer-demo/dist/", import.meta.url)),
  () => {},
);
const evidence = {
  cases: [],
  requests: [],
  errors: [],
  responseMode: "Deterministic PNG fixtures; does not test public endpoint availability.",
};
const record = (name) => {
  evidence.cases.push(name);
  process.stdout.write(`PASS ${name}\n`);
};
let browser;
let page;
let failTiles = false;
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
    const url = route.request().url();
    if (!url.startsWith(server.baseUrl) || /\/tiles\/|\/service-fixture\//.test(url)) {
      evidence.requests.push(url);
      return route.fulfill({
        status: failTiles ? 404 : 200,
        contentType: failTiles ? "text/plain" : "image/png",
        body: failTiles ? "Missing tile" : tile,
        headers: { "access-control-allow-origin": "*" },
      });
    }
    return route.continue();
  });
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => !!window.__tileProcesserStats);
  const field = (label) => page.getByLabel(label, { exact: true });
  const examples = field("Fill from example");
  const apply = page.getByRole("button", { name: "Apply source", exact: true });
  const test = page.getByRole("button", { name: "Test tile connection", exact: true });
  const active = page.getByTestId("active-source");
  const advanced = () => openDisclosure(page, "Grid, coverage and additional parameters");
  const runTileTest = async (successful = true) => {
    const start = evidence.requests.length;
    assert(await test.isEnabled(), await page.getByRole("form").innerText());
    await test.click();
    await page.waitForFunction(() =>
      /Tile readable|Tile test failed/.test(
        document.querySelector('[data-testid="service-test-result"]')?.textContent ?? "",
      ),
    );
    const result = await page.getByTestId("service-test-result").innerText();
    assert(result.includes(successful ? "Tile readable" : "Tile test failed"), result);
    assert(evidence.requests.length > start, "Preview must request an image");
    return new URL(evidence.requests.at(-1));
  };
  const query = (url) =>
    Object.fromEntries([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
  const bbox = (url, expected) => {
    const actual = query(url).bbox.split(",").map(Number);
    actual.forEach((value, index) =>
      assert(Math.abs(value - expected[index]) < 0.001, `${actual} != ${expected}`),
    );
  };
  const screenshot = async (name) => {
    await field("Service type").scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(name, output)) });
  };
  const presets = [
    ["gplates-topography-4326", "url-template", "geographic", "4"],
    ["gplates-topography-3857", "url-template", "web-mercator", "4"],
    ["arcgis-world-imagery", "wmts", "web-mercator", "18"],
    ["gmrt-topography-wms-3857", "wms", "web-mercator", ""],
    ["nasa-gibs-blue-marble-3857", "wms", "web-mercator", "8"],
    ["nasa-gibs-blue-marble-4326", "wms", "geographic", "7"],
    ["eox-terrain-4326", "wmts", "geographic", "17"],
    ["eox-terrain-light-4326", "wmts", "geographic", "17"],
    ["eox-s2-cloudless-2025-4326", "wmts", "geographic", "13"],
    ["eox-s2-cloudless-2025-3857", "wmts", "web-mercator", "14"],
    ["macrostrat-carto", "url-template", "web-mercator", "12"],
  ];
  for (const [key, protocol, projection, maximum] of presets) {
    await examples.selectOption(key);
    assert.equal(await field("Service type").inputValue(), protocol);
    assert.equal(await field("Service tiling scheme").inputValue(), projection);
    assert.equal(await field("Service maximum level").inputValue(), maximum);
    const url = await runTileTest();
    if (key.startsWith("gplates-")) {
      assert(
        (await page.getByTestId("service-address-help").innerText()).includes(
          "hosted with this Demo",
        ),
      );
      assert(url.pathname.endsWith(projection === "geographic" ? "/2/4/2.png" : "/2/2/2.png"));
    }
    if (protocol === "wms") {
      assert.equal(query(url).request, "GetMap");
      if (projection === "geographic") bbox(url, [-45, 0, 0, 45]);
      else bbox(url, [0, -10018754.1713946, 10018754.1713946, 0]);
    }
    if (key === "arcgis-world-imagery") {
      assert.equal(query(url).tilematrixset, "1");
      assert.equal(query(url).tilematrix, "2");
      assert.equal(query(url).tilerow, "2");
      assert.equal(query(url).tilecol, "2");
    }
    if (key.startsWith("eox-"))
      assert(
        url.pathname.endsWith(
          projection === "geographic" ? "/WGS84/2/2/4.jpg" : "/GoogleMapsCompatible/2/2/2.jpg",
        ),
      );
    if (key === "gplates-topography-4326") await screenshot("01-hosted-xyz.png");
    record(
      `Example fills an editable ${protocol} connection and generates the expected request: ${key}`,
    );
  }
  assert((await active.innerText()).includes("No source applied"));
  record("Testing connections does not apply a reconstruction source");

  await examples.selectOption("custom-url-template");
  assert(await apply.isDisabled());
  await field("Service URL").fill(
    "https://{s}.example.invalid/service-fixture/{z}/{x}/{reverseY}.png",
  );
  await advanced();
  await field("Service subdomains").fill("a,b");
  await field("Service parameters").fill("language=en\nvalue=a=b");
  let url = await runTileTest();
  assert(url.pathname.endsWith("/2/2/1.png"));
  assert(["a.example.invalid", "b.example.invalid"].includes(url.hostname));
  assert.equal(query(url).value, "a=b");
  await field("Service tiling scheme").selectOption("geographic");
  await field("L0 columns").fill("1");
  url = await runTileTest();
  assert(url.pathname.endsWith("/2/2/1.png"));
  await field("L0 columns").fill("2");
  url = await runTileTest();
  assert(url.pathname.endsWith("/2/4/1.png"));
  record(
    "Custom TMS reverses Y; editable L0 grid, subdomains and literal query values reach the request",
  );

  await examples.selectOption("nasa-gibs-blue-marble-4326");
  await field("Service URL").fill(
    "https://example.invalid/service-fixture/wms?SERVICE=WMS&REQUEST=GetCapabilities&LAYERS=stale&CRS=EPSG:3857&BBOX=stale",
  );
  await field("WMS layers").fill("paleo:elevation");
  await field("WMS styles").fill("terrain");
  await field("WMS image format").fill("image/png");
  await field("Transparent WMS background").check();
  await advanced();
  await field("Tile width").fill("512");
  await field("Tile height").fill("256");
  await field("Service parameters").fill("TIME=2025-01-01\nELEVATION=0");
  await field("Service connection name").fill("My WMS");
  await field("Service attribution").fill("Example dataset credit");
  url = await runTileTest();
  const wmsQuery = query(url);
  assert.equal(wmsQuery.request, "GetMap");
  assert.equal(wmsQuery.layers, "paleo:elevation");
  assert.equal(wmsQuery.crs, "EPSG:4326");
  assert.equal(wmsQuery.styles, "terrain");
  assert.equal(wmsQuery.format, "image/png");
  assert.equal(wmsQuery.transparent, "true");
  assert.equal(wmsQuery.width, "512");
  assert.equal(wmsQuery.height, "256");
  assert.equal(wmsQuery.time, "2025-01-01");
  assert.equal(wmsQuery.elevation, "0");
  assert.equal(
    [...url.searchParams.keys()].filter((key) => key.toLowerCase() === "layers").length,
    1,
  );
  bbox(url, [-45, 0, 0, 45]);
  await field("WMS version").selectOption("1.1.1");
  url = await runTileTest();
  assert.equal(query(url).srs, "EPSG:4326");
  assert.equal(query(url).crs, undefined);
  bbox(url, [0, -45, 45, 0]);
  await field("WMS version").selectOption("1.3.0");
  await field("WMS CRS").selectOption("CRS:84");
  url = await runTileTest();
  bbox(url, [0, -45, 45, 0]);
  record(
    "WMS uses form fields over stale endpoint parameters, preserves dimensions, and handles 1.1.1 / 1.3.0 / CRS:84 axis order",
  );
  await field("Limit service coverage").check();
  for (const [name, value] of [
    ["west", "10"],
    ["south", "20"],
    ["east", "30"],
    ["north", "40"],
  ])
    await field(`Service coverage ${name}`).fill(value);
  url = await runTileTest();
  bbox(url, [0, 0, 45, 45]);
  record("Coverage selects the covered tile without redefining the global grid origin");
  await field("Service parameters").fill("layers=override");
  assert(await test.isDisabled());
  assert(await apply.isDisabled());
  assert(
    (await page.getByLabel("Connection validation").innerText()).includes("controlled by the form"),
  );
  await field("Service parameters").fill("TIME=2025-01-01\nELEVATION=0");
  await screenshot("02-edited-wms.png");
  record("Invalid managed parameter overrides block both testing and applying with an explanation");

  await field("Feature source").selectOption("seton-2012-static-polygons-gpmlz");
  await field("Rotation source").selectOption("seton-2012-rot");
  await apply.click();
  await page.waitForFunction(
    () => document.querySelector(".status")?.textContent.includes("Source applied."),
    null,
    { timeout: 120000 },
  );
  assert((await active.innerText()).includes("My WMS"));
  const appliedUrl = await field("Service URL").inputValue();
  await field("Service URL").fill("https://example.invalid/service-fixture/unapplied-wms");
  assert(await page.getByTestId("service-pending").isVisible());
  await runTileTest();
  assert((await active.innerText()).includes(appliedUrl));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export info", exact: true }).click();
  const download = await downloading;
  const exportedPath = fileURLToPath(new URL("applied-service.json", output));
  await download.saveAs(exportedPath);
  const exported = JSON.parse(await readFile(exportedPath, "utf8"));
  assert.equal(exported.sources.serviceConfig.url, appliedUrl);
  assert.equal(exported.sources.serviceConfig.wms.crs, "CRS:84");
  assert.equal(exported.sources.serviceConfig.tileWidth, 512);
  assert.equal(exported.sources.serviceConfig.parameters, "TIME=2025-01-01\nELEVATION=0");
  assert.deepEqual(exported.sources.serviceConfig.bounds, [10, 20, 30, 40]);
  const importFile = page.locator('input[type="file"][accept=".json,application/json"]');
  const invalid = structuredClone(exported);
  invalid.sources.serviceConfig.tileWidth = "512";
  await importFile.setInputFiles({
    name: "invalid-service.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page.waitForFunction(() =>
    document.querySelector(".status")?.textContent.includes("Invalid service field: tileWidth"),
  );
  assert((await active.innerText()).includes("My WMS"));
  await importFile.setInputFiles(exportedPath);
  await page.waitForFunction(() =>
    document.querySelector(".status")?.textContent.includes("Experiment config imported"),
  );
  assert.equal(await field("Service URL").inputValue(), appliedUrl);
  assert.equal(await field("WMS CRS").inputValue(), "CRS:84");
  assert.equal(await field("Service parameters").inputValue(), "TIME=2025-01-01\nELEVATION=0");
  assert((await active.innerText()).includes("No source applied"));
  record(
    "Export saves the applied edited WMS, preview leaves it intact, import restores all fields, and invalid import preserves the active source",
  );

  await examples.selectOption("eox-terrain-4326");
  await field("WMTS layer").fill("custom-terrain");
  await field("WMTS style").fill("relief");
  await field("WMTS matrix set").fill("CustomWGS84");
  await field("Service maximum level").fill("2");
  await field("Service URL").fill(
    "https://example.invalid/service-fixture/{Layer}/{style}/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png",
  );
  await advanced();
  await field("WMTS matrix labels").fill("EPSG:4326:0\nEPSG:4326:1\nEPSG:4326:2");
  await field("WMTS dimensions").fill("Time=2025-01-01");
  url = await runTileTest();
  assert.equal(
    decodeURIComponent(url.pathname),
    "/service-fixture/custom-terrain/relief/2025-01-01/CustomWGS84/EPSG:4326:2/2/4.png",
  );
  await field("Service URL").fill("https://example.invalid/service-fixture/wmts");
  url = await runTileTest();
  assert.equal(query(url).layer, "custom-terrain");
  assert.equal(query(url).style, "relief");
  assert.equal(query(url).tilematrixset, "CustomWGS84");
  assert.equal(query(url).tilematrix, "EPSG:4326:2");
  assert.equal(query(url).time, "2025-01-01");
  await screenshot("03-edited-wmts.png");
  record("WMTS REST and KVP respect editable layer/style, matrix labels and dimensions");
  await field("WMTS matrix labels").fill("0\n1");
  assert(await test.isDisabled());
  await field("WMTS matrix labels").fill("0\n1\n2");
  failTiles = true;
  await runTileTest(false);
  failTiles = false;
  record(
    "Incomplete matrix labels are explained before requests; failed tile access gives visible feedback",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("04-narrow-form.png");
  assert(
    await page.locator(".control-panel").evaluate((node) => node.scrollWidth <= node.clientWidth),
  );
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(evidence.errors, []);
  record(
    "Expanded connection form fits a narrow screen without overflow or uncaught browser errors",
  );
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

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { createCdpMetrics } from "./cdpMetrics.mjs";
import { startStaticBenchmarkServer } from "./staticBenchmarkServer.mjs";
import { startWindowsSampler } from "./windowsSampler.mjs";
import { summarizeWindowsMetrics } from "./summarizeWindowsMetrics.mjs";
import { writeBenchmarkArtifacts } from "./writeArtifacts.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "../..");
const repositoryRoot = resolve(appDirectory, "../..");
const arguments_ = parseArguments(process.argv.slice(2));
const runLog = [];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  runLog.push(line);
  process.stdout.write(`${line}\n`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve(
  repositoryRoot,
  "output/benchmark/r2",
  `${timestamp}-${sanitize(arguments_.deviceLabel)}`,
);
await mkdir(outputDirectory, { recursive: true });

let staticServer;
try {
  log(`R2 benchmark output: ${outputDirectory}`);
  if (!arguments_.skipBuild) {
    await buildProductionAssets();
  }
  const { validateCoreAssumptions } = await import("./validateCore.mjs");
  const coreChecks = validateCoreAssumptions();
  log(`R2 core validation passed (${coreChecks.length} checks).`);
  staticServer = await startStaticBenchmarkServer(
    join(appDirectory, "dist"),
    log,
  );
  log(`Production benchmark server: ${staticServer.baseUrl}`);

  const profileResults = {};
  for (const profile of arguments_.profiles) {
    log(`Starting ${profile} profile in a fresh Edge process.`);
    profileResults[profile] = await runBrowserProfile(profile, staticServer.baseUrl);
  }

  const network = arguments_.skipNetwork
    ? { status: "skipped", reason: "--skip-network", blocks: [], assertions: [] }
    : await runNetworkProfile(staticServer.baseUrl, staticServer.relayRequests);
  const git = await collectGitInfo();
  const host = {
    collectedAt: new Date().toISOString(),
    deviceLabel: arguments_.deviceLabel,
    hostname: hostname(),
    os: { platform: platform(), release: release() },
    logicalProcessorCount: cpus().length,
    cpuModels: Array.from(new Set(cpus().map((cpu) => cpu.model))),
    totalPhysicalMemoryBytes: totalmem(),
    edge: profileResults.paper?.hostInfo ?? profileResults.diagnostic?.hostInfo ?? null,
  };

  await writeBenchmarkArtifacts({
    outputDirectory,
    paper: profileResults.paper ?? { status: "skipped", suite: null },
    diagnostic:
      profileResults.diagnostic ?? { status: "skipped", suite: null },
    network,
    host,
    manifest: {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      deviceLabel: arguments_.deviceLabel,
      commandLine: process.argv,
      options: arguments_,
      git,
      coreValidation: coreChecks,
      server: { relayRequestCount: staticServer.relayRequests.length },
    },
    runLog,
  });
  const failureCount = countAssertionFailures(
    profileResults.paper,
    profileResults.diagnostic,
    network,
  );
  if (failureCount > 0) {
    throw new Error(
      `R2 benchmark wrote artifacts but ${failureCount} assertion(s) failed.`,
    );
  }
  log("R2 benchmark completed and artifacts were written.");
} finally {
  await staticServer?.close();
}

async function buildProductionAssets() {
  const builds = [
    ["--filter", "tile-processer-webgl", "build"],
    ["--filter", "simple-geo-reconstruct", "build"],
    ["--filter", "simple-geo-reconstruct-demo", "build"],
  ];
  for (const buildArguments of builds) {
    log(`pnpm ${buildArguments.join(" ")}`);
    await runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", buildArguments);
  }
}

async function runBrowserProfile(profile, baseUrl) {
  const launched = await launchEdge();
  let sampler = null;
  let samplerResult = { status: "not-started", samples: [] };
  let preflight = null;
  try {
    if (profile === "diagnostic") {
      const preflightContext = await launched.browser.newContext(viewportOptions());
      const preflightPage = await preparePage(preflightContext, baseUrl);
      const samplerOff = await runSuite(preflightPage, {
        profile: "paper",
        conditions: ["level-2"],
        warmupRuns: 0,
        measuredBlocks: 1,
        randomSeed: arguments_.randomSeed,
      });
      sampler = await startWindowsSampler({
        rootPid: launched.browserServer.process().pid,
        outputDirectory,
        scriptPath: join(scriptDirectory, "windows-sampler.ps1"),
        log,
      });
      const samplerOn = await runSuite(preflightPage, {
        profile: "paper",
        conditions: ["level-2"],
        warmupRuns: 0,
        measuredBlocks: 1,
        randomSeed: arguments_.randomSeed,
      });
      preflight = compareSamplerPreflight(samplerOff, samplerOn);
      await preflightContext.close();
      log(
        `Sampler preflight present-time shift: ${preflight.presentTimeShiftPercent.toFixed(2)}%.`,
      );
    }

    const context = await launched.browser.newContext(viewportOptions());
    const page = await context.newPage();
    attachPageLogging(page);
    const cdp = await createCdpMetrics(launched.browser, page);
    if (profile === "diagnostic") {
      await page.exposeBinding(
        "__rtlBenchmarkCheckpoint",
        async (source, request) => {
          let visualSmoke = null;
          if (
            request.checkpoint === "atPresent" &&
            request.recordId.includes("split-l2-extent:block-0:replicate-0")
          ) {
            const condition = request.recordId.includes("level-0-")
              ? "level-0"
              : "level-1";
            const screenshotPath = join(
              outputDirectory,
              `visual-smoke-${condition}-split.png`,
            );
            const canvas = source.page.locator(".cesium-widget canvas").first();
            const box = await canvas.boundingBox();
            const image = await canvas.screenshot({ path: screenshotPath });
            visualSmoke = {
              status: image.length > 10_000 && box?.width > 0 && box?.height > 0
                ? "measured"
                : "invalid",
              screenshotPath,
              pngBytes: image.length,
              canvasBox: box,
            };
          }
          return {
            ...(await cdp.checkpoint(request, await sampler?.latest())),
            visualSmoke,
          };
        },
      );
    }
    await navigateToBenchmark(page, baseUrl);
    const suite = await runSuite(page, {
      profile,
      conditions: arguments_.conditions,
      warmupRuns: arguments_.warmupRuns,
      measuredBlocks: arguments_.measuredBlocks,
      randomSeed: arguments_.randomSeed,
    });
    const hostInfo = await cdp.getHostInfo();
    await cdp.close();
    await context.close();
    if (sampler) {
      samplerResult = await sampler.stop();
      sampler = null;
    }
    const windowsSummary =
      profile === "diagnostic" && samplerResult.status === "measured"
        ? summarizeWindowsMetrics(
            samplerResult.samples,
            samplerResult.gpuSamples,
            suite.records,
          )
        : null;
    const controlledExperimentAssertions = [
      ...buildControlledExperimentAssertions(suite),
      ...(profile === "diagnostic" ? buildVisualSmokeAssertions(suite) : []),
    ];
    return {
      status: "completed",
      suite,
      hostInfo,
      samplerPreflight: preflight,
      windowsSampler: samplerResult,
      windowsSummary,
      assertions: controlledExperimentAssertions,
    };
  } finally {
    if (sampler) {
      samplerResult = await sampler.stop();
    }
    await Promise.allSettled([
      launched.browser.close(),
      launched.browserServer.close(),
    ]);
  }
}

async function runNetworkProfile(baseUrl, relayRequests) {
  log("Starting paired Macrostrat cold/warm profile in a fresh Edge process.");
  const launched = await launchEdge();
  try {
    const context = await launched.browser.newContext(viewportOptions());
    const page = await context.newPage();
    attachPageLogging(page);
    const cdp = await createCdpMetrics(launched.browser, page);
    await navigateToBenchmark(page, baseUrl);
    const blocks = [];
    const assertions = [];
    const orders = shuffledBalancedOrders(
      arguments_.networkBlocks,
      arguments_.randomSeed,
    );
    const providerOverride = {
      key: "custom-url-template",
      customConfig: {
        url: `${baseUrl}/benchmark-macrostrat/carto/{z}/{x}/{y}.png`,
        tilingSchemeKey: "web-mercator",
        minimumLevel: 0,
        maximumLevel: 12,
      },
    };

    const measuredRun = async (label, blockIndex) => {
      cdp.takeNetworkEvents();
      const relayStart = relayRequests.length;
      const suite = await runSuite(page, {
        profile: "paper",
        conditions: ["network-macrostrat-w1-level-4"],
        warmupRuns: 0,
        measuredBlocks: 1,
        randomSeed: arguments_.randomSeed + blockIndex,
        providerOverride,
      });
      const events = cdp.takeNetworkEvents();
      const record = suite.records[0];
      const cachedCount = events.filter(isBrowserCacheEvent).length;
      const valid =
        events.length > 0 &&
        (label === "cold" ? cachedCount === 0 : cachedCount === events.length);
      assertions.push({
        name: `network-${label}-cache-block-${blockIndex}`,
        passed: valid,
        observed: `${cachedCount}/${events.length} browser-cache responses`,
        expected:
          label === "cold" ? "0 browser-cache responses" : "all responses cached",
      });
      return {
        label,
        record,
        events,
        relayRequestCount: relayRequests.length - relayStart,
        valid,
      };
    };

    for (let blockIndex = 0; blockIndex < orders.length; blockIndex++) {
      const order = orders[blockIndex];
      await cdp.clearBrowserCache();
      let cold;
      let warm;
      if (order === "cold-first") {
        cold = await measuredRun("cold", blockIndex);
        warm = await measuredRun("warm", blockIndex);
      } else {
        await runSuite(page, {
          profile: "paper",
          conditions: ["network-macrostrat-w1-level-4"],
          warmupRuns: 0,
          measuredBlocks: 1,
          randomSeed: arguments_.randomSeed + blockIndex,
          providerOverride,
        });
        cdp.takeNetworkEvents();
        warm = await measuredRun("warm", blockIndex);
        await cdp.clearBrowserCache();
        cold = await measuredRun("cold", blockIndex);
      }
      blocks.push({ blockIndex, order, cold, warm });
      log(`Network block ${blockIndex + 1}/${orders.length}: ${order}`);
    }

    const hostInfo = await cdp.getHostInfo();
    await cdp.close();
    await context.close();
    return {
      status: "completed",
      provider: "Macrostrat carto via benchmark relay",
      blocks,
      assertions,
      relayRequests: [...relayRequests],
      hostInfo,
    };
  } finally {
    await Promise.allSettled([
      launched.browser.close(),
      launched.browserServer.close(),
    ]);
  }
}

async function launchEdge() {
  const browserServer = await chromium.launchServer({
    channel: "msedge",
    headless: arguments_.headless,
    args: [
      "--enable-precise-memory-info",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  const browser = await chromium.connect(browserServer.wsEndpoint());
  return { browserServer, browser };
}

async function preparePage(context, baseUrl) {
  const page = await context.newPage();
  attachPageLogging(page);
  await navigateToBenchmark(page, baseUrl);
  return page;
}

async function navigateToBenchmark(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__rtlPerformanceBenchmark), null, {
    timeout: 120_000,
  });
}

function attachPageLogging(page) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      log(`page ${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => log(`page error: ${error.stack ?? error}`));
}

function runSuite(page, options) {
  return page.evaluate(async (runOptions) => {
    const controller = window.__rtlPerformanceBenchmark;
    if (!controller) throw new Error("RTL performance controller is unavailable.");
    return controller.run(runOptions);
  }, options);
}

function viewportOptions() {
  return {
    viewport: { width: arguments_.viewportWidth, height: arguments_.viewportHeight },
    deviceScaleFactor: arguments_.deviceScaleFactor,
  };
}

function compareSamplerPreflight(offSuite, onSuite) {
  const off = offSuite.records.find((record) => record.kind === "load")?.presentMs;
  const on = onSuite.records.find((record) => record.kind === "load")?.presentMs;
  const shift =
    Number.isFinite(off) && Number.isFinite(on) && off > 0
      ? ((on - off) / off) * 100
      : Number.NaN;
  return {
    samplerOffPresentMs: off ?? null,
    samplerOnPresentMs: on ?? null,
    presentTimeShiftPercent: shift,
    exceedsFivePercent: Number.isFinite(shift) ? Math.abs(shift) > 5 : null,
  };
}

function shuffledBalancedOrders(count, seed) {
  const coldFirstCount = Math.ceil(count / 2);
  const values = Array.from({ length: count }, (_, index) =>
    index < coldFirstCount ? "cold-first" : "warm-first",
  );
  const random = seededRandom(seed);
  for (let index = values.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function isBrowserCacheEvent(event) {
  return event.fromDiskCache || event.fromPrefetchCache || event.fromServiceWorker;
}

async function collectGitInfo() {
  const [commit, status] = await Promise.all([
    runCommand("git", ["rev-parse", "HEAD"], true),
    runCommand("git", ["status", "--short"], true),
  ]);
  return { commit: commit.trim(), dirty: status.trim().length > 0, status };
}

async function runCommand(command, commandArguments, capture = false) {
  const isWindowsCommandShim =
    process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const executable = isWindowsCommandShim
    ? process.env.ComSpec ?? "cmd.exe"
    : command;
  const executableArguments = isWindowsCommandShim
    ? ["/d", "/s", "/c", command, ...commandArguments]
    : commandArguments;
  const result = await execFileAsync(executable, executableArguments, {
    cwd: repositoryRoot,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!capture && result.stdout.trim()) log(result.stdout.trim());
  if (result.stderr.trim()) log(result.stderr.trim());
  return result.stdout;
}

function parseArguments(values) {
  const options = {
    deviceLabel: hostname(),
    profiles: ["paper", "diagnostic"],
    conditions: undefined,
    warmupRuns: undefined,
    measuredBlocks: undefined,
    networkBlocks: 10,
    randomSeed: 20260710,
    viewportWidth: 1280,
    viewportHeight: 720,
    deviceScaleFactor: 1,
    skipBuild: false,
    skipNetwork: false,
    headless: false,
  };
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    const value = values[index + 1];
    if (key === "--") continue;
    else if (key === "--skip-build") options.skipBuild = true;
    else if (key === "--skip-network") options.skipNetwork = true;
    else if (key === "--headless") options.headless = true;
    else if (key === "--device-label") options.deviceLabel = requireValue(key, value, index++);
    else if (key === "--profiles") options.profiles = requireValue(key, value, index++).split(",");
    else if (key === "--conditions") options.conditions = requireValue(key, value, index++).split(",");
    else if (key === "--warmup-runs") options.warmupRuns = numberValue(key, value, index++);
    else if (key === "--measured-blocks") options.measuredBlocks = numberValue(key, value, index++);
    else if (key === "--network-blocks") options.networkBlocks = numberValue(key, value, index++);
    else if (key === "--random-seed") options.randomSeed = numberValue(key, value, index++);
    else if (key === "--viewport-width") options.viewportWidth = numberValue(key, value, index++);
    else if (key === "--viewport-height") options.viewportHeight = numberValue(key, value, index++);
    else if (key === "--device-scale-factor") options.deviceScaleFactor = numberValue(key, value, index++);
    else throw new Error(`Unknown benchmark argument: ${key}`);
  }
  const invalidProfile = options.profiles.find(
    (profile) => profile !== "paper" && profile !== "diagnostic",
  );
  if (invalidProfile) throw new Error(`Unsupported profile: ${invalidProfile}`);
  return options;
}

function requireValue(key, value, consumedIndex) {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${key} requires a value at argument ${consumedIndex + 1}.`);
  }
  return value;
}

function numberValue(key, value, consumedIndex) {
  const parsed = Number(requireValue(key, value, consumedIndex));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} requires a non-negative numeric value.`);
  }
  return parsed;
}

function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "device";
}

function countAssertionFailures(...results) {
  let failures = 0;
  for (const result of results) {
    for (const record of result?.suite?.records ?? result?.records ?? []) {
      failures += (record.assertions ?? []).filter((item) => !item.passed).length;
      for (const transition of record.transitions ?? []) {
        failures += transition.assertions.filter((item) => !item.passed).length;
      }
    }
    failures += (result?.assertions ?? []).filter((item) => !item.passed).length;
    for (const block of result?.blocks ?? []) {
      for (const condition of [block.cold, block.warm]) {
        failures += (condition?.record?.assertions ?? []).filter(
          (item) => !item.passed,
        ).length;
      }
    }
  }
  return failures;
}

function buildControlledExperimentAssertions(suite) {
  const assertions = [];
  for (const level of [0, 1]) {
    const originalId = `level-${level}`;
    const splitId = `level-${level}-split-l2-extent`;
    const originalRecords = suite.records.filter(
      (record) =>
        !record.warmup && record.kind === "load" && record.conditionId === originalId,
    );
    for (const original of originalRecords) {
      const split = suite.records.find(
        (record) =>
          !record.warmup &&
          record.kind === "load" &&
          record.conditionId === splitId &&
          record.blockIndex === original.blockIndex,
      );
      if (!split || split.kind !== "load") continue;
      const comparisons = {
        compositeTaskCount: [
          original.atIdle.manager.compositeTaskCount,
          split.atIdle.manager.compositeTaskCount,
        ],
        sourceFeatureContributionCount: [
          original.atIdle.manager.sourceFeatureContributionCount,
          split.atIdle.manager.sourceFeatureContributionCount,
        ],
        clipAreaCount: [
          original.atIdle.manager.clipAreaCount,
          split.atIdle.manager.clipAreaCount,
        ],
        clipPolygonCount: [
          original.atIdle.manager.clipPolygonCount,
          split.atIdle.manager.clipPolygonCount,
        ],
        imageRequestAttempts: [
          original.atIdle.processor.imageRequestAttempts,
          split.atIdle.processor.imageRequestAttempts,
        ],
        imageRequestSuccesses: [
          original.atIdle.processor.imageRequestSuccesses,
          split.atIdle.processor.imageRequestSuccesses,
        ],
        renderedJobCount: [
          original.atIdle.processor.renderedJobCount,
          split.atIdle.processor.renderedJobCount,
        ],
        exportedAssetCount: [
          original.atIdle.processor.exportedAssetCount,
          split.atIdle.processor.exportedAssetCount,
        ],
        maskTriangleCount: [
          original.atIdle.processor.maskTriangleCount,
          split.atIdle.processor.maskTriangleCount,
        ],
        retainedImageAssetCount: [
          original.atIdle.manager.retainedImageAssetCount,
          split.atIdle.manager.retainedImageAssetCount,
        ],
        loadedCompositeTileCount: [
          original.atIdle.manager.loadedCompositeTileCount,
          split.atIdle.manager.loadedCompositeTileCount,
        ],
        estimatedTextureRgbaBytes: [
          original.atIdle.manager.estimatedTextureRgbaBytes,
          split.atIdle.manager.estimatedTextureRgbaBytes,
        ],
      };
      for (const [metric, [observed, expected]] of Object.entries(comparisons)) {
        assertions.push({
          name: `${splitId}-block-${original.blockIndex}-${metric}`,
          passed: observed === expected,
          observed,
          expected,
        });
      }
    }
  }
  return assertions;
}

function buildVisualSmokeAssertions(suite) {
  return suite.records
    .filter(
      (record) =>
        record.kind === "load" &&
        !record.warmup &&
        record.blockIndex === 0 &&
        record.replicateIndex === 0 &&
        record.conditionId.endsWith("split-l2-extent"),
    )
    .map((record) => {
      const visualSmoke = record.resourceCheckpoints.find(
        (checkpoint) => checkpoint.checkpoint === "atPresent",
      )?.external?.visualSmoke;
      return {
        name: `${record.conditionId}-visual-smoke`,
        passed: visualSmoke?.status === "measured",
        observed: visualSmoke?.status ?? "missing",
        expected: "measured",
      };
    });
}

export async function createCdpMetrics(browser, page) {
  const browserSession = await browser.newBrowserCDPSession();
  const pageSession = await page.context().newCDPSession(page);
  await pageSession.send("Performance.enable");
  await pageSession.send("Network.enable");
  const baselines = new Map();
  const networkEvents = [];
  const cachedRequestIds = new Set();

  pageSession.on("Network.requestServedFromCache", ({ requestId }) => {
    cachedRequestIds.add(requestId);
  });
  pageSession.on("Network.responseReceived", ({ requestId, response }) => {
    if (!response.url.includes("/benchmark-macrostrat/")) {
      return;
    }
    networkEvents.push({
      requestId,
      url: response.url,
      status: response.status,
      fromDiskCache:
        Boolean(response.fromDiskCache) || cachedRequestIds.has(requestId),
      fromPrefetchCache: Boolean(response.fromPrefetchCache),
      fromServiceWorker: Boolean(response.fromServiceWorker),
      encodedDataLength: response.encodedDataLength,
    });
  });

  return {
    browserSession,
    pageSession,
    checkpoint: async (request, osSnapshot) => {
      const current = await readCumulativeMetrics(browserSession, pageSession);
      if (request.checkpoint === "beforeCondition") {
        baselines.set(request.recordId, current);
      }
      const baseline = baselines.get(request.recordId) ?? current;
      return {
        capturedAt: new Date().toISOString(),
        cdpTaskDurationSeconds: deltaMetric(
          current.taskDurationSeconds,
          baseline.taskDurationSeconds,
          "seconds",
        ),
        cdpScriptDurationSeconds: deltaMetric(
          current.scriptDurationSeconds,
          baseline.scriptDurationSeconds,
          "seconds",
        ),
        processCpuSeconds: measured(
          subtractRecords(current.processCpuSeconds, baseline.processCpuSeconds),
          "seconds",
        ),
        processPrivateBytes: osMetric(osSnapshot, "processPrivateBytes", "bytes"),
        processWorkingSetBytes: osMetric(
          osSnapshot,
          "processWorkingSetBytes",
          "bytes",
        ),
        gpuDedicatedBytes: osMetric(osSnapshot, "gpuDedicatedBytes", "bytes"),
        gpuSharedBytes: osMetric(osSnapshot, "gpuSharedBytes", "bytes"),
      };
    },
    clearBrowserCache: () => pageSession.send("Network.clearBrowserCache"),
    takeNetworkEvents: () => {
      const result = networkEvents.splice(0, networkEvents.length);
      cachedRequestIds.clear();
      return result;
    },
    getHostInfo: async () => {
      const [version, systemInfo] = await Promise.all([
        browserSession.send("Browser.getVersion"),
        browserSession.send("SystemInfo.getInfo"),
      ]);
      return { version, systemInfo };
    },
    close: async () => {
      await Promise.allSettled([
        pageSession.detach(),
        browserSession.detach(),
      ]);
    },
  };
}

async function readCumulativeMetrics(browserSession, pageSession) {
  const [performanceMetrics, processInfo] = await Promise.all([
    pageSession.send("Performance.getMetrics"),
    browserSession.send("SystemInfo.getProcessInfo"),
  ]);
  const metrics = new Map(
    performanceMetrics.metrics.map(({ name, value }) => [name, value]),
  );
  const processCpuSeconds = {};
  for (const process of processInfo.processInfo) {
    const key = `${process.type}:${process.id}`;
    processCpuSeconds[key] = process.cpuTime;
  }
  return {
    taskDurationSeconds: metrics.get("TaskDuration"),
    scriptDurationSeconds: metrics.get("ScriptDuration"),
    processCpuSeconds,
  };
}

function deltaMetric(current, baseline, unit) {
  if (typeof current !== "number" || typeof baseline !== "number") {
    return { status: "unsupported", reason: "CDP metric is unavailable." };
  }
  return measured(Math.max(0, current - baseline), unit);
}

function subtractRecords(current, baseline) {
  const result = {};
  for (const [key, value] of Object.entries(current)) {
    result[key] = Math.max(0, value - (baseline[key] ?? value));
  }
  return result;
}

function osMetric(snapshot, key, unit) {
  if (!snapshot) {
    return { status: "unsupported", reason: "No Windows sampler snapshot." };
  }
  return measured(snapshot[key] ?? {}, unit);
}

function measured(value, unit) {
  return { status: "measured", value, unit };
}

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export async function writeBenchmarkArtifacts({
  outputDirectory,
  paper,
  diagnostic,
  network,
  host,
  manifest,
  runLog,
}) {
  const files = {
    "paper.json": paper,
    "diagnostic.json": diagnostic,
    "network.json": network,
    "host.json": host,
    "assertions.json": collectAssertions(paper, diagnostic, network),
  };
  for (const [name, value] of Object.entries(files)) {
    await writeJson(join(outputDirectory, name), value);
  }

  await writeFile(
    join(outputDirectory, "summary.csv"),
    toCsv([...buildSummaryRows(paper, diagnostic), ...buildNetworkSummaryRows(network)]),
    "utf8",
  );
  await writeFile(
    join(outputDirectory, "table5-input.csv"),
    toCsv(buildTable5Rows(paper)),
    "utf8",
  );
  await writeFile(
    join(outputDirectory, "figure8-input.csv"),
    toCsv(buildFigure8Rows(paper)),
    "utf8",
  );
  await writeFile(join(outputDirectory, "run.log"), runLog.join("\n"), "utf8");

  const hashes = {};
  for (const name of await readdir(outputDirectory)) {
    if (name === "manifest.json" || name.endsWith(".stop")) {
      continue;
    }
    const content = await readFile(join(outputDirectory, name));
    hashes[name] = createHash("sha256").update(content).digest("hex");
  }
  await writeJson(join(outputDirectory, "manifest.json"), {
    ...manifest,
    files: hashes,
  });
}

function buildSummaryRows(...suiteWrappers) {
  const groups = new Map();
  for (const wrapper of suiteWrappers) {
    const suite = wrapper?.suite;
    if (!suite) continue;
    for (const record of suite.records.filter((item) => !item.warmup)) {
      const values = recordValues(record);
      for (const [metric, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) continue;
        const key = `${suite.profile}|${record.conditionId}|${metric}`;
        const group = groups.get(key) ?? {
          profile: suite.profile,
          conditionId: record.conditionId,
          metric,
          values: [],
        };
        group.values.push(value);
        groups.set(key, group);
      }
    }
  }
  return Array.from(groups.values()).map((group) => ({
    profile: group.profile,
    conditionId: group.conditionId,
    metric: group.metric,
    unit: metricUnit(group.metric),
    n: group.values.length,
    median: median(group.values),
    q1: quantile(group.values, 0.25),
    q3: quantile(group.values, 0.75),
  }));
}

function buildTable5Rows(paper) {
  return (paper?.suite?.records ?? [])
    .filter((record) => !record.warmup)
    .map((record) => {
      const endpoint = endpointSnapshot(record);
      const usedHeap = endpoint?.jsHeap?.usedJSHeapSize;
      return {
        conditionId: record.conditionId,
        blockIndex: record.blockIndex,
        replicateIndex: record.replicateIndex,
        jsHeapEndpointMiB:
          usedHeap?.status === "measured"
            ? usedHeap.value / 1024 ** 2
            : usedHeap?.status ?? "unavailable",
        estimatedTextureMiB:
          (endpoint?.manager?.estimatedTextureRgbaBytes ?? 0) / 1024 ** 2,
        retainedImageAssetCount:
          endpoint?.manager?.retainedImageAssetCount ?? 0,
        primitiveCount: endpoint?.manager?.primitiveCount ?? 0,
        compositeCount: endpoint?.manager?.loadedCompositeTileCount ?? 0,
        retentionPolicy:
          "Retain processed images and Primitives until manager clear/destroy; no manager eviction.",
      };
    });
}

function buildNetworkSummaryRows(network) {
  const groups = new Map();
  for (const block of network?.blocks ?? []) {
    for (const condition of [block.cold, block.warm]) {
      if (!condition?.record || !condition.valid) continue;
      for (const metric of ["returnMs", "firstFrameMs", "presentMs", "idleMs"]) {
        const key = `${condition.label}|${metric}`;
        const group = groups.get(key) ?? {
          profile: "network",
          conditionId: `macrostrat-${condition.label}`,
          metric,
          values: [],
        };
        group.values.push(condition.record[metric]);
        groups.set(key, group);
      }
    }
  }
  return Array.from(groups.values()).map((group) => ({
    profile: group.profile,
    conditionId: group.conditionId,
    metric: group.metric,
    unit: "ms",
    n: group.values.length,
    median: median(group.values),
    q1: quantile(group.values, 0.25),
    q3: quantile(group.values, 0.75),
  }));
}

function buildFigure8Rows(paper) {
  return (paper?.suite?.records ?? [])
    .filter((record) => record.kind === "load" && !record.warmup)
    .flatMap((record) => {
      const base = {
        conditionId: record.conditionId,
        blockIndex: record.blockIndex,
        replicateIndex: record.replicateIndex,
        level: record.level,
        renderRectangleMode: record.renderRectangleMode,
        renderRectanglePartCount: record.renderRectanglePartCount,
        returnMs: record.returnMs,
        firstFrameMs: record.firstFrameMs,
        presentMs: record.presentMs,
        idleMs: record.idleMs,
      };
      return record.stageTimings.map((stage) => ({
        ...base,
        stage: stage.stage,
        stageStartEpochMs: record.performanceTimeOriginMs + stage.startTimeMs,
        stageEndEpochMs: record.performanceTimeOriginMs + stage.endTimeMs,
        stageWindowMs: stage.windowMs,
        stageOperationSumMs: stage.operationSumMs,
        stageOperationCount: stage.operationCount,
      }));
    });
}

function collectAssertions(...wrappers) {
  const rows = [];
  const networkResult = wrappers.find(
    (wrapper) => wrapper && !wrapper.suite && Array.isArray(wrapper.assertions),
  );
  for (const wrapper of wrappers) {
    const suite = wrapper?.suite;
    if (!suite) continue;
    for (const assertion of wrapper.assertions ?? []) {
      rows.push({ profile: suite.profile, ...assertion });
    }
    for (const record of suite.records) {
      for (const assertion of record.assertions ?? []) {
        rows.push({
          profile: suite.profile,
          recordId: record.recordId,
          conditionId: record.conditionId,
          ...assertion,
        });
      }
      if (record.kind === "age") {
        for (const transition of record.transitions) {
          for (const assertion of transition.assertions) {
            rows.push({
              profile: suite.profile,
              recordId: record.recordId,
              conditionId: record.conditionId,
              transition: `${transition.fromAgeMa}->${transition.toAgeMa}`,
              ...assertion,
            });
          }
        }
      }
    }
  }
  for (const assertion of networkResult?.assertions ?? []) {
    rows.push({ profile: "network", ...assertion });
  }
  for (const block of networkResult?.blocks ?? []) {
    for (const condition of [block.cold, block.warm]) {
      for (const assertion of condition?.record?.assertions ?? []) {
        rows.push({
          profile: "network",
          blockIndex: block.blockIndex,
          cacheState: condition.label,
          recordId: condition.record.recordId,
          conditionId: condition.record.conditionId,
          ...assertion,
        });
      }
    }
  }
  return {
    passed: rows.every((row) => row.passed),
    failureCount: rows.filter((row) => !row.passed).length,
    rows,
  };
}

function recordValues(record) {
  if (record.kind === "initialization") {
    return { totalReadyMs: record.totalReadyMs, managerInitMs: record.managerInitMs };
  }
  if (record.kind === "load") {
    const values = {
      returnMs: record.returnMs,
      firstFrameMs: record.firstFrameMs,
      presentMs: record.presentMs,
      idleMs: record.idleMs,
    };
    for (const stage of record.stageTimings) {
      values[`${stage.stage}.windowMs`] = stage.windowMs;
      values[`${stage.stage}.operationSumMs`] = stage.operationSumMs;
    }
    return values;
  }
  return {
    preparationIdleMs: record.preparationIdleMs,
    agePresentMs: median(record.transitions.map((item) => item.presentMs)),
  };
}

function endpointSnapshot(record) {
  if (record.kind === "initialization") return record.finalSnapshot;
  if (record.kind === "load") return record.atIdle;
  return record.transitions.at(-1)?.atPresent ?? null;
}

function median(values) {
  return quantile(values, 0.5);
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function metricUnit(metric) {
  return metric.toLowerCase().endsWith("ms") ? "ms" : "value";
}

function toCsv(rows) {
  if (rows.length === 0) return "\uFEFF\n";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()),
  );
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function artifactName(path) {
  return basename(path);
}

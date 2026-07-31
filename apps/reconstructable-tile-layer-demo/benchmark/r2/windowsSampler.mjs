import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function startWindowsSampler({
  rootPid,
  outputDirectory,
  scriptPath,
  log,
}) {
  if (process.platform !== "win32") {
    return unsupportedSampler("Windows performance counters require Windows.");
  }

  const samplesPath = join(outputDirectory, "windows-samples.jsonl");
  const gpuSamplesPath = join(outputDirectory, "windows-gpu-samples.jsonl");
  const stopPath = join(outputDirectory, "windows-sampler.stop");
  await Promise.all([
    rm(samplesPath, { force: true }),
    rm(gpuSamplesPath, { force: true }),
    rm(stopPath, { force: true }),
  ]);
  const processChild = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-RootPid",
      String(rootPid),
      "-OutputPath",
      samplesPath,
      "-StopPath",
      stopPath,
      "-IntervalMilliseconds",
      "200",
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const gpuChild = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath.replace("windows-sampler.ps1", "windows-gpu-sampler.ps1"),
      "-RootPid",
      String(rootPid),
      "-OutputPath",
      gpuSamplesPath,
      "-StopPath",
      stopPath,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  processChild.stdout.on("data", (data) =>
    log(`process sampler: ${String(data).trim()}`),
  );
  processChild.stderr.on("data", (data) =>
    log(`process sampler error: ${String(data).trim()}`),
  );
  gpuChild.stdout.on("data", (data) => log(`GPU sampler: ${String(data).trim()}`));
  gpuChild.stderr.on("data", (data) =>
    log(`GPU sampler error: ${String(data).trim()}`),
  );

  await waitForFirstSample(samplesPath, processChild);
  return {
    status: "running",
    samplesPath,
    gpuSamplesPath,
    latest: () => readLatestMergedSample(samplesPath, gpuSamplesPath),
    stop: async () => {
      await writeFile(stopPath, "stop\n", "utf8");
      await Promise.all([
        waitForExit(processChild, 10_000),
        waitForExit(gpuChild, 10_000),
      ]);
      const samples = await readSamples(samplesPath);
      const gpuSamples = await readSamples(gpuSamplesPath);
      await rm(stopPath, { force: true });
      return {
        status: "measured",
        samples,
        gpuSamples,
        samplesPath,
        gpuSamplesPath,
      };
    },
  };
}

function unsupportedSampler(reason) {
  return {
    status: "unsupported",
    samplesPath: null,
    latest: async () => null,
    stop: async () => ({ status: "unsupported", reason, samples: [] }),
  };
}

async function waitForFirstSample(samplesPath, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Windows sampler exited with code ${child.exitCode}.`);
    }
    const sample = await readLatestSample(samplesPath);
    if (sample) {
      return;
    }
    await delay(200);
  }
  throw new Error("Windows sampler did not produce a sample within 15 seconds.");
}

async function readLatestSample(samplesPath) {
  const samples = await readSamples(samplesPath);
  return samples.at(-1) ?? null;
}

async function readLatestMergedSample(samplesPath, gpuSamplesPath) {
  const [processSample, gpuSample] = await Promise.all([
    readLatestSample(samplesPath),
    readLatestSample(gpuSamplesPath),
  ]);
  if (!processSample) {
    return null;
  }
  return { ...processSample, ...aggregateGpuSample(gpuSample, processSample.processIds) };
}

function aggregateGpuSample(sample, processIds) {
  if (!sample) {
    return { gpuDedicatedBytes: {}, gpuSharedBytes: {}, gpuCounters: [] };
  }
  const allowedPids = new Set(processIds);
  const gpuDedicatedBytes = {};
  const gpuSharedBytes = {};
  const gpuCounters = [];
  for (const row of sample.engineRows ?? []) {
    const parsed = parseGpuInstance(row.name);
    if (!parsed || !allowedPids.has(parsed.pid)) continue;
    gpuCounters.push({
      ...parsed,
      instance: row.name,
      counter: "Utilization Percentage",
      value: row.utilizationPercentage,
    });
  }
  for (const row of sample.memoryRows ?? []) {
    const parsed = parseGpuInstance(row.name);
    if (!parsed || !allowedPids.has(parsed.pid)) continue;
    const key = String(parsed.pid);
    gpuDedicatedBytes[key] =
      (gpuDedicatedBytes[key] ?? 0) + row.dedicatedBytes;
    gpuSharedBytes[key] = (gpuSharedBytes[key] ?? 0) + row.sharedBytes;
  }
  return {
    gpuSampleEpochMs: sample.epochMs,
    gpuDedicatedBytes,
    gpuSharedBytes,
    gpuCounters,
  };
}

function parseGpuInstance(name) {
  const pid = /pid_(\d+)/.exec(name)?.[1];
  if (!pid) return null;
  return {
    pid: Number(pid),
    engineType: /engtype_([^_]+)/.exec(name)?.[1] ?? null,
    adapter: /luid_([^_]+_[^_]+)/.exec(name)?.[1] ?? null,
  };
}

async function readSamples(samplesPath) {
  try {
    const text = (await readFile(samplesPath, "utf8")).replace(/^\uFEFF/, "");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs).then(() => {
      child.kill();
    }),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

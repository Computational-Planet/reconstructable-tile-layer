export function summarizeWindowsMetrics(processSamples, gpuSamples, records) {
  return {
    sampling: {
      processSampleCount: processSamples.length,
      gpuSampleCount: gpuSamples.length,
      processMedianIntervalMs: medianInterval(processSamples),
      gpuMedianIntervalMs: medianInterval(gpuSamples),
    },
    records: records.map((record) => {
      const before = record.resourceCheckpoints.find(
        (checkpoint) => checkpoint.checkpoint === "beforeCondition",
      );
      const after = record.resourceCheckpoints.find(
        (checkpoint) => checkpoint.checkpoint === "afterDestroySettled",
      );
      const condition = summarizeRange(
        processSamples,
        gpuSamples,
        before?.epochMs,
        after?.epochMs,
      );
      const stages = Object.fromEntries(
        (record.stageTimings ?? []).map((stage) => [
          stage.stage,
          summarizeRange(
            processSamples,
            gpuSamples,
            record.performanceTimeOriginMs + stage.startTimeMs,
            record.performanceTimeOriginMs + stage.endTimeMs,
          ),
        ]),
      );
      return { recordId: record.recordId, conditionId: record.conditionId, condition, stages };
    }),
  };
}

function summarizeRange(processSamples, gpuSamples, startEpochMs, endEpochMs) {
  if (!Number.isFinite(startEpochMs) || !Number.isFinite(endEpochMs)) {
    return { status: "invalid", reason: "range-boundary-unavailable" };
  }
  const selectedProcess = processSamples.filter(
    (sample) => sample.epochMs >= startEpochMs && sample.epochMs <= endEpochMs,
  );
  const selectedGpu = gpuSamples.filter(
    (sample) => sample.epochMs >= startEpochMs && sample.epochMs <= endEpochMs,
  );
  return {
    status: "measured",
    startEpochMs,
    endEpochMs,
    process: summarizeProcessSamples(selectedProcess),
    gpu: summarizeGpuSamples(selectedGpu, processSamples),
  };
}

function summarizeProcessSamples(samples) {
  const utilization = [];
  let cpuSeconds = 0;
  let cpuCapacitySeconds = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const wallSeconds = (current.epochMs - previous.epochMs) / 1000;
    if (wallSeconds <= 0) continue;
    const previousCpu = new Map(
      previous.processes.map((process) => [process.pid, process.cpuSeconds]),
    );
    const deltaCpu = current.processes.reduce((sum, process) => {
      const baseline = previousCpu.get(process.pid);
      return baseline === undefined
        ? sum
        : sum + Math.max(0, process.cpuSeconds - baseline);
    }, 0);
    cpuSeconds += deltaCpu;
    cpuCapacitySeconds +=
      wallSeconds * Math.max(1, current.logicalProcessorCount);
    utilization.push(
      (100 * deltaCpu) /
        (wallSeconds * Math.max(1, current.logicalProcessorCount)),
    );
  }
  const privateBytes = samples.map((sample) =>
    sum(sample.processes.map((process) => process.privateBytes)),
  );
  const workingSetBytes = samples.map((sample) =>
    sum(sample.processes.map((process) => process.workingSetBytes)),
  );
  return {
    sampleCount: samples.length,
    cpuSeconds: metric(cpuSeconds, "seconds", utilization.length > 0),
    meanCpuUtilizationPercent: metric(
      cpuCapacitySeconds > 0 ? (100 * cpuSeconds) / cpuCapacitySeconds : null,
      "percent-of-total-logical-cpu",
      utilization.length > 0,
    ),
    peakCpuUtilizationPercent: metric(
      maximum(utilization),
      "percent-of-total-logical-cpu",
      utilization.length > 0,
    ),
    endpointPrivateBytes: metric(privateBytes.at(-1), "bytes", privateBytes.length > 0),
    peakPrivateBytes: metric(maximum(privateBytes), "bytes", privateBytes.length > 0),
    endpointWorkingSetBytes: metric(
      workingSetBytes.at(-1),
      "bytes",
      workingSetBytes.length > 0,
    ),
    peakWorkingSetBytes: metric(
      maximum(workingSetBytes),
      "bytes",
      workingSetBytes.length > 0,
    ),
  };
}

function summarizeGpuSamples(samples, processSamples) {
  const threeD = [];
  const copy = [];
  const dedicated = [];
  const shared = [];
  for (const sample of samples) {
    const processSample = nearestSample(processSamples, sample.epochMs);
    const processIds = new Set(processSample?.processIds ?? []);
    const threeDByAdapter = new Map();
    const copyByAdapter = new Map();
    for (const row of sample.engineRows ?? []) {
      const parsed = parseGpuInstance(row.name);
      if (!parsed || !processIds.has(parsed.pid)) continue;
      const target = parsed.engineType === "3D" ? threeDByAdapter : parsed.engineType === "Copy" ? copyByAdapter : null;
      if (target) {
        target.set(
          parsed.adapter,
          Math.max(target.get(parsed.adapter) ?? 0, row.utilizationPercentage),
        );
      }
    }
    threeD.push(maximum([...threeDByAdapter.values()]) ?? 0);
    copy.push(maximum([...copyByAdapter.values()]) ?? 0);

    let dedicatedBytes = 0;
    let sharedBytes = 0;
    for (const row of sample.memoryRows ?? []) {
      const parsed = parseGpuInstance(row.name);
      if (!parsed || !processIds.has(parsed.pid)) continue;
      dedicatedBytes += row.dedicatedBytes;
      sharedBytes += row.sharedBytes;
    }
    dedicated.push(dedicatedBytes);
    shared.push(sharedBytes);
  }
  const available = samples.length > 0;
  return {
    sampleCount: samples.length,
    mean3dUtilizationPercent: metric(average(threeD), "percent", available),
    peak3dUtilizationPercent: metric(maximum(threeD), "percent", available),
    meanCopyUtilizationPercent: metric(average(copy), "percent", available),
    peakCopyUtilizationPercent: metric(maximum(copy), "percent", available),
    endpointDedicatedBytes: metric(dedicated.at(-1), "bytes", available),
    peakDedicatedBytes: metric(maximum(dedicated), "bytes", available),
    endpointSharedBytes: metric(shared.at(-1), "bytes", available),
    peakSharedBytes: metric(maximum(shared), "bytes", available),
  };
}

function parseGpuInstance(name) {
  const pid = /pid_(\d+)/.exec(name)?.[1];
  if (!pid) return null;
  return {
    pid: Number(pid),
    engineType: /engtype_([^_]+)/.exec(name)?.[1] ?? null,
    adapter: /luid_([^_]+_[^_]+)/.exec(name)?.[1] ?? "unknown",
  };
}

function nearestSample(samples, epochMs) {
  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const currentDistance = Math.abs(sample.epochMs - epochMs);
    if (currentDistance < distance) {
      distance = currentDistance;
      nearest = sample;
    }
  }
  return nearest;
}

function medianInterval(samples) {
  const intervals = samples.slice(1).map((sample, index) => sample.epochMs - samples[index].epochMs);
  if (intervals.length === 0) return null;
  const sorted = intervals.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function metric(value, unit, valid) {
  return valid && Number.isFinite(value)
    ? { status: "measured", value, unit }
    : { status: "invalid", reason: "insufficient-samples" };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values) {
  return values.length > 0 ? sum(values) / values.length : null;
}

function maximum(values) {
  return values.length > 0 ? Math.max(...values) : null;
}

import {
  groupLegendEntries,
  legendGroupKey,
  parseLegend,
  type LegendEntry,
  type LegendGroup,
} from "./entries";

export type LegendBounds = [west: number, south: number, east: number, north: number];
export interface LegendResult {
  groups: LegendGroup[];
  exceeded: boolean;
  recordCount: number;
  groupCount: number;
  boundsCount: number;
  completedBoundsCount: number;
  failedBoundsCount: number;
}

export const MACROSTRAT_LEGEND_URL = "https://macrostrat.org/api/v3/map/carto/legend";
const MAX_CACHED_RECORDS = 50_000;

export function canonicalBounds(bounds: LegendBounds): LegendBounds {
  const [w, s, e, n] = bounds;
  if (
    !bounds.every(Number.isFinite) ||
    w < -180 ||
    e > 180 ||
    s < -90 ||
    n > 90 ||
    w >= e ||
    s >= n
  )
    throw new Error("Supply nonempty geographic bounds, split at the dateline.");
  // 向外取整，稳定缓存键且不缩小用户的查询范围。
  return [
    Math.floor(w * 1e6) / 1e6,
    Math.floor(s * 1e6) / 1e6,
    Math.ceil(e * 1e6) / 1e6,
    Math.ceil(n * 1e6) / 1e6,
  ];
}

/** Remove duplicate/contained rectangles without enlarging the queried footprint. */
export function simplifyLegendBounds(ranges: LegendBounds[]): LegendBounds[] {
  const unique = [
    ...new Map(
      ranges.map((range) => {
        const bounds = canonicalBounds(range);
        return [bounds.join(","), bounds] as const;
      }),
    ).values(),
  ];
  // 四至已经在反经线处分开；全包含比较可直接进行，保留原顺序以稳定请求和缓存。
  return unique.filter(
    (inner, index) =>
      !unique.some(
        (outer, otherIndex) =>
          otherIndex !== index &&
          outer[0] <= inner[0] &&
          outer[1] <= inner[1] &&
          outer[2] >= inner[2] &&
          outer[3] >= inner[3],
      ),
  );
}

/** Macrostrat transport/cache belongs to the demo, independently of RTL and Cesium. */
export class MacrostratLegendClient {
  private cache = new Map<string, { expires: number; entries: LegendEntry[] }>();
  private cachedRecordCount = 0;
  constructor(
    // 浏览器原生 fetch 不能以此类实例作为 this 调用。
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private now = Date.now,
  ) {}

  private removeCached(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return;
    this.cachedRecordCount -= cached.entries.length;
    this.cache.delete(key);
  }

  private async fetchBounds(bounds: LegendBounds, zoom: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const key = `${zoom}:${bounds.join(",")}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.entries;
    }
    this.removeCached(key);
    const request = new AbortController();
    const cancel = () => request.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(
      () => request.abort(new Error("Macrostrat request timed out. Try again.")),
      25000,
    );
    try {
      const url = new URL(MACROSTRAT_LEGEND_URL);
      url.searchParams.set("bounds", bounds.join(","));
      url.searchParams.set("zoom", String(zoom));
      const response = await this.fetcher(url.toString(), { signal: request.signal });
      if (!response.ok)
        throw new Error(`Macrostrat legend request failed (HTTP ${response.status}).`);
      const entries = parseLegend(await response.json());
      signal.throwIfAborted();
      // 合并后可显示的图例可能包含数千条原始记录；缓存按总记录数设预算，不按显示上限截断。
      if (entries.length <= MAX_CACHED_RECORDS) {
        this.removeCached(key);
        this.cache.set(key, { expires: this.now() + 5 * 60_000, entries });
        this.cachedRecordCount += entries.length;
        while (this.cache.size > 64 || this.cachedRecordCount > MAX_CACHED_RECORDS)
          this.removeCached(this.cache.keys().next().value!);
      }
      return entries;
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }

  async query(
    ranges: LegendBounds[],
    zoom: number,
    limit: number,
    signal: AbortSignal,
    onProgress?: (result: LegendResult, bounds: LegendBounds[]) => void,
  ): Promise<LegendResult> {
    if (!Number.isInteger(zoom) || zoom < 0 || zoom > 22)
      throw new Error("Zoom must be a whole number from 0 to 22.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Legend limit must be a whole number from 1 to 1000.");
    signal.throwIfAborted();
    const bounds = simplifyLegendBounds(ranges);
    const operation = new AbortController();
    const cancel = () => operation.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const unique = new Map<string, LegendEntry>();
    const groupKeys = new Set<string>();
    let next = 0,
      complete = 0,
      failed = 0,
      exceeded = false;
    const snapshot = (): LegendResult => ({
      groups: exceeded ? [] : groupLegendEntries(unique.values()),
      exceeded,
      recordCount: unique.size,
      groupCount: groupKeys.size,
      boundsCount: bounds.length,
      completedBoundsCount: complete,
      failedBoundsCount: failed,
    });
    const worker = async () => {
      while (next < bounds.length && !exceeded && !operation.signal.aborted) {
        const range = bounds[next++];
        let entries: LegendEntry[] | undefined;
        try {
          entries = await this.fetchBounds(range, zoom, operation.signal);
          operation.signal.throwIfAborted();
        } catch {
          if (exceeded) return;
          // 用户取消仍终止整次查询；单个范围失败或超时只计数，继续处理队列。
          operation.signal.throwIfAborted();
          failed++;
        }
        complete++;
        if (entries) {
          for (const entry of entries) {
            if (unique.has(entry.id)) continue;
            unique.set(entry.id, entry);
            groupKeys.add(legendGroupKey(entry));
            if (groupKeys.size > limit) {
              exceeded = true;
              operation.abort();
              break;
            }
          }
        }
        // 每个范围结束即发布独立快照，不等待慢请求；超限快照立即清空已显示条目。
        onProgress?.(snapshot(), bounds);
      }
    };
    try {
      onProgress?.(snapshot(), bounds);
      await Promise.all(Array.from({ length: Math.min(3, bounds.length) }, worker));
      signal.throwIfAborted();
      return snapshot();
    } finally {
      operation.abort();
      signal.removeEventListener("abort", cancel);
    }
  }
}

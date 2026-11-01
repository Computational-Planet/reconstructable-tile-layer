import { afterEach, expect, it, vi } from "vitest";
import {
  canonicalBounds,
  MacrostratLegendClient,
  simplifyLegendBounds,
  type LegendBounds,
  type LegendResult,
} from "./client";
const a: LegendBounds = [-100, 43, -98, 44],
  b: LegendBounds = [-90, 43, -88, 44];
const row = (id: number) => ({
  legend_id: id,
  map_unit_name: `Unit ${id}`,
  color: id === 1 ? "#d6e165" : `#${id.toString(16).padStart(6, "0")}`,
  age: "Quaternary",
  lith: "Alluvium",
  descrip: "Description",
});
const signal = () => new AbortController().signal;
const recordIds = (result: LegendResult) =>
  result.groups
    .flatMap((group) => group.entries.map((entry) => entry.id))
    .sort((a, b) => Number(a) - Number(b));
afterEach(() => vi.useRealTimers());

it("unions different regions by legend_id and reuses matching bounds/zoom caches", async () => {
  let time = 0;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([row(1), row(2)])))
    .mockResolvedValueOnce(new Response(JSON.stringify([row(2), row(3)])));
  const client = new MacrostratLegendClient(fetcher, () => time);
  const result = await client.query([a, b, a], 4, 100, signal());
  expect(recordIds(result)).toEqual(["1", "2", "3"]);
  expect(result.boundsCount).toBe(2);
  await client.query([a, b], 4, 100, signal());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("zoom")).toBe("4");
  fetcher.mockResolvedValue(new Response("[]"));
  await client.query([a], 5, 100, signal());
  expect(fetcher).toHaveBeenCalledTimes(3);
  time = 300_001;
  fetcher.mockResolvedValue(new Response("[]"));
  await client.query([a], 4, 100, signal());
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("shows exactly the color limit, but hides all groups above it", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify([row(1), row(1), row(2)])));
  const client = new MacrostratLegendClient(fetcher);
  expect((await client.query([a], 4, 2, signal())).groups).toHaveLength(2);
  expect(await client.query([a], 4, 1, signal())).toMatchObject({
    groups: [],
    exceeded: true,
    recordCount: 2,
    groupCount: 2,
  });
});
it("eliminates duplicates and contained areas before issuing requests", async () => {
  const outer: LegendBounds = [-101, 40, -95, 50];
  const inner: LegendBounds = [-100, 43, -99, 44];
  const ranges = [inner, a, outer, [...outer] as LegendBounds, b];
  const saved = structuredClone(ranges);
  expect(simplifyLegendBounds(ranges)).toEqual([outer, b]);
  const fetcher = vi.fn(async () => new Response("[]"));
  const progress = vi.fn();
  const result = await new MacrostratLegendClient(fetcher).query(
    ranges,
    4,
    100,
    signal(),
    progress,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.boundsCount).toBe(2);
  expect(progress.mock.calls[0][1]).toEqual([outer, b]);
  expect(ranges).toEqual(saved);
});
it("keeps partial overlaps and the two sides of a dateline range separate", () => {
  const ranges: LegendBounds[] = [
    [170, -10, 180, 10],
    [-180, -10, -170, 10],
    [172, -5, 179, 5],
    [-179, -5, -172, 5],
    [175, 5, 180, 15],
  ];
  expect(simplifyLegendBounds(ranges)).toEqual([ranges[0], ranges[1], ranges[4]]);
});
it("keeps successful areas when another request fails, and retries only the failed area", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([row(1)])))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  const client = new MacrostratLegendClient(fetcher);
  const result = await client.query([a, b], 4, 100, signal());
  expect(recordIds(result)).toEqual(["1"]);
  expect(result).toMatchObject({ completedBoundsCount: 2, failedBoundsCount: 1 });
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify([row(2)])));
  const retry = await client.query([a, b], 4, 100, signal());
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(recordIds(retry)).toEqual(["1", "2"]);
  expect(retry.failedBoundsCount).toBe(0);
});
it("publishes results and advances the queue while a slow area is still pending", async () => {
  let resolve!: (response: Response) => void;
  const slow = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(slow)
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([row(2)])))
    .mockResolvedValueOnce(new Response(JSON.stringify([row(3)])));
  const progress = vi.fn();
  let finished = false;
  const query = new MacrostratLegendClient(fetcher)
    .query([a, b, [-80, 43, -78, 44], [-70, 43, -68, 44]], 4, 100, signal(), progress)
    .then((result) => {
      finished = true;
      return result;
    });
  await vi.waitFor(() =>
    expect(progress.mock.lastCall?.[0]).toMatchObject({
      completedBoundsCount: 3,
      failedBoundsCount: 1,
      recordCount: 2,
      groupCount: 2,
    }),
  );
  const partial = progress.mock.lastCall![0];
  expect(recordIds(partial)).toEqual(["2", "3"]);
  expect(finished).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(4);
  resolve(new Response(JSON.stringify([row(1), row(2)])));
  const result = await query;
  expect(recordIds(result)).toEqual(["1", "2", "3"]);
  expect(result).toMatchObject({ completedBoundsCount: 4, failedBoundsCount: 1 });
  expect(partial.groups).toHaveLength(2);
});
it("clears previously published entries immediately when a later area exceeds the limit", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([row(1)])))
    .mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
  const progress = vi.fn();
  const query = new MacrostratLegendClient(fetcher).query([a, b], 4, 1, signal(), progress);
  await vi.waitFor(() => expect(progress.mock.lastCall?.[0].groups).toHaveLength(1));
  resolve(new Response(JSON.stringify([row(2)])));
  expect(await query).toMatchObject({ groups: [], exceeded: true });
  expect(progress.mock.lastCall?.[0]).toMatchObject({ groups: [], exceeded: true });
});
it("distinguishes all areas failing from a successful empty legend", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Network error"))
    .mockResolvedValueOnce(new Response('{"invalid":true}'));
  expect(await new MacrostratLegendClient(fetcher).query([a, b], 4, 100, signal())).toMatchObject({
    groups: [],
    completedBoundsCount: 2,
    failedBoundsCount: 2,
  });
});
it("aborts pending requests and never caches cancelled responses", async () => {
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason));
      }),
  );
  const controller = new AbortController();
  const progress = vi.fn();
  const request = new MacrostratLegendClient(fetcher as typeof fetch).query(
    [a, b],
    4,
    100,
    controller.signal,
    progress,
  );
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher.mock.calls.every((call) => call[1].signal?.aborted)).toBe(true);
  expect(progress).toHaveBeenCalledTimes(1);
  expect(progress.mock.lastCall?.[0].failedBoundsCount).toBe(0);
});
it("times out a stalled API request", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason));
      }),
  );
  const request = new MacrostratLegendClient(fetcher as typeof fetch).query([a], 4, 100, signal());
  await vi.advanceTimersByTimeAsync(25000);
  expect(await request).toMatchObject({
    groups: [],
    completedBoundsCount: 1,
    failedBoundsCount: 1,
  });
});
it("validates query settings and rounds bounds outward", async () => {
  expect(canonicalBounds([-100.0000001, 43.0000001, -98.0000001, 44.0000001])).toEqual([
    -100.000001, 43, -98, 44.000001,
  ]);
  expect(() => canonicalBounds([170, -1, -170, 1])).toThrow(/dateline/);
  const client = new MacrostratLegendClient(vi.fn());
  await expect(client.query([a], -1, 100, signal())).rejects.toThrow(/Zoom/);
  await expect(client.query([a], 4, 0, signal())).rejects.toThrow(/limit/);
  expect(await client.query([], 4, 100, signal())).toMatchObject({
    groups: [],
    exceeded: false,
    boundsCount: 0,
  });
});

it("merges same-color records arriving from different areas without applying the raw-record limit", async () => {
  let resolve!: (response: Response) => void;
  const sameColor = (id: number) => ({ ...row(id), color: "#e20083", lith: `Rock ${id}` });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([sameColor(1), sameColor(2)])))
    .mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
  const progress = vi.fn();
  const query = new MacrostratLegendClient(fetcher).query([a, b], 4, 1, signal(), progress);
  await vi.waitFor(() =>
    expect(progress.mock.lastCall?.[0]).toMatchObject({
      recordCount: 2,
      groupCount: 1,
      exceeded: false,
    }),
  );
  const previous = progress.mock.lastCall![0];
  resolve(new Response(JSON.stringify([sameColor(2), sameColor(3)])));
  const result = await query;
  expect(result).toMatchObject({ recordCount: 3, groupCount: 1, exceeded: false });
  expect(result.groups[0].entries.map((entry) => [entry.id, entry.lithology])).toEqual([
    ["1", "Rock 1"],
    ["2", "Rock 2"],
    ["3", "Rock 3"],
  ]);
  expect(previous.groups[0].entries).toHaveLength(2);
});

it("caches more than 1000 raw records that fit within the display color limit", async () => {
  const rows = Array.from({ length: 1200 }, (_, index) => ({
    ...row(index + 1),
    color: "#e20083",
  }));
  const fetcher = vi.fn(async () => new Response(JSON.stringify(rows)));
  const client = new MacrostratLegendClient(fetcher);
  expect(await client.query([a], 4, 1, signal())).toMatchObject({
    exceeded: false,
    recordCount: 1200,
    groupCount: 1,
  });
  expect((await client.query([a], 4, 1000, signal())).groups[0].entries).toHaveLength(1200);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("accepts 1000 colors with 2000 records and rejects a 1001st color", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) =>
    [0, 1].map((offset) => ({
      ...row(index * 2 + offset + 1),
      color: `#${index.toString(16).padStart(6, "0")}`,
    })),
  ).flat();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(rows.slice(0, 2000))))
    .mockResolvedValueOnce(new Response(JSON.stringify(rows)));
  const client = new MacrostratLegendClient(fetcher);
  const exact = await client.query([a], 4, 1000, signal());
  expect(exact).toMatchObject({ exceeded: false, recordCount: 2000, groupCount: 1000 });
  expect(exact.groups).toHaveLength(1000);
  expect(await client.query([b], 4, 1000, signal())).toMatchObject({
    exceeded: true,
    groupCount: 1001,
    groups: [],
  });
});

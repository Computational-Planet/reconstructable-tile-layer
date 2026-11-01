import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFiniteRotationRecords, parseFiniteRotationText } from "./index.js";

afterEach(() => vi.unstubAllGlobals());

describe("ROT parsing compatibility", () => {
  it("preserves IDs, poles, ages and source order while ignoring malformed lines", () => {
    expect(
      parseFiniteRotationText(`
      ! 板块旋转
      001 0 90 -180 0 0 ! present day
      invalid
      001 NaN 0 0 0 0
      001 100 45 120 -2.5 002
    `),
    ).toEqual({
      "001": [
        {
          plateId: "001",
          age: 0,
          rotation: { latitude: 90, longitude: -180, angle: 0 },
          relatedId: "0",
        },
        {
          plateId: "001",
          age: 100,
          rotation: { latitude: 45, longitude: 120, angle: -2.5 },
          relatedId: "002",
        },
      ],
    });
  });

  it("retains duplicate filtering and the legacy reference-switch age offset", () => {
    const records = parseFiniteRotationText(
      "1 0 0 0 0 0\n1 100 10 20 30 0\n1 100 10 20 35 0\n1 100 10 20 40 2",
    );
    expect(
      records["1"].map((record) => [record.age, record.relatedId, record.rotation.angle]),
    ).toEqual([
      [0, "0", 0],
      [99.99, "0", 30],
      [100, "2", 40],
    ]);
  });

  it("normalizes transitions across local-file boundaries without reordering files", async () => {
    const records = await loadFiniteRotationRecords([
      new Blob(["1 0 0 0 0 0\n1 100 0 0 20 0"]),
      new TextEncoder().encode("1 100 0 0 30 2\n1 200 0 0 40 2"),
    ]);
    expect(records["1"].map((record) => record.age)).toEqual([0, 99.99, 100, 200]);
  });

  it("rejects a failed file instead of silently creating an empty model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await expect(loadFiniteRotationRecords(["https://models.test/rotations.rot"])).rejects.toThrow(
      "503",
    );
  });
});

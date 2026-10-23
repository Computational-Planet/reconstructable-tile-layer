import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFiniteRotationText as sourceParser } from "../../gplates-source/src/index.js";
import {
  convertFileContentToJson,
  FiniteRotationInterpolator,
  parseFiniteRotationText,
  RotationOperator,
} from "./index.js";

afterEach(() => vi.unstubAllGlobals());

const text = "1 0 90 0 0 0\n1 100 90 0 30 0\n2 0 0 0 0 1\n2 100 0 0 20 1";

describe("source package integration", () => {
  it("retains the public parser and class aliases", () => {
    expect(parseFiniteRotationText).toBe(sourceParser);
    expect(convertFileContentToJson).toBe(sourceParser);
    expect(FiniteRotationInterpolator).toBe(RotationOperator);
  });

  it("produces the same plate-chain matrices for text, parsed records and local files", async () => {
    const fromText = new RotationOperator();
    const fromRecords = new RotationOperator();
    const fromFile = new RotationOperator();
    const records = sourceParser(text);
    const before = structuredClone(records);
    await fromText.initializeFromText(text);
    await fromRecords.initializeFromRecords(records);
    await fromFile.init([new Blob([text])]);
    for (const plate of ["1", "2"]) {
      for (const age of [0, 50, 100]) {
        const expected = await fromText.getRotateMatrix(plate, age);
        expect(await fromRecords.getRotateMatrix(plate, age)).toEqual(expected);
        expect(await fromFile.getRotateMatrix(plate, age)).toEqual(expected);
      }
    }
    expect(records).toEqual(before);
    expect(fromRecords.ready && fromText.ready && fromFile.ready).toBe(true);
  });

  it("leaves ready false and preserves existing data after a failed reload", async () => {
    const operator = new RotationOperator();
    await operator.initializeFromText(text);
    const matrix = await operator.getRotateMatrix("2", 50);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    await expect(operator.init(["https://models.test/missing.rot"])).rejects.toThrow("404");
    expect(operator.ready).toBe(false);
    expect(await operator.getRotateMatrix("2", 50)).toEqual(matrix);
  });
});

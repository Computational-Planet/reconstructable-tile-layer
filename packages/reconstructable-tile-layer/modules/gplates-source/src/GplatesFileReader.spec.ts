import { gzipSync, strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeGplatesArrayBuffer, readGplatesText, readGplatesXmlFromUrl } from "./index.js";

afterEach(() => vi.unstubAllGlobals());

describe("GPlates byte and source readers", () => {
  const text = "<gpml>板块数据</gpml>";

  it("decodes plain UTF-8, gzip and ZIP without relying on extensions", async () => {
    const cases = [
      strToU8(text),
      gzipSync(strToU8(text)),
      zipSync({
        "README.txt": strToU8("metadata"),
        "model/": new Uint8Array(),
        "model/plates.GPML": strToU8(text),
      }),
    ];
    for (const bytes of cases) {
      expect(decodeGplatesArrayBuffer(bytes)).toBe(text);
      expect(await readGplatesText(new Blob([bytes]))).toBe(text);
      expect(await readGplatesText(bytes.buffer)).toBe(text);
    }
  });

  it("respects the byte offset and length of a view", async () => {
    const bytes = strToU8("XX" + text + "YY");
    const slice = bytes.subarray(2, bytes.length - 2);
    expect(await readGplatesText(slice)).toBe(text);
  });

  it("selects ROT archive entries ahead of metadata and rejects empty archives", () => {
    expect(
      decodeGplatesArrayBuffer(
        zipSync({ "readme.txt": strToU8("help"), "model.rot": strToU8("1 0 0 0 0 0") }),
      ),
    ).toBe("1 0 0 0 0 0");
    expect(() => decodeGplatesArrayBuffer(zipSync({}), "empty.gpmlz")).toThrow("empty.gpmlz");
    expect(() => decodeGplatesArrayBuffer(new Uint8Array([0x1f, 0x8b]))).toThrow();
  });

  it("reads URL objects and retains the old URL reader", async () => {
    const fetchMock = vi.fn(async () => new Response(gzipSync(strToU8(text))));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const url = new URL("https://models.test/plates");
    expect(await readGplatesText(url, { signal })).toBe(text);
    expect(fetchMock).toHaveBeenCalledWith(url, { signal });
    expect(await readGplatesXmlFromUrl(String(url))).toBe(text);
  });

  it("propagates HTTP failures and cancellation before parsing", async () => {
    const fetchMock = vi.fn(async () => new Response("not a model", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readGplatesText("https://models.test/missing.rot")).rejects.toThrow("404");
    const controller = new AbortController();
    controller.abort();
    await expect(
      readGplatesText("https://models.test/model.rot", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      readGplatesText(new Blob([text]), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

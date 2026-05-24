import { gunzipSync, unzipSync } from "fflate";

const UTF8_DECODER = new TextDecoder("utf-8");

function isGzip(bytes: Uint8Array) {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function decodeUtf8(bytes: Uint8Array) {
  return UTF8_DECODER.decode(bytes);
}

function getZipGpmlEntry(entries: Record<string, Uint8Array>, sourceName: string) {
  const entry = Object.entries(entries).find(
    ([name]) =>
      !name.endsWith("/") &&
      (name.toLowerCase().endsWith(".gpml") ||
        name.toLowerCase().endsWith(".xml")),
  );

  if (entry) {
    return entry[1];
  }

  const firstFile = Object.entries(entries).find(([name]) => !name.endsWith("/"));
  if (!firstFile) {
    throw new Error(`GPML zip is empty: ${sourceName}`);
  }
  return firstFile[1];
}

export function decodeGplatesArrayBuffer(
  buffer: ArrayBuffer,
  sourceName = "unknown",
) {
  const bytes = new Uint8Array(buffer);

  if (isGzip(bytes)) {
    return decodeUtf8(gunzipSync(bytes));
  }

  if (isZip(bytes)) {
    return decodeUtf8(getZipGpmlEntry(unzipSync(bytes), sourceName));
  }

  return decodeUtf8(bytes);
}

export async function readGplatesXmlFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GPML file: ${url}`);
  }

  return decodeGplatesArrayBuffer(await response.arrayBuffer(), url);
}


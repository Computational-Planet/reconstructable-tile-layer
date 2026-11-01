import { gunzipSync, unzipSync } from "fflate";

const UTF8_DECODER = new TextDecoder("utf-8");

/** Strings are URLs; use the text parsers for already decoded content. */
export type GplatesSource = string | URL | Blob | ArrayBuffer | Uint8Array;

/** Options shared by remote and in-memory readers. */
export interface GplatesReadOptions {
  /** Cancels network requests and prevents processing cancelled local reads. */
  signal?: AbortSignal;
  /** Original filename for diagnostics and static-polygon classification. */
  sourceName?: string;
}

/** Resolves a source label without retaining or creating an object URL. */
export function getGplatesSourceName(source: GplatesSource, sourceName?: string): string {
  if (sourceName !== undefined) return sourceName;
  if (typeof source === "string" || source instanceof URL) return String(source);
  if ("name" in source && typeof source.name === "string") return source.name;
  return "unknown";
}

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
      (name.toLowerCase().endsWith(".gpml") || name.toLowerCase().endsWith(".xml")),
  );

  if (entry) {
    return entry[1];
  }

  const firstFile =
    Object.entries(entries).find(([name]) => name.toLowerCase().endsWith(".rot")) ??
    Object.entries(entries).find(([name]) => !name.endsWith("/"));
  if (!firstFile) {
    throw new Error(`GPML zip is empty: ${sourceName}`);
  }
  return firstFile[1];
}

/** Decodes plain UTF-8, gzip, or a zip-contained GPlates file. */
export function decodeGplatesArrayBuffer(buffer: ArrayBuffer | Uint8Array, sourceName = "unknown") {
  // 保留 TypedArray 的起点和长度，避免把同一缓冲区内的其他数据当作文件内容。
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (isGzip(bytes)) {
    return decodeUtf8(gunzipSync(bytes));
  }

  if (isZip(bytes)) {
    return decodeUtf8(getZipGpmlEntry(unzipSync(bytes), sourceName));
  }

  return decodeUtf8(bytes);
}

/** Reads a URL, File/Blob, or byte buffer and decodes its GPlates text. */
export async function readGplatesText(source: GplatesSource, options: GplatesReadOptions = {}) {
  options.signal?.throwIfAborted();
  const sourceName = getGplatesSourceName(source, options.sourceName);
  let buffer: ArrayBuffer | Uint8Array;
  if (typeof source === "string" || source instanceof URL) {
    const response = await fetch(source, { signal: options.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch GPlates file (${response.status}): ${sourceName}`);
    }
    buffer = await response.arrayBuffer();
  } else if (source instanceof Blob) {
    buffer = await source.arrayBuffer();
  } else {
    buffer = source;
  }

  options.signal?.throwIfAborted();
  return decodeGplatesArrayBuffer(buffer, sourceName);
}

/** Compatibility entry point for URL-based GPML/GPMLZ readers. */
export async function readGplatesXmlFromUrl(url: string, options: GplatesReadOptions = {}) {
  return readGplatesText(url, options);
}

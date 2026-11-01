import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import { extname, join, normalize, resolve, sep } from "node:path";

const MACROSTRAT_PATH = /^\/benchmark-macrostrat\/carto\/(\d+)\/(\d+)\/(\d+)\.png$/;
const upstreamSlots = createSemaphore(6);
const macrostratAgent = new HttpsAgent({ keepAlive: true, maxSockets: 6 });

export async function startStaticBenchmarkServer(distDirectory, log) {
  const distRoot = resolve(distDirectory);
  const relayRequests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relayMatch = MACROSTRAT_PATH.exec(url.pathname);
      if (relayMatch) {
        await relayMacrostrat(relayMatch, response, relayRequests);
        return;
      }
      await serveStaticFile(distRoot, url.pathname, response);
    } catch (error) {
      log(`server error: ${error instanceof Error ? error.stack : error}`);
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Benchmark server error");
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve benchmark server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    relayRequests,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

async function serveStaticFile(distRoot, pathname, response) {
  const decodedPath = decodeURIComponent(pathname);
  const requested = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(distRoot, normalize(requested));
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  let filePath = candidate;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    filePath = join(distRoot, "index.html");
  }
  const fileStat = await stat(filePath);
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "content-length": fileStat.size,
    "cache-control": filePath.endsWith("index.html")
      ? "no-store"
      : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(response);
}

async function relayMacrostrat(match, response, relayRequests) {
  const [, level, x, y] = match;
  const upstreamUrl = `https://tiles.macrostrat.org/carto/${level}/${x}/${y}.png`;
  const startedAt = new Date().toISOString();
  const { upstream, body, attempts } = await upstreamSlots.run(() =>
    fetchMacrostratWithRetry(upstreamUrl),
  );
  relayRequests.push({
    startedAt,
    upstreamUrl,
    status: upstream.status,
    bytes: body.length,
    attempts,
    upstreamXCache: upstream.headers.get("x-cache"),
    upstreamXTileCache: upstream.headers.get("x-tile-cache"),
  });
  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "image/png",
    "content-length": body.length,
    "cache-control": "public, max-age=600",
    "access-control-allow-origin": "*",
    "x-benchmark-upstream-x-cache":
      upstream.headers.get("x-cache") ?? "unavailable",
    "x-benchmark-upstream-x-tile-cache":
      upstream.headers.get("x-tile-cache") ?? "unavailable",
  });
  response.end(body);
}

async function fetchMacrostratWithRetry(upstreamUrl) {
  let lastError;
  for (let attempts = 1; attempts <= 4; attempts++) {
    try {
      const { upstream, body } = await requestMacrostrat(upstreamUrl);
      if (upstream.ok || (upstream.status < 500 && upstream.status !== 429)) {
        return { upstream, body, attempts };
      }
      lastError = new Error(`Macrostrat returned HTTP ${upstream.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200 * attempts));
  }
  throw lastError ?? new Error("Macrostrat request failed without an error.");
}

function requestMacrostrat(upstreamUrl) {
  return new Promise((resolveRequest, reject) => {
    const request = httpsGet(
      upstreamUrl,
      {
        agent: macrostratAgent,
        ALPNProtocols: ["http/1.1"],
        headers: { "user-agent": "rtl-r2-performance-benchmark/1.0" },
      },
      (upstreamResponse) => {
        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          const status = upstreamResponse.statusCode ?? 0;
          resolveRequest({
            upstream: {
              status,
              ok: status >= 200 && status < 300,
              headers: {
                get(name) {
                  const value = upstreamResponse.headers[name.toLowerCase()];
                  return Array.isArray(value) ? value.join(", ") : value ?? null;
                },
              },
            },
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(30_000, () => {
      request.destroy(new Error("Macrostrat upstream request timed out."));
    });
  });
}

function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  const release = () => {
    active--;
    queue.shift()?.();
  };
  return {
    async run(operation) {
      if (active >= limit) {
        await new Promise((resolveWait) => queue.push(resolveWait));
      }
      active++;
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
}

function contentType(filePath) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm",
      ".xml": "application/xml",
      ".zip": "application/zip",
    }[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

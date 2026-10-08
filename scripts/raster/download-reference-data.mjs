import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(
  await readFile(new URL("./reference-datasets.json", import.meta.url), "utf8"),
);
const directory = new URL("../../tmp/raster-reference-data/", import.meta.url);
await mkdir(directory, { recursive: true });
const observations = [];
for (const dataset of manifest) {
  if (!/^[A-Za-z0-9_.-]+$/.test(dataset.filename)) throw new Error("Invalid fixture filename.");
  const destination = new URL(dataset.filename, directory);
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!bytes) {
    const response = await fetch(dataset.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${dataset.id}: HTTP ${response.status}`);
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > dataset.maximumBytes)
        throw new Error(`${dataset.id}: download exceeds declared size limit`);
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    const tiff = (bytes[0] === 73 && bytes[1] === 73) || (bytes[0] === 77 && bytes[1] === 77);
    const nc =
      bytes.subarray(0, 3).toString() === "CDF" ||
      bytes.subarray(0, 8).equals(Buffer.from([137, 72, 68, 70, 13, 10, 26, 10]));
    if (!(tiff || nc))
      throw new Error(`${dataset.id}: server returned an unexpected file signature`);
    await writeFile(new URL(`${dataset.filename}.part`, directory), bytes);
    await rename(new URL(`${dataset.filename}.part`, directory), destination);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (dataset.sha256 && dataset.sha256 !== sha256)
    throw new Error(`${dataset.id}: SHA-256 differs from the pinned fixture`);
  observations.push({
    id: dataset.id,
    url: dataset.url,
    filename: dataset.filename,
    bytes: bytes.length,
    sha256,
    checkedAt: new Date().toISOString(),
  });
  process.stdout.write(`${dataset.id}: ${bytes.length} bytes, SHA-256 ${sha256}\n`);
  await writeFile(
    new URL("download-receipts.json", directory),
    `${JSON.stringify(observations, null, 2)}\n`,
  );
}
process.stdout.write(`Reference data cache: ${fileURLToPath(directory)}\n`);

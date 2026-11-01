import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStaticBenchmarkServer } from "../../apps/reconstructable-tile-layer-demo/benchmark/r2/staticBenchmarkServer.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = process.argv[2] ?? process.env.RTL_PNPM_CLI;
if (!cli)
  throw new Error(
    "Pass the absolute path to pnpm.cjs as the first argument or RTL_PNPM_CLI; no shell interpolation is used.",
  );
const directory = await mkdtemp(path.join(tmpdir(), "rtl-packed-consumer-"));
if ((await realpath(directory)).toLowerCase().startsWith((await realpath(root)).toLowerCase()))
  throw new Error("Consumer must be outside the repository to prevent workspace resolution");
process.stdout.write(`Isolated consumer: ${directory}\n`);
const run = (args, cwd = directory) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${args.join(" ")} failed (${code})\n${output.slice(-12000)}`)),
    );
  });
const names = [
  "reconstructable-tile-layer",
  "rtl-raster-source",
  "rtl-raster-imagery-provider",
  "rtl-raster-converter",
];
const packs = path.join(directory, "packs");
await mkdir(packs);
for (const name of names) {
  await run([cli, "pack", "--pack-destination", packs], path.join(root, "packages", name));
  process.stdout.write(`Packed ${name}\n`);
}
const dependencies = {};
for (const name of names) {
  const metadata = JSON.parse(
    await readFile(path.join(root, "packages", name, "package.json"), "utf8"),
  );
  dependencies[name] = `file:./packs/${name}-${metadata.version}.tgz`;
}
await writeFile(
  path.join(directory, "package.json"),
  JSON.stringify(
    {
      name: "rtl-isolated-consumer",
      private: true,
      type: "module",
      packageManager: "pnpm@9.0.5",
      dependencies: { ...dependencies, cesium: "1.119.0", "gdal3.js": "2.8.1" },
      devDependencies: { typescript: "5.5.3", vite: "5.3.3", "playwright-core": "1.55.0" },
      pnpm: { overrides: { ...dependencies, "@zip.js/zip.js": "2.7.45" } },
    },
    null,
    2,
  ),
);
await mkdir(path.join(directory, "src"));
await mkdir(path.join(directory, "public", "fixtures"), { recursive: true });
for (const name of ["packed-record.nc", "grouped-grid.nc", "stripped-preview.tif"])
  await copyFile(
    path.join(root, "packages", "rtl-raster-source", "test", "fixtures", name),
    path.join(directory, "public", "fixtures", name),
  );
for (const [source, target] of [
  ["main.ts", "src/main.ts"],
  ["import-check.mjs", "import-check.mjs"],
  ["build.mjs", "build.mjs"],
])
  await copyFile(new URL(`consumer/${source}`, import.meta.url), path.join(directory, target));
await writeFile(
  path.join(directory, "src", "service-only.ts"),
  'export { ReconstructableTileLayer } from "reconstructable-tile-layer";\n',
);
await writeFile(
  path.join(directory, "index.html"),
  '<!doctype html><html><head><meta charset="UTF-8"></head><body><script type="module" src="/src/main.ts"></script></body></html>',
);
await writeFile(
  path.join(directory, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        lib: ["ES2022", "DOM"],
        types: ["vite/client"],
        noEmit: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),
);
await run([cli, "install", "--prefer-offline", "--ignore-scripts"]);
process.stdout.write("Installed tarballs without workspace links.\n");
const requireConsumer = createRequire(path.join(directory, "package.json"));
const cesium = await realpath(requireConsumer.resolve("cesium/package.json"));
for (const name of ["rtl-raster-imagery-provider", "reconstructable-tile-layer"]) {
  const packagePath = requireConsumer.resolve(`${name}/package.json`);
  if ((await realpath(packagePath)).toLowerCase().startsWith(root.toLowerCase()))
    throw new Error("Unexpected workspace package link");
  const localRequire = createRequire(packagePath);
  if ((await realpath(localRequire.resolve("cesium/package.json"))) !== cesium)
    throw new Error("Duplicate Cesium instances");
}
await run(["import-check.mjs"]);
await run([requireConsumer.resolve("typescript/bin/tsc")]);
await run(["build.mjs"]);
process.stdout.write(
  "Import, public types, production build and ordinary-service dependency checks passed.\n",
);
const server = await startStaticBenchmarkServer(path.join(directory, "dist"), () => {});
const { chromium } = requireConsumer("playwright-core");
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.RASTER_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => process.stderr.write(`${error.stack}\n`));
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => typeof window.runPackedTest === "function");
  const results = await page.evaluate(async () => {
    let timer;
    try {
      return await Promise.race([
        window.runPackedTest(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Packed consumer test timed out")), 180000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
  const evidence = {
    directory,
    browser: browser.version(),
    packages: await readdir(packs),
    cesiumSingleInstance: true,
    versions: { cesium: "1.119.0", zipJs: "2.7.45", gdal3: "2.8.1", vite: "5.3.3" },
    build: JSON.parse(await readFile(path.join(directory, "build-evidence.json"), "utf8")),
    results,
  };
  await writeFile(
    path.join(root, "tmp", "raster-packed-consumer-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  process.stdout.write(
    `Packed consumer passed ${results.length} browser cases. Evidence: tmp/raster-packed-consumer-evidence.json\n`,
  );
} finally {
  await browser?.close();
  await server.close();
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 在仓库外安装真实 tarball，避免 workspace 链接掩盖缺失的依赖或类型声明。
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = process.env.RTL_PNPM_CLI ?? process.env.npm_execpath;
assert(cli, "Run with pnpm test:distribution or set RTL_PNPM_CLI to pnpm.cjs");
const directory = await mkdtemp(path.join(tmpdir(), "rtl-distribution-"));
const relative = path.relative(await realpath(root), await realpath(directory));
assert(
  relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
  "Consumer must be outside the repository",
);
process.stdout.write(`Isolated distribution checks: ${directory}\n`);
const run = (args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${args.join(" ")} failed (${code})\n${output.slice(-12000)}`)),
    );
  });
const core = "reconstructable-tile-layer";
const modules = {
  "rtl-gplates-source": "gplates-source",
  "rtl-finite-rotation": "finite-rotation",
  "rtl-tile-plate-quadtree": "tile-plate-quadtree",
  "rtl-webgl-tile-processor": "webgl-tile-processor",
};
const extensions = ["rtl-raster-source", "rtl-raster-imagery-provider", "rtl-raster-converter"];
const packs = path.join(directory, "packs");
await mkdir(packs);
const dependencies = {};
for (const name of [core, ...Object.keys(modules), ...extensions]) {
  const packageDir = modules[name]
    ? path.join(root, "packages", core, "modules", modules[name])
    : path.join(root, "packages", name);
  const metadata = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  await run([cli, "pack", "--pack-destination", packs], packageDir);
  dependencies[name] =
    `file:${path.join(packs, `${name}-${metadata.version}.tgz`).replaceAll("\\", "/")}`;
}

// 固定为仓库已经验证的外部依赖版本，支持 --offline 重复验证；不改变发布包的版本范围。
const lock = (await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"))
  .replaceAll("\r\n", "\n")
  .split("\npackages:\n")[1]
  .split("\nsnapshots:\n")[0];
const overrides = {};
for (const line of lock.split("\n")) {
  const match = /^ {2}'?((?:@[^/\s']+\/)?[^@\s':]+)@([^:\s']+)'?:$/.exec(line);
  if (match) overrides[match[1]] ??= match[2];
}
const installArgs = [cli, "install", "--ignore-scripts", "--config.auto-install-peers=false"];
if (process.argv.includes("--offline")) installArgs.push("--offline");
if (process.env.RTL_PNPM_STORE) installArgs.push("--store-dir", process.env.RTL_PNPM_STORE);

async function setup(name, names, withCesium) {
  const cwd = path.join(directory, name);
  await mkdir(cwd);
  const selected = Object.fromEntries(names.map((item) => [item, dependencies[item]]));
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify(
      {
        name: `rtl-distribution-${name}`,
        private: true,
        type: "module",
        packageManager: "pnpm@9.0.5",
        dependencies: { ...selected, ...(withCesium ? { cesium: "1.119.0" } : {}) },
        devDependencies: { typescript: "5.5.3" },
        pnpm: { overrides: { ...overrides, ...selected } },
      },
      null,
      2,
    ),
  );
  await run(installArgs, cwd);
  return cwd;
}

async function typecheck(cwd, fixture) {
  await copyFile(new URL(`fixtures/${fixture}`, import.meta.url), path.join(cwd, "consumer.ts"));
  const require = createRequire(path.join(cwd, "package.json"));
  for (const resolution of ["Bundler", "NodeNext"]) {
    await writeFile(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: resolution === "Bundler" ? "ESNext" : "NodeNext",
            moduleResolution: resolution,
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            lib: ["ES2022", "DOM"],
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      ),
    );
    await run([require.resolve("typescript/bin/tsc")], cwd);
  }
}

async function checkRuntime(cwd, standalone = false) {
  await copyFile(new URL("fixtures/runtime.mjs", import.meta.url), path.join(cwd, "runtime.mjs"));
  process.stdout.write(await run(["runtime.mjs", ...(standalone ? ["--standalone"] : [])], cwd));
}

const main = await setup("main-only", [core], true);
await checkRuntime(main);
await typecheck(main, "main.ts");
const requireMain = createRequire(path.join(main, "package.json"));
const manifest = requireMain(`${core}/package.json`);
for (const name of [...Object.keys(modules), ...extensions]) {
  assert(!manifest.dependencies[name], `Unexpected runtime dependency: ${name}`);
  assert.throws(() => requireMain.resolve(name), `Unexpected installed package: ${name}`);
}
const mainPath = await realpath(path.dirname(requireMain.resolve(`${core}/package.json`)));
assert(
  !mainPath.toLowerCase().startsWith(root.toLowerCase()),
  "Workspace package link escaped isolation",
);
async function checkOutput(folder) {
  for (const file of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, file.name);
    if (file.isDirectory()) await checkOutput(filename);
    else if (/\.(?:js|cjs|ts)$/.test(file.name)) {
      const contents = await readFile(filename, "utf8");
      assert(
        !/["']rtl-(?:gplates-source|finite-rotation|tile-plate-quadtree|webgl-tile-processor)(?:\/[^"']*)?["']/.test(
          contents,
        ),
        `External core import in ${filename}`,
      );
    }
  }
}
await checkOutput(path.join(mainPath, "dist"));
process.stdout.write(
  "PASS: main tarball alone, all public declarations (Bundler/NodeNext), no workspace/core runtime dependencies\n",
);

const standalone = await setup("standalone", [core, ...Object.keys(modules), ...extensions], true);
await checkRuntime(standalone, true);
await typecheck(standalone, "standalone.ts");
process.stdout.write(
  "PASS: standalone modules, processor injection and optional raster extension types\n",
);

const source = await setup("source-only", ["rtl-gplates-source"], false);
await copyFile(new URL("fixtures/source.mjs", import.meta.url), path.join(source, "source.mjs"));
process.stdout.write(await run(["source.mjs"], source));
await typecheck(source, "source.ts");
await writeFile(
  path.join(directory, "result.json"),
  JSON.stringify(
    { passed: true, main, standalone, source, packages: Object.keys(dependencies) },
    null,
    2,
  ),
);
process.stdout.write(
  `Distribution checks passed. Evidence: ${path.join(directory, "result.json")}\n`,
);

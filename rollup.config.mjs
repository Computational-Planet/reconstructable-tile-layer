import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "rollup-plugin-typescript2";

function readPackageManifest(packageDirectory) {
  return JSON.parse(readFileSync(resolve(packageDirectory, "package.json"), "utf8"));
}

function matchesPackage(id, packageName) {
  return id === packageName || id.startsWith(`${packageName}/`);
}

function normalizeSourceMapPath(sourcePath) {
  const normalizedPath = sourcePath.replaceAll("\\", "/");
  const dependencyPath = normalizedPath.split("/node_modules/").at(-1);
  return dependencyPath === normalizedPath ? normalizedPath : `vendor/${dependencyPath}`;
}

/**
 * Creates the consistent dual-module Rollup configuration used by every
 * publishable package in this workspace.
 */
export function createLibraryConfig(packageUrl, { entries } = {}) {
  const packageDirectory = dirname(fileURLToPath(packageUrl));
  const manifest = readPackageManifest(packageDirectory);
  const externalPackages = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
  const sourceDirectory = resolve(packageDirectory, "src");
  const distributionDirectory = resolve(packageDirectory, "dist");

  return {
    // 同一次多入口构建共享模块，保证主入口和子路径导出同一构造函数。
    input: entries
      ? Object.fromEntries(
          Object.entries(entries).map(([name, entry]) => [name, resolve(packageDirectory, entry)]),
        )
      : resolve(sourceDirectory, "index.ts"),
    external: (id) => externalPackages.some((packageName) => matchesPackage(id, packageName)),
    output: [
      {
        ...(entries
          ? {
              dir: resolve(distributionDirectory, "es"),
              entryFileNames: "[name].js",
              chunkFileNames: "chunks/[name]-[hash].js",
            }
          : { file: resolve(distributionDirectory, "es/index.js") }),
        format: "es",
        sourcemap: true,
        sourcemapPathTransform: normalizeSourceMapPath,
      },
      {
        ...(entries
          ? {
              dir: resolve(distributionDirectory, "cjs"),
              entryFileNames: "[name].cjs",
              chunkFileNames: "chunks/[name]-[hash].cjs",
            }
          : { file: resolve(distributionDirectory, "cjs/index.cjs") }),
        format: "cjs",
        sourcemap: true,
        sourcemapPathTransform: normalizeSourceMapPath,
      },
    ],
    plugins: [
      typescript({
        clean: true,
        tsconfig: resolve(packageDirectory, "tsconfig.json"),
        useTsconfigDeclarationDir: true,
      }),
      commonjs({ include: /node_modules/ }),
      json(),
      nodeResolve({ extensions: [".mjs", ".js", ".json", ".node", ".ts"] }),
    ],
  };
}

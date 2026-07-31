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
export function createLibraryConfig(packageUrl) {
  const packageDirectory = dirname(fileURLToPath(packageUrl));
  const manifest = readPackageManifest(packageDirectory);
  const externalPackages = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
  const sourceDirectory = resolve(packageDirectory, "src");
  const distributionDirectory = resolve(packageDirectory, "dist");

  return {
    input: resolve(sourceDirectory, "index.ts"),
    external: (id) => externalPackages.some((packageName) => matchesPackage(id, packageName)),
    output: [
      {
        file: resolve(distributionDirectory, "es/index.js"),
        format: "es",
        sourcemap: true,
        sourcemapPathTransform: normalizeSourceMapPath,
      },
      {
        file: resolve(distributionDirectory, "cjs/index.cjs"),
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

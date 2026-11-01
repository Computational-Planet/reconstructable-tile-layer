import { defineConfig, type Plugin } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

function runtimeNotices(): Plugin {
  const require = createRequire(import.meta.url);
  async function dependencyRoot(name: string) {
    let directory = dirname(
      require.resolve(name, {
        paths: [
          dirname(require.resolve("rtl-raster-source/package.json")),
          dirname(require.resolve("gdal3.js")),
        ],
      }),
    );
    for (;;) {
      try {
        const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
        if (metadata.name === name) return directory;
      } catch {
        /* A compiled entry may sit several directories below package.json. */
      }
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`Cannot locate ${name} license directory.`);
      directory = parent;
    }
  }
  return {
    name: "runtime-third-party-notices",
    async generateBundle() {
      // Worker/WASM 进入生产站点时，同时保留依赖包所附的完整许可声明。
      for (const name of [
        "reconstructable-tile-layer",
        "rtl-raster-source",
        "rtl-raster-imagery-provider",
        "rtl-raster-converter",
        "gdal3.js",
        "geotiff",
      ]) {
        const packageRoot =
          name.startsWith("rtl-") || name === "reconstructable-tile-layer"
            ? dirname(require.resolve(`${name}/package.json`))
            : await dependencyRoot(name);
        for (const filename of await readdir(packageRoot)) {
          if (!/^(LICENSE|COPYING|THIRD_PARTY_NOTICES)(\.|$)/i.test(filename)) continue;
          this.emitFile({
            type: "asset",
            fileName: `licenses/${name}/${filename}`,
            source: await readFile(join(packageRoot, filename)),
          });
        }
        if (name === "rtl-raster-source") {
          for (const filename of await readdir(join(packageRoot, "licenses"))) {
            this.emitFile({
              type: "asset",
              fileName: `licenses/${name}/${filename}`,
              source: await readFile(join(packageRoot, "licenses", filename)),
            });
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), cesium(), runtimeNotices()],
  worker: { format: "es" },
  build: {
    target: "esnext",
  },
});

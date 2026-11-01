import { build } from "vite";
import { writeFile } from "node:fs/promises";

await build({
  configFile: false,
  worker: { format: "es" },
  build: { target: "es2022", minify: false },
  logLevel: "warn",
});
const serviceModules = [];
await build({
  configFile: false,
  plugins: [
    {
      name: "check-ordinary-service-dependencies",
      moduleParsed(info) {
        serviceModules.push(info.id);
      },
    },
  ],
  build: {
    target: "es2022",
    outDir: "service-dist",
    lib: { entry: "src/service-only.ts", formats: ["es"], fileName: "service" },
    minify: false,
  },
  logLevel: "warn",
});
if (serviceModules.some((id) => /(?:rtl-raster-|h5wasm|netcdfjs|geotiff)/.test(id)))
  throw new Error("Ordinary RTL imports pulled in optional raster engines");
await writeFile(
  "build-evidence.json",
  JSON.stringify(
    { ordinaryServiceOptionalRasterModules: 0, ordinaryServiceModuleCount: serviceModules.length },
    null,
    2,
  ),
);

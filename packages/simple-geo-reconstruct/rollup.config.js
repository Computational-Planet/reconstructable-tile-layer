import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import ts from "rollup-plugin-typescript2";

const external = [
  "cesium",
  "fflate",
  "plates-rotation-operator",
  "polygon-tile-quadtree",
  "tile-processer-webgl",
];

export default {
  input: "src/index.ts",
  output: [
    {
      dir: "./dist/es/",
      format: "es",
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: "src",
    },
    {
      dir: "./dist/lib/",
      format: "cjs",
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: "src",
    },
    {
      dir: "./dist/typings/",
      entryFileNames: "[name].d.ts",
      format: "esm",
    },
  ],
  plugins: [
    ts({
      tsconfig: "tsconfig.json",
      clean: true,
    }),
    commonjs({
      include: /node_modules/,
    }),
    json(),
    resolve(),
  ],
  external,
};

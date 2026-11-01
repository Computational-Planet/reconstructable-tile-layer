import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "dist/netcdf/worker.js",
  output: {
    dir: "dist/workers",
    format: "es",
    entryFileNames: "netcdf.js",
    // 公共函数不能放在 Worker 入口：带查询参数的入口被 HDF 分块反向导入时，
    // 浏览器会再次执行入口并覆盖 onmessage，丢失已打开的数据集。
    manualChunks: {
      "netcdf-shared": ["dist/errors.js", "dist/validation.js", "dist/netcdf/numeric.js"],
    },
  },
  plugins: [nodeResolve({ browser: true, preferBuiltins: false }), commonjs()],
};

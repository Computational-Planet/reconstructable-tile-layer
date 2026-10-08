import { createRasterConverter } from "rtl-raster-converter";
import js from "gdal3.js/dist/package/gdal3.js?url";
import wasm from "gdal3.js/dist/package/gdal3WebAssembly.wasm?url";
import data from "gdal3.js/dist/package/gdal3WebAssembly.data?url";

// 只在用户请求转换时导入本模块；引擎资源随生产构建托管，不依赖外部 CDN。
export function createDemoConverter() {
  return createRasterConverter({ assets: { js, wasm, data } });
}

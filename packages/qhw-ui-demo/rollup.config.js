import ts from "rollup-plugin-typescript2"; // ts支持
import resolve from "@rollup/plugin-node-resolve"; // 支持指定外部模块（由宿主提供）
import commonjs from "@rollup/plugin-commonjs"; // 将CommonJS模块转换为ES6版本，让rollup能识别
import json from "@rollup/plugin-json"; // 支持导入json，没有 json 插件的支持我们在导入 json 文件时会报错
import postcss from "rollup-plugin-postcss";

export default {
  input: "src/index.ts", // 入口
  output: [
    //file：指定输出文件
    //dir：指定输出目录
    {
      //es输出到module
      dir: "./dist/es/", // 出口
      format: "es", // 输出格式 amd / es / cjs / iife / umd / system
      //name: "func", // 当format为iife和umd时必须提供，将作为全局变量挂在window(浏览器环境)下：window.A=...
      sourcemap: true, // 生成bundle.js.map文件，方便调试
      //banner: "// banner", // 为打包好的文件添加注释，注释的位置在整个文件的首行
      preserveModules: true, // 保留模块结构，不要全打包到一个文件里面
      preserveModulesRoot: "src", // 指定根目录
      exports: 'named', // 确认都不是默认输出
    },
    {
      //main，commonJS
      dir: "./dist/lib/",
      format: "cjs",
      sourcemap: true,
      preserveModules: true, // 保留模块结构
      preserveModulesRoot: "src", // 指定根目录
      exports: 'named', // 确认都不是默认输出
    },
    {
      dir: "./dist/typings/",
      entryFileNames: "[name].d.ts",
      format: "esm",
      exports: 'named', // 确认都不是默认输出
    },
  ],
  plugins: [
    ts({
      tsconfig: 'tsconfig.json', // 明确指定 tsconfig 文件路径
    }),
    commonjs({
      include: /node_modules/,
    }),
    json(),
    postcss(),
    resolve(),
  ],
  external: ["react", "react-dom"], // 指定外部的库（所有dependencies中的依赖其实都可以不打包进包中，由宿主的环境提供。但是，这么做需要在文档中写明告知用户，让用户手动装。他不会自动安装）（所以还是打包进去吧QwQ）
};

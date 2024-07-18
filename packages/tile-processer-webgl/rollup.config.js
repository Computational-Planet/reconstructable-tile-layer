import ts from "rollup-plugin-typescript2"; // ts支持
import resolve from "@rollup/plugin-node-resolve"; // 支持指定外部模块（由宿主提供）
import commonjs from "@rollup/plugin-commonjs"; // 将CommonJS模块转换为ES6版本，让rollup能识别
import json from "@rollup/plugin-json"; // 支持导入json，没有 json 插件的支持我们在导入 json 文件时会报错
//import livereload from "rollup-plugin-livereload"; // 热更新插件
//import { terser } from "rollup-plugin-terser"; // 安装代码压缩插件
//import alias from "@rollup/plugin-alias"; // 提供了为模块起别名的功能
//import path from "path";
//import { fileURLToPath } from "url";

/**
内部变量:

ES6 模块应该是通用的，同一个模块不用修改，就可以用在浏览器环境和服务器环境。为了达到这个目标，Node.js 规定 ES6 模块之中不能使用 CommonJS 模块的特有的一些内部变量。

首先，就是this关键字。ES6 模块之中，顶层的this指向undefined；CommonJS 模块的顶层this指向当前模块，这是两者的一个重大差异。

其次，以下这些顶层变量在 ES6 模块之中都是不存在的。

arguments
require
module
exports
__filename
__dirname

* 通过使用某些函数创建一个自定义__dirname变量来修复“__dirname is not defined in ES module scope”错误。
* 该变量就像全局变量一样工作，直接包含文件当前工作的完整路径。
* __dirname包含当前模块文件目录的绝对路径。
*/
// __filename包含当前模块文件的绝对路径
/* const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pathResolve = (p) => path.resolve(__dirname, p); */

// cjs(commonJS)是在node.js环境下使用
// es是直接给浏览器用的

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
      preserveModulesRoot: './src', // 指定根目录
    },
    {
      //main，commonJS
      dir: "./dist/lib/",
      format: "cjs",
      sourcemap: true,
      preserveModules: true, // 保留模块结构
      preserveModulesRoot: './src', // 指定根目录
    },
    {
      dir: "./dist/typings/",
      entryFileNames: "[name].d.ts",
      format: "esm",
    },
  ],
  plugins: [
    ts(),
    commonjs({
      include: /node_modules/,
    }),
    //terser(),
    json(),
    resolve(),
    /*     alias({
      resolve: [".jsx", ".js", ".tsx", ".ts"], // 可选，默认情况下这只会查找 .js 文件或文件夹
      entries: {
        "@": pathResolve("src"),
        _: __dirname,
      },
    }), */
    //livereload(),
  ],
  external: ["cesium"], // 指定外部的库（所有dependencies中的依赖其实都可以不打包进包中，由宿主的环境提供。但是，这么做需要在文档中写明告知用户，让用户手动装。他不会自动安装）（所以还是打包进去吧QwQ）
};

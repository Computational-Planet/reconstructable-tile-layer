import { createLibraryConfig } from "../../rollup.config.mjs";

export default createLibraryConfig(import.meta.url, {
  entries: {
    index: "src/index.ts",
    gplates: "src/gplates.ts",
    rotation: "src/rotation.ts",
    quadtree: "src/quadtree.ts",
    processor: "src/processor.ts",
  },
});

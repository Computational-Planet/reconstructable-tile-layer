import type { CesiumTileProcesser } from "./cesium-tile-processer.js";

/** Public processor instance contract accepted by RTL and standalone consumers. */
// 只包含公共成员，避免独立构建后类的私有字段让 TypeScript 判定两个处理器不兼容。
export type TileProcessor = Pick<CesiumTileProcesser, keyof CesiumTileProcesser>;

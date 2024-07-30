// RefContext.tsx
import { Viewer } from "cesium";
import React from "react";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { CustomTileManager } from "../utils/customTileManager";

interface CesiumRefContextType {
  viewerRef: React.MutableRefObject<Viewer | null>;
  tileProcesserRef: React.MutableRefObject<CesiumTileProcesser | undefined>;
  tileManager: React.MutableRefObject<CustomTileManager | null | undefined>;
}

const CesiumRefContext = React.createContext<CesiumRefContextType | undefined>(
  undefined
);

export default CesiumRefContext;

// RefContext.tsx
import { Viewer } from "cesium";
import React from "react";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { CustomTileManager } from "../utils/customTileManager";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";

interface CesiumRefContextType {
  viewerRef: React.MutableRefObject<Viewer | null>;
  tileProcesserRef: React.MutableRefObject<CesiumTileProcesser | undefined>;
  tileManager: React.MutableRefObject<CustomTileManager | null | undefined>;
  quadTreeTileProcesserRef: React.MutableRefObject<
    QuadTreeTileProcesser | undefined
  >;
}

const CesiumRefContext = React.createContext<CesiumRefContextType | undefined>(
  undefined
);

export default CesiumRefContext;

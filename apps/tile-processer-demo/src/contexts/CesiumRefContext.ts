// RefContext.tsx
import { Viewer } from "cesium";
import React from "react";
import { CesiumTileProcesser } from "tile-processer-webgl";
import { CustomTileManager } from "../utils/CustomTileManager";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";
import { TilePrimitivesManager } from "../utils/TilePrimitivesManager";
import { SimpleGeoReconstructManager } from "../utils/SimpleGeoReconstructManager";

interface CesiumRefContextType {
  viewerRef: React.MutableRefObject<Viewer | null>;
  tileProcesserRef: React.MutableRefObject<CesiumTileProcesser | undefined>;
  tileManagerRef: React.MutableRefObject<CustomTileManager | null | undefined>;
  quadTreeTileProcesserRef: React.MutableRefObject<
    QuadTreeTileProcesser | undefined
  >;
  tilePrimitivesManagerRef: React.MutableRefObject<
    TilePrimitivesManager | undefined
  >;
  simpleGeoReconstructManagerRef: React.MutableRefObject<
    SimpleGeoReconstructManager | undefined
  >;

}

const CesiumRefContext = React.createContext<CesiumRefContextType | undefined>(
  undefined
);

export default CesiumRefContext;

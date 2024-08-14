import clsx from "clsx";
import { CSSProperties, useContext, useEffect } from "react";
import "./index.css";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { Button } from "qhw-ui-demo";
import { TilePrimitivesManager } from "../../utils/TilePrimitivesManager";
import { DefaultProvider } from "../../App";

type DeepTimeGeoPanelProps = {
  style?: CSSProperties;
  className?: string;
};

function DeepTimeGeoPanel(props: DeepTimeGeoPanelProps) {
  const { style: userStyle, className /* ,viewerRef, tileProcesserRef */ } =
    props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  //const { viewerRef, tileManager } = context;
  const { tilePrimitivesManagerRef, tileManagerRef, tileProcesserRef } =
    context;

  //const tileManager = useRef<CustomTileManager | null>();

  return (
    <div className={clsx(className)} style={{ ...userStyle }}>
      <Button
        onClick={() => {
          if (tileProcesserRef.current) {
            const tilePrimitivesManager = new TilePrimitivesManager({
              processer: tileProcesserRef.current,
              files: { polygon: "/geo/PALEO_PLATE_POLYGON.json" },
            });
            tilePrimitivesManager.init();
            tilePrimitivesManagerRef.current = tilePrimitivesManager;
          }
        }}
      >
        Load Polygons
      </Button>
      <Button
        onClick={() => {
          if (tilePrimitivesManagerRef.current && tileManagerRef.current) {
            tilePrimitivesManagerRef.current.loadAllPolygonOnLevelZeroTile(
              tileManagerRef.current
            );
          }
        }}
      >
        Load Level 0 Tiles
      </Button>
    </div>
  );
}

export default DeepTimeGeoPanel;

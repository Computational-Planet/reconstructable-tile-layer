import clsx from "clsx";
import { CSSProperties, useContext, useEffect, useState } from "react";
import "./index.css";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { Button } from "qhw-ui-demo";
import { TilePrimitivesManager } from "../../utils/TilePrimitivesManager";
import { RotationOperator } from "plates-rotation-operator"
import { DefaultProvider } from "../../App";
import { SimpleGeoReconstructManager } from "../../utils/SimpleGeoReconstructManager";

type DeepTimeGeoPanelProps = {
  style?: CSSProperties;
  className?: string;
};

function DeepTimeGeoPanel(props: DeepTimeGeoPanelProps) {
  const { style: userStyle, className /* ,viewerRef, tileProcesserRef */ } =
    props;

  const [age, setAge] = useState<number>(0);
  const [level, setLevel] = useState<number>(3);
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  //const { viewerRef, tileManager } = context;
  const { viewerRef, tilePrimitivesManagerRef, tileManagerRef, tileProcesserRef, simpleGeoReconstructManagerRef } =
    context;

  useEffect(() => {
    if (tileProcesserRef.current) {
      simpleGeoReconstructManagerRef.current = new SimpleGeoReconstructManager({
        processer: tileProcesserRef.current,
        files: { polygon: "/geo/Matthews++/PresentDay_StaticPlatePolygons_Matthews++.json", rots: ["/geo/Matthews++/Global_EB_250-0Ma_GK07_Matthews++.rot", "/geo/Matthews++/Global_EB_410-250Ma_GK07_Matthews++.rot"] },
      });
      simpleGeoReconstructManagerRef.current.init();
    }


  }, [])

  useEffect(() => {
    if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
      simpleGeoReconstructManagerRef.current.updateAge(age).then(() => { viewerRef.current?.scene.requestRender(); });

    }
  }, [age])
  //const tileManager = useRef<CustomTileManager | null>();

  return (
    <div className={clsx(className)} style={{ ...userStyle }}>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (tileProcesserRef.current) {
              const tilePrimitivesManager = new TilePrimitivesManager({
                processer: tileProcesserRef.current,
                files: { polygon: "/geo/Matthews++/PresentDay_StaticPlatePolygons_Matthews++.json" },
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
          Load All Level 3 Tiles
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={async () => {
            if (simpleGeoReconstructManagerRef.current) {
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", -100));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 0));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 100));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 200));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 300));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 400));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 500));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 600));
              console.log(await simpleGeoReconstructManagerRef.current.rotationOperator.getRotateMatrix("514", 700));
            }

          }}
        >
          Rotation Test
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={async () => {
            if (viewerRef.current && simpleGeoReconstructManagerRef.current) {
              simpleGeoReconstructManagerRef.current.generateTilePrimitivesOnLevelN(viewerRef.current, level);
            }
          }}
        >
          NEW Load All Tiles On Lv {level}
        </Button>
        <input type="number" defaultValue={3} min={DefaultProvider.minimumLevel} max={DefaultProvider.maximumLevel} onChange={(e) => { setLevel(Number(e.target.value)) }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <input type="range" min={0} max={600} value={age} style={{ width: "80%" }} onChange={(e) => { setAge(Number(e.target.value)) }}></input>
        <input type="number" defaultValue={0} min={0} max={600} value={age} onChange={(e) => { setAge(Number(e.target.value)) }} />
      </div>
    </div>
  );
}


export default DeepTimeGeoPanel;

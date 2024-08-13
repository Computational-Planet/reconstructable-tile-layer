import { useContext, useRef, useState } from "react";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { Button } from "qhw-ui-demo";

interface AddTilesModuleProps {
  updateTilesTable: () => void; // 更新表格用的函数
  defaultClippedPolygon: Array<number>;
}

export default function AddTilesModule(props: AddTilesModuleProps) {
  const { updateTilesTable, defaultClippedPolygon } = props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef, tileProcesserRef, tileManager } = context;
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [l, setL] = useState(0);
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "left",
          width: "100%",
          marginBottom: 10,
        }}
      >
        <h3 style={{ marginRight: 5 }}>Add Tiles: </h3>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: "300px",
          marginBottom: 10,
        }}
      >
        <label>X:</label>
        <input
          style={{ width: "20%" }}
          type="number"
          value={x}
          onChange={(e) => {
            setX(e.target.valueAsNumber);
          }}
        ></input>
        <label>Y:</label>
        <input
          style={{ width: "20%" }}
          type="number"
          value={y}
          onChange={(e) => {
            setY(e.target.valueAsNumber);
          }}
        ></input>
        <label>L:</label>
        <input
          style={{ width: "20%" }}
          type="number"
          value={l}
          onChange={(e) => {
            setL(e.target.valueAsNumber);
          }}
        ></input>
      </div>
      <div
        style={{
          width: "100%",
          marginBottom: 20,
        }}
      >
        <Button
          style={{ margin: 5 }}
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              tileManager.current.generateOriTile(
                `tile-${x}/${y}/${l}-ori`,
                tileProcesserRef.current.provider,
                x,
                y,
                l,
                processCanvasRef.current
              );
              updateTilesTable();
            }
          }}
        >
          Add Origin Tile
        </Button>
        <Button
          style={{ margin: 5 }}
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              tileManager.current.generateReprojTile(
                `tile-${x}/${y}/${l}-reproj`,
                tileProcesserRef.current.provider,
                x,
                y,
                l,
                tileProcesserRef.current
              );
              updateTilesTable();
            }
          }}
        >
          Add Reprojected Tile
        </Button>
        <Button
          style={{ margin: 5 }}
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              tileManager.current.generateClippedReprojTile(
                `tile-${x}/${y}/${l}-reproj-clipped`,
                tileProcesserRef.current.provider,
                x,
                y,
                l,
                tileProcesserRef.current,
                defaultClippedPolygon
              );
              updateTilesTable();
            }
          }}
        >
          Add Clipped Reprojected Tile
        </Button>
      </div>
      {/* canvas2D处理普通瓦片 */}
      <canvas
        style={{
          display: "none",
        }}
        ref={processCanvasRef}
      ></canvas>
    </>
  );
}

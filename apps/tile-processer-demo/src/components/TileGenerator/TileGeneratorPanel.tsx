import {
  Cartesian3,
  Matrix3,
  Matrix4,
  Quaternion,
  Viewer,
  Math as CMath,
} from "cesium";
import clsx from "clsx";
import { CSSProperties, RefObject, useEffect, useRef, useState } from "react";
import CesiumTileProcesser from "tile-processer-webgl";
import { NeatTable, Button } from "qhw-ui-demo";
import { CustomTileManager } from "../../utils/customTileManager";
import "./index.css";

type TileGeneratorPanelProps = {
  style?: CSSProperties;
  className?: string;
  viewerRef: RefObject<Viewer | null>;
  tileProcesserRef: RefObject<CesiumTileProcesser | undefined>;
};

function TileGeneratorPanel(props: TileGeneratorPanelProps) {
  const { style: userStyle, className, viewerRef, tileProcesserRef } = props;
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const tileManager = useRef<CustomTileManager | null>();
  const updateTimer = useRef<number>();
  const isRotating = useRef<boolean>(false);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [l, setL] = useState(0);
  const [tableData, setTableData] = useState<Array<Array<any>>>([[]]);
  const [showTable, setShowTable] = useState<boolean>(true);

  /* 新建瓦片管理器和渲染触发器 */
  useEffect(() => {
    if (
      viewerRef.current &&
      tileProcesserRef.current &&
      processCanvasRef.current
    ) {
      tileManager.current = new CustomTileManager(viewerRef.current);
      /* 特殊的刷新（如旋转等）速率定为25帧 */
      updateTimer.current = setInterval(() => {
        if (isRotating.current && tileManager.current) {
          let dif = 1;
          for (let id in tileManager.current.tilePrimitives) {
            //通过转轴和角度，创建一个四元数
            const rotationQuaternion = Quaternion.fromAxisAngle(
              Cartesian3.fromDegrees(-60.0, 30.0), //绕原点到0，0的轴旋转（根据经纬度生成空间笛卡尔坐标，原理就是生成了一个原点到表面对应经纬度位置的向量）
              CMath.toRadians(0.1 * dif++) //转30度
            );
            // 为每个瓦片赋予不同的速度
            if (dif === 10) {
              dif = 1;
            }
            const rotationMartrix3 = Matrix3.fromQuaternion(rotationQuaternion);
            const rotationMartrix4 = Matrix4.fromRotation(rotationMartrix3);
            const primitive = tileManager.current.tilePrimitives[id].primitive;
            if (primitive)
              primitive.modelMatrix = Matrix4.multiply(
                primitive.modelMatrix,
                rotationMartrix4,
                new Matrix4()
              );
          }
        }
        viewerRef.current?.scene.requestRender(); // 通知Cesium重新渲染结果
      }, 1000 / 60);
    }
    return () => {
      /* 清空所有图元，释放瓦片管理器空间 */
      tileManager.current?.removeAll();
      tileManager.current = null;
      /* 消除计时器 */
      clearInterval(updateTimer.current);
    };
  }, []);

  function updateTilesTable() {
    if (tileManager.current && tileManager.current.tilePrimitives) {
      const dataArray: Array<Array<any>> = [];
      const oriData = tileManager.current.tilePrimitives;
      for (let id in tileManager.current.tilePrimitives) {
        const row: Array<any> = [];
        // id
        row.push(id);
        // xyl
        row.push(
          `${oriData[id].tileXYL.x}/${oriData[id].tileXYL.y}/${oriData[id].tileXYL.level}`
        );
        // 显影按钮
        row.push(
          oriData[id].shown ? (
            <Button
              level="secondary"
              onClick={() => {
                oriData[id].shown = false;
                updateTilesTable();
              }}
            >
              Fade
            </Button>
          ) : (
            <Button
              level="secondary"
              onClick={() => {
                oriData[id].shown = true;
                updateTilesTable();
              }}
            >
              Show
            </Button>
          )
        );
        // 删除按钮
        row.push(
          <Button
            level="secondary"
            onClick={() => {
              tileManager.current?.removeById(id);
              viewerRef.current?.scene.requestRender();
              updateTilesTable();
            }}
          >
            Delete
          </Button>
        );
        // 压入一整行
        dataArray.push(row);
      }
      setTableData(dataArray);
    }
  }

  return (
    <div className={clsx(className)} style={{ ...userStyle }}>
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
                [
                  0.0, 0.33, 0.66, 0.33, 0.66, 0.0, 1.0, 0.5, 0.66, 1.0, 0.66,
                  0.66, 0.0, 0.66, 0.0, 0.33,
                ]
              );
              updateTilesTable();
            }
          }}
        >
          Add Clipped Reprojected Tile
        </Button>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "left",
          width: "100%",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 5 }}>Controller: </h3>
        <Button
          style={{ margin: 5 }}
          onClick={() => {
            setShowTable(!showTable);
            viewerRef.current?.scene.requestRender(); // 通知Cesium重新渲染
          }}
        >
          Fade/Show Table
        </Button>
      </div>
      <div
        className={"div-scroll-x"}
        style={{
          maxWidth: "100%",
          maxHeight: `${showTable ? "" : "100px"}`,
          marginBottom: 20,
          overflowY: `${showTable ? "hidden" : "auto"}`,
        }}
      >
        <NeatTable
          style={{ color: "black" }}
          head={["Id", "Index", "Show", "Delete"]}
          body={tableData}
        />
      </div>
      <h3 style={{ marginBottom: 10 }}>Stress Tests: </h3>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              let lt = 9;
              for (let xt = 80; xt < 130; xt++) {
                for (let yt = 190; yt < 210; yt++) {
                  tileManager.current.generateReprojTile(
                    `tile-${xt}/${yt}/${lt}-reproj`,
                    tileProcesserRef.current.provider,
                    xt,
                    yt,
                    lt,
                    tileProcesserRef.current
                  );
                }
              }
            }
            updateTilesTable();
          }}
        >
          Add 1000 Reprojected Tiles
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              let lt = 9;
              for (let xt = 80; xt < 130; xt++) {
                for (let yt = 190; yt < 210; yt++) {
                  tileManager.current.generateClippedReprojTile(
                    `tile-${xt}/${yt}/${lt}-reproj-clipped`,
                    tileProcesserRef.current.provider,
                    xt,
                    yt,
                    lt,
                    tileProcesserRef.current,
                    [
                      0.0, 0.33, 0.66, 0.33, 0.66, 0.0, 1.0, 0.5, 0.66, 1.0,
                      0.66, 0.66, 0.0, 0.66, 0.0, 0.33,
                    ]
                  );
                }
              }
            }
            updateTilesTable();
          }}
        >
          Add 1000 Clipped Reprojected Tiles
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              isRotating.current = !isRotating.current;
              /* viewerRef.current.scene.preUpdate.addEventListener(() => {
                if (tileManager.current)
                  for (let id in tileManager.current.tilePrimitives) {
                    //通过转轴和角度，创建一个四元数
                    const rotationQuaternion = Quaternion.fromAxisAngle(
                      Cartesian3.fromDegrees(-60.0, 30.0), //绕原点到0，0的轴旋转（根据经纬度生成空间笛卡尔坐标，原理就是生成了一个原点到表面对应经纬度位置的向量）
                      CMath.toRadians(1.0 * Math.random()) //转30度
                    );
                    const rotationMartrix3 =
                      Matrix3.fromQuaternion(rotationQuaternion);
                    const rotationMartrix4 =
                      Matrix4.fromRotation(rotationMartrix3);
                    const primitive =
                      tileManager.current.tilePrimitives[id].primitive;
                    if (primitive)
                      primitive.modelMatrix = Matrix4.multiply(
                        primitive.modelMatrix,
                        rotationMartrix4,
                        new Matrix4()
                      );
                  }
              }); */
            }
          }}
        >
          Start/Stop Rotation
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              processCanvasRef.current &&
              tileManager.current
            ) {
              tileManager.current.removeAll();
              viewerRef.current.scene.requestRender(); // 通知Cesium重新渲染
              updateTilesTable();
            }
          }}
        >
          Clear All Tiles
        </Button>
      </div>
      {/* canvas2D处理普通瓦片 */}
      <canvas
        style={{
          display: "none",
        }}
        ref={processCanvasRef}
      ></canvas>
    </div>
  );
}

export default TileGeneratorPanel;

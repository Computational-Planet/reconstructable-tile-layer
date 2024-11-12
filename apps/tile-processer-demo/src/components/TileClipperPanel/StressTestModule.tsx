import { Button } from "qhw-ui-demo";
import { useContext, useEffect, useRef } from "react";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import {
  Quaternion,
  Cartesian3,
  Matrix3,
  Matrix4,
  Math as CMath,
} from "cesium";
import { CustomTileManager } from "../../utils/CustomTileManager";
import { DefaultProvider } from "../../App";

interface StressTestModuleProps {
  updateTilesTable: () => void; // 更新表格用的函数
  defaultClippedPolygon: Array<number>;
}

export default function StressTestModule(props: StressTestModuleProps) {
  const { updateTilesTable, defaultClippedPolygon } = props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef, tileProcesserRef, tileManagerRef } = context;
  const isRotating = useRef<boolean>(false);
  const updateTimer = useRef<number>();

  /* 新建瓦片管理器和渲染触发器 */
  useEffect(() => {
    if (viewerRef.current && tileProcesserRef.current) {
      tileManagerRef.current = new CustomTileManager(viewerRef.current);
      /* 特殊的刷新（如旋转等）速率定为25帧 */
      updateTimer.current = setInterval(() => {
        if (isRotating.current && tileManagerRef.current) {
          //let dif = 1;
          tileManagerRef.current.tilePrimitives.forEach((value, id) => {
            const rotationQuaternion = Quaternion.fromAxisAngle(
              Cartesian3.fromDegrees(-60.0, 30.0), //绕原点到0，0的轴旋转（根据经纬度生成空间笛卡尔坐标，原理就是生成了一个原点到表面对应经纬度位置的向量）
              CMath.toRadians(0.1 /*  * dif++ */) //转30度
            );
            // 为每个瓦片赋予不同的速度
            /* if (dif === 10) {
              dif = 1;
            } */
            const rotationMartrix3 = Matrix3.fromQuaternion(rotationQuaternion);
            const rotationMartrix4 = Matrix4.fromRotation(rotationMartrix3);
            const primitive =
              value.primitive;
            if (primitive)
              primitive.modelMatrix = Matrix4.multiply(
                primitive.modelMatrix,
                rotationMartrix4,
                new Matrix4()
              );
          })
        }
        viewerRef.current?.scene.requestRender(); // 通知Cesium重新渲染结果
      }, 1000 / 60);
    }
    return () => {
      /* 清空所有图元，释放瓦片管理器空间 */
      tileManagerRef.current?.removeAll();
      tileManagerRef.current = null;
      /* 消除计时器 */
      clearInterval(updateTimer.current);
    };
  }, []);

  return (
    <>
      <h3 style={{ marginBottom: 10 }}>Stress Tests: </h3>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              tileManagerRef.current
            ) {
              let lt = 9;
              for (let xt = 80; xt < 130; xt++) {
                for (let yt = 190; yt < 210; yt++) {
                  tileManagerRef.current.generateReprojTile(
                    `tile-${xt}/${yt}/${lt}-reproj`,
                    DefaultProvider,
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
              tileManagerRef.current
            ) {
              let lt = 9;
              for (let xt = 80; xt < 130; xt++) {
                for (let yt = 190; yt < 210; yt++) {
                  tileManagerRef.current.generateClippedReprojTile(
                    `tile-${xt}/${yt}/${lt}-reproj-clipped`,
                    DefaultProvider,
                    xt,
                    yt,
                    lt,
                    tileProcesserRef.current,
                    defaultClippedPolygon
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
              tileManagerRef.current
            ) {
              isRotating.current = !isRotating.current;
            }
          }}
        >
          Start/Stop Rotation
        </Button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Button
          onClick={() => {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              tileManagerRef.current
            ) {
              tileManagerRef.current.removeAll();
              viewerRef.current.scene.requestRender(); // 通知Cesium重新渲染
              updateTilesTable();
            }
          }}
        >
          Clear All Tiles
        </Button>
      </div>
    </>
  );
}

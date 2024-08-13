import {
  CSSProperties,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Cartographic,
  defined,
  ScreenSpaceEventHandler,
  Math as CesiumMath,
  ScreenSpaceEventType,
} from "cesium";
import CesiumRefContext from "../contexts/CesiumRefContext";
function GeoInfoBox(props: { style?: CSSProperties }): ReactNode {
  const { style: userStyle } = props;

  //获取上下文
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef } = context;

  const [lon, setLon] = useState(" --- °");
  const [lat, setLat] = useState(" --- °");
  const [cameraHeight, setCameraHeight] = useState("");

  useEffect(() => {
    if (viewerRef && viewerRef.current) {
      try {
        const viewer = viewerRef.current;
        // 第一次加载时就初始化一次高程
        let cheight = viewer.camera.positionCartographic.height;
        if (cheight > 10000) {
          setCameraHeight((cheight / 1000).toFixed(3) + "km");
        } else setCameraHeight(cheight.toFixed(3) + "m");
        // 添加鼠标移动事件监听器
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(function (movement: any) {
          let cartesian = viewer.scene.pickPosition(movement.endPosition);
          if (defined(cartesian)) {
            let cartographic = Cartographic.fromCartesian(cartesian);
            setLon(
              CesiumMath.toDegrees(cartographic.longitude).toFixed(5) + "°"
            );
            setLat(
              CesiumMath.toDegrees(cartographic.latitude).toFixed(5) + "°"
            );
          } else {
            //如果当前鼠标在椭球体外则显示" --- °"
            setLon(" --- " + "°");
            setLat(" --- " + "°");
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);
        viewer.scene.camera.moveEnd.addEventListener(function () {
          // 视图改变时的回调,更改高程
          let cheight = viewer.camera.positionCartographic.height;
          if (cheight > 10000) {
            setCameraHeight((cheight / 1000).toFixed(3) + "km");
          } else setCameraHeight(cheight.toFixed(3) + "m");
        });
      } catch (e) {
        console.log(e);
      }
    }
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: 260,
        background:
          "linear-gradient(0deg,#272527,rgba(37, 37, 39, 0.8) 52.08%,rgba(37, 37, 39, 0))",
        color: "white",
        fontSize: 15,
        fontWeight: 300,
        border: "none",
        boxSizing: "border-box",
        //borderRadius: 10,
        padding: 15,
        paddingBottom: 5,
        textAlign: "left",
        ...userStyle,
      }}
    >
      <div style={{ fontFamily: "cursive", textShadow: "2px 2px 0px black" }}>
        <div>Camera Height:{cameraHeight}</div>
        <div>
          Lon:{lon}Lat:{lat}
        </div>
      </div>
    </div>
  );
}

export default GeoInfoBox;

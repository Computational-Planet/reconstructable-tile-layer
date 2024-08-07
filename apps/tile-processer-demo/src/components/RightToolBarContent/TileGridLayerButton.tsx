import { GlobalOutlined } from "@ant-design/icons";
import clsx from "clsx";
import { ToolBarButton } from "qhw-ui-demo";
import { CSSProperties, useContext, useRef } from "react";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { ImageryLayer, TileCoordinatesImageryProvider } from "cesium";
import { DefaultProvider } from "../../App";

type TileGridLayerButtonProps = {
  style?: CSSProperties;
  className?: string;
};

function TileGridLayerButton(props: TileGridLayerButtonProps) {
  const { style: userStyle, className } = props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef } = context;

  const tileGridLayerRef = useRef<ImageryLayer | null>();

  return (
    <ToolBarButton
      style={{ ...userStyle }}
      className={clsx(className)}
      icon={<GlobalOutlined />}
      onActive={() => {
        if (viewerRef.current) {
          tileGridLayerRef.current = new ImageryLayer(
            new TileCoordinatesImageryProvider({
              tilingScheme: DefaultProvider.tilingScheme,
            })
          );
          viewerRef.current.imageryLayers.add(tileGridLayerRef.current);
        }
      }}
      onClose={() => {
        if (viewerRef.current && tileGridLayerRef.current) {
          viewerRef.current.imageryLayers.remove(tileGridLayerRef.current);
          tileGridLayerRef.current = null;
        }
      }}
    ></ToolBarButton>
  );
}

export default TileGridLayerButton;

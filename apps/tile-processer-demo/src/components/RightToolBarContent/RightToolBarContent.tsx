import clsx from "clsx";
import { CSSProperties } from "react";
import TileGridLayerButton from "./TileGridLayerButton";
import SceneModeToggleButton from "./SceneModeToggleButton";

type RightToolBarContentProps = {
  style?: CSSProperties;
  className?: string;
  //viewerRef: RefObject<Viewer | null>;
  //tileProcesserRef: RefObject<CesiumTileProcesser | undefined>;
};

function RightToolBarContent(props: RightToolBarContentProps) {
  const { style: userStyle, className } = props;
  return (
    <div
      style={{ margin: 0, padding: 0, ...userStyle }}
      className={clsx(className)}
    >
      <TileGridLayerButton />
      <SceneModeToggleButton />
    </div>
  );
}

export default RightToolBarContent;

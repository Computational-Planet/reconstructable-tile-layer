import { CSSProperties, useContext, useEffect, useState } from "react";
import clsx from "clsx";
import { SceneMode } from "cesium";
import { ToolBarButton } from "qhw-ui-demo";
import CesiumRefContext from "../../contexts/CesiumRefContext";

type SceneModeToggleButtonProps = {
  style?: CSSProperties;
  className?: string;
};

function SceneModeToggleButton(props: SceneModeToggleButtonProps) {
  const { style: userStyle, className } = props;
  const context = useContext(CesiumRefContext);
  const [is2DLikeMode, setIs2DLikeMode] = useState(false);

  useEffect(() => {
    const viewer = context?.viewerRef.current;
    if (!viewer) {
      return;
    }

    const syncMode = (mode = viewer.scene.mode) => {
      setIs2DLikeMode(mode !== SceneMode.SCENE3D);
    };

    syncMode();
    const removeMorphStart = viewer.scene.morphStart.addEventListener(
      (_transitioner: unknown, _previousMode: SceneMode, targetMode: SceneMode) => {
        syncMode(targetMode);
      }
    );
    const removeMorphComplete = viewer.scene.morphComplete.addEventListener(
      (_transitioner: unknown, _previousMode: SceneMode, targetMode: SceneMode) => {
        syncMode(targetMode);
      }
    );

    return () => {
      removeMorphStart();
      removeMorphComplete();
    };
  }, [context]);

  if (context === undefined) {
    return null;
  }

  const { viewerRef } = context;

  return (
    <ToolBarButton
      style={{ ...userStyle }}
      className={clsx(className)}
      active={is2DLikeMode}
      icon={
        <span style={{ fontSize: 11, fontWeight: 700 }}>
          {is2DLikeMode ? "2D" : "3D"}
        </span>
      }
      title={is2DLikeMode ? "切换到 3D" : "切换到 2D"}
      onActive={() => {
        if (viewerRef.current) {
          setIs2DLikeMode(true);
          viewerRef.current.scene.morphTo2D(0.6);
          viewerRef.current.scene.requestRender();
        }
      }}
      onClose={() => {
        if (viewerRef.current) {
          setIs2DLikeMode(false);
          viewerRef.current.scene.morphTo3D(0.6);
          viewerRef.current.scene.requestRender();
        }
      }}
    ></ToolBarButton>
  );
}

export default SceneModeToggleButton;

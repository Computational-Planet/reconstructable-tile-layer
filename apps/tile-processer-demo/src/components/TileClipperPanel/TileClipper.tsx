import clsx from "clsx";
import { CSSProperties, useContext, useState } from "react";
import { NeatTable, Button } from "qhw-ui-demo";
import "./index.css";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import AddTilesModule from "./AddTilesModule";
import StressTestModule from "./StressTestModule";
import OtherTestModule from "./OtherTestModule";

const defaultClippedPolygon = [
  0.0, 0.33, 0.5, 0.33, 0.5, 0.0, 1.0, 0.5, 0.5, 1.0, 0.5, 0.66, 0.0, 0.66, 0.0,
  0.33,
];

type TileClipperProps = {
  style?: CSSProperties;
  className?: string;
  //viewerRef: RefObject<Viewer | null>;
  //tileProcesserRef: RefObject<CesiumTileProcesser | undefined>;
};

function TileClipper(props: TileClipperProps) {
  const { style: userStyle, className /* ,viewerRef, tileProcesserRef */ } =
    props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef, tileManager } = context;

  //const tileManager = useRef<CustomTileManager | null>();

  const [tableData, setTableData] = useState<Array<Array<any>>>([[]]);
  const [showTable, setShowTable] = useState<boolean>(true);

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
      <AddTilesModule
        updateTilesTable={updateTilesTable}
        defaultClippedPolygon={defaultClippedPolygon}
      />
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
      <StressTestModule
        updateTilesTable={updateTilesTable}
        defaultClippedPolygon={defaultClippedPolygon}
      />
      <OtherTestModule updateTilesTable={updateTilesTable} />
    </div>
  );
}

export default TileClipper;

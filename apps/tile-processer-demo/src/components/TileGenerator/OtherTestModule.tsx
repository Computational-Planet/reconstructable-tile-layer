import { useContext, useEffect, useRef, useState } from "react";
import CesiumRefContext from "../../contexts/CesiumRefContext";
import { Button } from "qhw-ui-demo";
import {
  Primitive,
  GeometryInstance,
  PolygonGeometry,
  PolygonHierarchy,
  Cartesian3,
  ArcType,
  EllipsoidSurfaceAppearance,
  Material,
  Color,
} from "cesium";
import { QuadTreeTileProcesser } from "polygon-tile-quadtree";

interface OtherTestModuleProps {
  updateTilesTable: () => void; // 更新表格用的函数
}

export default function OtherTestModule(props: OtherTestModuleProps) {
  const { updateTilesTable } = props;
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef, tileProcesserRef, tileManager, quadTreeTileProcesserRef } =
    context;

  const [clipL, setClipL] = useState(6);
  const [doubleRoot, setDoubleRoot] = useState<boolean>(false);
  const comparedPolygon = useRef<Primitive | null>();

  useEffect(() => {
    if (tileProcesserRef.current) {
      quadTreeTileProcesserRef.current = !doubleRoot
        ? new QuadTreeTileProcesser(
            tileProcesserRef.current.provider,
            tileProcesserRef.current,
            [
              -72.0, 40.0, -80.0, 37.0, -88.0, 38.0, -88.0, 34.0, -75.0, 32.0,
              -70.0, 32.0, -74.0, 33.0, -68.0, 36.0, -73.0, 38.0, -68.0, 40.0,
              -72.0, 40.0,
            ],
            { x: 4, y: 6, l: 4 }
          )
        : new QuadTreeTileProcesser(
            tileProcesserRef.current.provider,
            tileProcesserRef.current,
            [
              -72.0, 40.0, -80.0, 37.0, -88.0, 38.0, -88.0, 34.0, -75.0, 32.0,
              -70.0, 32.0, -74.0, 33.0, -68.0, 36.0, -73.0, 38.0, -68.0, 40.0,
              -72.0, 40.0,
            ],
            { x: 8, y: 12, l: 5 },
            { x: 9, y: 12, l: 5 }
          );
    }
  }, [doubleRoot]);

  return (
    <>
      <h3 style={{ marginBottom: 10 }}>Other Tests: </h3>
      <div style={{ marginBottom: 10 }}>
        <label style={{ marginRight: 10 }}>Clip By Level:</label>
        <input
          style={{ width: 40, marginRight: 10 }}
          type="number"
          value={clipL}
          onChange={(e) => {
            setClipL(e.target.valueAsNumber);
          }}
        ></input>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Button
          onClick={() => {
            if (tileProcesserRef.current && quadTreeTileProcesserRef.current) {
              console.log("clipPolygon-op");
              console.log(clipL);
              const tileArray =
                quadTreeTileProcesserRef.current.findTilesByLevel(
                  clipL,
                  [] // 用于存放瓦片信息输出结果的空数组
                );
              console.log(tileArray);
              for (let i = 0; i < tileArray.length; i++) {
                if (tileArray[i].polygon !== null) {
                  tileManager.current?.generateClippedReprojTile(
                    `Clip-QuadTreetile-${tileArray[i].tileXYL.x}/${tileArray[i].tileXYL.y}/${tileArray[i].tileXYL.l}`,
                    tileProcesserRef.current.provider,
                    tileArray[i].tileXYL.x,
                    tileArray[i].tileXYL.y,
                    tileArray[i].tileXYL.l,
                    tileProcesserRef.current,
                    tileArray[i].polygon!
                  );
                } else {
                  tileManager.current?.generateReprojTile(
                    `Full-QuadTreetile-${tileArray[i].tileXYL.x}/${tileArray[i].tileXYL.y}/${tileArray[i].tileXYL.l}`,
                    tileProcesserRef.current.provider,
                    tileArray[i].tileXYL.x,
                    tileArray[i].tileXYL.y,
                    tileArray[i].tileXYL.l,
                    tileProcesserRef.current
                  );
                }
              }
              updateTilesTable();
            }
          }}
        >
          Test Polygon Clip
        </Button>{" "}
        <Button
          level="secondary"
          onClick={() => {
            setDoubleRoot(!doubleRoot);
          }}
        >
          Change Root
        </Button>
      </div>
      <Button
        style={{ marginBottom: 10 }}
        onClick={() => {
          if (
            viewerRef.current &&
            tileProcesserRef.current &&
            tileManager.current
          ) {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              tileManager.current
            ) {
              if (!comparedPolygon.current) {
                comparedPolygon.current = new Primitive({
                  geometryInstances: new GeometryInstance({
                    /* geometry: new RectangleGeometry({
                    rectangle: Rectangle.fromDegrees(-120.0, 20.0, -60.0, 40.0),
                    vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
                  }), */
                    id: "test-polygon",
                    geometry: new PolygonGeometry({
                      polygonHierarchy: new PolygonHierarchy(
                        Cartesian3.fromDegreesArray([
                          0.5, 0.5, 0.5, 85.0, 180.0, 0.5, 0.5, 0.5,
                        ])
                      ),
                      arcType: ArcType.RHUMB,
                    }),
                  }),
                  appearance: new EllipsoidSurfaceAppearance({
                    //aboveGround: true,
                    material: Material.fromType("Color", {
                      color: new Color(1.0, 0.0, 0.0, 0.1),
                    }),
                  }),
                });
                viewerRef.current.scene.primitives.add(comparedPolygon.current);
              } else {
                viewerRef.current.scene.primitives.remove(
                  comparedPolygon.current
                );
                comparedPolygon.current = null;
              }
              viewerRef.current.scene.requestRender();
            }
          }
        }}
      >
        Add/Clear Compared Polygon with Clipped Tile0/0/0
      </Button>
    </>
  );
}

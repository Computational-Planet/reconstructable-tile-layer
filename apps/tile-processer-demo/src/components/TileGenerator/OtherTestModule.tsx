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
import {
  clipPolygonByQuadTreeNodes,
  QuadTreeTileProcesser,
} from "polygon-tile-quadtree";
import { NodeInfo } from "polygon-tile-quadtree/dist/typings/QuadTreeTileNode";

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
  const comparedPolygon = useRef<Primitive | null>();

  useEffect(() => {
    if (tileProcesserRef.current) {
      quadTreeTileProcesserRef.current = new QuadTreeTileProcesser(
        tileProcesserRef.current.provider,
        tileProcesserRef.current,
        [
          -72.0, 40.0, -80.0, 37.0, -90.0, 38.0, -90.0, 33.0, -75.0, 30.0,
          -70.0, 30.0, -74.0, 32.0, -68.0, 35.0, -73.0, 38.0, -68.0, 40.0,
          -72.0, 40.0,
        ],
        { x: 4, y: 6, l: 4 }
      );
    }
  });

  return (
    <>
      <h3 style={{ marginBottom: 10 }}>Other Tests: </h3>

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
        <Button
          onClick={() => {
            if (tileProcesserRef.current && quadTreeTileProcesserRef.current) {
              const tileArray =
                quadTreeTileProcesserRef.current.findTilesByLevel(
                  clipL,
                  [] // 用于存放瓦片信息输出结果的空数组
                );
              console.log("clipPolygon-op");
              console.log(tileArray);
              for (let i = 0; i < tileArray.length; i++) {
                tileManager.current?.generateClippedReprojTile(
                  `QuadTreetile-${tileArray[i].tileXYL.x}/${tileArray[i].tileXYL.y}/${tileArray[i].tileXYL.l}`,
                  tileProcesserRef.current.provider,
                  tileArray[i].tileXYL.x,
                  tileArray[i].tileXYL.y,
                  tileArray[i].tileXYL.l,
                  tileProcesserRef.current,
                  tileArray[i].polygon
                );
              }
              updateTilesTable();
            }
          }}
        >
          Test Polygon Clip
        </Button>
      </div>
    </>
  );
}

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
import { defaultClippedPolygon } from "./TileClipperPanel";
import { DefaultProvider } from "../../App";

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
  const {
    viewerRef,
    tileProcesserRef,
    tileManagerRef,
    quadTreeTileProcesserRef,
  } = context;

  const [clipL, setClipL] = useState(3);
  const [doubleRoot, setDoubleRoot] = useState<boolean>(false);
  const comparedPolygon = useRef<Primitive | null>();

  useEffect(() => {
    if (tileProcesserRef.current) {
      quadTreeTileProcesserRef.current = new QuadTreeTileProcesser(
        DefaultProvider.tilingScheme,
        /* [
          -72.0, 40.0, -80.0, 37.0, -88.0, 38.0, -88.0, 34.0, -75.0, 32.0,
          -70.0, 32.0, -74.0, 33.0, -68.0, 36.0, -73.0, 38.0, -68.0, 40.0,
          -72.0, 40.0,
        ], */
        /* [
          -175, 80, -177, 80, -179, 80, 160, 80, -160, 70, 150, 70, 130, 75, 100, 80, 50, 75, 0, 75, -50, 80, -100, 75, -150, 80, -175, 80
        ], */
        [// 包含极点+穿越180
          150, 80, 170, 80,// 穿越1
          -170, 80, -170, 70,// 穿越2
          170, 70, 170, 65,// 穿越3
          -170, 65, -170, 60,// 穿越4
          170, 60, 170, 55,// 穿越4
          -160, 55,//收尾
          -160, 80, -150, 80, -100, 80, -50, 80, 0, 80, 50, 80, 100, 80, 150, 80
        ],
      )
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
                  tileManagerRef.current?.generateClippedReprojTile(
                    `${i}-Clip-QuadTreetile-${tileArray[i].tileXYL.x}/${tileArray[i].tileXYL.y}/${tileArray[i].tileXYL.l}`,
                    DefaultProvider,
                    tileArray[i].tileXYL.x,
                    tileArray[i].tileXYL.y,
                    tileArray[i].tileXYL.l,
                    tileProcesserRef.current,
                    tileArray[i].polygon!
                  );
                } else {
                  tileManagerRef.current?.generateReprojTile(
                    `${i}-Full-QuadTreetile-${tileArray[i].tileXYL.x}/${tileArray[i].tileXYL.y}/${tileArray[i].tileXYL.l}`,
                    DefaultProvider,
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
            tileManagerRef.current
          ) {
            if (
              viewerRef.current &&
              tileProcesserRef.current &&
              tileManagerRef.current
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
                        Cartesian3.fromDegreesArray(
                          defaultClippedPolygon.map((item, index) => {
                            const rec =
                              DefaultProvider.tilingScheme.tileXYToNativeRectangle(
                                0,
                                0,
                                0
                              );
                            if (index % 2 === 0) {
                              // x坐标
                              console.log(
                                (rec.east - rec.west) * item + rec.west
                              );
                              return (rec.east - rec.west) * item + rec.west;
                            } else {
                              // y坐标
                              console.log(
                                (rec.north - rec.south) * item + rec.south
                              );
                              return (rec.north - rec.south) * item + rec.south;
                            }
                          })
                        )
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

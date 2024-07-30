import { useContext, useRef } from "react";
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

interface OtherTestModuleProps {}

export default function OtherTestModule(props: OtherTestModuleProps) {
  const context = useContext(CesiumRefContext);
  if (context === undefined) {
    // 处理 context 为 undefined 的情况
    return null;
  }
  const { viewerRef, tileProcesserRef, tileManager } = context;
  const comparedPolygon = useRef<Primitive | null>();
  return (
    <>
      <h3 style={{ marginBottom: 10 }}>Other Tests: </h3>
      <div style={{ marginBottom: 10 }}>
        <Button
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
                  viewerRef.current.scene.primitives.add(
                    comparedPolygon.current
                  );
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
      </div>
    </>
  );
}

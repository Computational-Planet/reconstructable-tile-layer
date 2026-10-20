import {
  Cartesian2,
  Cartesian3,
  Color,
  LabelCollection,
  LabelStyle,
  Material,
  Math as CesiumMath,
  OrthographicFrustum,
  PolylineCollection,
  PrimitiveCollection,
  SceneMode,
  type Label,
  type Viewer,
} from "cesium";

import {
  createGraticuleLines,
  formatGraticuleLabel,
  getGraticuleHeight,
  type GraticuleLine,
} from "./graticuleGeometry";

type CoordinateLabel = Pick<GraticuleLine, "axis" | "degrees"> & { label: Label };

/** 参考 dde-earth Graticule 的显隐接口，独立管理几何、标签及场景资源。 */
export class GraticuleOverlay {
  private primitives: PrimitiveCollection | null = null;
  private coordinateLabels: CoordinateLabel[] = [];
  private removePreRender: (() => void) | null = null;
  private destroyed = false;

  constructor(private readonly viewer: Viewer) {}

  show() {
    if (this.destroyed || this.viewer.isDestroyed()) return;
    if (!this.primitives) this.createPrimitives();
    this.primitives!.show = true;
    // preRender 同时覆盖相机移动、投影切换和输出尺寸变化，不改写相机全局参数。
    this.removePreRender ??= this.viewer.scene.preRender.addEventListener(this.updateLabels);
    this.viewer.scene.requestRender();
  }

  hide() {
    this.removePreRender?.();
    this.removePreRender = null;
    if (this.destroyed || this.viewer.isDestroyed()) return;
    if (this.primitives) this.primitives.show = false;
    this.viewer.scene.requestRender();
  }

  destroy() {
    if (this.destroyed) return;
    this.hide();
    if (this.primitives && !this.primitives.isDestroyed()) {
      if (!this.viewer.isDestroyed()) {
        this.viewer.scene.primitives.remove(this.primitives);
      } else {
        this.primitives.destroy();
      }
    }
    this.primitives = null;
    this.coordinateLabels = [];
    this.destroyed = true;
  }

  private createPrimitives() {
    const { scene } = this.viewer;
    const primitives = new PrimitiveCollection();
    this.primitives = scene.primitives.add(primitives);
    const polylines = primitives.add(new PolylineCollection()) as PolylineCollection;
    const labels = primitives.add(new LabelCollection({ scene })) as LabelCollection;
    for (const line of createGraticuleLines(scene.globe.ellipsoid)) {
      const highlighted = line.degrees === 0 || Math.abs(line.degrees) === 180;
      polylines.add({
        positions: line.positions,
        width: highlighted ? 1.5 : 1,
        material: Material.fromType("Color", {
          color: highlighted ? Color.YELLOW.withAlpha(0.75) : Color.WHITE.withAlpha(0.5),
        }),
      });
      // 30° 网格逐线标注，使坐标标签与经纬网间隔保持一致。
      const label = labels.add({
        position: line.positions[0],
        text: formatGraticuleLabel(line.axis, line.degrees),
        font: "12px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: line.axis === "latitude" ? new Cartesian2(0, -8) : new Cartesian2(8, 0),
      });
      this.coordinateLabels.push({ axis: line.axis, degrees: line.degrees, label });
    }
  }

  private updateLabels = () => {
    const { scene, camera } = this.viewer;
    if (scene.mode === SceneMode.MORPHING) return;
    const ellipsoid = scene.globe.ellipsoid;
    const center = camera.pickEllipsoid(
      // 避开视野中心恰好落在反经线或极点时的标签接缝和交叉重叠。
      new Cartesian2(scene.canvas.clientWidth / 2 + 24, scene.canvas.clientHeight / 2 - 24),
      ellipsoid,
    );
    const cartographic = center
      ? ellipsoid.cartesianToCartographic(center)
      : camera.positionCartographic;
    const longitude = CesiumMath.toDegrees(cartographic.longitude);
    const latitude = CesiumMath.clamp(CesiumMath.toDegrees(cartographic.latitude), -70, 70);
    const height = getGraticuleHeight(ellipsoid);
    const normal = new Cartesian3();
    const toCamera = new Cartesian3();
    for (const entry of this.coordinateLabels) {
      const position = Cartesian3.fromDegrees(
        entry.axis === "longitude" ? entry.degrees : longitude,
        entry.axis === "latitude" ? entry.degrees : latitude,
        height,
        ellipsoid,
      );
      entry.label.position = position;
      entry.label.show = true;
      if (scene.mode === SceneMode.SCENE3D) {
        ellipsoid.geodeticSurfaceNormal(position, normal);
        if (camera.frustum instanceof OrthographicFrustum) {
          Cartesian3.negate(camera.directionWC, toCamera);
        } else {
          Cartesian3.subtract(camera.positionWC, position, toCamera);
          Cartesian3.normalize(toCamera, toCamera);
        }
        // 主动隐藏背面及轮廓附近的标签，避免默认地球深度设置造成文字穿透或挤在边缘。
        entry.label.show = Cartesian3.dot(normal, toCamera) > 0.2;
      }
    }
  };
}

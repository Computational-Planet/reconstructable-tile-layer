import {
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource,
  type Property,
  type Viewer,
} from "cesium";
import type { GeoJsonDocument } from "./geojson";

/** 原生矢量适配器只管理 DataSource，不涉及 imagery provider、瓦片或 RTL。 */
export class NativeGeoJsonLayer {
  readonly dataSource: GeoJsonDataSource;
  private disposed = false;
  private colors: { base: Color; property: ConstantProperty }[] = [];
  private opacity = 1;
  private appliedOpacity?: number;
  private visible = true;

  constructor(
    private viewer: Viewer,
    name: string,
  ) {
    this.dataSource = new GeoJsonDataSource(name);
    this.dataSource.show = false;
  }

  async load(data: GeoJsonDocument) {
    try {
      await this.dataSource.load(data, {
        markerColor: Color.fromCssColorString("#f59e0b"),
        stroke: Color.fromCssColorString("#f59e0b"),
        fill: Color.fromCssColorString("#f59e0b").withAlpha(0.3),
        strokeWidth: 2,
        clampToGround: false,
      });
      if (this.disposed || this.viewer.isDestroyed()) return;
      const colorProperty = (original?: Property, fallback = Color.WHITE) => {
        const base = Color.clone(original?.getValue(this.viewer.clock.currentTime) ?? fallback);
        const property = new ConstantProperty(base);
        this.colors.push({ base, property });
        return property;
      };
      // 每个实体保留自己的原始 alpha，避免共享材质及多次拖动引起透明度累乘。
      for (const entity of this.dataSource.entities.values) {
        if (entity.billboard) entity.billboard.color = colorProperty(entity.billboard.color);
        if (entity.polyline?.material instanceof ColorMaterialProperty)
          entity.polyline.material = new ColorMaterialProperty(
            colorProperty(entity.polyline.material.color),
          );
        if (entity.polygon) {
          entity.polygon.outlineColor = colorProperty(entity.polygon.outlineColor, Color.BLACK);
          if (entity.polygon.material instanceof ColorMaterialProperty)
            entity.polygon.material = new ColorMaterialProperty(
              colorProperty(entity.polygon.material.color),
            );
        }
      }
      this.present(this.visible, this.opacity);
      await this.viewer.dataSources.add(this.dataSource);
      // add 即使接收实例也异步完成；删除/导入期间完成的旧任务不能重新留在场景中。
      if (this.disposed || this.viewer.isDestroyed()) this.detach();
      else this.viewer.scene.requestRender();
    } finally {
      if (this.disposed || this.viewer.isDestroyed()) {
        this.dataSource.entities.removeAll();
        this.colors = [];
      }
    }
  }

  present(visible: boolean, opacity: number, name?: string) {
    if (this.disposed) return;
    this.visible = visible;
    this.dataSource.show = visible;
    if (name !== undefined) this.dataSource.name = name;
    this.opacity = opacity;
    // 年代轴只需修改整层 show；透明度未变时不遍历所有要素或分配新颜色。
    if (!this.colors.length || this.appliedOpacity === opacity) return;
    this.appliedOpacity = opacity;
    for (const { base, property } of this.colors)
      property.setValue(base.withAlpha(base.alpha * opacity));
  }

  async focus() {
    if (!this.disposed && !this.viewer.isDestroyed())
      await this.viewer.flyTo(this.dataSource, { duration: 0.5 });
  }

  private detach() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.dataSource, true);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.dataSource.show = false;
    this.detach();
    this.dataSource.entities.removeAll();
    this.colors = [];
  }
}

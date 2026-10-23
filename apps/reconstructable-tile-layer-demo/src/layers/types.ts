import type { TileServiceConfig, ProviderKey } from "../cesium/providers";
import type { LocalRasterDescriptor, ModelSelection } from "../raster/context";
import type { LocalGeoJsonDescriptor } from "../vector/geojson";

export type LayerMode = "reconstructable" | "static";
/** level 使用指定层级；view 根据当前视图自动选择层级。 */
export type TileLoadMode = "level" | "view";
export type AgeRange = { youngestMa: number; oldestMa: number };
export type LayerSource =
  | { kind: "service"; config: TileServiceConfig; exampleKey?: ProviderKey }
  | { kind: "local"; descriptor: LocalRasterDescriptor }
  | { kind: "geojson"; descriptor: LocalGeoJsonDescriptor };

/** Demo 的可保存配置；Cesium / RTL 实例只存在于运行时，不进入 JSON 或 React state。 */
export interface LayerDefinition {
  id: string;
  name: string;
  mode: LayerMode;
  source: LayerSource;
  model?: ModelSelection;
  modelRequiresReselect?: boolean;
  visible: boolean;
  opacity: number;
  ageRange: AgeRange | null;
  /** 重建图层的加载方式；普通图层由 Cesium 自动管理加载。 */
  loadMode: TileLoadMode;
  /** 按层级加载时使用；按视图加载会自动选级，不使用此值。 */
  level: number;
}

export interface LayerView extends LayerDefinition {
  status: "unloaded" | "needs-file" | "loading" | "ready" | "error";
  message: string;
  effectiveVisible: boolean;
}

export interface LayerSnapshot {
  /** 影像各组按从底到顶保存；矢量单独分组，列表顺序不表示几何遮挡关系。 */
  layers: LayerView[];
  selectedId: string | null;
}

export type NewLayer = Omit<LayerDefinition, "id">;

export function layerGroup(layer: Pick<LayerDefinition, "source" | "mode">) {
  return layer.source.kind === "geojson"
    ? "vector"
    : layer.mode === "static"
      ? "imagery"
      : "reconstructable";
}

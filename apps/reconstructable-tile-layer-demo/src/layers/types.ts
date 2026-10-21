import type { TileServiceConfig, ProviderKey } from "../cesium/providers";
import type { LocalRasterDescriptor, ModelSelection } from "../raster/context";

export type LayerMode = "reconstructable" | "static";
export type AgeRange = { youngestMa: number; oldestMa: number };
export type LayerSource =
  | { kind: "service"; config: TileServiceConfig; exampleKey?: ProviderKey }
  | { kind: "local"; descriptor: LocalRasterDescriptor };

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
  /** 重建图层的手动加载层级；普通图层保留此字段用于兼容导出，由 Cesium 自动选择 LOD。 */
  level: number;
}

export interface LayerView extends LayerDefinition {
  status: "unloaded" | "needs-file" | "loading" | "ready" | "error";
  message: string;
  effectiveVisible: boolean;
}

export interface LayerSnapshot {
  /** 从底到顶保存：普通影像在下、重建图层在上，各组内部可换位。 */
  layers: LayerView[];
  selectedId: string | null;
}

export type NewLayer = Omit<LayerDefinition, "id">;

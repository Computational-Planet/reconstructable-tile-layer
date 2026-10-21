import { useEffect, useState, type MutableRefObject } from "react";
import type { ReconstructableTileLayer } from "reconstructable-tile-layer";
import type { RasterImageryProvider } from "rtl-raster-imagery-provider";
import { getServiceLabel, type ProviderKey, type TileServiceConfig } from "../cesium/providers";
import type { LocalRasterDescriptor, ModelSelection } from "../raster/context";
import type { LayerController } from "./LayerController";
import type { LayerMode, LayerSnapshot } from "./types";

interface Options {
  controllerRef: MutableRefObject<LayerController | null>;
  managerRef: MutableRefObject<ReconstructableTileLayer | null>;
  age: number;
  setLevel(level: number): void;
  setStatus(message: string): void;
}

/** React 只保存视图快照；异步任务和所有资源由 controller 管理。 */
export function useLayerManager({ controllerRef, managerRef, age, setLevel, setStatus }: Options) {
  const [snapshot, setSnapshot] = useState<LayerSnapshot>({ layers: [], selectedId: null });
  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(
    () =>
      controllerRef.current?.subscribe((next) => {
        managerRef.current = controllerRef.current?.selectedManager ?? null;
        setSnapshot(next);
      }),
    [controllerRef, managerRef],
  );
  useEffect(() => {
    controllerRef.current?.setAge(age);
  }, [age, controllerRef]);
  const selected = snapshot.layers.find((layer) => layer.id === snapshot.selectedId) ?? null;
  useEffect(() => {
    if (selected) setLevel(selected.level);
    // 用户编辑加载层级时不要被一次年代/进度更新覆盖。
  }, [snapshot.selectedId]);

  const addService = async (
    config: TileServiceConfig,
    exampleKey: ProviderKey,
    model: ModelSelection,
    mode: LayerMode,
    level: number,
  ) => {
    const controller = controllerRef.current;
    if (!controller) {
      setStatus("Viewer runtime is unavailable. Reload the demo after an exclusive benchmark.");
      return;
    }
    const resolvedLevel = Math.max(config.minimumLevel, Math.min(level, config.maximumLevel ?? 24));
    const id = await controller.add({
      name: getServiceLabel(config),
      source: { kind: "service", config, exampleKey },
      mode,
      model: mode === "reconstructable" ? model : undefined,
      visible: true,
      opacity: 1,
      ageRange: null,
      level: resolvedLevel,
    });
    setPanelOpen(true);
    setStatus(
      id
        ? "Layer added. Manage it in the Layers panel."
        : "Layer could not be prepared. See its status in Layers.",
    );
  };

  const addRaster = async (
    provider: RasterImageryProvider,
    descriptor: LocalRasterDescriptor,
    model: ModelSelection,
    release: () => void,
    signal: AbortSignal,
  ): Promise<string | null> => {
    const controller = controllerRef.current;
    if (!controller || signal.aborted) {
      release();
      return null;
    }
    const restoration = controller.snapshot.layers.find(
      (layer) =>
        layer.id === controller.snapshot.selectedId &&
        layer.source.kind === "local" &&
        layer.status === "needs-file",
    );
    const mode =
      descriptor.context.role === "modern-reconstructable" ? "reconstructable" : "static";
    if (restoration && restoration.mode !== mode) {
      release();
      throw new Error(
        `The selected layer uses ${restoration.mode} coordinates. Choose the matching scientific use before restoring.`,
      );
    }
    const snapshotAge = descriptor.context.displayAgeMa;
    // 重选文件只恢复数据；已保存的逐层模型不能被左侧为下一层准备的模型覆盖。
    const preserveModel = restoration && !restoration.modelRequiresReselect;
    const layerModel = preserveModel ? restoration.model : model;
    const restoredDescriptor =
      preserveModel && restoration.source.kind === "local"
        ? {
            ...descriptor,
            context: { ...descriptor.context, model: restoration.source.descriptor.context.model },
          }
        : descriptor;
    const id = await controller.add(
      {
        name: descriptor.file.name,
        mode,
        source: { kind: "local", descriptor: restoredDescriptor },
        model: mode === "reconstructable" ? layerModel : undefined,
        visible: true,
        opacity: 1,
        ageRange: snapshotAge === null ? null : { youngestMa: snapshotAge, oldestMa: snapshotAge },
        level: provider.recommendedReconstructionLevel,
      },
      { provider, release },
      restoration?.id,
    );
    if (signal.aborted && id) {
      controller.remove(id);
      return null;
    }
    setPanelOpen(true);
    setStatus(
      id
        ? "Raster layer added. Existing layers are retained."
        : "Raster could not be prepared. See Layers.",
    );
    return id;
  };
  return {
    ...snapshot,
    selected,
    panelOpen,
    setPanelOpen,
    addService,
    addRaster,
    busy: selected?.status === "loading",
    stats: managerRef.current?.getRuntimeStats() ?? null,
  };
}

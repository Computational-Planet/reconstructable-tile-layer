import { ImageryLayer, PrimitiveCollection, type ImageryProvider, type Viewer } from "cesium";
import { ReconstructableTileLayer, type PrimitiveTransformMode } from "reconstructable-tile-layer";
import type { WebGLTileProcessor } from "rtl-webgl-tile-processor";
import { createTileServiceProvider } from "../cesium/providers";
import { resolveDemoAssetUrl } from "../utils/demoAssetUrl";
import { isLayerVisible, validateAgeRange } from "./temporal";
import type { LayerDefinition, LayerSnapshot, LayerView, NewLayer } from "./types";
import { makeScientificContext, type ModelSelection } from "../raster/context";

export interface SuppliedLayerSource {
  provider: ImageryProvider;
  /** Called once after scene references are detached. Includes provider and source leases. */
  release(): void;
}
interface Runtime {
  parent?: PrimitiveCollection;
  source: SuppliedLayerSource;
  rtl?: ReconstructableTileLayer;
  imagery?: ImageryLayer;
  initialization?: Promise<void>;
  coverage?: string;
}
interface Entry {
  definition: LayerDefinition;
  status: LayerView["status"];
  message: string;
  runtime?: Runtime;
  operation: number;
}

/** Demo 图层业务的唯一所有者。UI、时间规则与来源描述不进入 RTL 包。 */
export class LayerController {
  private entries: Entry[] = [];
  private listeners = new Set<(snapshot: LayerSnapshot) => void>();
  private root = new PrimitiveCollection();
  private disposed = false;
  private age = 0;
  private selectedId: string | null = null;
  private mode: PrimitiveTransformMode = "dynamic3D";

  constructor(
    private viewer: Viewer,
    private processor: WebGLTileProcessor,
  ) {
    viewer.scene.primitives.add(this.root);
  }

  get selected() {
    return this.find(this.selectedId);
  }
  get selectedManager() {
    return this.selected?.runtime?.rtl ?? null;
  }
  get firstManager() {
    return this.entries.find((entry) => entry.runtime?.rtl)?.runtime?.rtl ?? null;
  }
  get hasLayers() {
    return this.entries.length > 0;
  }
  get snapshot(): LayerSnapshot {
    return {
      selectedId: this.selectedId,
      layers: this.entries.map((entry) => ({
        ...entry.definition,
        status: entry.status,
        message: entry.message,
        effectiveVisible: isLayerVisible(entry.definition, this.age),
      })),
    };
  }
  get definitions() {
    return this.entries.map((entry) => structuredClone(entry.definition));
  }
  private find(id: string | null) {
    return this.entries.find((entry) => entry.definition.id === id);
  }
  private current(entry: Entry) {
    return !this.disposed && this.entries.includes(entry);
  }
  private emit() {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(this.snapshot);
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender();
  }
  subscribe(listener: (snapshot: LayerSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }
  select(id: string) {
    if (this.find(id)) {
      this.selectedId = id;
      this.emit();
    }
  }

  async add(definition: NewLayer, source?: SuppliedLayerSource, restoreId?: string) {
    if (this.disposed) {
      source?.release();
      return null;
    }
    const restored = restoreId ? this.find(restoreId) : undefined;
    const entry: Entry = {
      definition: {
        ...structuredClone(definition),
        id: restored?.definition.id ?? crypto.randomUUID(),
        ...(restored
          ? {
              name: restored.definition.name,
              visible: restored.definition.visible,
              opacity: restored.definition.opacity,
              ageRange: restored.definition.ageRange,
              level: restored.definition.level,
            }
          : {}),
      },
      status: "loading",
      message: "Preparing source…",
      operation: 0,
    };
    if (restored) {
      this.releaseRuntime(restored);
      this.entries.splice(this.entries.indexOf(restored), 1, entry);
    } else {
      // 原生影像在 Globe 通道绘制，RTL 在其上绘制；列表顺序必须反映实际叠放关系。
      const firstReconstruction = this.entries.findIndex(
        (candidate) => candidate.definition.mode === "reconstructable",
      );
      if (definition.mode === "static" && firstReconstruction >= 0)
        this.entries.splice(firstReconstruction, 0, entry);
      else this.entries.push(entry);
    }
    this.selectedId = entry.definition.id;
    this.emit();
    try {
      await this.initialize(entry, source);
      if (!this.current(entry)) return null;
      entry.status = "ready";
      entry.message =
        entry.definition.mode === "static"
          ? "Tiles load automatically with the view."
          : "Ready. Load tiles for this layer.";
      this.emit();
      return this.current(entry) ? entry.definition.id : null;
    } catch (error) {
      if (this.current(entry)) {
        entry.status = "error";
        entry.message = error instanceof Error ? error.message : String(error);
        if (!entry.runtime) source?.release();
        this.releaseRuntime(entry);
        this.emit();
      }
      return null;
    }
  }

  private async initialize(entry: Entry, supplied?: SuppliedLayerSource) {
    if (entry.runtime) return entry.runtime.initialization;
    const definition = entry.definition;
    if (definition.mode === "reconstructable" && definition.modelRequiresReselect)
      throw new Error("Reselect the local plate model on the left, then use it for this layer.");
    if (!supplied && definition.source.kind === "local")
      throw new Error(
        "Reselect this local file in Source settings, then restore the selected layer.",
      );
    if (
      definition.mode === "reconstructable" &&
      (!definition.model?.featureUrl || !definition.model.rotationUrls.length)
    )
      throw new Error(
        "Choose plate domains and rotation files before adding a reconstruction layer.",
      );
    let source = supplied;
    if (!source) {
      if (definition.source.kind !== "service") return;
      const provider = createTileServiceProvider(definition.source.config, {
        ellipsoid: this.viewer.scene.globe.ellipsoid,
      });
      source = {
        provider,
        release: () => (provider as ImageryProvider & { destroy?: () => void }).destroy?.(),
      };
    }
    const originalSource = source;
    let released = false;
    source = {
      provider: source.provider,
      release: () => {
        if (released) return;
        released = true;
        originalSource.release();
      },
    };
    const runtime: Runtime = { source };
    entry.runtime = runtime;
    runtime.initialization = (async () => {
      if (definition.mode === "static") {
        // 普通图层直接交给 Cesium：视野选片、LOD、请求与纹理生命周期均由原生影像系统管理。
        runtime.imagery = new ImageryLayer(source.provider, {
          alpha: definition.opacity,
          show: isLayerVisible(definition, this.age),
          rectangle: source.provider.rectangle,
        });
        this.viewer.imageryLayers.add(runtime.imagery);
      } else {
        runtime.parent = this.root.add(new PrimitiveCollection()) as PrimitiveCollection;
        runtime.parent.show = isLayerVisible(definition, this.age);
        const model = definition.model!;
        runtime.rtl = new ReconstructableTileLayer({
          provider: source.provider,
          processor: this.processor,
          featureSource: {
            url: resolveDemoAssetUrl(model.featureUrl),
            polygonRenderIntent:
              model.polygonRenderIntent === "classified" ? "classified" : "all-polygons-area",
          },
          rotationSources: model.rotationUrls.map(resolveDemoAssetUrl),
          anchorPlateId: model.anchorPlateId,
          initialAge: this.age,
          referenceEllipsoid: this.viewer.scene.globe.ellipsoid,
          primitiveCollection: runtime.parent,
          orderedRendering: true,
          clearProcessorOnReset: false,
          opacity: definition.opacity,
          primitiveTransformMode: this.mode,
          tileRequestConcurrency: 8,
        });
        await runtime.rtl.initialize();
        if (!this.current(entry) || entry.runtime !== runtime) return;
        runtime.rtl.bindSceneModeSync(this.viewer);
        // 初始化期间仍可拖动时间轴，新图层必须采用最新年代。
        await runtime.rtl.setReconstructionAge(this.age);
      }
    })();
    await runtime.initialization;
    if (this.current(entry) && entry.runtime === runtime) {
      this.syncPresentation();
      this.syncOrder();
    }
  }

  private syncPresentation() {
    for (const entry of this.entries) {
      const runtime = entry.runtime;
      if (!runtime) continue;
      const visible = isLayerVisible(entry.definition, this.age);
      if (runtime.parent && !runtime.parent.isDestroyed()) runtime.parent.show = visible;
      if (runtime.rtl) runtime.rtl.opacity = entry.definition.opacity;
      if (runtime.imagery) {
        runtime.imagery.show = visible;
        runtime.imagery.alpha = entry.definition.opacity;
      }
    }
  }

  private syncOrder() {
    // 仅在添加或换位时更新集合顺序，避免拖动年代/透明度时反复触发影像重排。
    for (const { runtime } of this.entries) {
      if (runtime?.parent) this.root.raiseToTop(runtime.parent);
      if (runtime?.imagery) this.viewer.imageryLayers.raiseToTop(runtime.imagery);
    }
  }

  update(
    id: string,
    patch: Partial<Pick<LayerDefinition, "name" | "visible" | "opacity" | "ageRange" | "level">>,
  ) {
    const entry = this.find(id);
    if (!entry) return;
    const next = { ...entry.definition, ...patch };
    const error = validateAgeRange(next.ageRange);
    if (error) throw new Error(error);
    if (!Number.isFinite(next.opacity) || next.opacity < 0 || next.opacity > 1)
      throw new Error("Opacity must be between 0 and 1.");
    if (!next.name.trim()) throw new Error("Supply a layer name.");
    entry.definition = next;
    this.syncPresentation();
    this.emit();
  }
  move(id: string, direction: "up" | "down") {
    const index = this.entries.findIndex((entry) => entry.definition.id === id);
    const target = index + (direction === "up" ? 1 : -1);
    if (index < 0 || target < 0 || target >= this.entries.length) return;
    if (this.entries[index].definition.mode !== this.entries[target].definition.mode) return;
    [this.entries[index], this.entries[target]] = [this.entries[target], this.entries[index]];
    this.syncOrder();
    this.emit();
  }
  setAge(age: number) {
    if (!Number.isFinite(age) || age < 0 || age > 1800) return;
    this.age = age;
    this.syncPresentation();
    for (const entry of this.entries) {
      void entry.runtime?.rtl
        ?.setReconstructionAge(age)
        .then(() => {
          if (this.current(entry) && this.age === age) this.emit();
        })
        .catch((error: unknown) => {
          if (this.current(entry) && this.age === age) {
            entry.message = error instanceof Error ? error.message : String(error);
            this.emit();
          }
        });
    }
    this.emit();
  }
  async load(id: string, level: number, inView = false) {
    const entry = this.find(id);
    if (!entry || entry.definition.mode !== "reconstructable" || entry.status === "loading") return;
    const token = ++entry.operation;
    entry.status = "loading";
    entry.message = inView ? "Loading current view…" : `Loading L${level}…`;
    this.emit();
    try {
      await this.initialize(entry);
      if (!this.current(entry) || token !== entry.operation) return;
      const runtime = entry.runtime!;
      const provider = runtime.source.provider;
      if (
        !Number.isInteger(level) ||
        level < (provider.minimumLevel ?? 0) ||
        level > (provider.maximumLevel ?? 24)
      )
        throw new Error(`Choose L${provider.minimumLevel ?? 0}–L${provider.maximumLevel ?? 24}.`);
      if (runtime.rtl) {
        const coverage = inView ? "view" : `level:${level}`;
        // RTL 可累积多个 LOD；图层透明度要求同一来源在同一区域只混合一次。
        // 切换覆盖时只清本层图元，保留共享处理器的原始瓦片缓存。
        if (runtime.coverage && (inView || runtime.coverage !== coverage))
          runtime.rtl.clear(this.viewer);
        runtime.coverage = coverage;
        if (inView)
          await runtime.rtl.refineTilesForView(this.viewer, {
            minLevel: Math.min(2, provider.maximumLevel ?? 2),
          });
        else await runtime.rtl.loadSourceTilesAtLevel(this.viewer, level);
        if (!this.current(entry) || token !== entry.operation) return;
        await runtime.rtl.setReconstructionAge(this.age);
      }
      if (!this.current(entry) || token !== entry.operation) return;
      entry.definition = { ...entry.definition, level };
      entry.status = "ready";
      entry.message = inView ? "Current view loaded." : `L${level} loaded.`;
    } catch (error) {
      if (!this.current(entry) || token !== entry.operation) return;
      if (entry.runtime?.rtl && !entry.runtime.rtl.ready) this.releaseRuntime(entry);
      entry.status =
        entry.definition.source.kind === "local" && !entry.runtime ? "needs-file" : "error";
      entry.message = error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }
  async activateImagery(id: string) {
    const entry = this.find(id);
    if (!entry || entry.definition.mode !== "static" || entry.status === "loading") return;
    entry.status = "loading";
    entry.message = "Preparing imagery…";
    this.emit();
    try {
      await this.initialize(entry);
      if (!this.current(entry)) return;
      entry.status = "ready";
      entry.message = "Tiles load automatically with the view.";
    } catch (error) {
      if (!this.current(entry)) return;
      this.releaseRuntime(entry);
      entry.status = entry.definition.source.kind === "local" ? "needs-file" : "error";
      entry.message = error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }
  clear(id: string) {
    const entry = this.find(id);
    if (!entry || entry.definition.mode !== "reconstructable") return;
    entry.operation++;
    entry.runtime?.rtl?.clear(this.viewer);
    if (entry.runtime) entry.runtime.coverage = undefined;
    entry.status = entry.runtime ? "ready" : entry.status;
    entry.message = "Tiles cleared.";
    this.emit();
  }
  updateModel(id: string, model: ModelSelection) {
    const entry = this.find(id);
    if (!entry || entry.definition.mode !== "reconstructable") return;
    // 本地 provider 由本层持有，换模型时不能关闭；只重建 RTL 与图元容器。
    const supplied = entry.runtime?.source;
    if (entry.runtime) entry.runtime.source = { ...entry.runtime.source, release: () => {} };
    this.releaseRuntime(entry);
    entry.definition = {
      ...entry.definition,
      model: structuredClone(model),
      modelRequiresReselect: false,
    };
    if (entry.definition.source.kind === "local") {
      const descriptor = entry.definition.source.descriptor;
      const previous = descriptor.context;
      descriptor.context = makeScientificContext(
        {
          ...previous,
          displayAge: previous.displayAgeMa === null ? "" : String(previous.displayAgeMa),
          modelConfirmed: true,
        },
        model,
      );
    }
    if (supplied) {
      entry.status = "loading";
      void this.initialize(entry, supplied)
        .then(() => {
          if (this.current(entry)) {
            entry.status = "ready";
            entry.message = "Model applied. Reload tiles.";
            this.emit();
          }
        })
        .catch((error: unknown) => {
          if (!entry.runtime) supplied.release();
          if (this.current(entry)) {
            this.releaseRuntime(entry);
            entry.status = "error";
            entry.message = error instanceof Error ? error.message : String(error);
            this.emit();
          }
        });
    } else {
      entry.status = entry.definition.source.kind === "local" ? "needs-file" : "unloaded";
      entry.message = "Model applied. Load or restore this layer.";
    }
    this.emit();
  }
  async setTransformMode(mode: PrimitiveTransformMode) {
    this.mode = mode;
    await Promise.all(
      this.entries.map((entry) => entry.runtime?.rtl?.setPrimitiveTransformMode(this.viewer, mode)),
    );
    this.emit();
  }
  private releaseRuntime(entry: Entry) {
    entry.operation++;
    const runtime = entry.runtime;
    if (!runtime) return;
    entry.runtime = undefined;
    runtime.rtl?.destroy(this.viewer);
    if (runtime.imagery) this.viewer.imageryLayers.remove(runtime.imagery, true);
    if (runtime.parent && !this.root.isDestroyed()) this.root.remove(runtime.parent);
    if (runtime.rtl) this.processor.clearProvider(runtime.source.provider);
    runtime.source.release();
  }
  remove(id: string) {
    const entry = this.find(id);
    if (!entry) return;
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.releaseRuntime(entry);
    if (this.selectedId === id)
      this.selectedId = this.entries[this.entries.length - 1]?.definition.id ?? null;
    this.emit();
  }
  restore(definitions: LayerDefinition[]) {
    for (const entry of this.entries) this.releaseRuntime(entry);
    // 旧配置允许两种绘制路径交错；导入时保留各组内部顺序，按原生绘制关系分组。
    const ordered = [
      ...definitions.filter((definition) => definition.mode === "static"),
      ...definitions.filter((definition) => definition.mode === "reconstructable"),
    ];
    this.entries = ordered.map((definition) => ({
      definition: structuredClone(definition),
      operation: 0,
      status: definition.source.kind === "local" ? "needs-file" : "unloaded",
      message:
        definition.source.kind === "local"
          ? "Reselect local file to restore."
          : "Load this layer to restore it.",
    }));
    this.selectedId = this.entries[this.entries.length - 1]?.definition.id ?? null;
    this.emit();
    for (const entry of this.entries) {
      if (entry.definition.mode === "static" && entry.definition.source.kind === "service")
        void this.activateImagery(entry.definition.id);
    }
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries) this.releaseRuntime(entry);
    this.entries = [];
    this.listeners.clear();
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.root);
  }
}

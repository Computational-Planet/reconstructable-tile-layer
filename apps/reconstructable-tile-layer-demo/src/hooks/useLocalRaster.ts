import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ImageryLayer,
  Rectangle,
  type ImageryProvider,
  type Viewer,
} from "cesium";
import {
  getGeographicBounds,
  openRasterSource,
  type RasterSource,
} from "rtl-raster-source";
import type {
  NetCDFDataset,
  NetCDFSliceLayout,
} from "rtl-raster-source/netcdf";
import {
  RasterImageryProvider,
  type RasterStyle,
} from "rtl-raster-imagery-provider";
import type {
  RasterConversionResult,
  RasterConverter,
} from "rtl-raster-converter";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import { downloadBlob } from "../utils/downloads";
import {
  describeLocalRaster,
  emptyRasterContext,
  makeScientificContext,
  stringifyScientific,
  type LocalRasterDescriptor,
  type ModelSelection,
  type RasterContextDraft,
  type ScientificRasterContext,
} from "../raster/context";

interface RasterEntry {
  file: File;
  dataset?: NetCDFDataset;
  source?: RasterSource;
  convertedFrom?: LocalRasterDescriptor;
}
interface AppliedRaster {
  provider: RasterImageryProvider;
  layer?: ImageryLayer;
  context: ScientificRasterContext;
  descriptor: LocalRasterDescriptor;
  modelKey: string;
}
export interface RasterStyleDraft {
  kind: "single-band" | "rgb";
  bands: [number, number, number];
  range: "preview" | "manual";
  min: string;
  max: string;
  palette: "gray" | "blue-brown" | "blue-red";
  additionalNoData: string;
}
const initialStyle: RasterStyleDraft = {
  kind: "single-band",
  bands: [0, 1, 2],
  range: "preview",
  min: "0",
  max: "1",
  palette: "gray",
  additionalNoData: "",
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function makeStyle(draft: RasterStyleDraft): RasterStyle {
  const additionalNoData = draft.additionalNoData.trim()
    ? draft.additionalNoData.split(",").map((value) => {
        if (!value.trim() || !Number.isFinite(Number(value)))
          throw new Error(
            "Additional NoData values must be comma-separated raw numbers.",
          );
        return Number(value);
      })
    : undefined;
  const domain: [number, number] | undefined =
    draft.range === "manual"
      ? [Number(draft.min), Number(draft.max)]
      : undefined;
  if (
    domain &&
    (!draft.min.trim() ||
      !draft.max.trim() ||
      !domain.every(Number.isFinite) ||
      domain[0] >= domain[1])
  )
    throw new Error(
      "The display range needs finite values with maximum greater than minimum.",
    );
  return draft.kind === "rgb"
    ? {
        kind: "rgb",
        bands: draft.bands,
        domains: domain ? [domain, domain, domain] : undefined,
        additionalNoData,
      }
    : {
        kind: "single-band",
        band: draft.bands[0],
        domain,
        additionalNoData,
        colors:
          draft.palette === "blue-brown"
            ? [
                [20, 60, 120, 255],
                [90, 160, 190, 255],
                [240, 230, 185, 255],
                [130, 80, 40, 255],
              ]
            : draft.palette === "blue-red"
              ? [
                  [35, 80, 155, 255],
                  [245, 245, 240, 255],
                  [175, 45, 40, 255],
                ]
              : undefined,
      };
}
function resolvedStyle(provider: RasterImageryProvider): RasterStyle {
  const { style } = provider;
  return style.kind === "single-band"
    ? {
        kind: "single-band",
        band: style.bands[0],
        domain: style.domains[0],
        colors: style.colors,
        additionalNoData: style.additionalNoData,
      }
    : {
        kind: "rgb",
        bands: [...style.bands] as [number, number, number],
        domains: [...style.domains] as [
          [number, number],
          [number, number],
          [number, number],
        ],
        additionalNoData: style.additionalNoData,
      };
}

interface Options {
  viewerRef: MutableRefObject<Viewer | null>;
  age: number;
  setAge: (age: number) => void;
  setLevel: (level: number) => void;
  model: ModelSelection;
  clearReconstruction: () => void;
  applyReconstruction: (provider: ImageryProvider) => Promise<boolean>;
}

export function useLocalRaster(options: Options) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const [entry, setEntry] = useState<RasterEntry | null>(null);
  const entryRef = useRef<RasterEntry | null>(null);
  const [applied, setApplied] = useState<AppliedRaster | null>(null);
  const appliedRef = useRef<AppliedRaster | null>(null);
  const [context, setContext] =
    useState<RasterContextDraft>(emptyRasterContext);
  const [style, setStyle] = useState<RasterStyleDraft>(initialStyle);
  const [variable, setVariable] = useState("");
  const [indices, setIndices] = useState<Record<string, number>>({});
  const [coordinates, setCoordinates] = useState<
    Record<string, readonly number[]>
  >({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Choose a local GeoTIFF or NetCDF file. Processing stays in this browser.",
  );
  const [conversion, setConversion] = useState<RasterConversionResult | null>(
    null,
  );
  const conversionOrigin = useRef<LocalRasterDescriptor>();
  const [grid, setGrid] = useState({
    bounds: "-180, -90, 180, 90",
    width: 720,
    height: 360,
    confirmed: false,
  });
  const operation = useRef<AbortController | null>(null);
  const converter = useRef<RasterConverter | null>(null);
  const alive = useRef(true);
  const modelKey = JSON.stringify(options.model);

  const releaseApplied = (
    managerAlreadyDetached = false,
    updateState = true,
  ) => {
    const current = appliedRef.current;
    if (!current) return;
    const viewer = callbacks.current.viewerRef.current;
    // 先让场景/RTL 失去引用，再终止 provider 的读取；dataset 由导入会话独立拥有。
    if (
      !managerAlreadyDetached &&
      current.context.role === "modern-reconstructable"
    )
      callbacks.current.clearReconstruction();
    if (current.layer && viewer && !viewer.isDestroyed())
      viewer.imageryLayers.remove(current.layer, true);
    current.provider.destroy();
    appliedRef.current = null;
    if (updateState) setApplied(null);
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  };
  const closeEntry = (current: RasterEntry | null) => {
    current?.source?.close();
    current?.dataset?.close();
  };
  const replaceEntry = (next: RasterEntry) => {
    releaseApplied();
    const previous = entryRef.current;
    if (previous?.source !== next.source) previous?.source?.close();
    if (previous?.dataset !== next.dataset) previous?.dataset?.close();
    entryRef.current = next;
    setEntry(next);
    setStyle(initialStyle);
    setConversion(null);
    conversionOrigin.current = undefined;
    if (next.source) {
      const metadata = next.source.metadata;
      setGrid({
        bounds: getGeographicBounds(metadata).join(", "),
        width: metadata.width,
        height: metadata.height,
        confirmed: false,
      });
    }
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      converter.current?.dispose();
      // Cesium runtime 的清理负责 manager；这里释放本地文件与独立图层。
      releaseApplied(true, false);
      closeEntry(entryRef.current);
      entryRef.current = null;
    };
  }, []);

  useEffect(() => {
    const current = appliedRef.current;
    if (
      current?.context.role === "modern-reconstructable" &&
      current.modelKey !== modelKey
    ) {
      releaseApplied();
      setContext((draft) => ({ ...draft, modelConfirmed: false }));
      setStatus(
        "Plate model settings changed. Confirm the frame and apply the raster again.",
      );
    }
  }, [modelKey]);

  useEffect(() => {
    const current = appliedRef.current;
    const viewer = options.viewerRef.current;
    if (current?.layer && viewer && !viewer.isDestroyed()) {
      current.layer.show =
        current.context.role !== "paleo-snapshot" ||
        current.context.displayAgeMa === options.age;
      viewer.scene.requestRender();
    }
  }, [options.age, applied]);

  const run = async (task: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try {
      await task(controller.signal);
    } catch (error) {
      if (alive.current)
        setStatus(
          controller.signal.aborted
            ? "Operation cancelled. The file can be used again."
            : message(error),
        );
    } finally {
      if (operation.current === controller) operation.current = null;
      if (alive.current) setBusy(false);
    }
  };

  const selectVariable = (
    name: string,
    dataset = entryRef.current?.dataset,
  ) => {
    setVariable(name);
    setCoordinates({});
    try {
      const layout = dataset?.describeVariable(name);
      setIndices(
        Object.fromEntries(
          layout?.selectors.map((selector) => [selector.dimension, 0]) ?? [],
        ),
      );
    } catch {
      setIndices({});
    }
  };

  const open = (file: File | null) => {
    if (!file) return Promise.resolve();
    return run(async (signal) => {
      setStatus(`Reading ${file.name} metadata…`);
      let next: RasterEntry | undefined;
      try {
        // 用文件签名区分 NetCDF/HDF5 和 TIFF，扩展名仅用于文件选择提示。
        const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        signal.throwIfAborted();
        const isNC =
          (signature[0] === 67 && signature[1] === 68 && signature[2] === 70) ||
          signature[0] === 137;
        if (isNC) {
          const { openNetCDFSource } = await import("rtl-raster-source/netcdf");
          signal.throwIfAborted();
          next = { file, dataset: await openNetCDFSource(file, { signal }) };
        } else
          next = { file, source: await openRasterSource(file, { signal }) };
        signal.throwIfAborted();
        replaceEntry(next);
        setContext({ ...emptyRasterContext });
        const variables =
          next.dataset?.metadata.variables.filter(
            (candidate) => candidate.shape.length >= 2,
          ) ?? [];
        const preferred =
          variables.find((candidate) => {
            try {
              next!.dataset!.describeVariable(candidate.name);
              return true;
            } catch {
              return false;
            }
          }) ?? variables[0];
        selectVariable(preferred?.name ?? "", next.dataset);
        setStatus(
          next.dataset
            ? "Select a variable and time/depth indices, then read the slice."
            : "File ready. Choose its scientific use, then apply the raster.",
        );
      } catch (error) {
        if (next && next !== entryRef.current) closeEntry(next);
        throw error;
      }
    });
  };

  let layout: NetCDFSliceLayout | undefined;
  let layoutError = "";
  if (entry?.dataset && variable) {
    try {
      layout = entry.dataset.describeVariable(variable);
    } catch (error) {
      layoutError = message(error);
    }
  }
  const slicePending =
    !!entry?.dataset &&
    (entry.source?.metadata.slice?.variable !== variable ||
      JSON.stringify(entry.source?.metadata.slice?.indices) !==
        JSON.stringify(indices));

  const readSlice = () =>
    run(async (signal) => {
      const current = entryRef.current;
      if (!current?.dataset || !layout)
        throw new Error(layoutError || "Choose a spatial variable.");
      setStatus(`Reading ${variable} slice…`);
      const source = await current.dataset.selectSlice({
        variable,
        indices,
        signal,
      });
      if (signal.aborted) {
        source.close();
        signal.throwIfAborted();
      }
      replaceEntry({ ...current, source });
      const coordinateValues: Record<string, readonly number[]> = {};
      for (const selector of layout.selectors) {
        // 只读有界的一维选择轴；大轴仍按原始下标选片，不把模型日历转成公历日期。
        if (selector.coordinate && selector.size <= 10000) {
          coordinateValues[selector.dimension] = Array.from(
            await current.dataset.readCoordinate(selector.coordinate.name, {
              signal,
            }),
          );
        }
      }
      signal.throwIfAborted();
      setCoordinates(coordinateValues);
      setStatus(
        `Slice ready: ${variable}. Values retain their original units and CF scaling.`,
      );
    });

  const apply = () =>
    run(async (signal) => {
      const current = entryRef.current;
      if (!current?.source || slicePending)
        throw new Error("Read the selected slice before applying it.");
      const scientificContext = makeScientificContext(context, options.model);
      const viewer = options.viewerRef.current;
      if (!viewer || viewer.isDestroyed())
        throw new Error("Viewer is not ready.");
      setStatus("Preparing imagery from the selected numeric source…");
      const provider = await RasterImageryProvider.fromSource(current.source, {
        style: makeStyle(style),
        signal,
        ellipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
        credit: current.file.name,
      });
      let layer: ImageryLayer | undefined;
      try {
        signal.throwIfAborted();
        if (scientificContext.role === "modern-reconstructable") {
          if (modelKey !== JSON.stringify(callbacks.current.model))
            throw new Error(
              "Plate model settings changed. Apply the raster again.",
            );
          const initialized =
            await callbacks.current.applyReconstruction(provider);
          // 初始化会替换旧 manager；失败时也不能继续把旧来源标记为正在重建。
          releaseApplied(true);
          if (!initialized)
            throw new Error(
              "Plate model initialization failed. See the reconstruction status.",
            );
          if (modelKey !== JSON.stringify(callbacks.current.model)) {
            callbacks.current.clearReconstruction();
            throw new Error(
              "Plate model settings changed. Apply the raster again.",
            );
          }
          if (signal.aborted) {
            callbacks.current.clearReconstruction();
            signal.throwIfAborted();
          }
          // 低分辨率源先用 L2，较细源先用 L3；源像元较少也不强制回退到 L0/L1。
          callbacks.current.setLevel(provider.recommendedReconstructionLevel);
        } else {
          // 用户选择的快照按年龄显隐；0 Ma PaleoDEM 也可以显式选择上面的 RTL 重建路径。
          layer = viewer.imageryLayers.addImageryProvider(provider);
          callbacks.current.clearReconstruction();
          releaseApplied(true);
          if (scientificContext.displayAgeMa !== null)
            options.setAge(scientificContext.displayAgeMa);
        }
        const next = {
          provider,
          layer,
          context: scientificContext,
          modelKey,
          descriptor: describeLocalRaster(
            current.file,
            current.source.metadata,
            scientificContext,
            resolvedStyle(provider),
            true,
            current.convertedFrom,
          ),
        };
        appliedRef.current = next;
        setApplied(next);
        viewer.scene.requestRender();
        setStatus(
          scientificContext.role === "modern-reconstructable"
            ? `Modern source bound to the selected plate model. Tile level is set to ${provider.recommendedReconstructionLevel}; available L0–L${provider.maximumLevel}. Load tiles to reconstruct it; use view loading for finer levels.`
            : scientificContext.role === "paleo-snapshot"
              ? `Snapshot displayed at ${scientificContext.displayAgeMa} Ma without additional rotation.`
              : "Reference layer displayed in its stored coordinates.",
        );
      } catch (error) {
        if (layer && !viewer.isDestroyed())
          viewer.imageryLayers.remove(layer, true);
        provider.destroy();
        throw error;
      }
    });

  const convert = () =>
    run(async (signal) => {
      const current = entryRef.current;
      if (!current?.source || slicePending)
        throw new Error("Read the selected slice before converting it.");
      const scientificContext = makeScientificContext(context, options.model);
      const descriptor = describeLocalRaster(
        current.file,
        current.source.metadata,
        scientificContext,
        makeStyle(style),
        false,
        current.convertedFrom,
      );
      const needsGrid = current.source.metadata.transform === null;
      if (needsGrid && !grid.confirmed)
        throw new Error(
          "Confirm the target regular grid and nearest-neighbour sampling for the selected NetCDF slice.",
        );
      const bounds = grid.bounds.split(",").map(Number);
      if (needsGrid && (bounds.length !== 4 || !bounds.every(Number.isFinite)))
        throw new Error(
          "Enter four numeric grid bounds: west, south, east, north.",
        );
      setStatus("Loading conversion resources…");
      const { createDemoConverter } = await import("../raster/conversion");
      signal.throwIfAborted();
      const engine = await createDemoConverter();
      converter.current = engine;
      try {
        const result = await engine.toCOG(
          current.dataset ? current.source : current.file,
          {
            signal,
            grid: needsGrid
              ? {
                  bounds: bounds as [number, number, number, number],
                  width: grid.width,
                  height: grid.height,
                  resampling: "nearest",
                }
              : undefined,
            provenance: {
              scientificContext,
              inputDescription: JSON.parse(stringifyScientific(descriptor)),
            },
            onProgress: (progress) => {
              if (!signal.aborted && alive.current)
                setStatus(
                  `COG: ${progress.stage}${progress.total ? ` (${progress.completed}/${progress.total} rows)` : ""}`,
                );
            },
          },
        );
        signal.throwIfAborted();
        conversionOrigin.current = descriptor;
        setConversion(result);
        setStatus(
          `COG ready: ${result.metadata.width} × ${result.metadata.height}. Download the numeric file and its provenance JSON.`,
        );
      } finally {
        engine.dispose();
        if (converter.current === engine) converter.current = null;
      }
    });

  const loadConverted = () =>
    run(async (signal) => {
      if (!conversion) return;
      const file = new File([conversion.blob], conversion.filename, {
        type: "image/tiff",
      });
      const source = await openRasterSource(file, { signal });
      if (signal.aborted) {
        source.close();
        signal.throwIfAborted();
      }
      const savedConversion = conversion;
      const original = conversionOrigin.current;
      replaceEntry({ file, source, convertedFrom: original });
      setConversion(savedConversion);
      conversionOrigin.current = original;
      setVariable("");
      setIndices({});
      setCoordinates({});
      setStatus(
        "Converted COG loaded. Apply the raster to use it in the selected display/reconstruction path.",
      );
    });

  const remove = () => {
    operation.current?.abort();
    converter.current?.dispose();
    releaseApplied();
    closeEntry(entryRef.current);
    entryRef.current = null;
    setEntry(null);
    setConversion(null);
    conversionOrigin.current = undefined;
    setVariable("");
    setIndices({});
    setCoordinates({});
    setContext({ ...emptyRasterContext });
    setStatus("Local raster removed and file resources released.");
  };

  // 统一应用按钮需要可解释的就绪状态；校验与真正应用复用同一规则。
  let applyDisabledReason = !entry
    ? "Choose a local TIFF or NetCDF file in Source settings."
    : layoutError
      ? "Choose a supported spatial variable in NetCDF selection."
      : !entry.source || slicePending
        ? "Click Read selected slice in Source settings before applying."
        : undefined;
  if (!applyDisabledReason) {
    try {
      makeScientificContext(context, options.model);
      makeStyle(style);
    } catch (error) {
      applyDisabledReason = message(error);
    }
  }

  return {
    applyDisabledReason,
    entry,
    applied,
    context,
    setContext,
    style,
    setStyle,
    variable,
    selectVariable,
    indices,
    setIndices,
    coordinates,
    layout,
    layoutError,
    slicePending,
    busy,
    status,
    grid,
    setGrid,
    conversion,
    open,
    readSlice,
    apply,
    convert,
    loadConverted,
    remove,
    cancel: () => {
      operation.current?.abort();
    },
    focusSource: () => {
      const source = entryRef.current?.source;
      const viewer = callbacks.current.viewerRef.current;
      if (!source || !viewer || viewer.isDestroyed()) return;
      const [west, south, east, north] = getGeographicBounds(source.metadata);
      viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(
          west,
          south,
          east > 180 ? east - 360 : east,
          north,
        ),
        duration: 0.5,
      });
    },
    detachForService: () => releaseApplied(true),
    downloadCOG: () => {
      if (conversion) downloadBlob(conversion.blob, conversion.filename);
    },
    downloadProvenance: () => {
      if (conversion)
        downloadBlob(conversion.provenanceBlob, conversion.provenanceFilename);
    },
    descriptor: applied?.descriptor,
  };
}

export type LocalRasterControls = ReturnType<typeof useLocalRaster>;

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Rectangle, type Viewer } from "cesium";
import { getGeographicBounds, openRasterSource, type RasterSource } from "rtl-raster-source";
import { assertTiffSignature } from "../raster/tiffInput";
import { RasterImageryProvider, type RasterStyle } from "rtl-raster-imagery-provider";
import type { RasterConversionResult, RasterConverter } from "rtl-raster-converter";
import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import { downloadBlob } from "../utils/downloads";
import { retainResources } from "../layers/resourceLeases";
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
  source?: RasterSource;
  convertedFrom?: LocalRasterDescriptor;
}
interface AppliedRaster {
  provider: RasterImageryProvider;
  layerId: string;
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
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function makeStyle(draft: RasterStyleDraft): RasterStyle {
  const additionalNoData = draft.additionalNoData.trim()
    ? draft.additionalNoData.split(",").map((value) => {
        if (!value.trim() || !Number.isFinite(Number(value)))
          throw new Error("Additional NoData values must be comma-separated raw numbers.");
        return Number(value);
      })
    : undefined;
  const domain: [number, number] | undefined =
    draft.range === "manual" ? [Number(draft.min), Number(draft.max)] : undefined;
  if (
    domain &&
    (!draft.min.trim() ||
      !draft.max.trim() ||
      !domain.every(Number.isFinite) ||
      domain[0] >= domain[1])
  )
    throw new Error("The display range needs finite values with maximum greater than minimum.");
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
        domains: [...style.domains] as [[number, number], [number, number], [number, number]],
        additionalNoData: style.additionalNoData,
      };
}

interface Options {
  viewerRef: MutableRefObject<Viewer | null>;
  model: ModelSelection;
  addLayer: (
    provider: RasterImageryProvider,
    descriptor: LocalRasterDescriptor,
    model: ModelSelection,
    release: () => void,
    signal: AbortSignal,
  ) => Promise<string | null>;
}

export function useLocalRaster(options: Options) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const [entry, setEntry] = useState<RasterEntry | null>(null);
  const entryRef = useRef<RasterEntry | null>(null);
  const releaseEntryRef = useRef<(() => void) | null>(null);
  const restoreDescriptorRef = useRef<LocalRasterDescriptor | null>(null);
  const restoredStyleRef = useRef<RasterStyle | null>(null);
  const [applied, setApplied] = useState<AppliedRaster | null>(null);
  const appliedRef = useRef<AppliedRaster | null>(null);
  const [context, setContext] = useState<RasterContextDraft>(emptyRasterContext);
  const [style, setStyle] = useState<RasterStyleDraft>(initialStyle);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Choose a local GeoTIFF file. Processing stays in this browser.",
  );
  const [conversion, setConversion] = useState<RasterConversionResult | null>(null);
  const conversionOrigin = useRef<LocalRasterDescriptor>();
  const operation = useRef<AbortController | null>(null);
  const converter = useRef<RasterConverter | null>(null);
  const alive = useRef(true);
  const modelKey = JSON.stringify(options.model);
  const restoreDraft = (descriptor: LocalRasterDescriptor) => {
    const saved = descriptor.context;
    setContext({
      role: saved.role,
      displayAge: saved.displayAgeMa === null ? "" : String(saved.displayAgeMa),
      ageSource: saved.ageSource,
      experiment: saved.experiment,
      citation: saved.citation,
      referenceFrame: saved.referenceFrame,
      modelConfirmed: false,
    });
    const savedStyle = descriptor.style;
    const domain = savedStyle.kind === "single-band" ? savedStyle.domain : savedStyle.domains?.[0];
    setStyle({
      ...initialStyle,
      kind: savedStyle.kind,
      bands: savedStyle.kind === "rgb" ? [...savedStyle.bands] : [savedStyle.band, 1, 2],
      range: domain ? "manual" : "preview",
      min: String(domain?.[0] ?? 0),
      max: String(domain?.[1] ?? 1),
      additionalNoData: savedStyle.additionalNoData?.join(", ") ?? "",
    });
    restoredStyleRef.current = savedStyle;
  };

  const releaseApplied = (updateState = true) => {
    // 此处只清理编辑器摘要；已添加图层的资源归 layers 模块所有。
    appliedRef.current = null;
    if (updateState) setApplied(null);
  };
  const closeEntry = (current: RasterEntry | null) => {
    current?.source?.close();
  };
  const replaceEntry = (next: RasterEntry) => {
    releaseApplied();
    const releaseNext = retainResources([next.source]);
    releaseEntryRef.current?.();
    releaseEntryRef.current = releaseNext;
    entryRef.current = next;
    setEntry(next);
    setStyle(initialStyle);
    restoredStyleRef.current = null;
    setConversion(null);
    conversionOrigin.current = undefined;
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      converter.current?.dispose();
      releaseApplied(false);
      releaseEntryRef.current?.();
      releaseEntryRef.current = null;
      entryRef.current = null;
    };
  }, []);

  useEffect(() => {
    const current = appliedRef.current;
    if (current?.context.role === "modern-reconstructable" && current.modelKey !== modelKey) {
      releaseApplied();
      setContext((draft) => ({ ...draft, modelConfirmed: false }));
      setStatus(
        "Plate model settings changed. Confirm the frame before adding another layer. Existing layers keep their applied model.",
      );
    }
  }, [modelKey]);

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

  const open = (file: File | null) => {
    if (!file) return Promise.resolve();
    return run(async (signal) => {
      setStatus(`Reading ${file.name} metadata…`);
      let next: RasterEntry | undefined;
      try {
        assertTiffSignature(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
        signal.throwIfAborted();
        next = { file, source: await openRasterSource(file, { signal }) };
        signal.throwIfAborted();
        replaceEntry(next);
        if (restoreDescriptorRef.current) restoreDraft(restoreDescriptorRef.current);
        else {
          restoredStyleRef.current = null;
          setContext({ ...emptyRasterContext });
        }
        setStatus("File ready. Choose its scientific use, then apply the raster.");
      } catch (error) {
        if (next && next !== entryRef.current) closeEntry(next);
        throw error;
      }
    });
  };

  const apply = () =>
    run(async (signal) => {
      const current = entryRef.current;
      if (!current?.source) throw new Error("Choose a TIFF file before applying it.");
      const scientificContext = makeScientificContext(context, options.model);
      const viewer = options.viewerRef.current;
      if (!viewer || viewer.isDestroyed()) throw new Error("Viewer is not ready.");
      setStatus("Preparing imagery from the selected numeric source…");
      const provider = await RasterImageryProvider.fromSource(current.source, {
        style: restoredStyleRef.current ?? makeStyle(style),
        signal,
        ellipsoid: DEMO_ELLIPSOID_CONFIG.ellipsoid,
        credit: current.file.name,
      });
      const releaseResources = retainResources([current.source]);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        provider.destroy();
        releaseResources();
      };
      try {
        signal.throwIfAborted();
        if (modelKey !== JSON.stringify(callbacks.current.model))
          throw new Error("Plate model changed while preparing the raster. Try adding it again.");
        const descriptor = describeLocalRaster(
          current.file,
          current.source.metadata,
          scientificContext,
          resolvedStyle(provider),
          true,
          current.convertedFrom,
        );
        const layerId = await callbacks.current.addLayer(
          provider,
          descriptor,
          options.model,
          release,
          signal,
        );
        if (!layerId)
          throw new Error("Layer was cancelled or could not be initialized. See the Layers panel.");
        const next = {
          provider,
          layerId,
          context: scientificContext,
          modelKey,
          descriptor,
        };
        appliedRef.current = next;
        restoreDescriptorRef.current = null;
        setApplied(next);
        viewer.scene.requestRender();
        setStatus(
          scientificContext.role === "modern-reconstructable"
            ? `Reconstruction layer added. Load tiles for it in the Layers panel or step 3. Available L0–L${provider.maximumLevel}.`
            : scientificContext.role === "paleo-snapshot"
              ? `Snapshot added at ${scientificContext.displayAgeMa} Ma. Edit its visible age range in Layers.`
              : "Fixed-coordinate layer added. Edit its visible age range in Layers.",
        );
      } catch (error) {
        release();
        throw error;
      }
    });

  const convert = () =>
    run(async (signal) => {
      const current = entryRef.current;
      if (!current?.source) throw new Error("Choose a TIFF file before converting it.");
      const scientificContext = makeScientificContext(context, options.model);
      const descriptor = describeLocalRaster(
        current.file,
        current.source.metadata,
        scientificContext,
        restoredStyleRef.current ?? makeStyle(style),
        false,
        current.convertedFrom,
      );
      setStatus("Loading conversion resources…");
      const { createDemoConverter } = await import("../raster/conversion");
      signal.throwIfAborted();
      const engine = await createDemoConverter();
      converter.current = engine;
      try {
        const result = await engine.toCOG(current.file, {
          signal,
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
        });
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
      setStatus(
        "Converted COG loaded. Apply the raster to use it in the selected display/reconstruction path.",
      );
    });

  const remove = () => {
    operation.current?.abort();
    converter.current?.dispose();
    releaseApplied();
    releaseEntryRef.current?.();
    releaseEntryRef.current = null;
    entryRef.current = null;
    setEntry(null);
    setConversion(null);
    conversionOrigin.current = undefined;
    restoreDescriptorRef.current = null;
    restoredStyleRef.current = null;
    setContext({ ...emptyRasterContext });
    setStatus("Prepared file cleared. Layers already added remain on the map.");
  };

  // 统一应用按钮需要可解释的就绪状态；校验与真正应用复用同一规则。
  let applyDisabledReason: string | undefined = !entry?.source
    ? "Choose a local TIFF file in Source settings."
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
    setStyle: (value: RasterStyleDraft) => {
      restoredStyleRef.current = null;
      setStyle(value);
    },
    busy,
    status,
    conversion,
    open,
    apply,
    convert,
    loadConverted,
    remove,
    prepareRestore: (descriptor: LocalRasterDescriptor) => {
      remove();
      restoreDescriptorRef.current = descriptor;
      restoreDraft(descriptor);
      setStatus(`Reselect ${descriptor.file.name}, then restore the selected layer.`);
    },
    cancel: () => {
      operation.current?.abort();
    },
    focusSource: () => {
      const source = entryRef.current?.source;
      const viewer = callbacks.current.viewerRef.current;
      if (!source || !viewer || viewer.isDestroyed()) return;
      const [west, south, east, north] = getGeographicBounds(source.metadata);
      viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(west, south, east > 180 ? east - 360 : east, north),
        duration: 0.5,
      });
    },
    downloadCOG: () => {
      if (conversion) downloadBlob(conversion.blob, conversion.filename);
    },
    downloadProvenance: () => {
      if (conversion) downloadBlob(conversion.provenanceBlob, conversion.provenanceFilename);
    },
    descriptor: applied?.descriptor,
  };
}

export type LocalRasterControls = ReturnType<typeof useLocalRaster>;

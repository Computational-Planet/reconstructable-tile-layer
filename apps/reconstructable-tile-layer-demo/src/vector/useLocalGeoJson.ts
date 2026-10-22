import { useEffect, useRef, useState } from "react";
import {
  describeGeoJson,
  parseGeoJson,
  type GeoJsonDocument,
  type LocalGeoJsonDescriptor,
} from "./geojson";

interface Options {
  addLayer(
    data: GeoJsonDocument,
    descriptor: LocalGeoJsonDescriptor,
    signal: AbortSignal,
    restoreId?: string,
  ): Promise<string | null>;
}
interface PreparedGeoJson {
  data: GeoJsonDocument;
  descriptor: LocalGeoJsonDescriptor;
}

/** 文件准备属于 demo；图层加入场景之后由 LayerController 独立持有。 */
export function useLocalGeoJson(options: Options) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const [entry, setEntry] = useState<PreparedGeoJson | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose a local GeoJSON file. Coordinates remain fixed.");
  const [applied, setApplied] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string>();
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  const run = async (task: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try {
      await task(controller.signal);
    } catch (error) {
      if (alive.current && operation.current === controller)
        setStatus(
          controller.signal.aborted
            ? "Operation cancelled."
            : error instanceof Error
              ? error.message
              : String(error),
        );
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (alive.current) setBusy(false);
      }
    }
  };
  const remove = () => {
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setEntry(null);
    setApplied(null);
    setRestoreId(undefined);
    setStatus("Prepared file cleared. Layers already added remain on the map.");
  };
  const open = (file: File | null) => {
    if (!file) return Promise.resolve();
    return run(async (signal) => {
      setEntry(null);
      setApplied(null);
      setStatus(`Reading ${file.name}…`);
      const text = await file.text();
      signal.throwIfAborted();
      const { data, summary } = parseGeoJson(text);
      setEntry({ data, descriptor: describeGeoJson(file, summary) });
      setStatus("File ready. Add it as an ordinary vector layer.");
    });
  };
  const apply = () =>
    run(async (signal) => {
      if (!entry) throw new Error("Choose a GeoJSON file first.");
      setStatus("Preparing vector layer…");
      const id = await callbacks.current.addLayer(entry.data, entry.descriptor, signal, restoreId);
      signal.throwIfAborted();
      if (!id) throw new Error("Layer could not be added. See its status in Layers.");
      setApplied(id);
      setRestoreId(undefined);
      setStatus(
        "GeoJSON layer added. Set its visible age range in Layers; coordinates remain fixed.",
      );
    });
  return {
    entry,
    busy,
    status,
    applied,
    restoreId,
    open,
    apply,
    remove,
    applyDisabledReason: entry ? undefined : "Choose a local GeoJSON file in Source settings.",
    cancel: () => operation.current?.abort(),
    prepareRestore: (id: string, descriptor: LocalGeoJsonDescriptor) => {
      remove();
      setRestoreId(id);
      setStatus(`Reselect ${descriptor.file.name}, then restore the selected layer.`);
    },
  };
}
export type LocalGeoJsonControls = ReturnType<typeof useLocalGeoJson>;

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Cartesian3, Color, Math as CesiumMath, Rectangle, type Viewer } from "cesium";
import { splitGeographicRectangle } from "reconstructable-tile-layer";
import type { LayerController } from "../layers/LayerController";
import type { LayerView } from "../layers/types";
import { MacrostratLegendClient, type LegendBounds, type LegendResult } from "./client";
import { selectMapRegion, type MapSelection, type MapSelectionMode } from "./selection";

const legendCounts = (result: LegendResult) =>
  `${result.groups.length} color ${result.groups.length === 1 ? "group" : "groups"} · ${result.recordCount} ${result.recordCount === 1 ? "record" : "records"}`;

interface Options {
  viewerRef: MutableRefObject<Viewer | null>;
  controllerRef: MutableRefObject<LayerController | null>;
  layers: LayerView[];
  selectedId?: string;
  age: number;
  viewMode: string;
}
export const rectangleBounds = (rectangle: Rectangle): LegendBounds =>
  [rectangle.west, rectangle.south, rectangle.east, rectangle.north].map(
    CesiumMath.toDegrees,
  ) as LegendBounds;

export function isMacrostratReconstruction(layer: LayerView) {
  return (
    layer.mode === "reconstructable" &&
    layer.source.kind === "service" &&
    /^https?:\/\/tiles\.macrostrat\.org\/carto\//i.test(layer.source.config.url)
  );
}

export function useMacrostratLegend({
  viewerRef,
  controllerRef,
  layers,
  selectedId,
  age,
  viewMode,
}: Options) {
  const [zoom, setZoom] = useState("4");
  const [limit, setLimit] = useState("1000");
  const [layerId, setLayerId] = useState("");
  const candidates = layers.filter(isMacrostratReconstruction);
  const layer =
    candidates.find((item) => item.id === layerId) ??
    candidates.find((item) => item.id === selectedId) ??
    candidates[0];
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [sourceBounds, setSourceBounds] = useState<LegendBounds[]>([]);
  const [result, setResult] = useState<LegendResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "selecting" | "querying">("idle");
  const [status, setStatus] = useState(
    "Choose a zoom level, then select a point or area on the map.",
  );
  const [error, setError] = useState(false);
  const client = useRef(new MacrostratLegendClient());
  const operation = useRef<AbortController | null>(null);
  const queryZoom = Number(zoom),
    queryLimit = Number(limit);
  const minimumZoom = age === 0 ? 0 : (layer?.tileLevelRange?.minimumLevel ?? 0);
  const maximumZoom = age === 0 ? 22 : Math.min(22, layer?.tileLevelRange?.maximumLevel ?? 22);
  const validation =
    !zoom.trim() ||
    !Number.isInteger(queryZoom) ||
    queryZoom < minimumZoom ||
    queryZoom > maximumZoom
      ? `Zoom must be a whole number from ${minimumZoom} to ${maximumZoom}${age !== 0 && layer ? " for this layer" : ""}.`
      : !limit.trim() || !Number.isInteger(queryLimit) || queryLimit < 1 || queryLimit > 1000
        ? "Limit must be a whole number from 1 to 1000."
        : age !== 0 && !layer
          ? "Add a Macrostrat reconstruction layer to query at this age."
          : age !== 0 && layer?.modelRequiresReselect
            ? "Reselect and apply this layer's plate-model files first."
            : "";
  const context = JSON.stringify({
    age,
    zoom,
    limit,
    viewMode,
    layer:
      age !== 0 && layer
        ? {
            id: layer.id,
            model: layer.model,
            source: layer.source,
            requiresReselect: layer.modelRequiresReselect,
          }
        : null,
  });
  const previousContext = useRef(context);
  useEffect(() => {
    if (previousContext.current === context) return;
    previousContext.current = context;
    operation.current?.abort();
    operation.current = null;
    setPhase("idle");
    setResult(null);
    setSourceBounds([]);
    setError(false);
    setStatus("Settings changed. Select a point or area, or query the saved selection again.");
  }, [context]);
  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [],
  );
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!selection || !viewer || viewer.isDestroyed()) return;
    // 点选范围很小，使用固定屏幕尺寸的点标记，便于缩放后识别；查询仍共用 rectangle。
    const outline = viewer.entities.add(
      selection.point
        ? {
            position: Cartesian3.fromRadians(
              selection.point.longitude,
              selection.point.latitude,
              1000,
              viewer.scene.globe.ellipsoid,
            ),
            point: {
              pixelSize: 9,
              color: Color.ORANGE,
              outlineColor: Color.WHITE,
              outlineWidth: 2,
            },
          }
        : {
            rectangle: {
              coordinates: selection.rectangle,
              height: 1000,
              material: Color.ORANGE.withAlpha(0.08),
              outline: true,
              outlineColor: Color.ORANGE,
            },
          },
    );
    viewer.scene.requestRender();
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.entities.remove(outline);
        viewer.scene.requestRender();
      }
    };
  }, [selection, viewerRef]);

  const cancel = () => {
    operation.current?.abort();
    operation.current = null;
    setPhase("idle");
    setError(false);
    setStatus(
      result && phase === "querying"
        ? `${legendCounts(result)} (partial) · Query stopped · ${result.completedBoundsCount}/${result.boundsCount} areas checked${result.failedBoundsCount ? `; ${result.failedBoundsCount} failed (skipped)` : ""}.`
        : "Legend query cancelled.",
    );
  };
  const run = async (pick?: MapSelectionMode) => {
    const viewer = viewerRef.current;
    if (validation || !viewer || viewer.isDestroyed()) return;
    operation.current?.abort();
    const current = new AbortController();
    operation.current = current;
    setError(false);
    setResult(null);
    setSourceBounds([]);
    try {
      let selected = selection;
      if (pick) {
        setPhase("selecting");
        setStatus(
          pick === "point"
            ? "Click a point on the globe. Escape cancels."
            : "Drag a rectangle on the map. Escape cancels.",
        );
        selected = await selectMapRegion(viewer, current.signal, pick);
        current.signal.throwIfAborted();
        setSelection(selected);
      }
      if (!selected) throw new Error("Select a point or map area first.");
      const { rectangle } = selected;
      setPhase("querying");
      setStatus(
        age === 0
          ? "Querying Macrostrat…"
          : selected.point
            ? "Finding modern source locations for this point…"
            : `Selecting modern source tiles at z${queryZoom} with the layer's plate model…`,
      );
      let ranges: LegendBounds[];
      if (age === 0) {
        ranges = splitGeographicRectangle(rectangle).map(rectangleBounds);
      } else {
        const controller = controllerRef.current;
        if (!controller || !layer) throw new Error("The reconstruction layer is unavailable.");
        const query = await controller.querySourceRegions(
          layer.id,
          rectangle,
          age,
          queryZoom,
          !!selected.point,
        );
        current.signal.throwIfAborted();
        ranges = query.rectangles.map(rectangleBounds);
      }
      const publish = (legend: LegendResult, loading: boolean) => {
        if (operation.current !== current || current.signal.aborted) return;
        setResult(legend);
        setError(legend.failedBoundsCount > 0 && !legend.exceeded);
        const checked = `${legend.completedBoundsCount}/${legend.boundsCount} areas checked`;
        const skipped = legend.failedBoundsCount
          ? ` · ${legend.failedBoundsCount} failed (skipped)`
          : "";
        const counts = legendCounts(legend);
        setStatus(
          legend.exceeded
            ? `More than ${queryLimit} color groups. Range too large; select a smaller area. Entries are hidden.`
            : legend.boundsCount === 0
              ? "No active plate domains intersect this area at the selected age."
              : loading
                ? `${counts} so far · ${checked}${skipped}`
                : legend.failedBoundsCount === legend.boundsCount
                  ? `All ${legend.boundsCount} source area(s) failed or timed out. Query again to retry.`
                  : legend.failedBoundsCount > 0
                    ? `${counts} (partial) · ${age} Ma · z${queryZoom}${skipped}. Query again to retry.`
                    : legend.groups.length === 0
                      ? "No Macrostrat legend entries in this area at this zoom."
                      : `${counts} · ${age} Ma · z${queryZoom} · ${legend.boundsCount} source area(s)`,
        );
      };
      const legend = await client.current.query(
        ranges,
        queryZoom,
        queryLimit,
        current.signal,
        (progress, bounds) => {
          if (operation.current !== current || current.signal.aborted) return;
          setSourceBounds(bounds);
          publish(progress, true);
        },
      );
      current.signal.throwIfAborted();
      publish(legend, false);
    } catch (cause) {
      if (operation.current === current) {
        const aborted =
          current.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError");
        setError(!aborted);
        setStatus(
          aborted
            ? "Selection cancelled."
            : cause instanceof Error
              ? cause.message
              : "Macrostrat query failed. Try again.",
        );
      }
    } finally {
      if (operation.current === current) {
        operation.current = null;
        setPhase("idle");
      }
    }
  };
  return {
    zoom,
    setZoom,
    minimumZoom,
    maximumZoom,
    limit,
    setLimit,
    candidates,
    layerId: layer?.id ?? "",
    setLayerId,
    age,
    phase,
    status,
    error,
    result,
    sourceBounds,
    validation,
    ready: !!viewerRef.current,
    selection: selection ? rectangleBounds(selection.rectangle) : null,
    point: selection?.point
      ? [selection.point.longitude, selection.point.latitude].map(CesiumMath.toDegrees)
      : null,
    select: () => void run("area"),
    selectPoint: () => void run("point"),
    query: () => void run(),
    cancel,
    clear: () => {
      cancel();
      setResult(null);
      setSourceBounds([]);
      setSelection(null);
      setStatus("Select a point or area on the map.");
    },
  };
}
export type MacrostratLegendControls = ReturnType<typeof useMacrostratLegend>;

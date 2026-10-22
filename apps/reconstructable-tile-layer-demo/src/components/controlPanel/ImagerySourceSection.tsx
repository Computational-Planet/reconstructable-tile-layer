import { useEffect, useState } from "react";
import { validateTileServiceConfig } from "../../cesium/tileServiceConfig";
import { LocalRasterSection } from "./LocalRasterSection";
import { LocalGeoJsonSection } from "./LocalGeoJsonSection";
import { ServiceConnectionForm } from "./ServiceConnectionForm";
import type { ControlPanelProps, ImagerySourceKind } from "./ControlPanel.types";

// 新的数据源类型在此登记，并提供独立的配置编辑器；应用入口和生效状态保持统一。
const SOURCE_KINDS: { key: ImagerySourceKind; label: string }[] = [
  { key: "tile-service", label: "Tile map service" },
  { key: "local-raster", label: "Local TIFF / GeoTIFF" },
  { key: "local-geojson", label: "Local GeoJSON" },
];

type Props = Pick<
  ControlPanelProps,
  | "age"
  | "busy"
  | "localRaster"
  | "localGeoJson"
  | "sourceKind"
  | "onSourceKindChange"
  | "providerKey"
  | "onProviderKeyChange"
  | "onApplyProvider"
  | "appliedService"
  | "initialized"
  | "modelNeedsApply"
  | "serviceConfig"
  | "onServiceConfigChange"
  | "selectedLayer"
  | "serviceMode"
  | "onServiceModeChange"
>;

export function ImagerySourceSection({
  age,
  busy,
  localRaster: raster,
  localGeoJson: vector,
  sourceKind,
  onSourceKindChange,
  providerKey,
  onProviderKeyChange,
  onApplyProvider,
  appliedService,
  initialized,
  modelNeedsApply,
  serviceConfig,
  onServiceConfigChange,
  selectedLayer,
  serviceMode,
  onServiceModeChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(true);
  const local = sourceKind === "local-raster";
  const geojson = sourceKind === "local-geojson";
  const localSource = local || geojson;
  const serviceActive = initialized && selectedLayer?.source.kind === "service" && appliedService;
  const disabledReason = busy
    ? "Wait for the current operation to finish."
    : geojson && vector.restoreId && vector.restoreId !== selectedLayer?.id
      ? "Select the layer being restored in Layers, or clear the prepared file to add a new layer."
      : local
        ? raster.applyDisabledReason
        : geojson
          ? vector.applyDisabledReason
          : validateTileServiceConfig(serviceConfig)[0];

  useEffect(() => {
    // 仅在应用成功后收起配置，给下方瓦片加载和时间轴留出空间；失败时保留编辑现场。
    setSettingsOpen(!(geojson ? vector.applied : raster.applied));
  }, [raster.applied, vector.applied, geojson]);
  useEffect(() => {
    if (vector.restoreId) setSettingsOpen(true);
  }, [vector.restoreId]);

  return (
    <section
      className="panel-section imagery-source-section"
      id="imagery-source"
      aria-label="Layer data source"
      aria-busy={busy}
    >
      <h2>
        <span className="workflow-step">2</span> Layer data source
      </h2>
      <div className="active-source" data-testid="active-source" aria-live="polite">
        <span className="active-source-label">Selected layer</span>
        {selectedLayer ? (
          <div data-testid="raster-applied">
            <strong>{selectedLayer.name}</strong>
            <p className="field-hint">
              {selectedLayer.mode === "reconstructable"
                ? `Reconstruction · ${age} Ma`
                : "Fixed coordinates"}
              {" · "}
              {selectedLayer.effectiveVisible ? "enabled at current age" : "hidden"}
            </p>
          </div>
        ) : (
          <strong>No layer selected</strong>
        )}
        {modelNeedsApply && (
          <p className="field-hint">Plate model changed. Apply source to use the new model.</p>
        )}
      </div>

      <label>
        Source type
        <select
          id="source-kind"
          aria-label="Layer source type"
          value={sourceKind}
          disabled={busy}
          onChange={(event) => {
            onSourceKindChange(event.target.value as ImagerySourceKind);
            setSettingsOpen(true);
          }}
        >
          {SOURCE_KINDS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {localSource ? (
        <details
          className="source-settings panel-disclosure"
          open={settingsOpen}
          onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary>Source settings</summary>
          {geojson ? (
            <LocalGeoJsonSection vector={vector} busy={busy} />
          ) : (
            <LocalRasterSection raster={raster} busy={busy} />
          )}
        </details>
      ) : (
        <>
          <label>
            Coordinates
            <select
              aria-label="Service layer coordinates"
              value={serviceMode}
              disabled={busy}
              onChange={(event) =>
                onServiceModeChange(event.target.value as "reconstructable" | "static")
              }
            >
              <option value="reconstructable">Reconstruct from 0 Ma</option>
              <option value="static">Fixed coordinates</option>
            </select>
          </label>
          <ServiceConnectionForm
            config={serviceConfig}
            exampleKey={providerKey}
            busy={busy}
            onChange={onServiceConfigChange}
            onExampleChange={onProviderKeyChange}
          />
        </>
      )}

      {!localSource &&
        serviceActive &&
        JSON.stringify(serviceConfig) !== JSON.stringify(appliedService.config) && (
          <p className="field-hint" data-testid="service-pending">
            Add this connection as another layer. Existing layers keep their applied settings.
          </p>
        )}
      <div className="source-apply-actions">
        <button
          type="button"
          disabled={!!disabledReason}
          aria-describedby="source-apply-help"
          onClick={() =>
            local ? void raster.apply() : geojson ? void vector.apply() : onApplyProvider()
          }
        >
          {(geojson && vector.restoreId) ||
          (local && selectedLayer?.source.kind === "local" && selectedLayer.status === "needs-file")
            ? "Restore selected layer"
            : "Add layer"}
        </button>
        {localSource && (geojson ? vector.entry || vector.restoreId : raster.entry) && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              if (geojson) vector.remove();
              else raster.remove();
              setSettingsOpen(true);
            }}
          >
            Clear prepared file
          </button>
        )}
      </div>
      <p id="source-apply-help" className="field-hint">
        {disabledReason ??
          (geojson ||
          (local && raster.context.role !== "modern-reconstructable") ||
          (!localSource && serviceMode === "static")
            ? "Add a fixed-coordinate layer, then set its visible age range in Layers."
            : "Add the source as a new layer, then load its tiles in step 3 or the Layers panel.")}
      </p>
      {geojson && (
        <>
          <p className="field-hint" role="status" data-testid="geojson-status">
            {vector.status}
          </p>
          {vector.busy && (
            <button type="button" className="secondary-button" onClick={vector.cancel}>
              Cancel GeoJSON operation
            </button>
          )}
        </>
      )}
      {local && (
        <>
          <p className="field-hint" role="status" data-testid="raster-status">
            {raster.status}
          </p>
          {raster.busy && (
            <button type="button" className="secondary-button" onClick={raster.cancel}>
              Cancel raster operation
            </button>
          )}
        </>
      )}
    </section>
  );
}

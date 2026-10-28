import { useEffect, useState } from "react";
import { validateTileServiceConfig } from "../../cesium/tileServiceConfig";
import { LocalRasterSection } from "./LocalRasterSection";
import { LocalGeoJsonSection } from "./LocalGeoJsonSection";
import { ServiceConnectionForm } from "./ServiceConnectionForm";
import { HelpHint } from "../HelpHint";
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
      <div className="field-heading">
        <h2>
          <span className="workflow-step">2</span> Layer data source
        </h2>
        <HelpHint label="Layer data source">
          Add the source as a new layer, then load reconstruction tiles in Timeline &amp; tiles or
          Layers. Fixed-coordinate layers can have a visible age range in Layers. Changing these
          inputs leaves existing layers unchanged.
        </HelpHint>
      </div>
      <div className="active-source" data-testid="active-source" aria-live="polite">
        <div className="active-source-heading">
          <span className="active-source-label">Selected</span>
          <strong title={selectedLayer?.name}>{selectedLayer?.name ?? "No layer selected"}</strong>
        </div>
        {selectedLayer ? (
          <p className="field-hint" data-testid="raster-applied">
            {selectedLayer.mode === "reconstructable"
              ? `Reconstruction · ${age} Ma`
              : "Fixed coordinates"}
            {" · "}
            {selectedLayer.effectiveVisible ? "Visible" : "Hidden"}
          </p>
        ) : null}
        {modelNeedsApply && (
          <p className="field-hint">Plate model changed. Apply source to use the new model.</p>
        )}
      </div>

      <div className={localSource ? "source-choice-field" : "panel-field-grid"}>
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
        {!localSource && (
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
              <option value="reconstructable">Reconstruct (0 Ma)</option>
              <option value="static">Fixed coordinates</option>
            </select>
          </label>
        )}
      </div>

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
            Connection edited. Add it as a new layer.
          </p>
        )}
      <div className="source-apply-actions">
        <button
          type="button"
          disabled={!!disabledReason}
          aria-describedby={disabledReason ? "source-apply-help" : undefined}
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
      {disabledReason && (
        <p id="source-apply-help" className="field-hint">
          {disabledReason}
        </p>
      )}
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

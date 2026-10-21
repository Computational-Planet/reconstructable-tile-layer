import { useEffect, useState } from "react";
import { validateTileServiceConfig } from "../../cesium/tileServiceConfig";
import { LocalRasterSection } from "./LocalRasterSection";
import { ServiceConnectionForm } from "./ServiceConnectionForm";
import type { ControlPanelProps, ImagerySourceKind } from "./ControlPanel.types";

// 新的数据源类型在此登记，并提供独立的配置编辑器；应用入口和生效状态保持统一。
const SOURCE_KINDS: { key: ImagerySourceKind; label: string }[] = [
  { key: "tile-service", label: "Tile map service" },
  { key: "local-raster", label: "Local TIFF / NetCDF" },
];

type Props = Pick<
  ControlPanelProps,
  | "age"
  | "busy"
  | "localRaster"
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
  const serviceActive = initialized && selectedLayer?.source.kind === "service" && appliedService;
  const disabledReason = busy
    ? "Wait for the current operation to finish."
    : local
      ? raster.applyDisabledReason
      : validateTileServiceConfig(serviceConfig)[0];

  useEffect(() => {
    // 仅在应用成功后收起配置，给下方瓦片加载和时间轴留出空间；失败时保留编辑现场。
    setSettingsOpen(!raster.applied);
  }, [raster.applied]);

  return (
    <section
      className="panel-section imagery-source-section"
      id="imagery-source"
      aria-label="Imagery data source"
      aria-busy={busy}
    >
      <h2>
        <span className="workflow-step">2</span> Imagery data source
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
          aria-label="Imagery source type"
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

      {local ? (
        <details
          className="source-settings panel-disclosure"
          open={settingsOpen}
          onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary>Source settings</summary>
          <LocalRasterSection raster={raster} busy={busy} />
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

      {!local &&
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
          onClick={() => (local ? void raster.apply() : onApplyProvider())}
        >
          {local && selectedLayer?.status === "needs-file" ? "Restore selected layer" : "Add layer"}
        </button>
        {local && raster.entry && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              raster.remove();
              setSettingsOpen(true);
            }}
          >
            Clear prepared file
          </button>
        )}
      </div>
      <p id="source-apply-help" className="field-hint">
        {disabledReason ??
          (local && raster.context.role !== "modern-reconstructable"
            ? "Add a fixed-coordinate layer, then set its visible age range in Layers."
            : "Add the source as a new layer, then load its tiles in step 3 or the Layers panel.")}
      </p>
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

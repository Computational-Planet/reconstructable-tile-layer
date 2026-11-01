/** Renders reconstruction age controls. */
import { useState, type CSSProperties } from "react";

import type { ControlPanelProps } from "./ControlPanel.types";
import { ViewLevelControl } from "../layers/ViewLevelControl";
import { HelpHint } from "../HelpHint";

type TimeTilesSectionProps = Pick<
  ControlPanelProps,
  | "age"
  | "onAgeChange"
  | "busy"
  | "initialized"
  | "modelNeedsApply"
  | "localRaster"
  | "level"
  | "tileLevelRange"
  | "onLevelChange"
  | "onViewLevelChange"
  | "onLoadLevel"
  | "onLoadFineInView"
  | "onClear"
  | "status"
  | "selectedLayer"
>;

export function TimeTilesSection({
  age,
  onAgeChange,
  busy,
  initialized,
  modelNeedsApply,
  level,
  tileLevelRange,
  onLevelChange,
  onViewLevelChange,
  onLoadLevel,
  onLoadFineInView,
  onClear,
  status,
  selectedLayer,
}: TimeTilesSectionProps) {
  const disabled = busy || !initialized || modelNeedsApply;
  const [viewLevelValid, setViewLevelValid] = useState(true);
  const viewLevelLabel =
    selectedLayer?.viewLevel === undefined
      ? "automatic level"
      : `fixed L${selectedLayer.viewLevel}`;
  const guidance = !selectedLayer
    ? "Select or add a layer to load tiles."
    : selectedLayer.status === "needs-file"
      ? "Reselect the local file to restore this layer."
      : selectedLayer.source.kind === "geojson"
        ? "Fixed GeoJSON · timeline controls visibility."
        : selectedLayer.mode === "static"
          ? "Fixed imagery · tiles load automatically."
          : `${selectedLayer.name} · ${selectedLayer.loadMode === "view" ? `View / ${viewLevelLabel}` : `Level ${selectedLayer.level}`}`;
  const ageRangeStyle = {
    "--range-progress": `${Math.min(100, Math.max(0, (age / 1800) * 100))}%`,
  } as CSSProperties;

  return (
    <section className="panel-section" aria-label="Reconstruction">
      <div className="panel-section-heading">
        <div className="field-heading">
          <h2>
            <span className="workflow-step">3</span> Timeline &amp; tiles
          </h2>
          <HelpHint label="Timeline and tile loading">
            Tile actions apply to the selected reconstruction layer. Load level loads all relevant
            tiles at that level; Load view adds tiles in the current camera's view sphere while
            retaining previously loaded tiles. Lock view level forces a level, including L0; leave
            it unchecked for automatic selection. All reconstruction layers follow the global
            geological age. Fixed layers use their visible age ranges. Clear removes the selected
            layer's loaded tiles.
          </HelpHint>
        </div>
        <button
          className="secondary-button source-detail-toggle"
          type="button"
          disabled={busy || !initialized || selectedLayer?.mode === "static"}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <p className="field-hint" id="reconstruction-help">
        {guidance}
      </p>
      {selectedLayer?.mode !== "static" && (
        <div className="map-loader-block" aria-describedby="reconstruction-help">
          <div className="tile-action-row">
            <div className="tile-level-input-row">
              <label htmlFor="reconstruction-tile-level">
                Level
                {tileLevelRange && (
                  <span className="field-hint">
                    L{tileLevelRange.minimumLevel}–
                    {tileLevelRange.maximumLevel === undefined
                      ? "unlimited"
                      : `L${tileLevelRange.maximumLevel}`}
                  </span>
                )}
              </label>
              <input
                id="reconstruction-tile-level"
                aria-label="Tile level"
                type="number"
                min={tileLevelRange?.minimumLevel ?? 0}
                max={tileLevelRange ? (tileLevelRange.maximumLevel ?? 24) : 12}
                value={level}
                disabled={disabled}
                onChange={(event) => onLevelChange(Number(event.target.value))}
              />
            </div>
            <button
              className="map-load-level-button"
              aria-label="Load Tiles By Level"
              type="button"
              disabled={disabled}
              onClick={onLoadLevel}
            >
              Load level
            </button>
          </div>
          <div className="tile-action-row">
            <ViewLevelControl
              key={selectedLayer?.id ?? "no-layer"}
              value={selectedLayer?.viewLevel}
              defaultLevel={level}
              minimumLevel={tileLevelRange?.minimumLevel ?? 0}
              maximumLevel={tileLevelRange?.maximumLevel ?? 24}
              disabled={disabled}
              compact
              onChange={onViewLevelChange}
              onValidityChange={setViewLevelValid}
            />
            <button
              className="secondary-button subtle-button"
              aria-label="Load Tiles By View Sphere"
              type="button"
              disabled={disabled || !viewLevelValid}
              onClick={onLoadFineInView}
            >
              Load view
            </button>
          </div>
        </div>
      )}

      <div className="timeline-age-row">
        <label htmlFor="reconstruction-age">Age (Ma)</label>
        <input
          id="reconstruction-age"
          aria-label="Reconstruction age"
          min={0}
          max={1800}
          type="range"
          value={age}
          style={ageRangeStyle}
          onChange={(event) => onAgeChange(Number(event.target.value))}
        />
        <input
          aria-label="Reconstruction age in Ma"
          min={0}
          max={1800}
          type="number"
          value={age}
          onChange={(event) => onAgeChange(Number(event.target.value))}
        />
      </div>
      <p className="status" role="status">
        {status}
      </p>
    </section>
  );
}

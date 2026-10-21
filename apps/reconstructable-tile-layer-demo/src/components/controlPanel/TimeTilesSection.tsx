/** Renders reconstruction age controls. */
import type { CSSProperties } from "react";

import type { ControlPanelProps } from "./ControlPanel.types";

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
  onLoadLevel,
  onLoadFineInView,
  onClear,
  status,
  selectedLayer,
}: TimeTilesSectionProps) {
  const disabled = busy || !initialized || modelNeedsApply;
  const guidance = !selectedLayer
    ? "Add an imagery source in step 2, or select a layer in the Layers panel."
    : selectedLayer.status === "needs-file"
      ? "Reselect this layer's local file before loading tiles."
      : selectedLayer.mode === "static"
        ? "Imagery loads automatically as you navigate. The timeline controls its visible age range."
        : `Tile actions apply to ${selectedLayer.name}. All reconstruction layers follow the global timeline.`;
  const ageRangeStyle = {
    "--range-progress": `${Math.min(100, Math.max(0, (age / 1800) * 100))}%`,
  } as CSSProperties;

  return (
    <section className="panel-section" aria-label="Reconstruction">
      <h2>
        <span className="workflow-step">3</span> Timeline & tiles
      </h2>
      <p className="field-hint" id="reconstruction-help">
        {guidance}
      </p>
      {selectedLayer?.mode !== "static" && (
        <div className="map-loader-block" aria-describedby="reconstruction-help">
          <label htmlFor="reconstruction-tile-level">
            Tile level
            {tileLevelRange
              ? ` (L${tileLevelRange.minimumLevel}–${tileLevelRange.maximumLevel === undefined ? "unlimited" : `L${tileLevelRange.maximumLevel}`})`
              : ""}
          </label>
          <div className="map-load-level-row">
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
            <button
              className="map-load-level-button"
              type="button"
              disabled={disabled}
              onClick={onLoadLevel}
            >
              Load Tiles By Level
            </button>
          </div>
          <div className="map-secondary-actions">
            <button
              className="secondary-button subtle-button"
              type="button"
              disabled={disabled}
              onClick={onLoadFineInView}
            >
              Load Tiles By View Sphere
            </button>
            <button
              className="secondary-button subtle-button"
              type="button"
              disabled={busy || !initialized}
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <label htmlFor="reconstruction-age">Global geological age</label>
      <div className="range-row">
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
        <div className="age-number-control">
          <input
            aria-label="Reconstruction age in Ma"
            min={0}
            max={1800}
            type="number"
            value={age}
            onChange={(event) => onAgeChange(Number(event.target.value))}
          />
          <span>Ma</span>
        </div>
      </div>
      <p className="status" role="status">
        {status}
      </p>
    </section>
  );
}

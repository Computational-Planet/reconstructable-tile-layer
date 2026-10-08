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
>;

export function TimeTilesSection({
  age,
  onAgeChange,
  busy,
  initialized,
  modelNeedsApply,
  localRaster,
  level,
  tileLevelRange,
  onLevelChange,
  onLoadLevel,
  onLoadFineInView,
  onClear,
  status,
}: TimeTilesSectionProps) {
  const disabled = busy || !initialized || modelNeedsApply;
  const appliedRole = localRaster.applied?.context.role;
  const guidance = modelNeedsApply
    ? "Plate model changed. Apply source again before loading tiles."
    : appliedRole === "paleo-snapshot"
      ? "This snapshot displays directly at its assigned age. Tile loading is not needed."
      : appliedRole === "reference-only"
        ? "This reference displays directly in fixed coordinates. Choose Reconstruct from 0 Ma to rotate it with the plates."
        : !initialized
          ? "Apply an imagery source in step 2 to enable tile loading."
          : "Load tiles, then move the timeline. Start at L2 for low-resolution rasters or L3–L4 when available; use the current view for finer detail.";
  const ageRangeStyle = {
    "--range-progress": `${Math.min(100, Math.max(0, (age / 1800) * 100))}%`,
  } as CSSProperties;

  return (
    <section className="panel-section" aria-label="Reconstruction">
      <h2>
        <span className="workflow-step">3</span> Reconstruction
      </h2>
      <p className="field-hint" id="reconstruction-help">
        {guidance}
      </p>
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

      <label htmlFor="reconstruction-age">Reconstruction age</label>
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

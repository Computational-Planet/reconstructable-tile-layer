/** Renders age, tile level, and tile loading controls. */
import type { CSSProperties } from "react";

import type { ControlPanelProps } from "./ControlPanel.types";

type TimeTilesSectionProps = Pick<
  ControlPanelProps,
  | "age"
  | "busy"
  | "initialized"
  | "level"
  | "onAgeChange"
  | "onClear"
  | "onLevelChange"
  | "onLoadFineInView"
  | "onLoadLevel"
  | "onLoadRoot"
>;

export function TimeTilesSection({
  age,
  busy,
  initialized,
  level,
  onAgeChange,
  onClear,
  onLevelChange,
  onLoadFineInView,
  onLoadLevel,
  onLoadRoot,
}: TimeTilesSectionProps) {
  const ageRangeStyle = {
    "--range-progress": `${Math.min(100, Math.max(0, (age / 1800) * 100))}%`,
  } as CSSProperties;

  return (
    <section className="panel-section">
      <h2>Time & Tiles</h2>

      <label>
        Age Ma
        <div className="range-row">
          <input
            min={0}
            max={1800}
            type="range"
            value={age}
            style={ageRangeStyle}
            onChange={(event) => onAgeChange(Number(event.target.value))}
          />
          <input
            min={0}
            max={1800}
            type="number"
            value={age}
            onChange={(event) => onAgeChange(Number(event.target.value))}
          />
        </div>
      </label>

      <label>
        Level
        <input
          min={0}
          max={12}
          type="number"
          value={level}
          onChange={(event) => onLevelChange(Number(event.target.value))}
        />
      </label>

      <div className="section-actions compact-actions">
        <button disabled={busy || !initialized} onClick={onLoadRoot}>
          Load root
        </button>
        <button disabled={busy || !initialized} onClick={onLoadLevel}>
          Load level
        </button>
        <button disabled={busy || !initialized} onClick={onLoadFineInView}>
          Load view
        </button>
        <button disabled={busy || !initialized} onClick={onClear}>
          Clear
        </button>
      </div>
    </section>
  );
}

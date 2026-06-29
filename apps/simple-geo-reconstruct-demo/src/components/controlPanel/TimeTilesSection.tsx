/** Renders reconstruction age controls. */
import type { CSSProperties } from "react";

import type { ControlPanelProps } from "./ControlPanel.types";

type TimeTilesSectionProps = Pick<
  ControlPanelProps,
  | "age"
  | "onAgeChange"
>;

export function TimeTilesSection({
  age,
  onAgeChange,
}: TimeTilesSectionProps) {
  const ageRangeStyle = {
    "--range-progress": `${Math.min(100, Math.max(0, (age / 1800) * 100))}%`,
  } as CSSProperties;

  return (
    <section className="panel-section">
      <h2>Times</h2>

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
    </section>
  );
}

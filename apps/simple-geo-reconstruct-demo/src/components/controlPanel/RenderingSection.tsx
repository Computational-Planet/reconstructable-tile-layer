/** Renders transform and display controls for the demo. */
import { useState } from "react";
import type { PrimitiveTransformMode } from "simple-geo-reconstruct";

import type { ControlPanelProps } from "./ControlPanel.types";

type RenderingSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "debugEnabled"
  | "globeBaseColor"
  | "initialized"
  | "primitiveTransformMode"
  | "onApplyTransformMode"
  | "onDebugEnabledChange"
  | "onGlobeBaseColorChange"
  | "onPrimitiveTransformModeChange"
>;

export function RenderingSection({
  busy,
  debugEnabled,
  globeBaseColor,
  initialized,
  primitiveTransformMode,
  onApplyTransformMode,
  onDebugEnabledChange,
  onGlobeBaseColorChange,
  onPrimitiveTransformModeChange,
}: RenderingSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <section className="panel-section">
      <div className="panel-section-heading">
        <h2>Rendering</h2>
        <button
          aria-expanded={detailsOpen}
          className="secondary-button source-detail-toggle"
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Detailed
        </button>
      </div>

      {detailsOpen ? (
        <div className="source-detail-panel">
        <label>
          Transform mode
          <div className="setting-action-row">
            <select
              value={primitiveTransformMode}
              onChange={(event) =>
                onPrimitiveTransformModeChange(
                  event.target.value as PrimitiveTransformMode,
                )
              }
            >
              <option value="dynamic3D">dynamic3D</option>
              <option value="bakedInstance">bakedInstance</option>
            </select>
            <button
              className="secondary-button source-inline-button"
              disabled={busy || !initialized}
              type="button"
              onClick={onApplyTransformMode}
            >
              Apply
            </button>
          </div>
        </label>

          <label>
            Globe color
            <div className="color-control">
              <input
                aria-label="Globe color"
                type="color"
                value={globeBaseColor}
                onChange={(event) => onGlobeBaseColorChange(event.target.value)}
              />
              <input readOnly value={globeBaseColor} />
            </div>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={(event) => onDebugEnabledChange(event.target.checked)}
            />
            Enable import debug logs
          </label>
        </div>
      ) : null}
    </section>
  );
}

/** Renders imagery provider and render-mode controls. */
import type {
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import { PROVIDER_OPTIONS, type ProviderKey } from "../../cesium/providers";
import type { ControlPanelProps } from "./ControlPanel.types";

type RenderingSectionProps = Pick<
  ControlPanelProps,
  | "debugEnabled"
  | "globeBaseColor"
  | "polygonRenderIntent"
  | "primitiveTransformMode"
  | "providerKey"
  | "onDebugEnabledChange"
  | "onGlobeBaseColorChange"
  | "onPolygonRenderIntentChange"
  | "onPrimitiveTransformModeChange"
  | "onProviderKeyChange"
> & {
  onConfigureCustomProvider: () => void;
};

export function RenderingSection({
  debugEnabled,
  globeBaseColor,
  polygonRenderIntent,
  primitiveTransformMode,
  providerKey,
  onConfigureCustomProvider,
  onDebugEnabledChange,
  onGlobeBaseColorChange,
  onPolygonRenderIntentChange,
  onPrimitiveTransformModeChange,
  onProviderKeyChange,
}: RenderingSectionProps) {
  return (
    <section className="panel-section">
      <h2>Rendering</h2>

      <div className="grid-2">
        <label>
          Provider
          <select
            value={providerKey}
            onChange={(event) => {
              const nextProviderKey = event.target.value as ProviderKey;
              if (nextProviderKey === "custom-url-template") {
                onConfigureCustomProvider();
                return;
              }
              onProviderKeyChange(nextProviderKey);
            }}
          >
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        {providerKey === "custom-url-template" ? (
          <button
            className="secondary-button align-end"
            type="button"
            onClick={onConfigureCustomProvider}
          >
            Configure custom
          </button>
        ) : null}

        <label>
          Polygon mode
          <select
            value={polygonRenderIntent}
            onChange={(event) =>
              onPolygonRenderIntentChange(
                event.target.value as PolygonRenderIntentMode,
              )
            }
          >
            <option value="classified">classified</option>
            <option value="all-polygons-area">all-polygons-area</option>
          </select>
        </label>

        <label>
          Transform mode
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
        </label>
      </div>

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
    </section>
  );
}

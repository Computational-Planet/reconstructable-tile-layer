import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import {
  PROVIDER_OPTIONS,
  type ProviderKey,
} from "../cesium/providers";
import type {
  FeaturePreset,
  FeaturePresetKey,
  RotationPreset,
  RotationPresetKey,
} from "../dataSources";

type ControlPanelProps = {
  age: number;
  busy: boolean;
  debugEnabled: boolean;
  featurePresetKey: FeaturePresetKey;
  featurePresets: FeaturePreset[];
  featureUrl: string;
  initialized: boolean;
  level: number;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  rotPresetKey: RotationPresetKey;
  rotPresets: RotationPreset[];
  rotUrls: string;
  stats: GeoTileStats | null;
  status: string;
  onAgeChange: (value: number) => void;
  onApplyProvider: () => void;
  onApplyTransformMode: () => void;
  onClear: () => void;
  onDebugEnabledChange: (value: boolean) => void;
  onFeaturePresetChange: (value: FeaturePresetKey) => void;
  onFeatureUpload: (file: File | null) => void;
  onFeatureUrlChange: (value: string) => void;
  onInit: () => void;
  onLevelChange: (value: number) => void;
  onLoadLevel: () => void;
  onLoadRoot: () => void;
  onPolygonRenderIntentChange: (value: PolygonRenderIntentMode) => void;
  onPrimitiveTransformModeChange: (value: PrimitiveTransformMode) => void;
  onProviderKeyChange: (value: ProviderKey) => void;
  onRotPresetChange: (value: RotationPresetKey) => void;
  onRotUpload: (files: FileList | null) => void;
  onRotUrlsChange: (value: string) => void;
};

export function ControlPanel(props: ControlPanelProps) {
  const {
    age,
    busy,
    debugEnabled,
    featurePresetKey,
    featurePresets,
    featureUrl,
    initialized,
    level,
    polygonRenderIntent,
    primitiveTransformMode,
    providerKey,
    rotPresetKey,
    rotPresets,
    rotUrls,
    stats,
    status,
    onAgeChange,
    onApplyProvider,
    onApplyTransformMode,
    onClear,
    onDebugEnabledChange,
    onFeaturePresetChange,
    onFeatureUpload,
    onFeatureUrlChange,
    onInit,
    onLevelChange,
    onLoadLevel,
    onLoadRoot,
    onPolygonRenderIntentChange,
    onPrimitiveTransformModeChange,
    onProviderKeyChange,
    onRotPresetChange,
    onRotUpload,
    onRotUrlsChange,
  } = props;

  return (
    <aside className="control-panel">
      <header>
        <p className="eyebrow">SimpleGeoReconstructManager</p>
        <h1>Deep Time Tile Demo</h1>
      </header>

      <section className="source-section">
        <label>
          Feature preset
          <select
            value={featurePresetKey}
            onChange={(event) =>
              onFeaturePresetChange(event.target.value as FeaturePresetKey)
            }
          >
            {featurePresets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom URL / uploaded file</option>
          </select>
        </label>

        <label>
          Feature URL
          <input
            value={featureUrl}
            onChange={(event) => onFeatureUrlChange(event.target.value)}
          />
        </label>

        <label>
          Upload GPML / GPMLZ / JSON
          <input
            accept=".gpml,.gpmlz,.json,.xml"
            type="file"
            onChange={(event) => {
              onFeatureUpload(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>

      <section className="source-section">
        <label>
          ROT preset
          <select
            value={rotPresetKey}
            onChange={(event) =>
              onRotPresetChange(event.target.value as RotationPresetKey)
            }
          >
            {rotPresets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom URL / uploaded files</option>
          </select>
        </label>

        <label>
          ROT URLs
          <textarea
            rows={4}
            value={rotUrls}
            onChange={(event) => onRotUrlsChange(event.target.value)}
          />
        </label>

        <label>
          Upload ROT files
          <input
            accept=".rot,.txt"
            multiple
            type="file"
            onChange={(event) => {
              onRotUpload(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>

      <div className="grid-2">
        <label>
          Provider
          <select
            value={providerKey}
            onChange={(event) =>
              onProviderKeyChange(event.target.value as ProviderKey)
            }
          >
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

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
      </div>

      <div className="grid-2">
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
      </div>

      <label>
        Age Ma
        <div className="range-row">
          <input
            min={0}
            max={1800}
            type="range"
            value={age}
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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={debugEnabled}
          onChange={(event) => onDebugEnabledChange(event.target.checked)}
        />
        Enable import debug logs
      </label>

      <div className="button-grid">
        <button disabled={busy} onClick={onInit}>
          Init manager
        </button>
        <button disabled={busy || !initialized} onClick={onApplyProvider}>
          Apply provider
        </button>
        <button disabled={busy || !initialized} onClick={onApplyTransformMode}>
          Apply transform
        </button>
        <button disabled={busy || !initialized} onClick={onLoadRoot}>
          Load root
        </button>
        <button disabled={busy || !initialized} onClick={onLoadLevel}>
          Load level
        </button>
        <button disabled={busy || !initialized} onClick={onClear}>
          Clear
        </button>
      </div>

      <p className="status">{status}</p>

      <section className="stats-panel">
        <h2>Stats</h2>
        <pre>{stats ? JSON.stringify(stats, null, 2) : "Not initialized"}</pre>
      </section>
    </aside>
  );
}

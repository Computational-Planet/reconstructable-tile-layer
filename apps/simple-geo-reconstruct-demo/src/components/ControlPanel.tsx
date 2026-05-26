import { useState } from "react";
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import {
  PROVIDER_OPTIONS,
  type ProviderKey,
  type UrlTemplateProviderConfig,
  type UrlTemplateTilingSchemeKey,
} from "../cesium/providers";
import type {
  FeaturePreset,
  FeaturePresetKey,
  RotationPreset,
  RotationPresetKey,
} from "../dataSources";
import { GlobalModal } from "./GlobalModal";

type ControlPanelProps = {
  age: number;
  busy: boolean;
  debugEnabled: boolean;
  featurePresetKey: FeaturePresetKey;
  featurePresets: FeaturePreset[];
  featureUrl: string;
  globeBaseColor: string;
  customProviderConfig: UrlTemplateProviderConfig;
  customProviderError: string;
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
  onCustomProviderConfigChange: (value: UrlTemplateProviderConfig) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onFeaturePresetChange: (value: FeaturePresetKey) => void;
  onFeatureUpload: (file: File | null) => void;
  onFeatureUrlChange: (value: string) => void;
  onGlobeBaseColorChange: (value: string) => void;
  onInit: () => void;
  onLevelChange: (value: number) => void;
  onLoadFineInView: () => void;
  onLoadLevel: () => void;
  onLoadRoot: () => void;
  onPolygonRenderIntentChange: (value: PolygonRenderIntentMode) => void;
  onPrimitiveTransformModeChange: (value: PrimitiveTransformMode) => void;
  onProviderKeyChange: (value: ProviderKey) => void;
  onRotPresetChange: (value: RotationPresetKey) => void;
  onRotUpload: (files: FileList | null) => void;
  onRotUrlsChange: (value: string) => void;
  onSaveCustomProviderConfig: () => boolean;
};

export function ControlPanel(props: ControlPanelProps) {
  const [customProviderDialogOpen, setCustomProviderDialogOpen] =
    useState(false);
  const {
    age,
    busy,
    debugEnabled,
    featurePresetKey,
    featurePresets,
    featureUrl,
    globeBaseColor,
    customProviderConfig,
    customProviderError,
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
    onCustomProviderConfigChange,
    onDebugEnabledChange,
    onFeaturePresetChange,
    onFeatureUpload,
    onFeatureUrlChange,
    onGlobeBaseColorChange,
    onInit,
    onLevelChange,
    onLoadFineInView,
    onLoadLevel,
    onLoadRoot,
    onPolygonRenderIntentChange,
    onPrimitiveTransformModeChange,
    onProviderKeyChange,
    onRotPresetChange,
    onRotUpload,
    onRotUrlsChange,
    onSaveCustomProviderConfig,
  } = props;

  const updateCustomProviderConfig = (
    patch: Partial<UrlTemplateProviderConfig>,
  ) => {
    onCustomProviderConfigChange({
      ...customProviderConfig,
      ...patch,
    });
  };

  const formatRequiredNumber = (value: number) =>
    Number.isFinite(value) ? String(value) : "";

  return (
    <>
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
              onChange={(event) => {
                const nextProviderKey = event.target.value as ProviderKey;
                if (nextProviderKey === "custom-url-template") {
                  setCustomProviderDialogOpen(true);
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
              className="secondary-button"
              type="button"
              onClick={() => setCustomProviderDialogOpen(true)}
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
          <button
            disabled={busy || !initialized}
            onClick={onApplyTransformMode}
          >
            Apply transform
          </button>
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

        <p className="status">{status}</p>

        <section className="stats-panel">
          <h2>Stats</h2>
          <pre>
            {stats ? JSON.stringify(stats, null, 2) : "Not initialized"}
          </pre>
        </section>
      </aside>

      <GlobalModal
        labelledBy="custom-provider-title"
        open={customProviderDialogOpen}
        onClose={() => setCustomProviderDialogOpen(false)}
      >
        <form
          className="provider-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (onSaveCustomProviderConfig()) {
              setCustomProviderDialogOpen(false);
            }
          }}
        >
          <header>
            <h2 id="custom-provider-title">Custom provider</h2>
          </header>

          <label>
            URL template
            <input
              required
              placeholder="http://localhost:9003/image/wmts/HC4aVmBO/{z}/{x}/{y}"
              value={customProviderConfig.url}
              onChange={(event) =>
                updateCustomProviderConfig({ url: event.target.value })
              }
            />
          </label>

          <label>
            Tiling scheme
            <select
              required
              value={customProviderConfig.tilingSchemeKey}
              onChange={(event) =>
                updateCustomProviderConfig({
                  tilingSchemeKey: event.target
                    .value as UrlTemplateTilingSchemeKey,
                })
              }
            >
              <option value="geographic">EPSG:4326 / Geographic</option>
              <option value="web-mercator">EPSG:3857 / Web Mercator</option>
            </select>
          </label>

          <div className="grid-2">
            <label>
              Min level
              <input
                min={0}
                required
                type="number"
                value={formatRequiredNumber(customProviderConfig.minimumLevel)}
                onChange={(event) =>
                  updateCustomProviderConfig({
                    minimumLevel: event.target.valueAsNumber,
                  })
                }
              />
            </label>

            <label>
              Max level
              <input
                min={0}
                required
                type="number"
                value={formatRequiredNumber(customProviderConfig.maximumLevel)}
                onChange={(event) =>
                  updateCustomProviderConfig({
                    maximumLevel: event.target.valueAsNumber,
                  })
                }
              />
            </label>
          </div>

          {customProviderError ? (
            <p className="form-error" role="alert">
              {customProviderError}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCustomProviderDialogOpen(false)}
            >
              Cancel
            </button>
            <button type="submit">Use custom</button>
          </div>
        </form>
      </GlobalModal>
    </>
  );
}

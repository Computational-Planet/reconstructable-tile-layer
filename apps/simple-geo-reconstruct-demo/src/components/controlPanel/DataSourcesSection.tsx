/** Renders feature and rotation source controls for the demo. */
import { useState } from "react";
import type { PolygonRenderIntentMode } from "simple-geo-reconstruct";

import { PROVIDER_OPTIONS, type ProviderKey } from "../../cesium/providers";
import type {
  FeaturePresetKey,
  GplatesReferencePolygonKey,
  RotationAnchorMode,
  RotationPresetKey,
} from "../../dataSources";
import type { ControlPanelProps } from "./ControlPanel.types";

type DataSourcesSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "featurePresetKey"
  | "featurePresets"
  | "featureSourceLabel"
  | "featureUrl"
  | "anchorPlateIdInput"
  | "initialized"
  | "level"
  | "polygonRenderIntent"
  | "providerKey"
  | "referencePolygonColor"
  | "referencePolygonKey"
  | "referencePolygonSources"
  | "rotationAnchorMode"
  | "rotPresetKey"
  | "rotPresets"
  | "rotSourceLabels"
  | "rotUrls"
  | "onApplyProvider"
  | "onClear"
  | "onFeaturePresetChange"
  | "onFeatureUpload"
  | "onFeatureUrlChange"
  | "onAnchorPlateIdInputChange"
  | "onInit"
  | "onLevelChange"
  | "onLoadFineInView"
  | "onLoadLevel"
  | "onPolygonRenderIntentChange"
  | "onProviderKeyChange"
  | "onReferencePolygonColorChange"
  | "onReferencePolygonKeyChange"
  | "onRotationAnchorModeChange"
  | "onRotPresetChange"
  | "onRotUpload"
  | "onRotUrlsChange"
> & {
  onConfigureCustomProvider: () => void;
};

type CitationInfoProps = {
  citation: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  panelId: string;
};

function CitationInfo({
  citation,
  isOpen,
  onToggle,
  panelId,
}: CitationInfoProps) {
  if (!citation) {
    return null;
  }

  return (
    <span className="citation-info-wrap">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="Toggle citation guidance"
        className={`citation-info${isOpen ? " is-open" : ""}`}
        onClick={onToggle}
        type="button"
      >
        !
      </button>
      {isOpen ? (
        <span className="citation-popover" id={panelId} role="note">
          {citation}
        </span>
      ) : null}
    </span>
  );
}

function isObjectUrl(value: string) {
  return value.startsWith("blob:");
}

type SourceUploadButtonProps = {
  accept: string;
  children: string;
  multiple?: boolean;
  onFilesChange: (files: FileList | null) => void;
};

function SourceUploadButton({
  accept,
  children,
  multiple = false,
  onFilesChange,
}: SourceUploadButtonProps) {
  return (
    <label className="source-upload-button">
      {children}
      <input
        accept={accept}
        className="source-upload-input"
        multiple={multiple}
        type="file"
        onChange={(event) => {
          onFilesChange(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

export function DataSourcesSection({
  busy,
  featurePresetKey,
  featurePresets,
  featureSourceLabel,
  featureUrl,
  anchorPlateIdInput,
  initialized,
  level,
  polygonRenderIntent,
  providerKey,
  referencePolygonColor,
  referencePolygonKey,
  referencePolygonSources,
  rotationAnchorMode,
  rotPresetKey,
  rotPresets,
  rotSourceLabels,
  rotUrls,
  onConfigureCustomProvider,
  onApplyProvider,
  onClear,
  onFeaturePresetChange,
  onFeatureUpload,
  onFeatureUrlChange,
  onAnchorPlateIdInputChange,
  onInit,
  onLevelChange,
  onLoadFineInView,
  onLoadLevel,
  onPolygonRenderIntentChange,
  onProviderKeyChange,
  onReferencePolygonColorChange,
  onReferencePolygonKeyChange,
  onRotationAnchorModeChange,
  onRotPresetChange,
  onRotUpload,
  onRotUrlsChange,
}: DataSourcesSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openCitation, setOpenCitation] = useState<
    "feature" | "rotation" | "provider" | null
  >(null);
  const selectedFeaturePreset = featurePresets.find(
    (preset) => preset.key === featurePresetKey,
  );
  const selectedRotPreset = rotPresets.find(
    (preset) => preset.key === rotPresetKey,
  );
  const selectedProvider = PROVIDER_OPTIONS.find(
    (provider) => provider.key === providerKey,
  );
  const rotSourceUrls = rotUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasUploadedFeatureSource =
    featureSourceLabel !== "" && isObjectUrl(featureUrl);
  const hasUploadedRotSources =
    rotSourceLabels.length > 0 &&
    rotSourceUrls.length === rotSourceLabels.length &&
    rotSourceUrls.every(isObjectUrl);

  return (
    <section className="panel-section data-sources-section">
      <div className="panel-section-heading">
        <h2>Data Sources</h2>
        <button
          aria-expanded={detailsOpen}
          className="secondary-button source-detail-toggle"
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Detailed
        </button>
      </div>

      <div className="source-compact-stack">
        <div className="source-choice-field">
          <label htmlFor="feature-preset-select">Feature source</label>
          <div className="source-select-row">
            <select
              id="feature-preset-select"
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
            <CitationInfo
              citation={selectedFeaturePreset?.citation}
              isOpen={openCitation === "feature"}
              onToggle={() =>
                setOpenCitation((current) =>
                  current === "feature" ? null : "feature",
                )
              }
              panelId="feature-preset-citation"
            />
            <SourceUploadButton
              accept=".gpml,.gpmlz,.json,.xml"
              onFilesChange={(files) => onFeatureUpload(files?.[0] ?? null)}
            >
              Upload
            </SourceUploadButton>
          </div>
        </div>

        <div className="source-choice-field">
          <label htmlFor="rot-preset-select">Rotation source</label>
          <div className="source-select-row">
            <select
              id="rot-preset-select"
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
            <CitationInfo
              citation={selectedRotPreset?.citation}
              isOpen={openCitation === "rotation"}
              onToggle={() =>
                setOpenCitation((current) =>
                  current === "rotation" ? null : "rotation",
                )
              }
              panelId="rot-preset-citation"
            />
            <SourceUploadButton
              accept=".rot,.txt"
              multiple
              onFilesChange={onRotUpload}
            >
              Upload
            </SourceUploadButton>
          </div>
        </div>

        <label>
          Map Provider
          <div
            className={`setting-action-row provider-select-row${
              providerKey === "custom-url-template" ? " has-configure" : ""
            }`}
          >
            <div className="provider-select-control">
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
              <CitationInfo
                citation={selectedProvider?.citation}
                isOpen={openCitation === "provider"}
                onToggle={() =>
                  setOpenCitation((current) =>
                    current === "provider" ? null : "provider",
                  )
                }
                panelId="provider-preset-citation"
              />
            </div>
            <button
              className="secondary-button source-inline-button"
              disabled={busy || !initialized}
              type="button"
              onClick={onApplyProvider}
            >
              Apply
            </button>
            {providerKey === "custom-url-template" ? (
              <button
                className="secondary-button source-inline-button"
                type="button"
                onClick={onConfigureCustomProvider}
              >
                Configure
              </button>
            ) : null}
          </div>
        </label>

        <label>
          GPlates reference
          <div className="reference-control">
            <select
              value={referencePolygonKey}
              onChange={(event) =>
                onReferencePolygonKeyChange(
                  event.target.value as GplatesReferencePolygonKey,
                )
              }
            >
              {referencePolygonSources.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label}
                </option>
              ))}
            </select>
            <input
              aria-label="GPlates reference color"
              type="color"
              value={referencePolygonColor}
              onChange={(event) =>
                onReferencePolygonColorChange(event.target.value)
              }
            />
          </div>
        </label>

        <button disabled={busy} type="button" onClick={onInit}>
          Init Reconstruction Manager
        </button>

        <div className="map-loader-block">
          <h3>Map Loader</h3>
          <div className="map-load-level-row">
            <input
              aria-label="Tile level"
              min={0}
              max={12}
              type="number"
              value={level}
              onChange={(event) => onLevelChange(Number(event.target.value))}
            />
            <button
              className="map-load-level-button"
              disabled={busy || !initialized}
              type="button"
              onClick={onLoadLevel}
            >
              Load Tiles By Level
            </button>
          </div>

          <div className="map-secondary-actions">
            <button
              className="secondary-button subtle-button"
              disabled={busy || !initialized}
              type="button"
              onClick={onLoadFineInView}
            >
              Load Tiles By View Sphere
            </button>
            <button
              className="secondary-button subtle-button"
              disabled={busy || !initialized}
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {detailsOpen ? (
        <div className="source-detail-panel">
          {hasUploadedFeatureSource ? (
            <div className="uploaded-source-summary">
              <span>Uploaded feature file</span>
              <strong>{featureSourceLabel}</strong>
              <button type="button" onClick={() => onFeatureUrlChange("")}>
                Use URL
              </button>
            </div>
          ) : (
            <label>
              Feature URL
              <input
                value={featureUrl}
                onChange={(event) => onFeatureUrlChange(event.target.value)}
              />
            </label>
          )}

          <label>
            Rotation anchor
            <select
              value={rotationAnchorMode}
              onChange={(event) =>
                onRotationAnchorModeChange(
                  event.target.value as RotationAnchorMode,
                )
              }
            >
              <option value="default">GPlates anchor 0</option>
              <option value="auto">Auto recurse</option>
              <option value="custom">Custom plate ID</option>
            </select>
          </label>

          {rotationAnchorMode === "custom" ? (
            <label>
              Anchor plate ID
              <input
                value={anchorPlateIdInput}
                onChange={(event) =>
                  onAnchorPlateIdInputChange(event.target.value)
                }
              />
            </label>
          ) : null}

          {hasUploadedRotSources ? (
            <div className="uploaded-source-summary">
              <span>Uploaded ROT files</span>
              <strong>{rotSourceLabels.join(", ")}</strong>
              <button type="button" onClick={() => onRotUrlsChange("")}>
                Use URLs
              </button>
            </div>
          ) : (
            <label>
              ROT URLs
              <textarea
                rows={3}
                value={rotUrls}
                onChange={(event) => onRotUrlsChange(event.target.value)}
              />
            </label>
          )}

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
      ) : null}
    </section>
  );
}

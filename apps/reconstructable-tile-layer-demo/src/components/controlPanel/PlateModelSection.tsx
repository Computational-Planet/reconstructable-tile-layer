/** Renders feature and rotation source controls for the demo. */
import { useState } from "react";
import type { PolygonRenderIntentMode } from "reconstructable-tile-layer";

import { CitationInfo } from "./SourceCitation";
import type { FeaturePresetKey, RotationAnchorMode, RotationPresetKey } from "../../dataSources";
import type { ControlPanelProps } from "./ControlPanel.types";

type PlateModelSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "featurePresetKey"
  | "featurePresets"
  | "featureSourceLabel"
  | "featureUrl"
  | "anchorPlateIdInput"
  | "polygonRenderIntent"
  | "rotationAnchorMode"
  | "rotPresetKey"
  | "rotPresets"
  | "rotSourceLabels"
  | "rotUrls"
  | "onFeaturePresetChange"
  | "onFeatureUpload"
  | "onFeatureUrlChange"
  | "onAnchorPlateIdInputChange"
  | "onPolygonRenderIntentChange"
  | "onRotationAnchorModeChange"
  | "onRotPresetChange"
  | "onRotUpload"
  | "onRotUrlsChange"
>;

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

export function PlateModelSection({
  busy,
  featurePresetKey,
  featurePresets,
  featureSourceLabel,
  featureUrl,
  anchorPlateIdInput,
  polygonRenderIntent,
  rotationAnchorMode,
  rotPresetKey,
  rotPresets,
  rotSourceLabels,
  rotUrls,
  onFeaturePresetChange,
  onFeatureUpload,
  onFeatureUrlChange,
  onAnchorPlateIdInputChange,
  onPolygonRenderIntentChange,
  onRotationAnchorModeChange,
  onRotPresetChange,
  onRotUpload,
  onRotUrlsChange,
}: PlateModelSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openCitation, setOpenCitation] = useState<"feature" | "rotation" | null>(null);
  const selectedFeaturePreset = featurePresets.find((preset) => preset.key === featurePresetKey);
  const selectedRotPreset = rotPresets.find((preset) => preset.key === rotPresetKey);
  const rotSourceUrls = rotUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasUploadedFeatureSource = featureSourceLabel !== "" && isObjectUrl(featureUrl);
  const hasUploadedRotSources =
    rotSourceLabels.length > 0 &&
    rotSourceUrls.length === rotSourceLabels.length &&
    rotSourceUrls.every(isObjectUrl);

  return (
    <section className="panel-section" aria-label="Plate model">
      <div className="panel-section-heading">
        <h2>
          <span className="workflow-step">1</span> Plate model
        </h2>
        <button
          aria-expanded={detailsOpen}
          className="secondary-button source-detail-toggle"
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Model settings
        </button>
      </div>

      <fieldset className="source-compact-stack unstyled-fieldset" disabled={busy}>
        <div className="source-choice-field">
          <label htmlFor="feature-preset-select">Feature source</label>
          <div className="source-select-row">
            <select
              id="feature-preset-select"
              value={featurePresetKey}
              onChange={(event) => {
                onFeaturePresetChange(event.target.value as FeaturePresetKey);
                if (event.target.value === "custom") setDetailsOpen(true);
              }}
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
                setOpenCitation((current) => (current === "feature" ? null : "feature"))
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
              onChange={(event) => {
                onRotPresetChange(event.target.value as RotationPresetKey);
                if (event.target.value === "custom") setDetailsOpen(true);
              }}
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
                setOpenCitation((current) => (current === "rotation" ? null : "rotation"))
              }
              panelId="rot-preset-citation"
            />
            <SourceUploadButton accept=".rot,.txt" multiple onFilesChange={onRotUpload}>
              Upload
            </SourceUploadButton>
          </div>
        </div>
      </fieldset>

      {detailsOpen ? (
        <fieldset className="source-detail-panel unstyled-fieldset" disabled={busy}>
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
              aria-label="Rotation anchor"
              value={rotationAnchorMode}
              onChange={(event) =>
                onRotationAnchorModeChange(event.target.value as RotationAnchorMode)
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
                onChange={(event) => onAnchorPlateIdInputChange(event.target.value)}
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
              aria-label="Polygon mode"
              value={polygonRenderIntent}
              onChange={(event) =>
                onPolygonRenderIntentChange(event.target.value as PolygonRenderIntentMode)
              }
            >
              <option value="classified">classified</option>
              <option value="all-polygons-area">all-polygons-area</option>
            </select>
          </label>
        </fieldset>
      ) : null}
    </section>
  );
}

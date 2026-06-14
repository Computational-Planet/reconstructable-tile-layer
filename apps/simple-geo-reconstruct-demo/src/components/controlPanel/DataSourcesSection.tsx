/** Renders feature and rotation source controls for the demo. */
import { useState } from "react";

import type { FeaturePresetKey, RotationPresetKey } from "../../dataSources";
import type { ControlPanelProps } from "./ControlPanel.types";

type DataSourcesSectionProps = Pick<
  ControlPanelProps,
  | "featurePresetKey"
  | "featurePresets"
  | "featureUrl"
  | "rotPresetKey"
  | "rotPresets"
  | "rotUrls"
  | "onFeaturePresetChange"
  | "onFeatureUpload"
  | "onFeatureUrlChange"
  | "onRotPresetChange"
  | "onRotUpload"
  | "onRotUrlsChange"
>;

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

export function DataSourcesSection({
  featurePresetKey,
  featurePresets,
  featureUrl,
  rotPresetKey,
  rotPresets,
  rotUrls,
  onFeaturePresetChange,
  onFeatureUpload,
  onFeatureUrlChange,
  onRotPresetChange,
  onRotUpload,
  onRotUrlsChange,
}: DataSourcesSectionProps) {
  const [openCitation, setOpenCitation] = useState<
    "feature" | "rotation" | null
  >(null);
  const selectedFeaturePreset = featurePresets.find(
    (preset) => preset.key === featurePresetKey,
  );
  const selectedRotPreset = rotPresets.find(
    (preset) => preset.key === rotPresetKey,
  );

  return (
    <section className="panel-section">
      <h2>Data Sources</h2>

      <div className="source-preset-field">
        <label htmlFor="feature-preset-select">Feature preset</label>
        <div className="preset-select-row">
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
        </div>
      </div>

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

      <div className="source-preset-field">
        <label htmlFor="rot-preset-select">ROT preset</label>
        <div className="preset-select-row">
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
        </div>
      </div>

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
  );
}

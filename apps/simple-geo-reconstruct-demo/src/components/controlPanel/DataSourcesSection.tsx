/** Renders feature and rotation source controls for the demo. */
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
  return (
    <section className="panel-section">
      <h2>Data Sources</h2>

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
  );
}

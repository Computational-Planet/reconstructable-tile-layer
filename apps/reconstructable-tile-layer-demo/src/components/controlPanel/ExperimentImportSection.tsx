/** Renders experiment configuration import controls at the start of the workflow. */
import { useState } from "react";

import type { ControlPanelProps } from "./ControlPanel.types";

type ExperimentImportSectionProps = Pick<
  ControlPanelProps,
  "busy" | "onImportExperimentConfig"
>;

const EXPERIMENT_CONFIG_PRESETS = [
  { key: "custom", label: "Custom / uploaded config" },
] as const;

type ExperimentConfigPresetKey =
  (typeof EXPERIMENT_CONFIG_PRESETS)[number]["key"];

export function ExperimentImportSection({
  busy,
  onImportExperimentConfig,
}: ExperimentImportSectionProps) {
  const [experimentPresetKey, setExperimentPresetKey] =
    useState<ExperimentConfigPresetKey>("custom");

  return (
    <section className="panel-section">
      <h2>Experiment Import</h2>

      <div className="source-select-row">
        <select
          aria-label="Experiment config preset"
          disabled={busy}
          value={experimentPresetKey}
          onChange={(event) =>
            setExperimentPresetKey(
              event.target.value as ExperimentConfigPresetKey,
            )
          }
        >
          {EXPERIMENT_CONFIG_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
        <label
          className={`source-upload-button${busy ? " is-disabled" : ""}`}
        >
          Upload
          <input
            accept=".json,application/json"
            className="source-upload-input"
            disabled={busy}
            type="file"
            onChange={(event) => {
              onImportExperimentConfig(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    </section>
  );
}

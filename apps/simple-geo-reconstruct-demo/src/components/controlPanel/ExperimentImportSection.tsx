/** Renders experiment configuration import controls at the start of the workflow. */
import type { ControlPanelProps } from "./ControlPanel.types";

type ExperimentImportSectionProps = Pick<
  ControlPanelProps,
  "busy" | "onImportExperimentConfig"
>;

export function ExperimentImportSection({
  busy,
  onImportExperimentConfig,
}: ExperimentImportSectionProps) {
  return (
    <section className="panel-section">
      <h2>Experiment Import</h2>

      <label>
        Import config JSON
        <input
          accept=".json,application/json"
          disabled={busy}
          type="file"
          onChange={(event) => {
            onImportExperimentConfig(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </section>
  );
}

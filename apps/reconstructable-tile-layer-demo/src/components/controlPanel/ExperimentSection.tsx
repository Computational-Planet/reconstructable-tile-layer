import { HelpHint } from "../HelpHint";
import type { ControlPanelProps } from "./ControlPanel.types";

type Props = Pick<
  ControlPanelProps,
  "busy" | "onImportExperimentConfig" | "onExportInfo" | "onCaptureScreenshot"
>;

/** 导入与导出共用一组操作，单一文件来源无需额外的预设选择器。 */
export function ExperimentSection({
  busy,
  onImportExperimentConfig,
  onExportInfo,
  onCaptureScreenshot,
}: Props) {
  return (
    <section className="panel-section" aria-label="Experiment files">
      <div className="field-heading">
        <h2>Experiment</h2>
        <HelpHint label="Experiment files">
          Import a JSON configuration to restore layers, geological age and camera settings. Export
          info saves the current configuration and runtime measurements. Screenshot saves the map
          without the control panels. Local data files must be reselected after importing.
        </HelpHint>
      </div>
      <div className="experiment-actions">
        <label className={`source-upload-button${busy ? " is-disabled" : ""}`}>
          Import
          <input
            aria-label="Import experiment configuration"
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
        <button type="button" disabled={busy} onClick={onExportInfo}>
          Export info
        </button>
        <button type="button" disabled={busy} onClick={onCaptureScreenshot}>
          Screenshot
        </button>
      </div>
    </section>
  );
}

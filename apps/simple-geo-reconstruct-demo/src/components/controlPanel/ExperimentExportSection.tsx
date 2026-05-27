/** Renders experiment metadata export and screenshot capture actions. */
import type { ControlPanelProps } from "./ControlPanel.types";

type ExperimentExportSectionProps = Pick<
  ControlPanelProps,
  "busy" | "onCaptureScreenshot" | "onExportInfo"
>;

export function ExperimentExportSection({
  busy,
  onCaptureScreenshot,
  onExportInfo,
}: ExperimentExportSectionProps) {
  return (
    <section className="panel-section">
      <h2>Experiment Export</h2>

      <div className="section-actions compact-actions">
        <button disabled={busy} onClick={onExportInfo}>
          Export info
        </button>
        <button disabled={busy} onClick={onCaptureScreenshot}>
          Screenshot
        </button>
      </div>
    </section>
  );
}

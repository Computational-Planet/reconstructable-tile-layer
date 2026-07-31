/** Renders manager lifecycle and render refresh actions. */
import type { ControlPanelProps } from "./ControlPanel.types";

type ManagerSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "onInit"
>;

export function ManagerSection({
  busy,
  onInit,
}: ManagerSectionProps) {
  return (
    <section className="panel-section">
      <h2>Manager</h2>

      <button disabled={busy} onClick={onInit}>
        Init manager
      </button>
    </section>
  );
}

/** Renders manager lifecycle and render refresh actions. */
import type { ControlPanelProps } from "./ControlPanel.types";

type ManagerSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "initialized"
  | "onApplyProvider"
  | "onApplyTransformMode"
  | "onInit"
>;

export function ManagerSection({
  busy,
  initialized,
  onApplyProvider,
  onApplyTransformMode,
  onInit,
}: ManagerSectionProps) {
  return (
    <section className="panel-section">
      <h2>Manager</h2>

      <div className="section-actions">
        <button disabled={busy} onClick={onInit}>
          Init manager
        </button>
        <button disabled={busy || !initialized} onClick={onApplyProvider}>
          Apply provider
        </button>
        <button disabled={busy || !initialized} onClick={onApplyTransformMode}>
          Apply transform
        </button>
      </div>
    </section>
  );
}

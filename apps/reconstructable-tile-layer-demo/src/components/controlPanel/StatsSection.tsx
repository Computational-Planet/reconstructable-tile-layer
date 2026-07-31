/** Displays manager statistics and operation status. */
import type { ControlPanelProps } from "./ControlPanel.types";

type StatsSectionProps = Pick<ControlPanelProps, "stats" | "status">;

export function StatsSection({ stats, status }: StatsSectionProps) {
  return (
    <>
      <p className="status">{status}</p>

      <section className="panel-section stats-panel">
        <h2>Stats</h2>
        <pre>{stats ? JSON.stringify(stats, null, 2) : "Not initialized"}</pre>
      </section>
    </>
  );
}

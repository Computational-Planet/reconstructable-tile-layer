/** Displays manager statistics and operation status. */
import type { ControlPanelProps } from "./ControlPanel.types";

type StatsSectionProps = Pick<ControlPanelProps, "stats">;

export function StatsSection({ stats }: StatsSectionProps) {
  return (
    <details className="panel-section stats-panel panel-disclosure">
      <summary>Runtime statistics</summary>
      <pre>{stats ? JSON.stringify(stats, null, 2) : "Not initialized"}</pre>
    </details>
  );
}

import type { GplatesReferencePolygonKey } from "../../dataSources";
import type { ControlPanelProps } from "./ControlPanel.types";
import { MacrostratLegendSection } from "./MacrostratLegendSection";

type Props = Pick<
  ControlPanelProps,
  | "referencePolygonColor"
  | "referencePolygonKey"
  | "referencePolygonSources"
  | "onReferencePolygonColorChange"
  | "onReferencePolygonKeyChange"
  | "macrostratLegend"
>;

export function ReferenceSection(props: Props) {
  return (
    <details className="panel-section panel-disclosure">
      <summary>Reference &amp; Legend</summary>
      <details className="panel-disclosure reference-tool">
        <summary>GPlates reference</summary>
        <p className="field-hint">Compare the reconstruction with published GPlates outlines.</p>
        <label htmlFor="reference-polygon-select">GPlates reference</label>
        <div className="reference-control">
          <select
            id="reference-polygon-select"
            value={props.referencePolygonKey}
            onChange={(event) =>
              props.onReferencePolygonKeyChange(event.target.value as GplatesReferencePolygonKey)
            }
          >
            {props.referencePolygonSources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
          <input
            aria-label="GPlates reference color"
            type="color"
            value={props.referencePolygonColor}
            onChange={(event) => props.onReferencePolygonColorChange(event.target.value)}
          />
        </div>
      </details>
      <MacrostratLegendSection legend={props.macrostratLegend} />
    </details>
  );
}

import type { MacrostratLegendControls } from "../../legend/useMacrostratLegend";
import { HelpHint } from "../HelpHint";
import { LegendGroupItem } from "./LegendGroupItem";

export function MacrostratLegendSection({ legend }: { legend: MacrostratLegendControls }) {
  const busy = legend.phase !== "idle";
  const coordinateDigits = legend.point ? 6 : 3;
  return (
    <details className="panel-disclosure reference-tool">
      <summary>Macrostrat legend</summary>
      <div className="legend-controls">
        <div className="field-heading">
          <span className="field-hint">
            {legend.age} Ma · {legend.age === 0 ? "Modern bounds" : "Reconstructed area"}
          </span>
          <HelpHint label="Macrostrat legend">
            Choose the same zoom as your Macrostrat tiles, then select a point or drag an area on
            the map. A point uses a small box extending 0.0001° in each direction. At 0 Ma, the
            selected geographic bounds are queried directly. At older ages, the chosen layer's plate
            model maps a bounding sphere back to modern coordinates and selects covered tiles at
            this zoom. Area queries combine adjacent selected tiles across plates while keeping gaps
            and holes. Point queries use the small inverse-rotated bounds intersected with that
            coverage, without expanding to whole tiles. Returned bounds can still include nearby
            units. Records are deduplicated by legend_id and displayed together by color. Expand a
            color to see the original IDs and differences in map units, ages, lithology and
            descriptions. Limit counts color groups (default 1000). If exceeded, all groups are
            hidden; narrow the selection. Escape cancels selection. Duplicate areas and areas fully
            covered by another are queried only once. Entries appear as each area finishes; failed
            or timed-out areas are skipped and reported. Cancel stops remaining requests and keeps
            the entries already received.
          </HelpHint>
        </div>
        <div className="panel-field-grid">
          <label>
            Zoom (z)
            <input
              aria-label="Macrostrat legend zoom"
              type="number"
              min={legend.minimumZoom}
              max={legend.maximumZoom}
              step={1}
              value={legend.zoom}
              onChange={(event) => legend.setZoom(event.target.value)}
            />
          </label>
          <label>
            Limit (colors)
            <input
              aria-label="Macrostrat legend limit"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={legend.limit}
              onChange={(event) => legend.setLimit(event.target.value)}
            />
          </label>
        </div>
        {legend.age !== 0 && (
          <label>
            Reconstruction layer
            <select
              aria-label="Macrostrat legend reconstruction layer"
              value={legend.layerId}
              onChange={(event) => legend.setLayerId(event.target.value)}
            >
              {!legend.candidates.length && (
                <option value="">No Macrostrat reconstruction layer</option>
              )}
              {legend.candidates.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="legend-actions">
          <button
            type="button"
            disabled={busy || !!legend.validation || !legend.ready}
            onClick={legend.select}
          >
            Select area
          </button>
          <button
            type="button"
            disabled={busy || !!legend.validation || !legend.ready}
            onClick={legend.selectPoint}
          >
            Select point
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !legend.selection || !!legend.validation}
            onClick={legend.query}
          >
            Query again
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!busy && !legend.selection}
            onClick={busy ? legend.cancel : legend.clear}
          >
            {busy ? "Cancel" : "Clear"}
          </button>
        </div>
        {legend.validation && (
          <p className="legend-error" role="alert">
            {legend.validation}
          </p>
        )}
        <p
          className={legend.error ? "legend-error" : "field-hint"}
          role={legend.error ? "alert" : "status"}
          data-testid="macrostrat-legend-status"
        >
          {legend.status}
        </p>
        {legend.selection && (
          <details className="panel-disclosure legend-query-area">
            <summary>{legend.point ? "Query point" : "Query area"}</summary>
            {legend.point && (
              <p className="field-hint">
                Selected lon, lat: {legend.point.map((value) => value.toFixed(6)).join(", ")}°
              </p>
            )}
            <p className="field-hint">
              Selected W, S, E, N:{" "}
              {legend.selection.map((value) => value.toFixed(coordinateDigits)).join(", ")}°
            </p>
            {legend.sourceBounds.length > 0 && (
              <div className="legend-source-bounds">
                {legend.sourceBounds.map((bounds, index) => (
                  <p className="field-hint" key={index}>
                    0 Ma · {bounds.map((value) => value.toFixed(coordinateDigits)).join(", ")}°
                  </p>
                ))}
              </div>
            )}
          </details>
        )}
        {!!legend.result?.groups.length && (
          <ul className="legend-results" aria-label="Macrostrat legend entries">
            {legend.result.groups.map((group) => (
              <LegendGroupItem key={group.key} group={group} />
            ))}
          </ul>
        )}
        <a
          className="legend-attribution"
          href="https://macrostrat.org/docs/data-services"
          target="_blank"
          rel="noreferrer"
        >
          Macrostrat · CC BY 4.0
        </a>
      </div>
    </details>
  );
}

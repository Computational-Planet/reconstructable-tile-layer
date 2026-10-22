import type { LocalGeoJsonControls } from "../../vector/useLocalGeoJson";

export function LocalGeoJsonSection({
  vector,
  busy,
}: {
  vector: LocalGeoJsonControls;
  busy: boolean;
}) {
  const descriptor = vector.entry?.descriptor;
  return (
    <section className="local-raster-section" aria-label="Local GeoJSON">
      <label>
        Local GeoJSON file
        <input
          type="file"
          aria-label="Local GeoJSON file"
          accept=".geojson,.json,application/geo+json,application/json"
          disabled={busy || vector.busy}
          onChange={(event) => {
            void vector.open(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </label>
      <p className="field-hint">
        Points, lines and polygons in WGS84 longitude/latitude. Added as an ordinary vector layer;
        the timeline controls visibility only. Colors and other supported GeoJSON styles are
        preserved.
      </p>
      {descriptor && (
        <div className="raster-summary" data-testid="geojson-summary">
          <p>
            {descriptor.file.name} · {(descriptor.file.size / 1048576).toFixed(2)} MiB
          </p>
          <p className="field-hint">
            {descriptor.summary.features} features · {descriptor.summary.geometries} geometries
            <br />
            {descriptor.summary.geometryTypes.join(", ")}
          </p>
        </div>
      )}
    </section>
  );
}

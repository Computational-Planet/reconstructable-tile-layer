import type { LocalRasterControls } from "../../hooks/useLocalRaster";
import { stringifyScientific, type RasterRole } from "../../raster/context";
import { getGeographicBounds } from "rtl-raster-source";
import { getRasterLevelInfo } from "rtl-raster-imagery-provider";

export function LocalRasterSection({
  raster,
  busy,
}: {
  raster: LocalRasterControls;
  busy: boolean;
}) {
  const disabled = busy || raster.busy;
  const metadata = raster.entry?.source?.metadata;
  const levels = metadata ? getRasterLevelInfo(metadata) : undefined;
  const variables =
    raster.entry?.dataset?.metadata.variables.filter((variable) => variable.shape.length >= 2) ??
    [];
  const selected = variables.find((variable) => variable.name === raster.variable);
  const editContext = (patch: Partial<typeof raster.context>) =>
    raster.setContext({ ...raster.context, ...patch });
  const editStyle = (patch: Partial<typeof raster.style>) =>
    raster.setStyle({ ...raster.style, ...patch });
  const ready = !!metadata && !raster.slicePending;
  return (
    <section className="local-raster-section" aria-label="Local raster">
      <label className="field-label">
        Local raster file
        <input
          aria-label="Local raster file"
          type="file"
          accept=".tif,.tiff,.nc,.nc4,.cdf"
          disabled={disabled}
          onChange={(event) => {
            void raster.open(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </label>
      {raster.entry && (
        <>
          <p data-testid="raster-file">
            {raster.entry.file.name} · {(raster.entry.file.size / 1048576).toFixed(2)} MiB
          </p>
          {raster.entry.dataset && (
            <fieldset disabled={disabled}>
              <legend>NetCDF selection</legend>
              <label>
                Variable
                <select
                  aria-label="NetCDF variable"
                  value={raster.variable}
                  onChange={(event) => raster.selectVariable(event.target.value)}
                >
                  {variables.map((variable) => (
                    <option key={variable.name} value={variable.name}>
                      {variable.name} —{" "}
                      {String(
                        variable.attributes.long_name ??
                          variable.attributes.standard_name ??
                          variable.dataType,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                {selected?.dimensions
                  .map((dimension, index) => `${dimension} (${selected.shape[index]})`)
                  .join(" × ")}
              </p>
              {selected && (
                <p className="field-hint">
                  Units: {String(selected.attributes.units ?? "not supplied in file")}
                </p>
              )}
              {raster.layoutError && (
                <p className="field-error" role="alert">
                  {raster.layoutError}
                </p>
              )}
              {raster.layout && (
                <p className="field-hint">
                  Spatial axes: {raster.layout.longitude.name}, {raster.layout.latitude.name}
                </p>
              )}
              {raster.layout?.selectors.map((selector) => (
                <label key={selector.dimension}>
                  {selector.dimension} index (0–{selector.size - 1})
                  <input
                    aria-label={`${selector.dimension} index`}
                    type="number"
                    min={0}
                    max={selector.size - 1}
                    step={1}
                    value={raster.indices[selector.dimension] ?? 0}
                    onChange={(event) =>
                      raster.setIndices({
                        ...raster.indices,
                        [selector.dimension]: Number(event.target.value),
                      })
                    }
                  />
                  <span className="field-hint">
                    {raster.coordinates[selector.dimension]
                      ? `Raw coordinate: ${raster.coordinates[selector.dimension][raster.indices[selector.dimension] ?? 0]}. `
                      : ""}
                    {String(selector.coordinate?.attributes.units ?? "")}
                    {selector.coordinate?.attributes.calendar
                      ? `; calendar: ${selector.coordinate.attributes.calendar}`
                      : ""}
                  </span>
                </label>
              ))}
              <p className="field-hint">
                Model time and geological age are separate. Calendar values remain in the file's
                original convention.
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={!raster.layout}
                onClick={() => void raster.readSlice()}
              >
                Read selected slice
              </button>
            </fieldset>
          )}
          {metadata && levels && (
            <p className="field-hint raster-summary" data-testid="raster-summary">
              {metadata.width} × {metadata.height} · EPSG:{metadata.crs.epsg}
              {" · "}L0–L{levels.maximumLevel} · suggested start L
              {levels.recommendedReconstructionLevel}
            </p>
          )}
          {metadata && (
            <details className="panel-disclosure" data-testid="raster-metadata">
              <summary>Spatial metadata and file attributes</summary>
              <p>
                {metadata.format} · {metadata.width} × {metadata.height} · EPSG:
                {metadata.crs.epsg}
              </p>
              <p className="field-hint">
                Geographic bounds (W, S, E, N):{" "}
                {getGeographicBounds(metadata)
                  .map((value) => value.toFixed(4))
                  .join(", ")}
                °
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={raster.focusSource}
              >
                View source bounds (stored coordinates)
              </button>
              <p className="field-hint">
                {metadata.transform ? "Affine grid" : "Native 1D longitude/latitude axes"} ·{" "}
                {metadata.bands.length} band(s) · {metadata.overviews.length} overview(s)
              </p>
              <p className="field-hint">
                Stored image sizes: {metadata.width} × {metadata.height}
                {metadata.overviews.map((overview) => ` → ${overview.width} × ${overview.height}`)}
                {metadata.overviews.length === 0 ? " (no stored overviews)" : ""}
              </p>
              {levels && (
                <p className="field-hint" data-testid="raster-levels">
                  Available map tiles: L0–L{levels.maximumLevel}. Suggested RTL start: L
                  {levels.recommendedReconstructionLevel}. Stored pixel scale corresponds to
                  approximately L{levels.nativeMaximumLevel}. L2 divides this file's coverage into 4
                  × 4 source tiles; L3 into 8 × 8. Finer subdivisions resample existing values.
                </p>
              )}
              {raster.entry?.convertedFrom && (
                <p className="field-hint">
                  Before conversion: {raster.entry.convertedFrom.source.width} ×{" "}
                  {raster.entry.convertedFrom.source.height}. Resampling the COG grid does not
                  increase the original data's detail.
                </p>
              )}
              {metadata.slice && (
                <p className="field-hint">
                  Loaded: {metadata.slice.variable} {JSON.stringify(metadata.slice.indices)}
                </p>
              )}
              {metadata.bands.map((band, index) => (
                <p className="field-hint" key={index}>
                  Band {index}: {band.name}, {band.units ?? "units not supplied"}; scale{" "}
                  {band.scale}, offset {band.offset}; NoData{" "}
                  {band.noData.map(String).join(", ") || "none declared"}
                </p>
              ))}
              {metadata.warnings?.map((warning) => (
                <p className="field-hint" key={warning}>
                  {warning}
                </p>
              ))}
              <details>
                <summary>Original file attributes</summary>
                <pre className="raster-attributes">
                  {stringifyScientific(
                    raster.entry.dataset?.metadata ?? {
                      ...metadata,
                      coordinates: metadata?.coordinates
                        ? "Native coordinate arrays retained by the source"
                        : undefined,
                    },
                  )}
                </pre>
              </details>
            </details>
          )}
          <fieldset disabled={disabled}>
            <legend>Coordinate use</legend>
            <label>
              Coordinate use
              <select
                aria-label="Raster coordinate use"
                value={raster.context.role}
                onChange={(event) =>
                  editContext({
                    role: event.target.value as RasterRole,
                    modelConfirmed: false,
                  })
                }
              >
                <option value="modern-reconstructable">
                  Reconstruct from 0 Ma (follows timeline)
                </option>
                <option value="reference-only">Reference / unknown coordinate age</option>
                <option value="paleo-snapshot">Paleo snapshot (visible at one age)</option>
              </select>
            </label>
            <p className="field-hint">
              To move a present-day raster with the plates, choose Reconstruct from 0 Ma. The
              timeline sets the target reconstruction age.
            </p>
            {raster.context.role === "paleo-snapshot" && (
              <>
                <label>
                  Display age (Ma, supplied by you)
                  <input
                    aria-label="Snapshot display age"
                    type="number"
                    min={0}
                    max={1800}
                    value={raster.context.displayAge}
                    onChange={(event) => editContext({ displayAge: event.target.value })}
                  />
                </label>
                <label>
                  Age source / citation
                  <input
                    aria-label="Snapshot age source"
                    value={raster.context.ageSource}
                    onChange={(event) => editContext({ ageSource: event.target.value })}
                  />
                </label>
                <p className="field-hint">
                  This layer starts with its published age as the visible range. Edit that range in
                  Layers. For a 0 Ma file that should move with the timeline, choose Reconstruct
                  from 0 Ma.
                </p>
              </>
            )}
            {raster.context.role === "modern-reconstructable" && (
              <>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={raster.context.modelConfirmed}
                    onChange={(event) => editContext({ modelConfirmed: event.target.checked })}
                  />
                  Data use the present-day frame of the selected plate model.
                </label>
                <p className="field-hint">
                  Adding a layer binds this raster to the plate domains, ROT files and anchor
                  selected above. Then use Load Tiles By Level and move the timeline to reconstruct
                  it, just like an online map. New layers use L2 for low-resolution sources and L3
                  when available. Use Load Tiles By View Sphere for finer levels.
                </p>
              </>
            )}
            <details className="panel-disclosure">
              <summary>Source and citation (optional)</summary>
              <label>
                Dataset source / version / citation
                <input
                  aria-label="Raster source citation"
                  value={raster.context.citation}
                  onChange={(event) => editContext({ citation: event.target.value })}
                />
              </label>
              <label>
                Geological experiment / period (optional)
                <input
                  aria-label="Raster geological experiment"
                  value={raster.context.experiment}
                  onChange={(event) => editContext({ experiment: event.target.value })}
                />
              </label>
              <label>
                Coordinate reference frame (if known)
                <input
                  aria-label="Raster reference frame"
                  value={raster.context.referenceFrame}
                  onChange={(event) => editContext({ referenceFrame: event.target.value })}
                />
              </label>
            </details>
          </fieldset>
          {metadata && (
            <details className="panel-disclosure">
              <summary>Display style</summary>
              <fieldset disabled={disabled}>
                <legend className="sr-only">Display style</legend>
                <label>
                  Color mode
                  <select
                    aria-label="Raster color mode"
                    value={raster.style.kind}
                    onChange={(event) =>
                      editStyle({
                        kind: event.target.value as "single-band" | "rgb",
                      })
                    }
                  >
                    <option value="single-band">Single band</option>
                    <option value="rgb" disabled={metadata.bands.length < 3}>
                      RGB
                    </option>
                  </select>
                </label>
                {(raster.style.kind === "single-band" ? ["Value"] : ["Red", "Green", "Blue"]).map(
                  (label, index) => (
                    <label key={label}>
                      {label} band
                      <select
                        aria-label={`${label} band`}
                        value={raster.style.bands[index]}
                        onChange={(event) => {
                          const bands: [number, number, number] = [...raster.style.bands];
                          bands[index] = Number(event.target.value);
                          editStyle({ bands });
                        }}
                      >
                        {metadata.bands.map((band, number) => (
                          <option key={number} value={number}>
                            {number}: {band.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ),
                )}
                <label>
                  Color range
                  <select
                    aria-label="Raster color range"
                    value={raster.style.range}
                    onChange={(event) =>
                      editStyle({
                        range: event.target.value as "preview" | "manual",
                      })
                    }
                  >
                    <option value="preview">Estimate from bounded preview (128 × 128)</option>
                    <option value="manual">Manual physical value range</option>
                  </select>
                </label>
                {raster.style.range === "manual" && (
                  <div className="field-grid">
                    <label>
                      Minimum
                      <input
                        aria-label="Raster minimum"
                        type="number"
                        value={raster.style.min}
                        onChange={(event) => editStyle({ min: event.target.value })}
                      />
                    </label>
                    <label>
                      Maximum
                      <input
                        aria-label="Raster maximum"
                        type="number"
                        value={raster.style.max}
                        onChange={(event) => editStyle({ max: event.target.value })}
                      />
                    </label>
                  </div>
                )}
                <p className="field-hint">
                  NoData stays transparent. Preview ranges are sampled display limits; numeric
                  values remain unchanged.
                </p>
                {raster.style.kind === "single-band" && (
                  <label>
                    Color ramp
                    <select
                      aria-label="Raster color ramp"
                      value={raster.style.palette}
                      onChange={(event) =>
                        editStyle({
                          palette: event.target.value as typeof raster.style.palette,
                        })
                      }
                    >
                      <option value="gray">Grayscale</option>
                      <option value="blue-brown">Blue–cream–brown</option>
                      <option value="blue-red">Blue–white–red</option>
                    </select>
                  </label>
                )}
                <label>
                  Additional NoData raw values (display only)
                  <input
                    aria-label="Raster additional NoData"
                    value={raster.style.additionalNoData}
                    placeholder="e.g. -9999, -32768"
                    onChange={(event) => editStyle({ additionalNoData: event.target.value })}
                  />
                </label>
                <p className="field-hint">
                  Extra display exclusions do not change original missing-value metadata or numeric
                  COG exports.
                </p>
              </fieldset>
            </details>
          )}
          <details className="panel-disclosure">
            <summary>Numeric COG export (optional)</summary>
            {metadata && (
              <fieldset disabled={disabled}>
                <legend className="sr-only">Numeric COG export</legend>
                {metadata.transform === null && (
                  <>
                    <label>
                      Target geographic bounds (W, S, E, N)
                      <input
                        aria-label="COG bounds"
                        value={raster.grid.bounds}
                        onChange={(event) =>
                          raster.setGrid({
                            ...raster.grid,
                            bounds: event.target.value,
                            confirmed: false,
                          })
                        }
                      />
                    </label>
                    <div className="field-grid">
                      <label>
                        Width
                        <input
                          aria-label="COG width"
                          type="number"
                          min={1}
                          value={raster.grid.width}
                          onChange={(event) =>
                            raster.setGrid({
                              ...raster.grid,
                              width: Number(event.target.value),
                              confirmed: false,
                            })
                          }
                        />
                      </label>
                      <label>
                        Height
                        <input
                          aria-label="COG height"
                          type="number"
                          min={1}
                          value={raster.grid.height}
                          onChange={(event) =>
                            raster.setGrid({
                              ...raster.grid,
                              height: Number(event.target.value),
                              confirmed: false,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={raster.grid.confirmed}
                        onChange={(event) =>
                          raster.setGrid({
                            ...raster.grid,
                            confirmed: event.target.checked,
                          })
                        }
                      />
                      Resample the selected slice onto this regular grid (nearest neighbour).
                    </label>
                  </>
                )}
                <button type="button" disabled={!ready} onClick={() => void raster.convert()}>
                  Create numeric COG
                </button>
                <p className="field-hint">
                  GeoTIFF exports its stored bands. NetCDF exports only the selected 2D slice in
                  physical units. Save the provenance JSON with the COG.
                </p>
              </fieldset>
            )}
            {raster.conversion && (
              <div className="button-row">
                <button type="button" onClick={raster.downloadCOG}>
                  Download COG
                </button>
                <button type="button" onClick={raster.downloadProvenance}>
                  Download provenance
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void raster.loadConverted()}
                >
                  Load converted COG
                </button>
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}

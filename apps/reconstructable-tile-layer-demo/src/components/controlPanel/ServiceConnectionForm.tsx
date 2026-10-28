import { useState } from "react";
import {
  PROVIDER_OPTIONS,
  getServicePreset,
  type ProviderKey,
  type TileServiceConfig,
} from "../../cesium/providers";
import { validateTileServiceConfig } from "../../cesium/tileServiceConfig";
import { useServiceTileTest } from "../../hooks/useServiceTileTest";
import { CitationInfo } from "./SourceCitation";
import { HelpHint } from "../HelpHint";

type Props = {
  config: TileServiceConfig;
  exampleKey: ProviderKey;
  busy: boolean;
  onChange: (config: TileServiceConfig) => void;
  onExampleChange: (key: ProviderKey) => void;
};
const numberValue = (value: number | null) =>
  value !== null && Number.isFinite(value) ? value : "";

export function ServiceConnectionForm({
  config,
  exampleKey,
  busy,
  onChange,
  onExampleChange,
}: Props) {
  const [citationOpen, setCitationOpen] = useState(false);
  const example = PROVIDER_OPTIONS.find((item) => item.key === exampleKey);
  const edited =
    exampleKey !== "custom-url-template" &&
    JSON.stringify(config) !== JSON.stringify(getServicePreset(exampleKey));
  const errors = validateTileServiceConfig(config);
  const { result, test } = useServiceTileTest(config);
  const patch = (value: Partial<TileServiceConfig>) => onChange({ ...config, ...value });
  const wms = (value: Partial<TileServiceConfig["wms"]>) =>
    patch({ wms: { ...config.wms, ...value } });
  const wmts = (value: Partial<TileServiceConfig["wmts"]>) =>
    patch({ wmts: { ...config.wmts, ...value } });
  return (
    <div className="service-connection-form" role="form" aria-label="Tile service connection">
      <fieldset className="unstyled-fieldset source-compact-stack" disabled={busy}>
        <div className="source-choice-field">
          <div className="field-heading">
            <label htmlFor="service-example">Fill from example</label>
            <HelpHint label="Service examples">
              Enter your own service URL, or fill this form from an example. Every setting is
              editable.
            </HelpHint>
          </div>
          <div className="source-select-row">
            <select
              id="service-example"
              value={exampleKey}
              onChange={(event) => {
                onExampleChange(event.target.value as ProviderKey);
                setCitationOpen(false);
              }}
            >
              <option value="custom-url-template">Your connection (blank form)</option>
              <optgroup label="Tiles hosted with this Demo">
                {PROVIDER_OPTIONS.filter((item) => item.key.startsWith("gplates-")).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="External online services">
                {PROVIDER_OPTIONS.filter(
                  (item) => !item.key.startsWith("gplates-") && item.key !== "custom-url-template",
                ).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <CitationInfo
              citation={example?.citation}
              isOpen={citationOpen}
              onToggle={() => setCitationOpen((open) => !open)}
              panelId="provider-preset-citation"
            />
          </div>
          {edited && (
            <div className="service-example-edited">
              <span>Example settings edited</span>
              <button
                type="button"
                className="secondary-button subtle-button"
                onClick={() => onExampleChange(exampleKey)}
              >
                Reset example
              </button>
            </div>
          )}
        </div>
        <div className="panel-field-grid">
          <label>
            Service type
            <select
              aria-label="Service type"
              value={config.protocol}
              onChange={(event) =>
                patch({ protocol: event.target.value as TileServiceConfig["protocol"] })
              }
            >
              <option value="url-template">XYZ / TMS</option>
              <option value="wms">WMS</option>
              <option value="wmts">WMTS</option>
            </select>
          </label>
          <div className="source-choice-field">
            <div className="field-heading">
              <label htmlFor="service-tiling-scheme">Projection</label>
              <HelpHint label="Service projection">
                Match the service's tile grid; EPSG alone does not specify it. L0:{" "}
                {config.levelZeroTilesX} columns × {config.levelZeroTilesY} rows; each level doubles
                both. Edit the grid in the additional parameters below.
              </HelpHint>
            </div>
            <select
              id="service-tiling-scheme"
              aria-label="Service tiling scheme"
              value={config.tilingSchemeKey}
              onChange={(event) => {
                const geographic = event.target.value === "geographic";
                patch({
                  tilingSchemeKey: geographic ? "geographic" : "web-mercator",
                  levelZeroTilesX: geographic ? 2 : 1,
                  levelZeroTilesY: 1,
                  bounds: null,
                  wms: { ...config.wms, crs: geographic ? "EPSG:4326" : "EPSG:3857" },
                });
              }}
            >
              <option value="geographic">EPSG:4326</option>
              <option value="web-mercator">EPSG:3857</option>
            </select>
          </div>
        </div>
        <div className="source-choice-field">
          <div className="field-heading">
            <label htmlFor="service-url">
              {config.protocol === "url-template"
                ? "Tile URL template"
                : "Service endpoint / REST template"}
            </label>
            <HelpHint label="Service URL">
              <span data-testid="service-address-help">
                {config.url.trim().startsWith("/tiles/")
                  ? "These tiles are hosted with this Demo. The relative URL uses this site's address; replace it with your own endpoint if needed."
                  : config.protocol === "url-template"
                    ? "{z} = level, {x} = column; {y} counts rows from the north (XYZ), {reverseY} from the south (TMS)."
                    : config.protocol === "wms"
                      ? "Cesium builds GetMap requests from these fields. Service, layer or BBOX values in the endpoint query are replaced by the form and tile grid."
                      : "Use a WMTS endpoint for KVP, or a REST template with {TileMatrix}, {TileRow}, {TileCol}. {Layer} and {style} follow the form fields."}
              </span>
            </HelpHint>
          </div>
          <textarea
            id="service-url"
            aria-label="Service URL"
            rows={2}
            spellCheck={false}
            value={config.url}
            placeholder={
              config.protocol === "url-template"
                ? "https://your-server/tiles/{z}/{x}/{y}.png"
                : "https://your-server/map-service"
            }
            onChange={(event) => patch({ url: event.target.value })}
          />
        </div>

        {config.protocol === "wms" && (
          <fieldset className="service-protocol-fields">
            <legend>
              <span className="field-heading">
                WMS request
                <HelpHint label="WMS request">
                  {config.wms.version === "1.3.0" && config.wms.crs === "EPSG:4326"
                    ? "WMS 1.3.0 / EPSG:4326 uses latitude, longitude BBOX order. Cesium handles it automatically."
                    : "BBOX follows the selected CRS and WMS version."}{" "}
                  Leave Styles blank to use the server's default style.
                </HelpHint>
              </span>
            </legend>
            <label>
              Layers
              <input
                aria-label="WMS layers"
                value={config.wms.layers}
                placeholder="layer_name,another_layer"
                onChange={(event) => wms({ layers: event.target.value })}
              />
            </label>
            <div className="grid-2">
              <label>
                Version
                <select
                  aria-label="WMS version"
                  value={config.wms.version}
                  onChange={(event) =>
                    wms({
                      version: event.target.value as TileServiceConfig["wms"]["version"],
                      crs:
                        event.target.value === "1.1.1" && config.wms.crs === "CRS:84"
                          ? "EPSG:4326"
                          : config.wms.crs,
                    })
                  }
                >
                  <option>1.3.0</option>
                  <option>1.1.1</option>
                </select>
              </label>
              <label>
                Request CRS
                <select
                  aria-label="WMS CRS"
                  value={config.wms.crs}
                  onChange={(event) =>
                    wms({ crs: event.target.value as TileServiceConfig["wms"]["crs"] })
                  }
                >
                  {config.tilingSchemeKey === "web-mercator" ? (
                    <option>EPSG:3857</option>
                  ) : (
                    <>
                      <option>EPSG:4326</option>
                      <option disabled={config.wms.version === "1.1.1"}>CRS:84</option>
                    </>
                  )}
                </select>
              </label>
            </div>
            <div className="panel-field-grid">
              <label>
                Styles
                <input
                  aria-label="WMS styles"
                  placeholder="Default"
                  value={config.wms.styles}
                  onChange={(event) => wms({ styles: event.target.value })}
                />
              </label>
              <label>
                Image format
                <input
                  aria-label="WMS image format"
                  list="service-image-formats"
                  value={config.wms.format}
                  onChange={(event) => wms({ format: event.target.value })}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.wms.transparent}
                onChange={(event) => wms({ transparent: event.target.checked })}
              />
              Transparent WMS background
            </label>
          </fieldset>
        )}
        {config.protocol === "wmts" && (
          <fieldset className="service-protocol-fields">
            <legend>
              <span className="field-heading">
                WMTS request
                <HelpHint label="WMTS request">
                  Use the matrix set ID from GetCapabilities. Its projection and L0 grid must match
                  this form.
                </HelpHint>
              </span>
            </legend>
            <label>
              Layer
              <input
                aria-label="WMTS layer"
                value={config.wmts.layer}
                onChange={(event) => wmts({ layer: event.target.value })}
              />
            </label>
            <label>
              Tile matrix set ID
              <input
                aria-label="WMTS matrix set"
                value={config.wmts.tileMatrixSetID}
                onChange={(event) => wmts({ tileMatrixSetID: event.target.value })}
              />
            </label>
            <div className="grid-2">
              <label>
                Style
                <input
                  aria-label="WMTS style"
                  value={config.wmts.style}
                  onChange={(event) => wmts({ style: event.target.value })}
                />
              </label>
              <label>
                Image format
                <input
                  aria-label="WMTS image format"
                  list="service-image-formats"
                  value={config.wmts.format}
                  onChange={(event) => wmts({ format: event.target.value })}
                />
              </label>
            </div>
          </fieldset>
        )}
        <datalist id="service-image-formats">
          <option value="image/png" />
          <option value="image/jpeg" />
          <option value="image/webp" />
        </datalist>
        <div className="grid-2">
          <label>
            Min level
            <input
              aria-label="Service minimum level"
              type="number"
              min={0}
              max={24}
              value={numberValue(config.minimumLevel)}
              onChange={(event) => patch({ minimumLevel: event.target.valueAsNumber })}
            />
          </label>
          <div className="source-choice-field">
            <div className="field-heading">
              <label htmlFor="service-max-level">Max level</label>
              <HelpHint label="Service level limits">
                Leave Max level blank when the service declares no upper limit. These are service
                limits; choose the loading level in Timeline &amp; tiles.
              </HelpHint>
            </div>
            <input
              id="service-max-level"
              aria-label="Service maximum level"
              type="number"
              min={0}
              max={24}
              value={numberValue(config.maximumLevel)}
              onChange={(event) =>
                patch({
                  maximumLevel: event.target.value === "" ? null : event.target.valueAsNumber,
                })
              }
            />
          </div>
        </div>

        <details className="panel-disclosure service-advanced">
          <summary>Grid, coverage and additional parameters</summary>
          <div className="source-compact-stack">
            <div className="grid-2">
              {(["levelZeroTilesX", "levelZeroTilesY", "tileWidth", "tileHeight"] as const).map(
                (key, index) => (
                  <label key={key}>
                    {["L0 columns", "L0 rows", "Tile width (px)", "Tile height (px)"][index]}
                    <input
                      aria-label={["L0 columns", "L0 rows", "Tile width", "Tile height"][index]}
                      type="number"
                      min={1}
                      value={numberValue(config[key])}
                      onChange={(event) => patch({ [key]: event.target.valueAsNumber })}
                    />
                  </label>
                ),
              )}
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.bounds !== null}
                onChange={(event) =>
                  patch({
                    bounds: event.target.checked
                      ? [
                          -180,
                          config.tilingSchemeKey === "geographic" ? -90 : -85.05112878,
                          180,
                          config.tilingSchemeKey === "geographic" ? 90 : 85.05112878,
                        ]
                      : null,
                  })
                }
              />
              Limit service coverage
            </label>
            {config.bounds && (
              <>
                <div className="grid-2">
                  {["West", "South", "East", "North"].map((label, index) => (
                    <label key={label}>
                      {label} (degrees)
                      <input
                        aria-label={`Service coverage ${label.toLowerCase()}`}
                        type="number"
                        step="any"
                        value={numberValue(config.bounds![index])}
                        onChange={(event) => {
                          const bounds = [...config.bounds!] as TileServiceConfig["bounds"];
                          bounds![index] = event.target.valueAsNumber;
                          patch({ bounds });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="field-hint">
                  Coverage clips the global grid; it does not redefine its origin. Crossing the
                  dateline and non-global matrix origins need a different tiling scheme.
                </p>
              </>
            )}
            <label>
              Subdomains (comma-separated)
              <input
                aria-label="Service subdomains"
                value={config.subdomains}
                onChange={(event) => patch({ subdomains: event.target.value })}
              />
            </label>
            {config.protocol === "wmts" && (
              <>
                <label>
                  Matrix labels (optional, one per level from L0)
                  <textarea
                    aria-label="WMTS matrix labels"
                    rows={3}
                    value={config.wmts.tileMatrixLabels}
                    placeholder={"EPSG:4326:0\nEPSG:4326:1\nEPSG:4326:2"}
                    onChange={(event) => wmts({ tileMatrixLabels: event.target.value })}
                  />
                </label>
                <label>
                  Dimensions (one name=value per line)
                  <textarea
                    aria-label="WMTS dimensions"
                    rows={2}
                    value={config.wmts.dimensions}
                    placeholder="Time=2025-01-01"
                    onChange={(event) => wmts({ dimensions: event.target.value })}
                  />
                </label>
              </>
            )}
            <label>
              Additional request parameters (one name=value per line)
              <textarea
                aria-label="Service parameters"
                rows={3}
                value={config.parameters}
                placeholder={
                  config.protocol === "wms" ? "TIME=2025-01-01\nELEVATION=0" : "language=en"
                }
                onChange={(event) => patch({ parameters: event.target.value })}
              />
            </label>
            <p className="field-hint">
              Service time is independent of geological reconstruction age. Parameters here stay
              fixed when moving the timeline.
            </p>
            <label>
              Connection name (optional)
              <input
                aria-label="Service connection name"
                value={config.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <label>
              Attribution / credit
              <input
                aria-label="Service attribution"
                value={config.credit}
                onChange={(event) => patch({ credit: event.target.value })}
              />
            </label>
          </div>
        </details>
      </fieldset>
      {errors.length > 0 && (
        <ul className="service-validation" aria-label="Connection validation">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
      <div className="action-with-help">
        <button
          type="button"
          className="secondary-button"
          disabled={busy || errors.length > 0 || result?.loading}
          onClick={() => void test()}
        >
          Test tile connection
        </button>
        <HelpHint label="Test tile connection">
          Fetch a sample tile to check the connection. Requests run in this browser; the server must
          allow browser access (CORS).
        </HelpHint>
      </div>
      {result && (
        <div className="service-tile-test" role="status" data-testid="service-test-result">
          {result.image && (
            <img src={result.image} width={80} height={80} alt="Sample tile from this connection" />
          )}
          <p className="field-hint">{result.message}</p>
        </div>
      )}
    </div>
  );
}

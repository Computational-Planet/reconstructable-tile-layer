import { useEffect, useState } from "react";
import type { LayerController } from "../../layers/LayerController";
import type { LayerDefinition, LayerView } from "../../layers/types";
import { validateAgeRange } from "../../layers/temporal";

interface Props {
  layer: LayerView;
  controller: LayerController;
  selected: boolean;
  atTop: boolean;
  atBottom: boolean;
  age: number;
  onPrepareFile(layer: LayerDefinition): void;
  onUseModel(id: string): void;
}

export function LayerItem({
  layer,
  controller,
  selected,
  atTop,
  atBottom,
  age,
  onPrepareFile,
  onUseModel,
}: Props) {
  const [name, setName] = useState(layer.name);
  const [youngest, setYoungest] = useState(String(layer.ageRange?.youngestMa ?? age));
  const [oldest, setOldest] = useState(String(layer.ageRange?.oldestMa ?? age));
  const [level, setLevel] = useState(layer.level);
  const [error, setError] = useState("");
  const busy = layer.status === "loading";
  const vector = layer.source.kind === "geojson";
  useEffect(() => {
    setName(layer.name);
  }, [layer.name]);
  useEffect(() => {
    setLevel(layer.level);
  }, [layer.level]);
  useEffect(() => {
    if (layer.ageRange) {
      setYoungest(String(layer.ageRange.youngestMa));
      setOldest(String(layer.ageRange.oldestMa));
    }
  }, [layer.ageRange?.youngestMa, layer.ageRange?.oldestMa]);
  const applyRange = () => {
    const range = { youngestMa: Number(youngest), oldestMa: Number(oldest) };
    const invalid =
      !youngest.trim() || !oldest.trim() ? "Enter both ages." : validateAgeRange(range);
    if (invalid) {
      setError(invalid);
      return;
    }
    controller.update(layer.id, { ageRange: range });
    setError("");
  };
  const state = !layer.visible
    ? "Hidden"
    : !layer.effectiveVisible
      ? "Outside age range"
      : layer.status === "ready"
        ? "Visible"
        : layer.status;
  return (
    <li className={`layer-card${selected ? " is-selected" : ""}`} data-layer-id={layer.id}>
      <div className="layer-card-heading">
        <input
          aria-label={`Show ${layer.name}`}
          type="checkbox"
          checked={layer.visible}
          onChange={(event) => controller.update(layer.id, { visible: event.target.checked })}
        />
        <button
          type="button"
          className="layer-select"
          aria-pressed={selected}
          onClick={() => controller.select(layer.id)}
        >
          <strong>{layer.name}</strong>
          <span>
            {vector
              ? "GeoJSON · Ordinary vector"
              : layer.mode === "static"
                ? "Ordinary imagery"
                : "Reconstruction"}{" "}
            · {state}
          </span>
        </button>
        {!vector && (
          <div className="layer-order-actions">
            <button
              type="button"
              className="secondary-button"
              aria-label={`Move ${layer.name} up`}
              title="Move up within group"
              disabled={atTop}
              onClick={() => controller.move(layer.id, "up")}
            >
              ↑
            </button>
            <button
              type="button"
              className="secondary-button"
              aria-label={`Move ${layer.name} down`}
              title="Move down within group"
              disabled={atBottom}
              onClick={() => controller.move(layer.id, "down")}
            >
              ↓
            </button>
          </div>
        )}
      </div>
      {selected && (
        <div className="layer-details">
          <label>
            Name
            <input
              aria-label="Selected layer name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (name.trim()) controller.update(layer.id, { name: name.trim() });
                else setName(layer.name);
              }}
            />
          </label>
          <label className="layer-opacity">
            Opacity <span>{Math.round(layer.opacity * 100)}%</span>
            <input
              aria-label="Selected layer opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={layer.opacity}
              onChange={(event) =>
                controller.update(layer.id, { opacity: Number(event.target.value) })
              }
            />
          </label>
          {layer.mode === "static" ? (
            <fieldset className="layer-age-range">
              <legend>Visible geological ages</legend>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!layer.ageRange}
                  onChange={(event) => {
                    controller.update(layer.id, {
                      ageRange: event.target.checked ? null : { youngestMa: age, oldestMa: age },
                    });
                    setError("");
                  }}
                />
                All ages
              </label>
              {layer.ageRange && (
                <>
                  <div className="grid-2">
                    <label>
                      Youngest (Ma)
                      <input
                        aria-label="Youngest visible age"
                        type="number"
                        min={0}
                        max={1800}
                        value={youngest}
                        onChange={(event) => setYoungest(event.target.value)}
                      />
                    </label>
                    <label>
                      Oldest (Ma)
                      <input
                        aria-label="Oldest visible age"
                        type="number"
                        min={0}
                        max={1800}
                        value={oldest}
                        onChange={(event) => setOldest(event.target.value)}
                      />
                    </label>
                  </div>
                  <button type="button" className="secondary-button" onClick={applyRange}>
                    Apply age range
                  </button>
                  <p className="field-hint">
                    Both endpoints are included. Coordinates remain fixed.
                  </p>
                </>
              )}
            </fieldset>
          ) : (
            <>
              <p className="field-hint">
                Follows the global timeline · {age} Ma
                <br />
                Model: {layer.model?.name || "Applied plate model"}
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => onUseModel(layer.id)}
              >
                Use current plate model
              </button>
            </>
          )}
          <p className="field-hint layer-source-name">
            {layer.source.kind !== "service"
              ? layer.source.descriptor.file.name
              : layer.source.config.url}
          </p>
          <p className={`layer-status${layer.status === "error" ? " is-error" : ""}`} role="status">
            {layer.message}
          </p>
          {error && (
            <p className="layer-status is-error" role="alert">
              {error}
            </p>
          )}
          {layer.status === "needs-file" || (vector && layer.status === "error") ? (
            <button type="button" onClick={() => onPrepareFile(layer)}>
              Prepare local file
            </button>
          ) : vector ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !layer.effectiveVisible}
              onClick={() => void controller.focus(layer.id)}
            >
              Zoom to layer
            </button>
          ) : layer.mode === "reconstructable" ? (
            <>
              <div className="layer-load-row">
                <label>
                  Level
                  <input
                    aria-label="Selected layer tile level"
                    type="number"
                    min={0}
                    max={24}
                    value={level}
                    disabled={busy}
                    onChange={(event) => setLevel(Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void controller.load(layer.id, level)}
                >
                  Load tiles
                </button>
              </div>
              <div className="grid-2">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void controller.load(layer.id, level, true)}
                >
                  Load view
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => controller.clear(layer.id)}
                >
                  Clear tiles
                </button>
              </div>
            </>
          ) : layer.status === "error" || layer.status === "unloaded" ? (
            <button type="button" onClick={() => void controller.activateImagery(layer.id)}>
              Retry layer
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button layer-remove"
            onClick={() => controller.remove(layer.id)}
          >
            Remove layer
          </button>
        </div>
      )}
    </li>
  );
}

import { useEffect, useId, useState } from "react";
import type { LayerController } from "../../layers/LayerController";
import type { LayerDefinition, LayerView } from "../../layers/types";
import { validateAgeRange } from "../../layers/temporal";
import { ViewLevelControl } from "./ViewLevelControl";
import { HelpHint } from "../HelpHint";

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
  const id = useId();
  const [name, setName] = useState(layer.name);
  const [youngest, setYoungest] = useState(String(layer.ageRange?.youngestMa ?? age));
  const [oldest, setOldest] = useState(String(layer.ageRange?.oldestMa ?? age));
  const [level, setLevel] = useState(layer.level);
  const [error, setError] = useState("");
  const [viewLevelValid, setViewLevelValid] = useState(true);
  const busy = layer.status === "loading";
  const vector = layer.source.kind === "geojson";
  const minimumLevel = layer.tileLevelRange?.minimumLevel ?? 0;
  const maximumLevel = layer.tileLevelRange?.maximumLevel ?? 24;
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
          <strong title={layer.name}>{layer.name}</strong>
          <span>{state}</span>
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
          <div className="layer-name-row">
            <div className="field-heading">
              <label htmlFor={`${id}-name`}>Name</label>
              <HelpHint label="Layer source">
                <strong>Source</strong>
                <div>
                  {layer.source.kind !== "service"
                    ? layer.source.descriptor.file.name
                    : layer.source.config.url}
                </div>
              </HelpHint>
            </div>
            <input
              id={`${id}-name`}
              aria-label="Selected layer name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (name.trim()) controller.update(layer.id, { name: name.trim() });
                else setName(layer.name);
              }}
            />
          </div>
          <label className="layer-opacity">
            Opacity
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
            <span>{Math.round(layer.opacity * 100)}%</span>
          </label>
          {layer.mode === "static" ? (
            <fieldset className="layer-age-range">
              <legend>
                <span className="field-heading">
                  Visible ages (Ma)
                  <HelpHint label="Visible geological ages">
                    Both endpoints are included. Coordinates remain fixed. All ages removes the time
                    limit; hiding a layer still takes precedence over its age range.
                  </HelpHint>
                </span>
              </legend>
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
                  <div className="layer-age-fields">
                    <label>
                      Youngest
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
                      Oldest
                      <input
                        aria-label="Oldest visible age"
                        type="number"
                        min={0}
                        max={1800}
                        value={oldest}
                        onChange={(event) => setOldest(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label="Apply age range"
                      onClick={applyRange}
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}
            </fieldset>
          ) : (
            <div className="layer-model-row">
              <p className="field-hint" title={layer.model?.name}>
                Model: {layer.model?.name || "Applied plate model"}
              </p>
              <HelpHint label="Layer plate model">
                <strong>{layer.model?.name || "Applied plate model"}.</strong> This layer follows
                the global timeline using its applied model. Use current replaces it with the plate
                domains, ROT files and anchor selected on the left, clears its loaded tiles, and
                requires reloading.
              </HelpHint>
              <button
                type="button"
                className="secondary-button"
                aria-label="Use current plate model"
                disabled={busy}
                onClick={() => onUseModel(layer.id)}
              >
                Use current
              </button>
            </div>
          )}
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
            <div className="layer-loading-controls">
              <div className="field-heading">
                <label htmlFor={`${id}-load-mode`}>Tile loading</label>
                <HelpHint label="Layer tile loading">
                  Specified level loads all relevant tiles at that level. Current view adds tiles in
                  the camera's view sphere while retaining previously loaded tiles. Lock view level
                  forces a level, including L0; leave it unchecked for automatic selection. Clear
                  tiles releases this layer's loaded tiles without removing the layer.
                </HelpHint>
              </div>
              <div className={layer.loadMode === "level" ? "layer-load-settings" : undefined}>
                <select
                  id={`${id}-load-mode`}
                  aria-label="Selected layer loading mode"
                  value={layer.loadMode}
                  disabled={busy}
                  onChange={(event) => {
                    const loadMode = event.target.value === "view" ? "view" : "level";
                    const nextLevel = Math.max(minimumLevel, Math.min(layer.level, maximumLevel));
                    controller.update(layer.id, {
                      loadMode,
                      ...(loadMode === "level" ? { level: nextLevel } : {}),
                    });
                    if (loadMode === "level") setLevel(nextLevel);
                  }}
                >
                  <option value="level">Specified level</option>
                  <option value="view">Current view</option>
                </select>
                {layer.loadMode === "level" && (
                  <input
                    aria-label="Selected layer tile level"
                    title="Tile level"
                    type="number"
                    min={minimumLevel}
                    max={maximumLevel}
                    value={level}
                    disabled={busy}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setLevel(value);
                      if (Number.isInteger(value) && value >= minimumLevel && value <= maximumLevel)
                        controller.update(layer.id, { level: value });
                    }}
                  />
                )}
              </div>
              {layer.loadMode === "view" && (
                <ViewLevelControl
                  value={layer.viewLevel}
                  defaultLevel={layer.level}
                  minimumLevel={minimumLevel}
                  maximumLevel={maximumLevel}
                  disabled={busy}
                  compact
                  onChange={(viewLevel) => controller.update(layer.id, { viewLevel })}
                  onValidityChange={setViewLevelValid}
                />
              )}
              <div className="layer-action-row">
                <button
                  type="button"
                  disabled={busy || (layer.loadMode === "view" && !viewLevelValid)}
                  onClick={() =>
                    void controller.load(layer.id, layer.loadMode === "level" ? level : undefined)
                  }
                >
                  Load tiles
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
            </div>
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

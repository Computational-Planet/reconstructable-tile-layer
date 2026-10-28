import { useRef } from "react";
import type { LayerController } from "../../layers/LayerController";
import { layerGroup, type LayerDefinition, type LayerSnapshot } from "../../layers/types";
import { LayerItem } from "./LayerItem";
import { HelpHint } from "../HelpHint";

interface Props extends LayerSnapshot {
  controller: LayerController | null;
  open: boolean;
  age: number;
  onOpenChange(open: boolean): void;
  onAdd(): void;
  onPrepareFile(layer: LayerDefinition): void;
  onUseModel(id: string): void;
}

export function LayerPanel({
  controller,
  layers,
  selectedId,
  open,
  age,
  onOpenChange,
  onAdd,
  onPrepareFile,
  onUseModel,
}: Props) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    onOpenChange(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };
  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="secondary-button layer-panel-toggle"
        aria-controls="layer-panel"
        aria-expanded={open}
        hidden={open}
        onClick={() => onOpenChange(true)}
      >
        Layers <span>{layers.length}</span>
      </button>
      <aside
        id="layer-panel"
        className="layer-panel"
        aria-label="Layer management"
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <header className="panel-section-heading">
          <div className="field-heading">
            <h2>
              Layers <span>{layers.length}</span>
            </h2>
            <HelpHint label="Layer management">
              Select a layer to edit it. Add layer opens the source form on the left. Reconstruction
              layers follow the global age; fixed layers use their visible age ranges. Higher
              imagery layers in each group draw on top. Reconstruction draws above ordinary imagery.
            </HelpHint>
          </div>
          <button
            type="button"
            className="secondary-button"
            aria-label="Hide layer panel"
            onClick={close}
          >
            Hide →
          </button>
        </header>
        <div className="layer-panel-toolbar">
          <p className="field-hint">
            Global age · <strong>{age} Ma</strong>
          </p>
          <button type="button" onClick={onAdd}>
            Add layer
          </button>
        </div>
        <div className="layer-panel-content" role="region" aria-label="Layer list" tabIndex={0}>
          {layers.length === 0 ? (
            <div className="panel-section layer-empty">
              <h3>No layers yet</h3>
              <p>Add an online service, TIFF or GeoJSON using the source form on the left.</p>
            </div>
          ) : (
            <>
              {(["vector", "reconstructable", "imagery"] as const).map((kind) => {
                const group = layers.filter((layer) => layerGroup(layer) === kind).reverse();
                const label =
                  kind === "vector"
                    ? "Ordinary vectors"
                    : kind === "imagery"
                      ? "Ordinary imagery"
                      : "Reconstruction layers";
                if (!group.length || !controller) return null;
                return (
                  <section className="layer-group" key={kind} aria-label={label}>
                    <div className="field-heading layer-group-heading">
                      <h3>
                        {label} <span>{group.length}</span>
                      </h3>
                      {kind === "vector" && (
                        <HelpHint label="Ordinary vectors">
                          GeoJSON coordinates remain fixed. Overlap follows geometry depth and
                          transparency; list order does not set draw order.
                        </HelpHint>
                      )}
                    </div>
                    <ol className="layer-list">
                      {group.map((layer, index) => (
                        <LayerItem
                          key={layer.id}
                          layer={layer}
                          controller={controller}
                          selected={selectedId === layer.id}
                          atTop={index === 0}
                          atBottom={index === group.length - 1}
                          age={age}
                          onPrepareFile={onPrepareFile}
                          onUseModel={onUseModel}
                        />
                      ))}
                    </ol>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

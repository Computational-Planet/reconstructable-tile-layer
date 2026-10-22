import { useRef } from "react";
import type { LayerController } from "../../layers/LayerController";
import { layerGroup, type LayerDefinition, type LayerSnapshot } from "../../layers/types";
import { LayerItem } from "./LayerItem";

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
          <div>
            <p className="eyebrow">Map layers</p>
            <h2>
              Layers <span>{layers.length}</span>
            </h2>
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
            <br />
            Imagery layers higher in each group draw on top.
          </p>
          <button type="button" onClick={onAdd}>
            Add layer
          </button>
        </div>
        {layers.length === 0 ? (
          <div className="panel-section layer-empty">
            <h3>No layers yet</h3>
            <p>
              Prepare an online service, local TIFF or GeoJSON on the left, then choose Add layer.
            </p>
            <p>
              Reconstruction layers follow the timeline. Fixed layers can have a visible age range.
            </p>
          </div>
        ) : (
          <>
            <p className="field-hint">Reconstruction layers draw above ordinary imagery.</p>
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
                  <h3>{label}</h3>
                  {kind === "vector" && (
                    <p className="field-hint">
                      Fixed coordinates. Overlap follows geometry depth and transparency; list order
                      does not set draw order.
                    </p>
                  )}
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
      </aside>
    </>
  );
}

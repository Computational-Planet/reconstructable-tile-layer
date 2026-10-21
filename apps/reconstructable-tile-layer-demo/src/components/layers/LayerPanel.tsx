import { useRef } from "react";
import type { LayerController } from "../../layers/LayerController";
import type { LayerDefinition, LayerSnapshot } from "../../layers/types";
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
            Layers higher in each group draw on top.
          </p>
          <button type="button" onClick={onAdd}>
            Add layer
          </button>
        </div>
        {layers.length === 0 ? (
          <div className="panel-section layer-empty">
            <h3>No layers yet</h3>
            <p>Prepare an online service or local raster on the left, then choose Add layer.</p>
            <p>
              Reconstruction layers follow the timeline. Fixed layers can have a visible age range.
            </p>
          </div>
        ) : (
          <>
            <p className="field-hint">Reconstruction layers draw above ordinary imagery.</p>
            {(["reconstructable", "static"] as const).map((mode) => {
              const group = layers.filter((layer) => layer.mode === mode).reverse();
              if (!group.length || !controller) return null;
              return (
                <section
                  className="layer-group"
                  key={mode}
                  aria-label={mode === "static" ? "Ordinary imagery" : "Reconstruction layers"}
                >
                  <h3>{mode === "static" ? "Ordinary imagery" : "Reconstruction"}</h3>
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

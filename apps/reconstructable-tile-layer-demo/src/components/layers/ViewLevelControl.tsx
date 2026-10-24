import { useEffect, useId, useState } from "react";

interface Props {
  value?: number;
  defaultLevel: number;
  minimumLevel: number;
  maximumLevel: number;
  disabled: boolean;
  onChange(value: number | undefined): void;
  onValidityChange(valid: boolean): void;
}

/** 两侧面板共用输入行为；只把有效层级写入图层，缺省表示自动选级。 */
export function ViewLevelControl({
  value,
  defaultLevel,
  minimumLevel,
  maximumLevel,
  disabled,
  onChange,
  onValidityChange,
}: Props) {
  const id = useId();
  const locked = value !== undefined;
  const initialLevel = Math.max(
    minimumLevel,
    Math.min(Number.isInteger(defaultLevel) ? defaultLevel : minimumLevel, maximumLevel),
  );
  const [draft, setDraft] = useState(String(value ?? initialLevel));
  useEffect(() => {
    setDraft(String(value ?? initialLevel));
  }, [value, initialLevel]);
  const parsed = draft.trim() ? Number(draft) : NaN;
  const valid =
    !locked || (Number.isInteger(parsed) && parsed >= minimumLevel && parsed <= maximumLevel);
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  return (
    <div className="view-level-control">
      <div className="view-level-row">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={locked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked ? initialLevel : undefined)}
          />
          Lock view level
        </label>
        <input
          aria-label="View tile level"
          aria-describedby={`${id}-hint`}
          aria-invalid={!valid}
          type="number"
          min={minimumLevel}
          max={maximumLevel}
          step={1}
          disabled={disabled || !locked}
          value={draft}
          onChange={(event) => {
            const text = event.target.value;
            const next = event.target.valueAsNumber;
            setDraft(text);
            if (
              text.trim() &&
              Number.isInteger(next) &&
              next >= minimumLevel &&
              next <= maximumLevel
            )
              onChange(next);
          }}
        />
      </div>
      <p id={`${id}-hint`} className="field-hint" role={valid ? undefined : "alert"}>
        {!valid
          ? `Enter a whole level from L${minimumLevel} to L${maximumLevel}.`
          : locked
            ? `Loads the current view at L${value}.`
            : "Automatically selects a level for the current view."}
      </p>
    </div>
  );
}

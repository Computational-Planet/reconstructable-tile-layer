import type { AgeRange, LayerDefinition } from "./types";

export function validateAgeRange(range: AgeRange | null): string | null {
  if (!range) return null;
  if (
    ![range.youngestMa, range.oldestMa].every(
      (age) => Number.isFinite(age) && age >= 0 && age <= 1800,
    )
  )
    return "Ages must be between 0 and 1800 Ma.";
  if (range.youngestMa > range.oldestMa) return "Youngest age must not exceed oldest age.";
  return null;
}

export function isLayerVisible(
  layer: Pick<LayerDefinition, "visible" | "ageRange">,
  age: number,
): boolean {
  return (
    layer.visible &&
    Number.isFinite(age) &&
    (!layer.ageRange || (age >= layer.ageRange.youngestMa && age <= layer.ageRange.oldestMa))
  );
}

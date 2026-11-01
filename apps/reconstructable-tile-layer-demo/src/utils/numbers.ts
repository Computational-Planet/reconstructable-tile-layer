/** Contains numeric formatting helpers used by experiment controls. */
export function roundNumber(value: number, digits = 6) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

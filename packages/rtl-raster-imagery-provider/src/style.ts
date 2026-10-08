import { toPhysicalValue, type RasterSource } from "rtl-raster-source";

export type RasterColor = readonly [number, number, number, number];
export type RasterDomain = readonly [number, number];
export type RasterStyle = (
  | {
      readonly kind: "single-band";
      readonly band: number;
      readonly domain?: RasterDomain;
      readonly colors?: readonly RasterColor[];
    }
  | {
      readonly kind: "rgb";
      readonly bands: readonly [number, number, number];
      readonly domains?: readonly [RasterDomain, RasterDomain, RasterDomain];
    }
) & {
  /** Additional raw missing values for display only; source metadata/numeric exports are unchanged. */
  readonly additionalNoData?: readonly number[];
};

export interface ResolvedRasterStyle {
  readonly kind: "single-band" | "rgb";
  readonly bands: readonly number[];
  readonly domains: readonly RasterDomain[];
  readonly colors: readonly RasterColor[];
  readonly additionalNoData?: readonly number[];
}

export async function resolveStyle(
  source: RasterSource,
  style: RasterStyle,
  signal?: AbortSignal,
): Promise<ResolvedRasterStyle> {
  const additionalNoData = [...(style.additionalNoData ?? [])];
  if (additionalNoData.length > 256 || additionalNoData.some((value) => !Number.isFinite(value)))
    throw new RangeError("additionalNoData accepts at most 256 finite raw values.");
  const bands = style.kind === "single-band" ? [style.band] : [...style.bands];
  if (
    bands.some(
      (band) => !Number.isInteger(band) || band < 0 || band >= source.metadata.bands.length,
    )
  )
    throw new RangeError("Style band indices must refer to source bands.");
  const requested = style.kind === "single-band" ? style.domain && [style.domain] : style.domains;
  let domains: RasterDomain[];
  if (requested) domains = requested.map((domain) => [...domain] as [number, number]);
  else {
    // 色标只基于一个有界预览；不把抽样范围伪装成全局统计值。
    const { width, height } = source.metadata;
    const preview = await source.readWindow({
      window: [0, 0, width, height],
      width: Math.min(128, width),
      height: Math.min(128, height),
      bands,
      signal,
    });
    domains = preview.bands.map((samples, index) => {
      let min = Infinity;
      let max = -Infinity;
      for (const sample of samples) {
        if (additionalNoData.includes(sample)) continue;
        const value = toPhysicalValue(sample, source.metadata.bands[bands[index]]);
        if (Number.isFinite(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
      return Number.isFinite(min)
        ? [min, max > min ? max : min + Math.max(1, Math.abs(min) * 0.01)]
        : [0, 1];
    });
  }
  if (
    domains.length !== bands.length ||
    domains.some(([min, max]) => !Number.isFinite(min) || !Number.isFinite(max) || max <= min)
  )
    throw new RangeError("Each style domain needs finite values with max > min.");
  const colors: RasterColor[] =
    style.kind === "single-band" && style.colors
      ? style.colors.map((color) => [...color])
      : [
          [0, 0, 0, 255],
          [255, 255, 255, 255],
        ];
  if (
    colors.length < 2 ||
    colors.some(
      (color) =>
        color.length !== 4 ||
        color.some((value) => !Number.isFinite(value) || value < 0 || value > 255),
    )
  )
    throw new RangeError("A color ramp needs at least two RGBA colors with components in 0–255.");
  domains.forEach(Object.freeze);
  colors.forEach(Object.freeze);
  return Object.freeze({
    kind: style.kind,
    bands: Object.freeze(bands),
    domains: Object.freeze(domains),
    colors: Object.freeze(colors),
    additionalNoData: Object.freeze(additionalNoData),
  });
}

/** Writes display colors only. Numeric buffers remain untouched. */
export function writeColor(
  values: readonly number[],
  style: ResolvedRasterStyle,
  rgba: Uint8ClampedArray,
  offset: number,
): void {
  if (values.some((value) => !Number.isFinite(value))) return;
  const normalized = values.map((value, index) => {
    const [min, max] = style.domains[index];
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
  });
  if (style.kind === "rgb") {
    rgba[offset] = 255 * normalized[0];
    rgba[offset + 1] = 255 * normalized[1];
    rgba[offset + 2] = 255 * normalized[2];
    rgba[offset + 3] = 255;
  } else {
    const position = normalized[0] * (style.colors.length - 1);
    const first = Math.min(style.colors.length - 2, Math.floor(position));
    const fraction = position - first;
    for (let channel = 0; channel < 4; channel++)
      rgba[offset + channel] =
        style.colors[first][channel] * (1 - fraction) + style.colors[first + 1][channel] * fraction;
  }
}

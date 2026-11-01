import { parseTileServiceConfig } from "../cesium/tileServiceConfig";
import { PROVIDER_OPTIONS, type ProviderKey } from "../cesium/providers";
import type { LocalRasterDescriptor, ModelSelection } from "../raster/context";
import type { LayerDefinition } from "./types";
import { validateAgeRange } from "./temporal";
import { TIFF_ONLY_MESSAGE } from "../raster/tiffInput";
import { parseGeoJsonDescriptor } from "../vector/geojson";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function parseExampleKey(value: unknown): ProviderKey | undefined {
  if (value === undefined) return undefined;
  if (!PROVIDER_OPTIONS.some((option) => option.key === value))
    throw new Error("Unknown service example key.");
  return value as ProviderKey;
}

/** 仅持久化配置，去掉仅在当前会话有效的本地模型 URL。 */
export function exportLayerDefinitions(layers: LayerDefinition[]): LayerDefinition[] {
  return layers.map((layer) => {
    const next = structuredClone(layer);
    if (next.model) {
      const local =
        next.model.featureUrl.startsWith("blob:") ||
        next.model.rotationUrls.some((url) => url.startsWith("blob:"));
      if (local) {
        next.modelRequiresReselect = true;
        next.model.featureUrl = next.model.featureUrl.startsWith("blob:")
          ? ""
          : next.model.featureUrl;
        next.model.rotationUrls = next.model.rotationUrls.filter((url) => !url.startsWith("blob:"));
      }
    }
    return next;
  });
}

function parseModel(value: unknown): ModelSelection | undefined {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    typeof value.featureUrl !== "string" ||
    !strings(value.rotationUrls) ||
    !(value.anchorPlateId === null || typeof value.anchorPlateId === "string")
  )
    throw new Error("Invalid layer plate model.");
  return {
    name: typeof value.name === "string" ? value.name : "",
    featureUrl: value.featureUrl,
    featureLabel: typeof value.featureLabel === "string" ? value.featureLabel : "",
    rotationUrls: value.rotationUrls,
    rotationLabels: strings(value.rotationLabels) ? value.rotationLabels : [],
    anchorPlateId: value.anchorPlateId,
    polygonRenderIntent:
      value.polygonRenderIntent === "classified" ? "classified" : "all-polygons-area",
  };
}

function parseLocalDescriptor(value: unknown): LocalRasterDescriptor {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !record(value.file) ||
    typeof value.file.name !== "string" ||
    !finite(value.file.size) ||
    value.file.size < 0 ||
    !finite(value.file.lastModified) ||
    !record(value.source) ||
    !finite(value.source.width) ||
    !finite(value.source.height) ||
    value.source.width <= 0 ||
    value.source.height <= 0 ||
    !record(value.context) ||
    !["reference-only", "paleo-snapshot", "modern-reconstructable"].includes(
      String(value.context.role),
    ) ||
    !(
      value.context.displayAgeMa === null ||
      (finite(value.context.displayAgeMa) &&
        value.context.displayAgeMa >= 0 &&
        value.context.displayAgeMa <= 1800)
    ) ||
    typeof value.context.ageSource !== "string" ||
    typeof value.context.experiment !== "string" ||
    typeof value.context.citation !== "string" ||
    typeof value.context.referenceFrame !== "string" ||
    !record(value.style) ||
    !["single-band", "rgb"].includes(String(value.style.kind))
  )
    throw new Error("Invalid local raster description in layer stack.");
  const style = value.style;
  if (value.source.format !== "geotiff") throw new Error(TIFF_ONLY_MESSAGE);
  if (
    style.kind === "single-band" &&
    (!finite(style.band) || !Number.isInteger(style.band) || style.band < 0)
  )
    throw new Error("Invalid local raster band.");
  if (
    style.kind === "rgb" &&
    (!Array.isArray(style.bands) ||
      style.bands.length !== 3 ||
      !style.bands.every((band) => finite(band) && Number.isInteger(band) && band >= 0))
  )
    throw new Error("Invalid local raster RGB bands.");
  for (const domain of [style.domain, ...(Array.isArray(style.domains) ? style.domains : [])]) {
    if (
      domain !== undefined &&
      (!Array.isArray(domain) ||
        domain.length !== 2 ||
        !domain.every(finite) ||
        domain[0] >= domain[1])
    )
      throw new Error("Invalid local raster display range.");
  }
  if (
    style.additionalNoData !== undefined &&
    (!Array.isArray(style.additionalNoData) || !style.additionalNoData.every(finite))
  )
    throw new Error("Invalid additional NoData values.");
  if (
    style.colors !== undefined &&
    (!Array.isArray(style.colors) ||
      style.colors.length < 2 ||
      !style.colors.every(
        (color) =>
          Array.isArray(color) &&
          (color.length === 3 || color.length === 4) &&
          color.every((channel) => finite(channel) && channel >= 0 && channel <= 255),
      ))
  )
    throw new Error("Invalid local raster palette.");
  return structuredClone(value) as unknown as LocalRasterDescriptor;
}

/** 整个列表校验通过后才替换当前图层，错误配置不会清掉已有场景。 */
export function parseLayerDefinitions(value: unknown): LayerDefinition[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Layer stack must contain at most 100 layers.");
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      (item.mode !== "static" && item.mode !== "reconstructable") ||
      typeof item.visible !== "boolean" ||
      !finite(item.opacity) ||
      item.opacity < 0 ||
      item.opacity > 1 ||
      (item.loadMode !== "level" && item.loadMode !== "view") ||
      !finite(item.level) ||
      !Number.isInteger(item.level) ||
      item.level < 0 ||
      item.level > 24 ||
      !record(item.source)
    )
      throw new Error("Invalid or duplicate layer definition.");
    ids.add(item.id);
    if (
      item.viewLevel !== undefined &&
      (!finite(item.viewLevel) ||
        !Number.isInteger(item.viewLevel) ||
        item.viewLevel < 0 ||
        item.viewLevel > 24)
    )
      throw new Error("Fixed view level must be an integer between 0 and 24.");
    let ageRange = null;
    if (item.ageRange !== null && item.ageRange !== undefined) {
      if (
        !record(item.ageRange) ||
        !finite(item.ageRange.youngestMa) ||
        !finite(item.ageRange.oldestMa)
      )
        throw new Error("Invalid layer age range.");
      ageRange = { youngestMa: item.ageRange.youngestMa, oldestMa: item.ageRange.oldestMa };
      const error = validateAgeRange(ageRange);
      if (error) throw new Error(error);
    }
    const source =
      item.source.kind === "service"
        ? {
            kind: "service" as const,
            config: parseTileServiceConfig(item.source.config),
            ...(item.source.exampleKey === undefined
              ? {}
              : { exampleKey: parseExampleKey(item.source.exampleKey) }),
          }
        : item.source.kind === "local"
          ? { kind: "local" as const, descriptor: parseLocalDescriptor(item.source.descriptor) }
          : item.source.kind === "geojson"
            ? {
                kind: "geojson" as const,
                descriptor: parseGeoJsonDescriptor(item.source.descriptor),
              }
            : null;
    if (!source) throw new Error("Unknown layer source.");
    if (
      source.kind === "service" &&
      item.mode === "reconstructable" &&
      item.loadMode === "level" &&
      (item.level < source.config.minimumLevel || item.level > (source.config.maximumLevel ?? 24))
    )
      throw new Error("Layer tile level is outside its service range.");
    if (
      source.kind === "service" &&
      item.viewLevel !== undefined &&
      (item.viewLevel < source.config.minimumLevel ||
        item.viewLevel > (source.config.maximumLevel ?? 24))
    )
      throw new Error("Fixed view level is outside its service range.");
    if (source.kind === "geojson" && item.mode !== "static")
      throw new Error(
        "GeoJSON supports fixed coordinates only; vector reconstruction is not available.",
      );
    if (
      source.kind === "local" &&
      (source.descriptor.context.role === "modern-reconstructable") !==
        (item.mode === "reconstructable")
    )
      throw new Error("The local raster's scientific use does not match its layer coordinates.");
    const model = parseModel(item.model);
    if (item.mode === "reconstructable" && !model)
      throw new Error("A reconstruction layer requires its model.");
    const definition: LayerDefinition = {
      id: item.id,
      name: item.name,
      mode: item.mode,
      source,
      model,
      modelRequiresReselect: item.modelRequiresReselect === true,
      visible: item.visible,
      opacity: item.opacity,
      ageRange,
      loadMode: item.loadMode,
      level: item.level,
      ...(item.viewLevel === undefined ? {} : { viewLevel: item.viewLevel }),
    };
    return exportLayerDefinitions([definition])[0];
  });
}

/** Converts exported experiment JSON back into editable control state. */
import type {
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "simple-geo-reconstruct";

import type {
  ProviderKey,
  UrlTemplateProviderConfig,
} from "../cesium/providers";
import {
  DEFAULT_ANCHOR_PLATE_ID,
  DEFAULT_GPLATES_REFERENCE_POLYGON_COLOR,
  DEFAULT_ROTATION_ANCHOR_MODE,
  GPLATES_REFERENCE_POLYGON_SOURCES,
  type FeaturePresetKey,
  type GplatesReferencePolygonKey,
  type RotationAnchorMode,
  type RotationPresetKey,
} from "../dataSources";
import type {
  ExperimentViewMode,
  GeographicExtent,
  ImportedExperimentControlState,
} from "./types";

const FEATURE_PRESET_KEYS: FeaturePresetKey[] = [
  "earthbyte-static-polygons-gpmlz",
  "zahirovic-2022-feature-geometries-gpml",
  "custom",
];

const ROTATION_PRESET_KEYS: RotationPresetKey[] = [
  "zahirovic-2022-optimised-mantle-rot",
  "custom",
];

const ROTATION_ANCHOR_MODES: RotationAnchorMode[] = [
  "default",
  "auto",
  "custom",
];

const GPLATES_REFERENCE_POLYGON_KEYS: GplatesReferencePolygonKey[] = [
  "off",
  "reconstructed-0",
  "reconstructed-35",
  "reconstructed-50",
  "reconstructed-120",
  "reconstructed-200",
  "reconstructed-400",
];

const PROVIDER_KEYS: ProviderKey[] = [
  "gplates-topography-4326",
  "gplates-topography-3857",
  "arcgis-world-imagery",
  "gmrt-topography-wms-3857",
  "mars-viking-4326",
  "custom-url-template",
];

const POLYGON_RENDER_INTENTS: PolygonRenderIntentMode[] = [
  "classified",
  "all-polygons-area",
];

const PRIMITIVE_TRANSFORM_MODES: PrimitiveTransformMode[] = [
  "dynamic3D",
  "bakedInstance",
];

const IMPORTABLE_VIEW_MODES: ExperimentViewMode[] = [
  "2D_RECTANGULAR",
  "3D_GLOBE",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const nextValue = value[key];
  return isRecord(nextValue) ? nextValue : null;
}

function getString(value: Record<string, unknown>, key: string) {
  const nextValue = value[key];
  return typeof nextValue === "string" ? nextValue : undefined;
}

function getNullableString(value: Record<string, unknown>, key: string) {
  const nextValue = value[key];
  if (nextValue === null) {
    return null;
  }

  return typeof nextValue === "string" ? nextValue : undefined;
}

function getBoolean(value: Record<string, unknown>, key: string) {
  const nextValue = value[key];
  return typeof nextValue === "boolean" ? nextValue : undefined;
}

function getNumber(value: Record<string, unknown>, key: string) {
  const nextValue = value[key];
  return typeof nextValue === "number" && Number.isFinite(nextValue)
    ? nextValue
    : undefined;
}

function getInteger(value: Record<string, unknown>, key: string) {
  const nextValue = getNumber(value, key);
  return nextValue === undefined ? undefined : Math.round(nextValue);
}

function getStringArray(value: Record<string, unknown>, key: string) {
  const nextValue = value[key];
  if (!Array.isArray(nextValue)) {
    return undefined;
  }

  const strings = nextValue.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
  return strings.length > 0 ? strings : undefined;
}

function getEnumValue<T extends string>(
  value: Record<string, unknown>,
  key: string,
  options: T[],
) {
  const nextValue = getString(value, key);
  return nextValue && options.includes(nextValue as T)
    ? (nextValue as T)
    : undefined;
}

function isZeroLikePlateId(value: string) {
  return /^[+-]?0+$/.test(value.trim());
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function parseExtent(value: Record<string, unknown>) {
  const west = getNumber(value, "west");
  const south = getNumber(value, "south");
  const east = getNumber(value, "east");
  const north = getNumber(value, "north");
  if (
    west === undefined ||
    south === undefined ||
    east === undefined ||
    north === undefined
  ) {
    return undefined;
  }

  return { west, south, east, north } satisfies GeographicExtent;
}

function parseCamera3D(value: Record<string, unknown>) {
  const targetLon = getNumber(value, "targetLon");
  const targetLat = getNumber(value, "targetLat");
  const range = getNumber(value, "range");
  const heading = getNumber(value, "heading");
  const pitch = getNumber(value, "pitch");
  const roll = getNumber(value, "roll");
  const orthographic = getBoolean(value, "orthographic");
  if (
    targetLon === undefined ||
    targetLat === undefined ||
    range === undefined ||
    heading === undefined ||
    pitch === undefined ||
    roll === undefined ||
    orthographic === undefined
  ) {
    return undefined;
  }

  return {
    targetLon,
    targetLat,
    range,
    heading,
    pitch,
    roll,
    orthographic,
  };
}

function parseOutput(value: Record<string, unknown>) {
  const width =
    getInteger(value, "configuredCssWidth") ?? getInteger(value, "width");
  const height =
    getInteger(value, "configuredCssHeight") ?? getInteger(value, "height");
  const pixelRatio =
    getNumber(value, "configuredPixelRatio") ?? getNumber(value, "pixelRatio");
  if (
    width === undefined ||
    height === undefined ||
    pixelRatio === undefined ||
    width < 1 ||
    height < 1 ||
    pixelRatio <= 0
  ) {
    return undefined;
  }

  return { width, height, pixelRatio };
}

function parseCustomProviderConfig(value: Record<string, unknown>) {
  const url = getString(value, "url");
  const tilingSchemeKey = getEnumValue(value, "tilingSchemeKey", [
    "geographic",
    "web-mercator",
  ]);
  const minimumLevel = getInteger(value, "minimumLevel");
  const maximumLevel = getInteger(value, "maximumLevel");
  if (
    !url ||
    !tilingSchemeKey ||
    minimumLevel === undefined ||
    maximumLevel === undefined
  ) {
    return undefined;
  }

  return {
    url,
    tilingSchemeKey,
    minimumLevel,
    maximumLevel,
  } satisfies UrlTemplateProviderConfig;
}

export function parseImportedExperimentConfig(
  value: unknown,
): ImportedExperimentControlState {
  if (!isRecord(value)) {
    throw new Error("Imported file is not a valid experiment JSON object.");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported experiment config schema version.");
  }

  const sources = getRecord(value, "sources");
  const render = getRecord(value, "render");
  const layers = getRecord(value, "layers");
  const output = getRecord(value, "output");
  const extent = getRecord(value, "extent");
  const camera3D = getRecord(value, "camera3D");
  const result: ImportedExperimentControlState = {
    referencePolygonColor: DEFAULT_GPLATES_REFERENCE_POLYGON_COLOR,
    referencePolygonKey: "off",
    rotationAnchorMode: DEFAULT_ROTATION_ANCHOR_MODE,
    anchorPlateId: DEFAULT_ANCHOR_PLATE_ID,
  };
  const viewConfig: ImportedExperimentControlState["experimentViewConfig"] = {};

  const caseId = getString(value, "caseId");
  if (caseId) {
    viewConfig.caseId = caseId;
  }

  const modelName = getString(value, "modelName");
  if (modelName) {
    viewConfig.modelName = modelName;
  }

  const viewMode = getEnumValue(value, "viewMode", IMPORTABLE_VIEW_MODES);
  if (viewMode) {
    viewConfig.viewMode = viewMode;
  }

  const age = getNumber(value, "timeMa");
  if (age !== undefined) {
    result.age = age;
  }

  const parsedExtent = extent ? parseExtent(extent) : undefined;
  if (parsedExtent) {
    viewConfig.extent = parsedExtent;
  }

  const parsedCamera3D = camera3D ? parseCamera3D(camera3D) : undefined;
  if (parsedCamera3D) {
    viewConfig.camera3D = parsedCamera3D;
  }

  const parsedOutput = output ? parseOutput(output) : undefined;
  if (parsedOutput) {
    viewConfig.output = parsedOutput;
  }

  if (layers) {
    const backgroundColor = getString(layers, "backgroundColor");
    if (backgroundColor) {
      result.globeBaseColor = backgroundColor;
    }
  }

  if (sources) {
    result.featurePresetKey = getEnumValue(
      sources,
      "featurePresetKey",
      FEATURE_PRESET_KEYS,
    );
    result.featureUrl =
      getString(sources, "featureUrl") ?? getString(value, "platePolygonFile");
    const referencePolygonColor = getString(
      sources,
      "gplatesReferencePolygonColor",
    );
    if (referencePolygonColor && isHexColor(referencePolygonColor)) {
      result.referencePolygonColor = referencePolygonColor;
    }
    result.referencePolygonKey = getEnumValue(
      sources,
      "gplatesReferencePolygonKey",
      GPLATES_REFERENCE_POLYGON_KEYS,
    );
    if (!result.referencePolygonKey) {
      const referencePolygonUrl = getString(
        sources,
        "gplatesReferencePolygonUrl",
      );
      result.referencePolygonKey =
        GPLATES_REFERENCE_POLYGON_SOURCES.find(
          (source) => source.url === referencePolygonUrl,
        )?.key ?? "off";
    }
    result.rotPresetKey = getEnumValue(
      sources,
      "rotationPresetKey",
      ROTATION_PRESET_KEYS,
    );
    const importedRotationAnchorMode = getEnumValue(
      sources,
      "rotationAnchorMode",
      ROTATION_ANCHOR_MODES,
    );
    const importedAnchorPlateId = getNullableString(sources, "anchorPlateId");
    if (importedRotationAnchorMode) {
      result.rotationAnchorMode = importedRotationAnchorMode;
      if (importedRotationAnchorMode === "default") {
        result.anchorPlateId = DEFAULT_ANCHOR_PLATE_ID;
      } else if (importedRotationAnchorMode === "auto") {
        result.anchorPlateId = null;
      } else {
        result.anchorPlateId =
          importedAnchorPlateId ?? DEFAULT_ANCHOR_PLATE_ID;
      }
    } else if (importedAnchorPlateId !== undefined) {
      result.anchorPlateId = importedAnchorPlateId;
      result.rotationAnchorMode =
        importedAnchorPlateId === null
          ? "auto"
          : isZeroLikePlateId(importedAnchorPlateId)
            ? "default"
            : "custom";
    }
    result.rotUrls =
      getStringArray(sources, "rotUrls") ??
      getStringArray(value, "rotationFiles");
    result.providerKey = getEnumValue(sources, "providerKey", PROVIDER_KEYS);

    const customProviderConfig = getRecord(sources, "customProviderConfig");
    const parsedCustomProviderConfig = customProviderConfig
      ? parseCustomProviderConfig(customProviderConfig)
      : undefined;
    if (parsedCustomProviderConfig) {
      result.customProviderConfig = parsedCustomProviderConfig;
    }
  } else {
    result.featureUrl = getString(value, "platePolygonFile");
    result.rotUrls = getStringArray(value, "rotationFiles");
  }

  if (render) {
    const level = getInteger(render, "level");
    if (level !== undefined && level >= 0) {
      result.level = level;
    }

    result.polygonRenderIntent = getEnumValue(
      render,
      "polygonRenderIntent",
      POLYGON_RENDER_INTENTS,
    );
    result.primitiveTransformMode = getEnumValue(
      render,
      "primitiveTransformMode",
      PRIMITIVE_TRANSFORM_MODES,
    );
    result.debugEnabled = getBoolean(render, "debugEnabled");
  }

  if (Object.keys(viewConfig).length > 0) {
    result.experimentViewConfig = viewConfig;
  }

  return result;
}

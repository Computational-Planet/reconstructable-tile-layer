import type {
  FeatureImportDiagnostics,
  FeaturePolygonData,
  ParsedGpmlFeature,
  PolygonRenderIntentMode,
  Position,
} from "./types";

const DEFAULT_BEGIN_TIME = 999999;
const DEFAULT_END_TIME = -999;

export interface GpmlFeatureAdapterOptions {
  polygonRenderIntent?: PolygonRenderIntentMode;
}

function positionsToFlatRing(positions: Position[]) {
  return positions.flatMap(([longitude, latitude]) => [longitude, latitude]);
}

function stripNamespace(value: string | number | undefined) {
  if (value === undefined) {
    return "";
  }
  const text = String(value);
  return text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text;
}

function getDiagnosticFeatureType(item: FeaturePolygonData) {
  return (
    stripNamespace(item.source?.attributes?.GPGIM_TYPE) ||
    item.source?.featureType ||
    "UnknownFeature"
  );
}

function incrementRecord(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function countFeatureIds(features: ParsedGpmlFeature[]) {
  const counts = new Map<string, number>();
  features.forEach((feature) => {
    counts.set(feature.id, (counts.get(feature.id) ?? 0) + 1);
  });
  return counts;
}

function getUniqueFeatureId(
  feature: ParsedGpmlFeature,
  featureIdCounts: Map<string, number>,
) {
  if ((featureIdCounts.get(feature.id) ?? 0) <= 1) {
    return feature.id;
  }
  return `${feature.id}:member:${feature.featureMemberIndex}`;
}

function createDiagnostics(
  features: ParsedGpmlFeature[],
  items: FeaturePolygonData[],
  polygonRenderIntent: PolygonRenderIntentMode,
  featureIdCounts: Map<string, number>,
): FeatureImportDiagnostics {
  const polygonCount = items.reduce(
    (count, item) => count + item.clipArea.polygons.length,
    0,
  );
  const interiorRingCount = items.reduce(
    (count, item) =>
      count +
      item.clipArea.polygons.reduce(
        (polygonCount, polygon) => polygonCount + (polygon.interiors?.length ?? 0),
        0,
      ),
    0,
  );
  const multiPolygonFeatureCount = items.filter(
    (item) => item.clipArea.polygons.length > 1,
  ).length;
  const skippedPolygonFeatureTypes: Record<string, number> = {};

  items.forEach((item) => {
    if (item.renderIntent !== "area" && item.clipArea.polygons.length > 0) {
      incrementRecord(skippedPolygonFeatureTypes, getDiagnosticFeatureType(item));
    }
  });
  const duplicatedIdCounts = Array.from(featureIdCounts.values()).filter(
    (count) => count > 1,
  );

  return {
    totalFeatures: features.length,
    totalImportedFeatures: items.length,
    areaFeatureCount: items.filter((item) => item.renderIntent === "area").length,
    lineLikeFeatureCount: items.filter(
      (item) => item.renderIntent === "line-like",
    ).length,
    unknownFeatureCount: items.filter(
      (item) => item.renderIntent === "unknown",
    ).length,
    polygonCount,
    polygonsWithHoles: items.reduce(
      (count, item) =>
        count +
        item.clipArea.polygons.filter(
          (polygon) => (polygon.interiors?.length ?? 0) > 0,
        ).length,
      0,
    ),
    interiorRingCount,
    multiPolygonFeatureCount,
    skippedFromFillFeatureCount: items.filter(
      (item) => item.renderIntent !== "area",
    ).length,
    polygonRenderIntent,
    skippedPolygonFeatureTypes,
    staticPolygonAreaOverrideCount: features.filter(
      (feature) => feature.renderIntentOverride === "all-polygons-area",
    ).length,
    duplicateOriginalFeatureIdCount: duplicatedIdCounts.length,
    duplicateFeatureMemberCount: duplicatedIdCounts.reduce(
      (total, count) => total + count - 1,
      0,
    ),
    renamedDuplicateFeatureIdCount: items.filter(
      (item) => item.featureId !== item.source?.originalFeatureId,
    ).length,
  };
}

export function parsedGpmlFeaturesToPaleoData(
  features: ParsedGpmlFeature[],
  options: GpmlFeatureAdapterOptions = {},
) {
  const polygonRenderIntent = options.polygonRenderIntent ?? "classified";
  const featureIdCounts = countFeatureIds(features);
  const items: FeaturePolygonData[] = [];

  features.forEach((feature) => {
    if (feature.reconstructionPlateId === undefined || feature.geometries.length === 0) {
      return;
    }

    const clipPolygons = feature.geometries.map((geometry) => ({
      exterior: positionsToFlatRing(geometry.polygon.exterior),
      interiors: geometry.polygon.interiors.map(positionsToFlatRing),
    }));
    const firstExterior = clipPolygons[0]?.exterior;
    if (!firstExterior) {
      return;
    }

    items.push({
      featureId: getUniqueFeatureId(feature, featureIdCounts),
      plateId: String(feature.reconstructionPlateId),
      lonlats: firstExterior,
      clipArea: {
        polygons: clipPolygons,
      },
      renderIntent: feature.renderIntent,
      time: {
        begine: feature.validTime?.begin ?? DEFAULT_BEGIN_TIME,
        end: feature.validTime?.end ?? DEFAULT_END_TIME,
      },
      source: {
        featureType: feature.featureType,
        originalFeatureId: feature.id,
        featureMemberIndex: feature.featureMemberIndex,
        propertyNames: Array.from(
          new Set(feature.geometries.map((geometry) => geometry.propertyName)),
        ),
        name: feature.name,
        polygonCount: clipPolygons.length,
        interiorCount: clipPolygons.reduce(
          (count, polygon) => count + polygon.interiors.length,
          0,
        ),
        attributes: feature.attributes,
      },
    });
  });

  return {
    items,
    diagnostics: createDiagnostics(
      features,
      items,
      polygonRenderIntent,
      featureIdCounts,
    ),
  };
}

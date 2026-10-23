import {
  getGplatesSourceName,
  readGplatesText,
  type GplatesReadOptions,
  type GplatesSource,
} from "./GplatesFileReader.js";
import { parsedGpmlFeaturesToPaleoData } from "./GpmlFeatureAdapter.js";
import { parseGpmlText } from "./GpmlParser.js";
import type {
  CoordinateOrder,
  FeatureImportDiagnostics,
  FeatureLoadResult,
  FeaturePolygonData,
  PolygonRenderIntentMode,
} from "./types.js";

/** Options shared by GPML and custom feature-source loaders. */
export interface FeatureLoadOptions extends GplatesReadOptions {
  /** Position-list order; `auto` infers the order from coordinate ranges. */
  coordinateOrder?: CoordinateOrder;
  /** Whether parsed polygons follow classification or are always filled. */
  polygonRenderIntent?: PolygonRenderIntentMode;
}

interface CustomPaleoItem {
  FeatureID: string;
  PlateID: string;
  ValidTime: {
    Begin: number;
    End: number;
  };
  Polygon: Array<{
    PosList: Array<{
      Latitude: number;
      Longitude: number;
    }>;
  }>;
}

function createDiagnostics(items: FeaturePolygonData[]): FeatureImportDiagnostics {
  return {
    totalFeatures: items.length,
    totalImportedFeatures: items.length,
    areaFeatureCount: items.length,
    lineLikeFeatureCount: 0,
    unknownFeatureCount: 0,
    polygonCount: items.reduce((count, item) => count + item.clipArea.polygons.length, 0),
    polygonsWithHoles: 0,
    interiorRingCount: 0,
    multiPolygonFeatureCount: items.filter((item) => item.clipArea.polygons.length > 1).length,
    skippedFromFillFeatureCount: 0,
    polygonRenderIntent: "classified",
    skippedPolygonFeatureTypes: {},
    staticPolygonAreaOverrideCount: 0,
    duplicateOriginalFeatureIdCount: 0,
    duplicateFeatureMemberCount: 0,
    renamedDuplicateFeatureIdCount: 0,
  };
}

function parseCustomJsonPaleoData(polygons: CustomPaleoItem[]): FeatureLoadResult {
  // Keep the old JSON behavior: consume only the first polygon per feature.
  const items = polygons.flatMap<FeaturePolygonData>((item) => {
    const polygon = item.Polygon[0];
    if (!polygon) {
      return [];
    }

    const exterior = polygon.PosList.flatMap((pos) => [pos.Longitude, pos.Latitude]);
    return [
      {
        featureId: item.FeatureID,
        plateId: item.PlateID,
        lonlats: exterior,
        clipArea: {
          polygons: [
            {
              exterior,
            },
          ],
        },
        renderIntent: "area",
        time: {
          begine: item.ValidTime.Begin,
          end: item.ValidTime.End,
        },
      },
    ];
  });

  return {
    items,
    diagnostics: createDiagnostics(items),
  };
}

function parseCustomJsonPaleoDataText(text: string) {
  return parseCustomJsonPaleoData(JSON.parse(text) as CustomPaleoItem[]);
}

function inferPolygonRenderIntent(sourceName: string): PolygonRenderIntentMode {
  let pathname = sourceName.split(/[?#]/)[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // 本地文件名允许普通百分号，并不一定是 URL 编码。
  }
  pathname = pathname.toLowerCase();
  if (pathname.includes("static_polygons") || pathname.includes("static_plate")) {
    return "all-polygons-area";
  }
  return "classified";
}

function parseGpmlPaleoData(xmlText: string, sourceName: string, options: FeatureLoadOptions = {}) {
  const polygonRenderIntent = options.polygonRenderIntent ?? inferPolygonRenderIntent(sourceName);
  return parsedGpmlFeaturesToPaleoData(
    parseGpmlText(xmlText, {
      coordinateOrder: options.coordinateOrder ?? "auto",
      polygonRenderIntent,
    }),
    { polygonRenderIntent },
  );
}

/** Loads normalized polygon records and import diagnostics from a GPlates source. */
export async function loadFeaturePolygonDataWithDiagnostics(
  source: GplatesSource,
  options: FeatureLoadOptions = {},
): Promise<FeatureLoadResult> {
  const sourceName = getGplatesSourceName(source, options.sourceName);
  const text = await readGplatesText(source, options);
  const contentStart = text.trimStart();

  // 按内容识别格式，让本地 File、无扩展名 URL 和旧的 blob URL 共用同一条链路。
  if (contentStart.startsWith("{") || contentStart.startsWith("[")) {
    return parseCustomJsonPaleoDataText(text);
  }

  if (contentStart.startsWith("<")) {
    return parseGpmlPaleoData(text, sourceName, options);
  }

  throw new Error(`Unsupported feature file content: ${sourceName}`);
}

/** Loads a supported feature source and returns only normalized features. */
export async function loadFeaturePolygonData(
  source: GplatesSource,
  options: FeatureLoadOptions = {},
) {
  const result = await loadFeaturePolygonDataWithDiagnostics(source, options);
  return result.items;
}

export type { FeatureImportDiagnostics, FeatureLoadResult, FeaturePolygonData } from "./types.js";

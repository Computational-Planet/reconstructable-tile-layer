import { decodeGplatesArrayBuffer, readGplatesXmlFromUrl } from "./GplatesFileReader.js";
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
export interface FeatureLoadOptions {
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

function getFeatureFileExtension(url: string) {
  const pathname = url.split(/[?#]/)[0].toLowerCase();
  const fileName = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? "" : fileName.slice(dotIndex + 1);
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

async function loadCustomJsonPaleoData(url: string): Promise<FeatureLoadResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch polygon JSON: ${url}`);
  }

  return parseCustomJsonPaleoData((await response.json()) as CustomPaleoItem[]);
}

function parseCustomJsonPaleoDataText(text: string) {
  return parseCustomJsonPaleoData(JSON.parse(text) as CustomPaleoItem[]);
}

function inferPolygonRenderIntent(url: string): PolygonRenderIntentMode {
  const pathname = decodeURIComponent(url.split(/[?#]/)[0]).toLowerCase();
  if (pathname.includes("static_polygons") || pathname.includes("static_plate")) {
    return "all-polygons-area";
  }
  return "classified";
}

function isDeepTimeGeoDebugEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("deepTimeGeoDebug") === "1";
}

function parseGpmlPaleoData(xmlText: string, sourceName: string, options: FeatureLoadOptions = {}) {
  const polygonRenderIntent = options.polygonRenderIntent ?? inferPolygonRenderIntent(sourceName);
  const result = parsedGpmlFeaturesToPaleoData(
    parseGpmlText(xmlText, {
      coordinateOrder: options.coordinateOrder ?? "auto",
      polygonRenderIntent,
    }),
    { polygonRenderIntent },
  );

  if (isDeepTimeGeoDebugEnabled()) {
    // eslint-disable-next-line no-console -- Explicitly enabled import diagnostics.
    console.debug("[GPlates] feature import", {
      url: sourceName,
      polygonRenderIntent,
      diagnostics: result.diagnostics,
    });
  }

  return result;
}

async function loadGpmlPaleoData(url: string, options: FeatureLoadOptions = {}) {
  const xmlText = await readGplatesXmlFromUrl(url);
  return parseGpmlPaleoData(xmlText, url, options);
}

async function loadFeatureDataByContent(url: string, options: FeatureLoadOptions = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch feature file: ${url}`);
  }

  const text = decodeGplatesArrayBuffer(await response.arrayBuffer(), url);
  const contentStart = text.trimStart();

  // Uploaded object URLs do not preserve file extensions, so route by content.
  if (contentStart.startsWith("{") || contentStart.startsWith("[")) {
    return parseCustomJsonPaleoDataText(text);
  }

  if (contentStart.startsWith("<")) {
    return parseGpmlPaleoData(text, url, options);
  }

  throw new Error(`Unsupported feature file content: ${url}`);
}

/**
 * Loads GPML, GPMLZ, XML, custom JSON, or uploaded blob content and returns
 * normalized features together with import diagnostics.
 */
export async function loadFeaturePolygonDataWithDiagnostics(
  url: string,
  options: FeatureLoadOptions = {},
): Promise<FeatureLoadResult> {
  const extension = getFeatureFileExtension(url);

  if (extension === "json") {
    return loadCustomJsonPaleoData(url);
  }

  if (extension === "gpml" || extension === "gpmlz" || extension === "xml") {
    return loadGpmlPaleoData(url, options);
  }

  if (url.startsWith("blob:")) {
    return loadFeatureDataByContent(url, options);
  }

  throw new Error(`Unsupported feature file format: ${url}`);
}

/** Loads a supported feature source and returns only normalized features. */
export async function loadFeaturePolygonData(url: string, options: FeatureLoadOptions = {}) {
  const result = await loadFeaturePolygonDataWithDiagnostics(url, options);
  return result.items;
}

export type { FeatureImportDiagnostics, FeatureLoadResult, FeaturePolygonData } from "./types.js";

import { readGplatesXmlFromUrl } from "./GplatesFileReader";
import { parsedGpmlFeaturesToPaleoData } from "./GpmlFeatureAdapter";
import { parseGpmlText } from "./GpmlParser";
import type {
  CoordinateOrder,
  FeatureImportDiagnostics,
  FeatureLoadResult,
  FeaturePolygonData,
  PolygonRenderIntentMode,
} from "./types";

export interface FeatureLoadOptions {
  coordinateOrder?: CoordinateOrder;
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
  return pathname.slice(pathname.lastIndexOf(".") + 1);
}

function createDiagnostics(items: FeaturePolygonData[]): FeatureImportDiagnostics {
  return {
    totalFeatures: items.length,
    totalImportedFeatures: items.length,
    areaFeatureCount: items.length,
    lineLikeFeatureCount: 0,
    unknownFeatureCount: 0,
    polygonCount: items.reduce(
      (count, item) => count + item.clipArea.polygons.length,
      0,
    ),
    polygonsWithHoles: 0,
    interiorRingCount: 0,
    multiPolygonFeatureCount: items.filter(
      (item) => item.clipArea.polygons.length > 1,
    ).length,
    skippedFromFillFeatureCount: 0,
    polygonRenderIntent: "classified",
    skippedPolygonFeatureTypes: {},
    staticPolygonAreaOverrideCount: 0,
    duplicateOriginalFeatureIdCount: 0,
    duplicateFeatureMemberCount: 0,
    renamedDuplicateFeatureIdCount: 0,
  };
}

async function loadCustomJsonPaleoData(url: string): Promise<FeatureLoadResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch polygon JSON: ${url}`);
  }

  const polygons = (await response.json()) as CustomPaleoItem[];

  // Keep the old JSON behavior: consume only the first polygon per feature.
  const items = polygons.flatMap<FeaturePolygonData>((item) => {
    const polygon = item.Polygon[0];
    if (!polygon) {
      return [];
    }

    const exterior = polygon.PosList.flatMap((pos) => [
      pos.Longitude,
      pos.Latitude,
    ]);
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

function inferPolygonRenderIntent(url: string): PolygonRenderIntentMode {
  const pathname = decodeURIComponent(url.split(/[?#]/)[0]).toLowerCase();
  if (pathname.includes("static_polygons") || pathname.includes("static_plate")) {
    return "all-polygons-area";
  }
  return "classified";
}

function isDeepTimeGeoDebugEnabled() {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("deepTimeGeoDebug") === "1"
  );
}

async function loadGpmlPaleoData(
  url: string,
  options: FeatureLoadOptions = {},
) {
  const polygonRenderIntent =
    options.polygonRenderIntent ?? inferPolygonRenderIntent(url);
  const xmlText = await readGplatesXmlFromUrl(url);
  const result = parsedGpmlFeaturesToPaleoData(
    parseGpmlText(xmlText, {
      coordinateOrder: options.coordinateOrder ?? "auto",
      polygonRenderIntent,
    }),
    { polygonRenderIntent },
  );

  if (isDeepTimeGeoDebugEnabled()) {
    console.debug("[GPlates] feature import", {
      url,
      polygonRenderIntent,
      diagnostics: result.diagnostics,
    });
  }

  return result;
}

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

  throw new Error(`Unsupported feature file format: ${url}`);
}

export async function loadFeaturePolygonData(
  url: string,
  options: FeatureLoadOptions = {},
) {
  const result = await loadFeaturePolygonDataWithDiagnostics(url, options);
  return result.items;
}

export type {
  FeatureImportDiagnostics,
  FeatureLoadResult,
  FeaturePolygonData,
} from "./types";

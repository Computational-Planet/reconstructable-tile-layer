import {
  GeographicTilingScheme,
  type ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";

export type ProviderKey =
  | "gplates-image-4326"
  | "arcgis-world-imagery"
  | "mars-viking-4326"
  | "custom-url-template";

export type UrlTemplateTilingSchemeKey = "geographic" | "web-mercator";

export type UrlTemplateProviderConfig = {
  url: string;
  tilingSchemeKey: UrlTemplateTilingSchemeKey;
  minimumLevel: number;
  maximumLevel: number;
};

export const DEFAULT_PROVIDER_KEY: ProviderKey = "gplates-image-4326";

export const DEFAULT_CUSTOM_PROVIDER_CONFIG: UrlTemplateProviderConfig = {
  url: "",
  tilingSchemeKey: "geographic",
  minimumLevel: 0,
  maximumLevel: 12,
};

export const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
}> = [
  { key: "gplates-image-4326", label: "GPlates Image (4326)" },
  { key: "arcgis-world-imagery", label: "ArcGIS World Imagery (3857)" },
  { key: "mars-viking-4326", label: "Mars Viking Mosaic (4326)" },
  { key: "custom-url-template", label: "Custom URL Template" },
];

function createTilingScheme(key: UrlTemplateTilingSchemeKey) {
  if (key === "geographic") {
    return new GeographicTilingScheme();
  }

  return new WebMercatorTilingScheme({});
}

export function validateUrlTemplateProviderConfig(
  config: UrlTemplateProviderConfig,
) {
  const errors: string[] = [];
  const url = config.url.trim();

  if (!url) {
    errors.push("Custom provider URL is required.");
  }
  if (url && !url.includes("{z}")) {
    errors.push("Custom provider URL must include {z}.");
  }
  if (url && !url.includes("{x}") && !url.includes("{reverseX}")) {
    errors.push("Custom provider URL must include {x} or {reverseX}.");
  }
  if (url && !url.includes("{y}") && !url.includes("{reverseY}")) {
    errors.push("Custom provider URL must include {y} or {reverseY}.");
  }
  if (!Number.isInteger(config.minimumLevel) || config.minimumLevel < 0) {
    errors.push(
      "Custom provider minimum level must be a non-negative integer.",
    );
  }
  if (!Number.isInteger(config.maximumLevel) || config.maximumLevel < 0) {
    errors.push(
      "Custom provider maximum level must be a non-negative integer.",
    );
  }
  if (
    Number.isInteger(config.minimumLevel) &&
    Number.isInteger(config.maximumLevel) &&
    config.maximumLevel < config.minimumLevel
  ) {
    errors.push(
      "Custom provider maximum level must be greater than minimum level.",
    );
  }

  return errors;
}

function createUrlTemplateProvider(
  config: UrlTemplateProviderConfig,
): ImageryProvider {
  const errors = validateUrlTemplateProviderConfig(config);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  return new UrlTemplateImageryProvider({
    url: config.url.trim(),
    tilingScheme: createTilingScheme(config.tilingSchemeKey),
    minimumLevel: config.minimumLevel,
    maximumLevel: config.maximumLevel,
  });
}

export function createImageryProvider(
  key: ProviderKey,
  customProviderConfig?: UrlTemplateProviderConfig,
): ImageryProvider {
  if (key === "gplates-image-4326") {
    return new UrlTemplateImageryProvider({
      url: "http://210.32.153.209:9003/image/wmts/HC4aVmBO/{z}/{x}/{y}",
      tilingScheme: new GeographicTilingScheme(),
      minimumLevel: 0,
      maximumLevel: 12,
    });
  }

  if (key === "mars-viking-4326") {
    return new UrlTemplateImageryProvider({
      url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg",
      tilingScheme: new GeographicTilingScheme(),
    });
  }

  if (key === "custom-url-template") {
    if (!customProviderConfig) {
      throw new Error("Custom provider settings are required.");
    }

    // Custom providers use Cesium's URL-template provider so callers can
    // choose the tiling scheme while keeping the tile URL token format stable.
    return createUrlTemplateProvider(customProviderConfig);
  }

  return new WebMapTileServiceImageryProvider({
    url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS",
    tileMatrixSetID: "1",
    layer: "World_Imagery",
    style: "default",
    format: "image/jpeg",
    maximumLevel: 18,
    tilingScheme: new WebMercatorTilingScheme({}),
  });
}

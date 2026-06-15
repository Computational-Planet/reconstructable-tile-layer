import {
  Ellipsoid,
  GeographicTilingScheme,
  type ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";

export type ProviderKey =
  | "gplates-topography-4326"
  | "gplates-topography-3857"
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

export type ImageryProviderReferenceOptions = {
  ellipsoid?: Ellipsoid;
};

export const DEFAULT_PROVIDER_KEY: ProviderKey = "gplates-topography-4326";
const GPLATES_TOPOGRAPHY_TILE_URL = "/tiles/Gplates_Topography/{z}/{x}/{y}.png";
const GPLATES_TOPOGRAPHY_3857_URL =
  "/tiles/Gplates_Topography_3857/{z}/{x}/{y}.png";

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
  { key: "gplates-topography-4326", label: "GPlates Topography (4326)" },
  { key: "gplates-topography-3857", label: "GPlates Topography (3857)" },
  { key: "arcgis-world-imagery", label: "ArcGIS World Imagery (3857)" },
  { key: "mars-viking-4326", label: "Mars Viking Mosaic (4326)" },
  { key: "custom-url-template", label: "Custom URL Template" },
];

function resolveProviderEllipsoid(options?: ImageryProviderReferenceOptions) {
  return options?.ellipsoid ?? Ellipsoid.default;
}

function createTilingScheme(
  key: UrlTemplateTilingSchemeKey,
  options?: ImageryProviderReferenceOptions,
) {
  const ellipsoid = resolveProviderEllipsoid(options);
  if (key === "geographic") {
    return new GeographicTilingScheme({ ellipsoid });
  }

  return new WebMercatorTilingScheme({ ellipsoid });
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
  options?: ImageryProviderReferenceOptions,
): ImageryProvider {
  const errors = validateUrlTemplateProviderConfig(config);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  return new UrlTemplateImageryProvider({
    url: config.url.trim(),
    tilingScheme: createTilingScheme(config.tilingSchemeKey, options),
    minimumLevel: config.minimumLevel,
    maximumLevel: config.maximumLevel,
  });
}

export function createImageryProvider(
  key: ProviderKey,
  customProviderConfig?: UrlTemplateProviderConfig,
  options?: ImageryProviderReferenceOptions,
): ImageryProvider {
  const ellipsoid = resolveProviderEllipsoid(options);
  if (key === "gplates-topography-4326") {
    return new UrlTemplateImageryProvider({
      url: GPLATES_TOPOGRAPHY_TILE_URL,
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      minimumLevel: 0,
      maximumLevel: 4,
    });
  }

  if (key === "gplates-topography-3857") {
    return new UrlTemplateImageryProvider({
      url: GPLATES_TOPOGRAPHY_3857_URL,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
      minimumLevel: 0,
      maximumLevel: 4,
    });
  }

  if (key === "mars-viking-4326") {
    return new UrlTemplateImageryProvider({
      url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg",
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
    });
  }

  if (key === "custom-url-template") {
    if (!customProviderConfig) {
      throw new Error("Custom provider settings are required.");
    }

    return createUrlTemplateProvider(customProviderConfig, { ellipsoid });
  }

  return new WebMapTileServiceImageryProvider({
    url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS",
    tileMatrixSetID: "1",
    layer: "World_Imagery",
    style: "default",
    format: "image/jpeg",
    maximumLevel: 18,
    tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
  });
}

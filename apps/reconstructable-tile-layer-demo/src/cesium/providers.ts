import {
  Ellipsoid,
  GeographicTilingScheme,
  type ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";

export type ProviderKey =
  | "gplates-topography-4326"
  | "gplates-topography-3857"
  | "arcgis-world-imagery"
  | "gmrt-topography-wms-3857"
  | "nasa-gibs-blue-marble-3857"
  | "nasa-gibs-blue-marble-4326"
  | "eox-terrain-4326"
  | "eox-terrain-light-4326"
  | "eox-s2-cloudless-2025-4326"
  | "eox-s2-cloudless-2025-3857"
  | "macrostrat-carto"
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
const GMRT_TOPOGRAPHY_WMS_URL =
  "https://www.gmrt.org/services/mapserver/wms_merc";
const NASA_GIBS_BLUE_MARBLE_LAYER = "BlueMarble_ShadedRelief_Bathymetry";
const NASA_GIBS_BLUE_MARBLE_3857_WMS_URL =
  "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/";
const NASA_GIBS_BLUE_MARBLE_4326_WMS_URL =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/";
const EOX_TERRAIN_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/terrain/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_TERRAIN_LIGHT_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/terrain-light/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_S2_CLOUDLESS_2025_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_S2_CLOUDLESS_2025_3857_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const MACROSTRAT_CARTO_TILE_URL =
  "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";

export const DEFAULT_CUSTOM_PROVIDER_CONFIG: UrlTemplateProviderConfig = {
  url: "",
  tilingSchemeKey: "geographic",
  minimumLevel: 0,
  maximumLevel: 12,
};

export type ProviderOption = {
  key: ProviderKey;
  label: string;
  citation?: string;
};

// Keep provider citation guidance close to the preset endpoints it describes.
const GPLATES_TOPOGRAPHY_CITATION =
  "Source raster: cite Amante and Eakins (2009), ETOPO1 1 Arc-Minute Global Relief Model, DOI: 10.7289/V5C8276M. If using the bundled colour raster from GPlates GeoData, also cite EarthByte (2024), GPlates 2.5 GeoData v1, DOI: 10.5281/zenodo.14194897.";
const ARCGIS_WORLD_IMAGERY_CITATION =
  "Basemap: cite/attribute Esri ArcGIS Online World Imagery following Esri basemap guidance. World Imagery sources include Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community.";
const GMRT_TOPOGRAPHY_CITATION =
  "Dataset/service: cite Ryan et al. (2009), Global Multi-Resolution Topography (GMRT) synthesis data set, Geochemistry, Geophysics, Geosystems, 10, Q03014, DOI: 10.1029/2008GC002332; data DOI: 10.1594/IEDA.100001.";
const NASA_GIBS_BLUE_MARBLE_CITATION =
  "Service/layer: cite NASA Earth Science Data and Information System, Global Imagery Browse Services (GIBS) API for Developers, layer BlueMarble_ShadedRelief_Bathymetry.";
const EOX_TERRAIN_CITATION =
  "Service/layer: cite EOX::Maps and the EOX::Maps WMTS capabilities for the terrain layer. Follow EOX::Maps layer attribution; Terrain/Terrain Light use open data sources listed by EOX and rendering by EOX.";
const EOX_S2_CLOUDLESS_2025_CITATION =
  "Layer: cite/attribute EOX Sentinel-2 cloudless 2025 by EOX IT Services GmbH. The layer uses Copernicus Sentinel-2 data and is served through EOX::Maps/WMTS.";
const MACROSTRAT_CARTO_CITATION =
  "Map/data platform: cite Peters et al. (2018), Macrostrat, DOI: 10.1029/2018GC007467. Tile service: cite Macrostrat Tile Services for the /carto/{z}/{x}/{y}.png endpoint.";

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    key: "gplates-topography-4326",
    label: "GPlates Topography (4326)",
    citation: GPLATES_TOPOGRAPHY_CITATION,
  },
  {
    key: "gplates-topography-3857",
    label: "GPlates Topography (3857)",
    citation: GPLATES_TOPOGRAPHY_CITATION,
  },
  {
    key: "arcgis-world-imagery",
    label: "ArcGIS World Imagery (3857)",
    citation: ARCGIS_WORLD_IMAGERY_CITATION,
  },
  {
    key: "gmrt-topography-wms-3857",
    label: "GMRT Topography WMS (3857)",
    citation: GMRT_TOPOGRAPHY_CITATION,
  },
  {
    key: "nasa-gibs-blue-marble-3857",
    label: "NASA GIBS Blue Marble (3857)",
    citation: NASA_GIBS_BLUE_MARBLE_CITATION,
  },
  {
    key: "nasa-gibs-blue-marble-4326",
    label: "NASA GIBS Blue Marble (4326)",
    citation: NASA_GIBS_BLUE_MARBLE_CITATION,
  },
  {
    key: "eox-terrain-4326",
    label: "EOX Terrain (4326)",
    citation: EOX_TERRAIN_CITATION,
  },
  {
    key: "eox-terrain-light-4326",
    label: "EOX Terrain Light (4326)",
    citation: EOX_TERRAIN_CITATION,
  },
  {
    key: "eox-s2-cloudless-2025-4326",
    label: "EOX Sentinel-2 Cloudless 2025 (4326)",
    citation: EOX_S2_CLOUDLESS_2025_CITATION,
  },
  {
    key: "eox-s2-cloudless-2025-3857",
    label: "EOX Sentinel-2 Cloudless 2025 (3857)",
    citation: EOX_S2_CLOUDLESS_2025_CITATION,
  },
  {
    key: "macrostrat-carto",
    label: "Macrostrat Carto (3857)",
    citation: MACROSTRAT_CARTO_CITATION,
  },
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

  if (key === "gmrt-topography-wms-3857") {
    return new WebMapServiceImageryProvider({
      url: GMRT_TOPOGRAPHY_WMS_URL,
      layers: "topo",
      parameters: {
        version: "1.3.0",
        format: "image/png",
        transparent: "false",
      },
      crs: "EPSG:3857",
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
      enablePickFeatures: false,
      credit: "GMRT",
    });
  }

  if (key === "nasa-gibs-blue-marble-3857") {
    return new WebMapServiceImageryProvider({
      url: NASA_GIBS_BLUE_MARBLE_3857_WMS_URL,
      layers: NASA_GIBS_BLUE_MARBLE_LAYER,
      parameters: {
        version: "1.3.0",
        format: "image/jpeg",
        transparent: "false",
      },
      crs: "EPSG:3857",
      maximumLevel: 8,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
      enablePickFeatures: false,
      credit: "NASA GIBS",
    });
  }

  if (key === "nasa-gibs-blue-marble-4326") {
    return new WebMapServiceImageryProvider({
      url: NASA_GIBS_BLUE_MARBLE_4326_WMS_URL,
      layers: NASA_GIBS_BLUE_MARBLE_LAYER,
      parameters: {
        version: "1.3.0",
        format: "image/jpeg",
        transparent: "false",
      },
      crs: "EPSG:4326",
      maximumLevel: 7,
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      enablePickFeatures: false,
      credit: "NASA GIBS",
    });
  }

  if (key === "eox-terrain-light-4326") {
    return new WebMapTileServiceImageryProvider({
      url: EOX_TERRAIN_LIGHT_4326_TILE_URL,
      layer: "terrain-light",
      style: "default",
      format: "image/jpeg",
      tileMatrixSetID: "WGS84",
      maximumLevel: 17,
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      credit: "EOX::Maps",
    });
  }

  if (key === "eox-terrain-4326") {
    return new WebMapTileServiceImageryProvider({
      url: EOX_TERRAIN_4326_TILE_URL,
      layer: "terrain",
      style: "default",
      format: "image/jpeg",
      tileMatrixSetID: "WGS84",
      maximumLevel: 17,
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      credit: "EOX::Maps",
    });
  }

  if (key === "eox-s2-cloudless-2025-4326") {
    return new WebMapTileServiceImageryProvider({
      url: EOX_S2_CLOUDLESS_2025_4326_TILE_URL,
      layer: "s2cloudless-2025",
      style: "default",
      format: "image/jpeg",
      tileMatrixSetID: "WGS84",
      maximumLevel: 13,
      tilingScheme: new GeographicTilingScheme({ ellipsoid }),
      credit: "EOxCloudless 2025 by EOX",
    });
  }

  if (key === "eox-s2-cloudless-2025-3857") {
    return new WebMapTileServiceImageryProvider({
      url: EOX_S2_CLOUDLESS_2025_3857_TILE_URL,
      layer: "s2cloudless-2025_3857",
      style: "default",
      format: "image/jpeg",
      tileMatrixSetID: "GoogleMapsCompatible",
      maximumLevel: 14,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
      credit: "EOxCloudless 2025 by EOX",
    });
  }

  if (key === "macrostrat-carto") {
    return new UrlTemplateImageryProvider({
      url: MACROSTRAT_CARTO_TILE_URL,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid }),
      minimumLevel: 0,
      maximumLevel: 12,
      credit: "Macrostrat",
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

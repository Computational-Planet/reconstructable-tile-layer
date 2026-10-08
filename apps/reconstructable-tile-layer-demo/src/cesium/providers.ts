import {
  Ellipsoid,
  Rectangle,
  Resource,
  GeographicTilingScheme,
  type ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";

import { resolveDemoAssetUrl } from "../utils/demoAssetUrl";

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

export type {
  UrlTemplateProviderConfig,
  UrlTemplateTilingSchemeKey,
  TileServiceConfig,
} from "./tileServiceConfig";
import {
  emptyTileServiceConfig,
  migrateUrlTemplateConfig,
  validateTileServiceConfig,
  parseServiceParameters,
  splitMatrixLabels,
  MANAGED_SERVICE_PARAMETERS,
  type UrlTemplateProviderConfig,
  type TileServiceConfig,
} from "./tileServiceConfig";

export type ImageryProviderReferenceOptions = {
  ellipsoid?: Ellipsoid;
};

export const DEFAULT_PROVIDER_KEY: ProviderKey = "gplates-topography-4326";
const GPLATES_TOPOGRAPHY_TILE_URL = "/tiles/Gplates_Topography/{z}/{x}/{y}.png";
const GPLATES_TOPOGRAPHY_3857_URL = "/tiles/Gplates_Topography_3857/{z}/{x}/{y}.png";
const GMRT_TOPOGRAPHY_WMS_URL = "https://www.gmrt.org/services/mapserver/wms_merc";
const NASA_GIBS_BLUE_MARBLE_LAYER = "BlueMarble_ShadedRelief_Bathymetry";
const NASA_GIBS_BLUE_MARBLE_3857_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/";
const NASA_GIBS_BLUE_MARBLE_4326_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/";
const EOX_TERRAIN_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/terrain/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_TERRAIN_LIGHT_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/terrain-light/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_S2_CLOUDLESS_2025_4326_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const EOX_S2_CLOUDLESS_2025_3857_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
const MACROSTRAT_CARTO_TILE_URL = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";

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
  { key: "custom-url-template", label: "Your connection (blank form)" },
];

type PresetFields = Partial<Omit<TileServiceConfig, "wms" | "wmts">> & {
  wms?: Partial<TileServiceConfig["wms"]>;
  wmts?: Partial<TileServiceConfig["wmts"]>;
};
const geographic = { tilingSchemeKey: "geographic", levelZeroTilesX: 2 } as const;
const wmsBase = { protocol: "wms", maximumLevel: null } as const;
const wmtsBase = { protocol: "wmts", credit: "EOX::Maps" } as const;
// 示例是一份可见、可修改的连接配置；不再有按示例名称执行的 Provider 分支。
const SERVICE_PRESETS: Record<Exclude<ProviderKey, "custom-url-template">, PresetFields> = {
  "gplates-topography-4326": { ...geographic, url: GPLATES_TOPOGRAPHY_TILE_URL, maximumLevel: 4 },
  "gplates-topography-3857": { url: GPLATES_TOPOGRAPHY_3857_URL, maximumLevel: 4 },
  "arcgis-world-imagery": {
    protocol: "wmts",
    url: "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS",
    maximumLevel: 18,
    wmts: { layer: "World_Imagery", tileMatrixSetID: "1", format: "image/jpeg" },
  },
  "gmrt-topography-wms-3857": {
    ...wmsBase,
    url: GMRT_TOPOGRAPHY_WMS_URL,
    credit: "GMRT",
    wms: { layers: "topo", transparent: false },
  },
  "nasa-gibs-blue-marble-3857": {
    ...wmsBase,
    url: NASA_GIBS_BLUE_MARBLE_3857_WMS_URL,
    maximumLevel: 8,
    credit: "NASA GIBS",
    wms: { layers: NASA_GIBS_BLUE_MARBLE_LAYER, format: "image/jpeg", transparent: false },
  },
  "nasa-gibs-blue-marble-4326": {
    ...wmsBase,
    ...geographic,
    url: NASA_GIBS_BLUE_MARBLE_4326_WMS_URL,
    maximumLevel: 7,
    credit: "NASA GIBS",
    wms: {
      layers: NASA_GIBS_BLUE_MARBLE_LAYER,
      format: "image/jpeg",
      transparent: false,
      crs: "EPSG:4326",
    },
  },
  "eox-terrain-4326": {
    ...wmtsBase,
    ...geographic,
    url: EOX_TERRAIN_4326_TILE_URL.replace("/terrain/default/", "/{Layer}/{style}/"),
    maximumLevel: 17,
    wmts: { layer: "terrain", tileMatrixSetID: "WGS84", format: "image/jpeg" },
  },
  "eox-terrain-light-4326": {
    ...wmtsBase,
    ...geographic,
    url: EOX_TERRAIN_LIGHT_4326_TILE_URL.replace("/terrain-light/default/", "/{Layer}/{style}/"),
    maximumLevel: 17,
    wmts: { layer: "terrain-light", tileMatrixSetID: "WGS84", format: "image/jpeg" },
  },
  "eox-s2-cloudless-2025-4326": {
    ...wmtsBase,
    ...geographic,
    url: EOX_S2_CLOUDLESS_2025_4326_TILE_URL.replace(
      "/s2cloudless-2025/default/",
      "/{Layer}/{style}/",
    ),
    maximumLevel: 13,
    credit: "EOxCloudless 2025 by EOX",
    wmts: { layer: "s2cloudless-2025", tileMatrixSetID: "WGS84", format: "image/jpeg" },
  },
  "eox-s2-cloudless-2025-3857": {
    ...wmtsBase,
    url: EOX_S2_CLOUDLESS_2025_3857_TILE_URL.replace(
      "/s2cloudless-2025_3857/default/",
      "/{Layer}/{style}/",
    ),
    maximumLevel: 14,
    credit: "EOxCloudless 2025 by EOX",
    wmts: {
      layer: "s2cloudless-2025_3857",
      tileMatrixSetID: "GoogleMapsCompatible",
      format: "image/jpeg",
    },
  },
  "macrostrat-carto": { url: MACROSTRAT_CARTO_TILE_URL, maximumLevel: 12, credit: "Macrostrat" },
};

export function getServicePreset(key: ProviderKey): TileServiceConfig {
  const defaults = emptyTileServiceConfig();
  if (key === "custom-url-template") return defaults;
  const preset = SERVICE_PRESETS[key];
  return {
    ...defaults,
    ...preset,
    name: PROVIDER_OPTIONS.find((item) => item.key === key)?.label ?? key,
    wms: {
      ...defaults.wms,
      crs: preset.tilingSchemeKey === "geographic" ? "EPSG:4326" : "EPSG:3857",
      ...preset.wms,
    },
    wmts: { ...defaults.wmts, ...preset.wmts },
  };
}

export function getServiceLabel(config: TileServiceConfig) {
  return (
    config.name.trim() ||
    `${config.protocol === "url-template" ? "URL template" : config.protocol.toUpperCase()} connection`
  );
}

export function createTileServiceProvider(
  config: TileServiceConfig,
  options?: ImageryProviderReferenceOptions,
): ImageryProvider {
  const errors = validateTileServiceConfig(config);
  if (errors.length) throw new Error(errors[0]);
  // EPSG:3857 的米制 BBOX 必须使用标准半径；显示用的 GPlates 球半径不能改变服务坐标。
  const ellipsoid =
    config.protocol === "wms" && config.tilingSchemeKey === "web-mercator"
      ? Ellipsoid.WGS84
      : (options?.ellipsoid ?? Ellipsoid.default);
  const schemeOptions = {
    ellipsoid,
    numberOfLevelZeroTilesX: config.levelZeroTilesX,
    numberOfLevelZeroTilesY: config.levelZeroTilesY,
  };
  const tilingScheme =
    config.tilingSchemeKey === "geographic"
      ? new GeographicTilingScheme(schemeOptions)
      : new WebMercatorTilingScheme(schemeOptions);
  const rectangle = config.bounds
    ? Rectangle.fromDegrees(...config.bounds)
    : tilingScheme.rectangle;
  const resource = new Resource({ url: resolveDemoAssetUrl(config.url.trim()) });
  const managed = MANAGED_SERVICE_PARAMETERS[config.protocol] as string[];
  for (const key of Object.keys(resource.queryParameters)) {
    if (managed.includes(key.toLowerCase())) delete resource.queryParameters[key];
  }
  // Cesium combine 会调用参数对象的 hasOwnProperty，传入普通对象保持上游兼容。
  resource.setQueryParameters({ ...parseServiceParameters(config.parameters) });
  const common = {
    url: resource,
    tilingScheme,
    rectangle,
    minimumLevel: config.minimumLevel,
    maximumLevel: config.maximumLevel ?? undefined,
    tileWidth: config.tileWidth,
    tileHeight: config.tileHeight,
    subdomains: config.subdomains
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    credit: config.credit || undefined,
  };
  if (config.protocol === "url-template")
    return new UrlTemplateImageryProvider({ ...common, enablePickFeatures: false });
  if (config.protocol === "wms") {
    return new WebMapServiceImageryProvider({
      ...common,
      layers: config.wms.layers.trim(),
      crs: config.wms.crs,
      srs: config.wms.crs,
      parameters: {
        version: config.wms.version,
        styles: config.wms.styles,
        format: config.wms.format,
        transparent: String(config.wms.transparent),
      },
      enablePickFeatures: false,
    });
  }
  const sw = tilingScheme.positionToTileXY(Rectangle.southwest(rectangle), config.minimumLevel);
  const ne = tilingScheme.positionToTileXY(Rectangle.northeast(rectangle), config.minimumLevel);
  if (sw && ne && (Math.abs(ne.x - sw.x) + 1) * (Math.abs(ne.y - sw.y) + 1) > 4)
    throw new Error(
      "WMTS minimum level covers more than four tiles. Use service minimum L0 and load L2/L3 in step 3, or restrict the service coverage.",
    );
  // Cesium 的 REST 模板支持矩阵参数；额外绑定 Layer，让编辑图层名也会改变真实请求。
  resource.setTemplateValues({ Layer: config.wmts.layer.trim(), layer: config.wmts.layer.trim() });
  const labels = splitMatrixLabels(config.wmts.tileMatrixLabels);
  return new WebMapTileServiceImageryProvider({
    ...common,
    layer: config.wmts.layer.trim(),
    style: config.wmts.style.trim(),
    format: config.wmts.format,
    tileMatrixSetID: config.wmts.tileMatrixSetID.trim(),
    tileMatrixLabels: labels.length ? labels : undefined,
    dimensions: { ...parseServiceParameters(config.wmts.dimensions) },
  });
}

/** 兼容既有 benchmark 和旧 URL 模板配置；交互表单直接使用 createTileServiceProvider。 */
export function createImageryProvider(
  key: ProviderKey,
  custom?: UrlTemplateProviderConfig,
  options?: ImageryProviderReferenceOptions,
): ImageryProvider {
  if (key === "custom-url-template" && !custom)
    throw new Error("Custom service settings are required.");
  return createTileServiceProvider(
    key === "custom-url-template" && custom
      ? migrateUrlTemplateConfig(custom)
      : getServicePreset(key),
    options,
  );
}

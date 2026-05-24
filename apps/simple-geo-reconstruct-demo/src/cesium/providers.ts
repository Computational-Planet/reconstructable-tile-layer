import {
  GeographicTilingScheme,
  type ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";

export type ProviderKey = "arcgis-world-imagery" | "mars-viking-4326";

export const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
}> = [
  { key: "arcgis-world-imagery", label: "ArcGIS World Imagery (3857)" },
  { key: "mars-viking-4326", label: "Mars Viking Mosaic (4326)" },
];

export function createImageryProvider(key: ProviderKey): ImageryProvider {
  if (key === "mars-viking-4326") {
    return new UrlTemplateImageryProvider({
      url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg",
      tilingScheme: new GeographicTilingScheme(),
    });
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

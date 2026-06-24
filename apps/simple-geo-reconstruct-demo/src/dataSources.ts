export type FeaturePresetKey =
  | "earthbyte-static-polygons-gpmlz"
  | "zahirovic-2022-feature-geometries-gpml"
  | "custom";

export type RotationPresetKey =
  | "zahirovic-2022-optimised-mantle-rot"
  | "custom";

export type RotationAnchorMode = "default" | "auto" | "custom";

export type GplatesReferencePolygonKey =
  | "off"
  | "reconstructed-0"
  | "reconstructed-35"
  | "reconstructed-50"
  | "reconstructed-120"
  | "reconstructed-200"
  | "reconstructed-400";

export type FeaturePreset = {
  key: FeaturePresetKey;
  label: string;
  url: string;
  citation: string;
};

export type RotationPreset = {
  key: RotationPresetKey;
  label: string;
  urls: string[];
  citation: string;
};

export type GplatesReferencePolygonSource = {
  key: GplatesReferencePolygonKey;
  label: string;
  url: string | null;
};

const GPLATES_25_GEODATA_CITATION =
  "Data package: EarthByte (2024), GPlates 2.5 GeoData version 1, DOI: 10.5281/zenodo.14194897.";

export const FEATURE_PRESETS: FeaturePreset[] = [
  {
    key: "earthbyte-static-polygons-gpmlz",
    label: "EarthByte present-day static plate polygons GPMLZ",
    url: "/features/Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz",
    citation:
      "Static polygons: cite Müller et al. (2019), Seton et al. (2020), and Zahirovic et al. (2022). " +
      GPLATES_25_GEODATA_CITATION,
  },
  {
    key: "zahirovic-2022-feature-geometries-gpml",
    label: "Zahirovic et al. (2022) feature geometries GPML",
    url: "/features/Zahirovic_etal_2022_Feature_Geometries.gpml",
    citation:
      "Feature geometries: cite Zahirovic et al. (2022). " +
      GPLATES_25_GEODATA_CITATION,
  },
];

export const ROTATION_PRESETS: RotationPreset[] = [
  {
    key: "zahirovic-2022-optimised-mantle-rot",
    label: "Zahirovic et al. (2022) optimised mantle ROT",
    urls: [
      "/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot",
    ],
    citation:
      "Rotation model: cite Zahirovic et al. (2022). " +
      GPLATES_25_GEODATA_CITATION,
  },
];

export const GPLATES_REFERENCE_POLYGON_SOURCES: GplatesReferencePolygonSource[] =
  [
    {
      key: "off",
      label: "Off",
      url: null,
    },
    {
      key: "reconstructed-0",
      label: "GPlates reconstructed 0 Ma",
      url: "/gplates_ref/geojson/reconstructed_0.00Ma.geojson",
    },
    {
      key: "reconstructed-35",
      label: "GPlates reconstructed 35 Ma",
      url: "/gplates_ref/geojson/reconstructed_35.00Ma.geojson",
    },
    {
      key: "reconstructed-50",
      label: "GPlates reconstructed 50 Ma",
      url: "/gplates_ref/geojson/reconstructed_50.00Ma.geojson",
    },
    {
      key: "reconstructed-120",
      label: "GPlates reconstructed 120 Ma",
      url: "/gplates_ref/geojson/reconstructed_120.00Ma.geojson",
    },
    {
      key: "reconstructed-200",
      label: "GPlates reconstructed 200 Ma",
      url: "/gplates_ref/geojson/reconstructed_200.00Ma.geojson",
    },
    {
      key: "reconstructed-400",
      label: "GPlates reconstructed 400 Ma",
      url: "/gplates_ref/geojson/reconstructed_400.00Ma.geojson",
    },
  ];

export const DEFAULT_FEATURE_PRESET = FEATURE_PRESETS[0];
export const DEFAULT_ROTATION_PRESET = ROTATION_PRESETS[0];
export const DEFAULT_ROTATION_ANCHOR_MODE: RotationAnchorMode = "default";
export const DEFAULT_ANCHOR_PLATE_ID = "0";
export const DEFAULT_GPLATES_REFERENCE_POLYGON_KEY: GplatesReferencePolygonKey =
  "off";
export const DEFAULT_GPLATES_REFERENCE_POLYGON_COLOR = "#E6E6E6";

export function getGplatesReferencePolygonSource(
  key: GplatesReferencePolygonKey,
) {
  return GPLATES_REFERENCE_POLYGON_SOURCES.find((source) => source.key === key);
}

export type FeaturePresetKey =
  | "seton-2012-static-polygons-gpmlz"
  | "earthbyte-static-polygons-gpmlz"
  | "merdith-2021-static-polygons-gpml"
  | "custom";

export type RotationPresetKey =
  | "seton-2012-rot"
  | "zahirovic-2022-optimised-mantle-rot"
  | "merdith-2021-rot"
  | "custom";

export type RotationAnchorMode = "default" | "auto" | "custom";

export type GplatesReferencePolygonKey =
  | "off"
  | "reconstructed-0"
  | "reconstructed-35"
  | "reconstructed-50"
  | "reconstructed-120"
  | "reconstructed-200"
  | "reconstructed-400"
  | "seton-2012-120"
  | "zahirovic-2022-300"
  | "merdith-2021-750";

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
const SETON_2012_MODEL_CITATION =
  "Model package: cite Seton et al. (2012) and the Seton et al. GPlates dataset, DOI: 10.5281/zenodo.10596050.";
const ZAHIROVIC_2022_MODEL_CITATION =
  "Model package: cite Zahirovic et al. (2022) and the Zahirovic et al. GPlates dataset, DOI: 10.5281/zenodo.13899315.";
const MERDITH_2021_MODEL_CITATION =
  "Model package: cite Merdith et al. (2021) and the Merdith et al. GPlates dataset, DOI: 10.5281/zenodo.13635864.";

// Keep the Case 2B package sequence around the existing Zahirovic-compatible option.
export const FEATURE_PRESETS: FeaturePreset[] = [
  {
    key: "seton-2012-static-polygons-gpmlz",
    label: "Seton et al. (2012) static polygons GPMLZ",
    url: "/features/Seton_etal_ESR2012_StaticPolygons.1.gpmlz",
    citation: SETON_2012_MODEL_CITATION,
  },
  {
    key: "earthbyte-static-polygons-gpmlz",
    label: "EarthByte present-day static plate polygons GPMLZ",
    url: "/features/Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz",
    citation:
      "Static polygons: cite Müller et al. (2019), Seton et al. (2020), and Zahirovic et al. (2022). " +
      GPLATES_25_GEODATA_CITATION,
  },
  {
    key: "merdith-2021-static-polygons-gpml",
    label: "Merdith et al. (2021) static polygons GPML",
    url: "/features/shapes_static_polygons_Merdith_etal.gpml",
    citation: MERDITH_2021_MODEL_CITATION,
  },
];

export const ROTATION_PRESETS: RotationPreset[] = [
  {
    key: "seton-2012-rot",
    label: "Seton et al. (2012) ROT",
    urls: ["/rotations/Seton_etal_ESR2012_2012.1.rot"],
    citation: SETON_2012_MODEL_CITATION,
  },
  {
    key: "zahirovic-2022-optimised-mantle-rot",
    label: "Zahirovic et al. (2022) optimised mantle ROT",
    urls: [
      "/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot",
    ],
    citation: ZAHIROVIC_2022_MODEL_CITATION,
  },
  {
    key: "merdith-2021-rot",
    label: "Merdith et al. (2021) ROT",
    urls: ["/rotations/1000_0_rotfile_Merdith_etal.rot"],
    citation: MERDITH_2021_MODEL_CITATION,
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
      label: "GPlates reconstructed 0 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_0.00Ma.geojson",
    },
    {
      key: "reconstructed-35",
      label: "GPlates reconstructed 35 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_35.00Ma.geojson",
    },
    {
      key: "reconstructed-50",
      label: "GPlates reconstructed 50 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_50.00Ma.geojson",
    },
    {
      key: "reconstructed-120",
      label: "GPlates reconstructed 120 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_120.00Ma.geojson",
    },
    {
      key: "reconstructed-200",
      label: "GPlates reconstructed 200 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_200.00Ma.geojson",
    },
    {
      key: "reconstructed-400",
      label: "GPlates reconstructed 400 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/reconstructed_400.00Ma.geojson",
    },
    {
      key: "seton-2012-120",
      label: "GPlates reconstructed 120 Ma (Seton2012)",
      url: "/gplates_ref/geojson/Seton2012_120.00Ma.geojson",
    },
    {
      key: "zahirovic-2022-300",
      label: "GPlates reconstructed 300 Ma (Zahirovic2022)",
      url: "/gplates_ref/geojson/Zahirovic2022_300.00Ma.geojson",
    },
    {
      key: "merdith-2021-750",
      label: "GPlates reconstructed 750 Ma (Merdith2021)",
      url: "/gplates_ref/geojson/Merdith2021_750.00Ma.geojson",
    },
  ];

export const DEFAULT_FEATURE_PRESET =
  FEATURE_PRESETS.find(
    (preset) => preset.key === "earthbyte-static-polygons-gpmlz",
  ) ?? FEATURE_PRESETS[0];
export const DEFAULT_ROTATION_PRESET =
  ROTATION_PRESETS.find(
    (preset) => preset.key === "zahirovic-2022-optimised-mantle-rot",
  ) ?? ROTATION_PRESETS[0];
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

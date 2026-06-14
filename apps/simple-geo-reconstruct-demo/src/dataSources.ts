export type FeaturePresetKey =
  | "earthbyte-static-polygons-gpmlz"
  | "zahirovic-2022-feature-geometries-gpml"
  | "custom";

export type RotationPresetKey =
  | "zahirovic-2022-optimised-mantle-rot"
  | "custom";

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
    urls: ["/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot"],
    citation:
      "Rotation model: cite Zahirovic et al. (2022). " +
      GPLATES_25_GEODATA_CITATION,
  },
];

export const DEFAULT_FEATURE_PRESET = FEATURE_PRESETS[0];
export const DEFAULT_ROTATION_PRESET = ROTATION_PRESETS[0];

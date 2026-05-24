export type FeaturePresetKey =
  | "matthews-static-gpml"
  | "matthews-coastlines-gpmlz"
  | "cao-coasts-gpmlz"
  | "matthews-static-json"
  | "scotese-json"
  | "custom";

export type RotationPresetKey =
  | "matthews-test-1800-0"
  | "matthews-global-410-0"
  | "scotese"
  | "custom";

export type FeaturePreset = {
  key: FeaturePresetKey;
  label: string;
  url: string;
};

export type RotationPreset = {
  key: RotationPresetKey;
  label: string;
  urls: string[];
};

export const FEATURE_PRESETS: FeaturePreset[] = [
  {
    key: "matthews-static-gpml",
    label: "Matthews static polygons GPML",
    url: "/geo/Matthews++/test/shapes_static_polygons_Merdith_et_al.gpml",
  },
  {
    key: "matthews-coastlines-gpmlz",
    label: "EarthByte present-day coastlines GPMLZ",
    url: "/geo/Matthews++/test/Global_EarthByte_GPlates_PresentDay_Coastlines.gpmlz",
  },
  {
    key: "cao-coasts-gpmlz",
    label: "Cao shapes coasts GPMLZ",
    url: "/geo/Matthews++/test/shapes_coasts.gpmlz",
  },
  {
    key: "matthews-static-json",
    label: "Matthews static polygons JSON",
    url: "/geo/Matthews++/PresentDay_StaticPlatePolygons_Matthews++.json",
  },
  {
    key: "scotese-json",
    label: "Scotese paleo plate polygons JSON",
    url: "/geo/Scotese/PALEO_PLATE_POLYGON.json",
  },
];

export const ROTATION_PRESETS: RotationPreset[] = [
  {
    key: "matthews-test-1800-0",
    label: "Matthews test ROT 1800-0 Ma",
    urls: [
      "/geo/Matthews++/test/1000_0_rotfile_20240725.rot",
      "/geo/Matthews++/test/1800_1000_rotfile_20240725.rot",
    ],
  },
  {
    key: "matthews-global-410-0",
    label: "Matthews global ROT 410-0 Ma",
    urls: [
      "/geo/Matthews++/Global_EB_250-0Ma_GK07_Matthews++.rot",
      "/geo/Matthews++/Global_EB_410-250Ma_GK07_Matthews++.rot",
    ],
  },
  {
    key: "scotese",
    label: "Scotese PALEOMAP ROT",
    urls: ["/geo/Scotese/PALEOMAP_PlateModel.rot"],
  },
];

export const DEFAULT_FEATURE_PRESET = FEATURE_PRESETS[0];
export const DEFAULT_ROTATION_PRESET = ROTATION_PRESETS[0];

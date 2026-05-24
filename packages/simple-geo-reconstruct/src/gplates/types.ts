import type { TileClipArea } from "polygon-tile-quadtree";

export type CoordinateOrder = "auto" | "lat-lon" | "lon-lat";
export type RenderIntent = "area" | "line-like" | "unknown";
export type PolygonRenderIntentMode = "classified" | "all-polygons-area";

export type Position = [longitude: number, latitude: number];

export interface ParsedGpmlTime {
  begin?: number;
  end?: number;
}

export interface ParsedGpmlPolygon {
  exterior: Position[];
  interiors: Position[][];
}

export interface ParsedGpmlGeometry {
  propertyName: string;
  geometryType: "Polygon";
  polygon: ParsedGpmlPolygon;
}

export interface ParsedGpmlFeature {
  id: string;
  featureMemberIndex: number;
  name?: string;
  featureType: string;
  reconstructionPlateId?: number;
  conjugatePlateId?: number;
  validTime?: ParsedGpmlTime;
  geometries: ParsedGpmlGeometry[];
  attributes: Record<string, string | number>;
  renderIntent: RenderIntent;
  renderIntentOverride?: PolygonRenderIntentMode;
}

export interface FeaturePolygonData {
  featureId: string;
  plateId: string;
  lonlats: number[];
  clipArea: TileClipArea;
  renderIntent: RenderIntent;
  time: {
    begine: number;
    end: number;
  };
  source?: {
    featureType?: string;
    originalFeatureId?: string;
    featureMemberIndex?: number;
    propertyNames?: string[];
    name?: string;
    polygonCount?: number;
    interiorCount?: number;
    attributes?: Record<string, string | number>;
  };
}

export interface FeatureImportDiagnostics {
  totalFeatures: number;
  totalImportedFeatures: number;
  areaFeatureCount: number;
  lineLikeFeatureCount: number;
  unknownFeatureCount: number;
  polygonCount: number;
  polygonsWithHoles: number;
  interiorRingCount: number;
  multiPolygonFeatureCount: number;
  skippedFromFillFeatureCount: number;
  polygonRenderIntent: PolygonRenderIntentMode;
  skippedPolygonFeatureTypes: Record<string, number>;
  staticPolygonAreaOverrideCount: number;
  duplicateOriginalFeatureIdCount: number;
  duplicateFeatureMemberCount: number;
  renamedDuplicateFeatureIdCount: number;
}

export interface FeatureLoadResult {
  items: FeaturePolygonData[];
  diagnostics: FeatureImportDiagnostics;
}

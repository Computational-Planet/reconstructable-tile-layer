import {
  readGplatesText,
  loadFiniteRotationRecords,
  type FiniteRotationRecords,
  type FeaturePolygonData,
} from "rtl-gplates-source";
const text: Promise<string> = readGplatesText(new Blob(["local"]));
const records: Promise<FiniteRotationRecords> = loadFiniteRotationRecords([new Uint8Array()]);
declare const features: FeaturePolygonData[];
void [text, records, features];

import type { RasterMetadata } from "rtl-raster-source";
import type { RasterStyle } from "rtl-raster-imagery-provider";

export type RasterRole = "reference-only" | "paleo-snapshot" | "modern-reconstructable";

/** JSON 没有 NaN/Infinity；保留显式文本，避免把科学缺测声明悄悄变成 null。 */
export function stringifyScientific(value: unknown, indent = 2) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "number" && !Number.isFinite(item) ? String(item) : item),
    indent,
  );
}

export interface RasterContextDraft {
  role: RasterRole;
  displayAge: string;
  ageSource: string;
  experiment: string;
  citation: string;
  referenceFrame: string;
  modelConfirmed: boolean;
}

export const emptyRasterContext: RasterContextDraft = {
  role: "reference-only",
  displayAge: "",
  ageSource: "",
  experiment: "",
  citation: "",
  referenceFrame: "",
  modelConfirmed: false,
};

export interface ModelSelection {
  name: string;
  featureUrl: string;
  featureLabel: string;
  rotationUrls: string[];
  rotationLabels: string[];
  anchorPlateId: string | null;
  polygonRenderIntent?: string;
}

function portableResource(url: string, label: string) {
  return {
    label,
    url: url.startsWith("blob:") ? null : url,
    requiresReselect: url.startsWith("blob:"),
  };
}

/** 应用负责科学用途；读取包只保留原始坐标、时间、单位及数值。 */
export function makeScientificContext(draft: RasterContextDraft, model: ModelSelection) {
  let displayAgeMa: number | null = null;
  if (draft.role === "paleo-snapshot") {
    displayAgeMa = Number(draft.displayAge);
    if (
      !draft.displayAge.trim() ||
      !Number.isFinite(displayAgeMa) ||
      displayAgeMa < 0 ||
      displayAgeMa > 1800
    )
      throw new Error(
        "Supply a display age between 0 and 1800 Ma for this paleo-coordinate snapshot.",
      );
    if (!draft.ageSource.trim())
      throw new Error("Record the source of the snapshot's display age.");
  }
  if (draft.role === "modern-reconstructable" && !draft.modelConfirmed)
    throw new Error("Confirm that the data use the present-day frame of the selected plate model.");
  return {
    role: draft.role,
    coordinateEpoch:
      draft.role === "modern-reconstructable"
        ? "present-day"
        : draft.role === "paleo-snapshot"
          ? "paleo"
          : "unspecified",
    displayAgeMa,
    ageSource: draft.ageSource.trim(),
    experiment: draft.experiment.trim(),
    citation: draft.citation.trim(),
    referenceFrame: draft.referenceFrame.trim(),
    model:
      draft.role === "modern-reconstructable"
        ? {
            name: model.name,
            plateDomains: portableResource(model.featureUrl, model.featureLabel),
            rotations: model.rotationUrls.map((url, index) =>
              portableResource(url, model.rotationLabels[index] ?? "Rotation file"),
            ),
            anchorPlateId: model.anchorPlateId,
            polygonRenderIntent: model.polygonRenderIntent ?? null,
          }
        : null,
  };
}

export type ScientificRasterContext = ReturnType<typeof makeScientificContext>;

export interface LocalRasterDescriptor {
  schemaVersion: 1;
  file: {
    name: string;
    size: number;
    lastModified: number;
    requiresReselect: true;
  };
  source: Pick<RasterMetadata, "format" | "width" | "height" | "crs" | "bands">;
  context: ScientificRasterContext;
  style: RasterStyle;
  applied: boolean;
  /** A converted file keeps its original TIFF description for provenance. */
  convertedFrom?: LocalRasterDescriptor;
}

export function describeLocalRaster(
  file: File,
  metadata: RasterMetadata,
  context: ScientificRasterContext,
  style: RasterStyle,
  applied: boolean,
  convertedFrom?: LocalRasterDescriptor,
): LocalRasterDescriptor {
  return {
    schemaVersion: 1,
    file: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      requiresReselect: true,
    },
    source: {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      crs: metadata.crs,
      bands: metadata.bands,
    },
    context,
    style,
    applied,
    convertedFrom,
  };
}

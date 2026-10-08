/** Wires experiment JSON import/export and screenshot downloads to app state. */
import type { MutableRefObject } from "react";
import type { Viewer } from "cesium";
import type {
  ReconstructableTileLayer,
  ReconstructableTileLayerStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
} from "reconstructable-tile-layer";
import type { WebGLTileProcessor } from "rtl-webgl-tile-processor";

import {
  applyExperimentView,
  makeAppliedOutputSize,
  renderViewerFrame,
} from "../cesium/cameraControls";
import type { ProviderKey, TileServiceConfig } from "../cesium/providers";
import {
  DEFAULT_ANCHOR_PLATE_ID,
  type FeaturePresetKey,
  type GplatesReferencePolygonKey,
  type RotationAnchorMode,
  type RotationPresetKey,
} from "../dataSources";
import {
  createExperimentExportInfo,
  createExportBaseName,
  parseImportedExperimentConfig,
  type ExperimentOutputConfig,
  type ExperimentViewConfig,
} from "../experiment";
import { canvasToPngBlob, downloadBlob, downloadJson } from "../utils/downloads";
import type { LocalRasterDescriptor } from "../raster/context";

type UseExperimentIOOptions = {
  localRaster?: LocalRasterDescriptor;
  appliedService: { config: TileServiceConfig; exampleKey: ProviderKey } | null;
  onImportSources: (hasLocalRaster: boolean) => void;
  age: number;
  applyImportedFeatureSource: (
    importedFeatureUrl: string | undefined,
    importedFeaturePresetKey: FeaturePresetKey | undefined,
  ) => void;
  applyImportedRotationSources: (
    importedRotUrls: string[] | undefined,
    importedRotPresetKey: RotationPresetKey | undefined,
  ) => void;
  serviceConfig: TileServiceConfig;
  debugEnabled: boolean;
  experimentViewConfig: ExperimentViewConfig;
  featurePresetKey: FeaturePresetKey;
  featureUrl: string;
  featureSourceLabel: string;
  globeBaseColor: string;
  initialized: boolean;
  level: number;
  managerRef: MutableRefObject<ReconstructableTileLayer | null>;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  referencePolygonColor: string;
  referencePolygonKey: GplatesReferencePolygonKey;
  rotationAnchorMode: RotationAnchorMode;
  anchorPlateId: string | null;
  rotationSources: string[];
  rotSourceLabels: string[];
  rotPresetKey: RotationPresetKey;
  setAge: (value: number) => void;
  setAppliedOutputSize: (value: ExperimentOutputConfig | null) => void;
  setBusy: (value: boolean) => void;
  setServiceConfig: (value: TileServiceConfig) => void;
  setDebugEnabled: (value: boolean) => void;
  setExperimentViewConfig: (
    value: ExperimentViewConfig | ((current: ExperimentViewConfig) => ExperimentViewConfig),
  ) => void;
  setGlobeBaseColor: (value: string) => void;
  setLevel: (value: number) => void;
  setPolygonRenderIntent: (value: PolygonRenderIntentMode) => void;
  setPrimitiveTransformMode: (value: PrimitiveTransformMode) => void;
  setProviderKey: (value: ProviderKey) => void;
  setReferencePolygonColor: (value: string) => void;
  setReferencePolygonKey: (value: GplatesReferencePolygonKey) => void;
  setRotationAnchorMode: (value: RotationAnchorMode) => void;
  setAnchorPlateIdInput: (value: string) => void;
  setStatus: (value: string) => void;
  stats: ReconstructableTileLayerStats | null;
  status: string;
  webglProcessorRef: MutableRefObject<WebGLTileProcessor | null>;
  viewerRef: MutableRefObject<Viewer | null>;
};

export function useExperimentIO({
  localRaster,
  appliedService,
  onImportSources,
  age,
  applyImportedFeatureSource,
  applyImportedRotationSources,
  serviceConfig,
  debugEnabled,
  experimentViewConfig,
  featurePresetKey,
  featureUrl,
  featureSourceLabel,
  globeBaseColor,
  initialized,
  level,
  managerRef,
  polygonRenderIntent,
  primitiveTransformMode,
  providerKey,
  referencePolygonColor,
  referencePolygonKey,
  rotationAnchorMode,
  anchorPlateId,
  rotationSources,
  rotSourceLabels,
  rotPresetKey,
  setAge,
  setAppliedOutputSize,
  setBusy,
  setServiceConfig,
  setDebugEnabled,
  setExperimentViewConfig,
  setGlobeBaseColor,
  setLevel,
  setPolygonRenderIntent,
  setPrimitiveTransformMode,
  setProviderKey,
  setReferencePolygonColor,
  setReferencePolygonKey,
  setRotationAnchorMode,
  setAnchorPlateIdInput,
  setStatus,
  stats,
  status,
  webglProcessorRef,
  viewerRef,
}: UseExperimentIOOptions) {
  const createCurrentExportInfo = (exportedAt: Date, exportBaseName: string) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      throw new Error("Viewer is not ready yet.");
    }

    const info = createExperimentExportInfo(
      {
        age,
        serviceConfig: initialized && appliedService ? appliedService.config : serviceConfig,
        debugEnabled,
        experimentViewConfig,
        featurePresetKey,
        featureUrl,
        globeBaseColor,
        initialized,
        level,
        manager: managerRef.current,
        polygonRenderIntent,
        primitiveTransformMode,
        providerKey: initialized && appliedService ? appliedService.exampleKey : providerKey,
        referencePolygonColor,
        referencePolygonKey,
        rotationAnchorMode,
        anchorPlateId,
        rotationFiles: rotationSources,
        rotPresetKey,
        stats,
        status,
        webglProcessor: webglProcessorRef.current,
        viewer,
      },
      exportedAt,
      exportBaseName,
    );
    if (localRaster) {
      info.sources.localRaster = localRaster;
      info.sources.providerLabel = `Local raster: ${localRaster.file.name}`;
      info.layers.rtlLayer =
        localRaster.context.role === "modern-reconstructable" ? localRaster.file.name : "off";
    }
    // 本地模型与本地栅格遵循同一规则：导出文件描述，不能重用会话中的 blob 地址。
    const featureIsLocal = featureUrl.trim().startsWith("blob:");
    const rotationsAreLocal = rotationSources.some((url) => url.trim().startsWith("blob:"));
    if (featureIsLocal || rotationsAreLocal) {
      info.sources.localModelFiles = {
        feature: featureIsLocal ? featureSourceLabel || "Local plate-domain file" : undefined,
        rotations: rotationsAreLocal
          ? rotationSources.map((url, index) =>
              url.trim().startsWith("blob:") ? rotSourceLabels[index] || "Local ROT file" : url,
            )
          : undefined,
      };
      if (featureIsLocal) {
        info.sources.featureUrl = "";
        info.platePolygonFile = "";
      }
      if (rotationsAreLocal) {
        info.sources.rotUrls = [];
        info.rotationFiles = [];
        info.rotationFile = "";
      }
    }
    return info;
  };

  const handleImportExperimentConfig = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const importedConfig = parseImportedExperimentConfig(parsedJson);
      onImportSources(!!importedConfig.localRasterFileName);
      const rasterNotice = importedConfig.localRasterFileName
        ? ` Reselect the local file ${importedConfig.localRasterFileName} and apply its slice/context; local files are not embedded.`
        : "";
      const modelNotice = importedConfig.requiresLocalModelFiles
        ? " Reselect the local plate-domain/ROT files before initializing the model."
        : "";
      const importedViewConfig = importedConfig.experimentViewConfig;
      const nextViewConfig: ExperimentViewConfig = importedViewConfig
        ? {
            ...experimentViewConfig,
            ...importedViewConfig,
            camera3D: {
              ...experimentViewConfig.camera3D,
              ...importedViewConfig.camera3D,
            },
            extent: {
              ...experimentViewConfig.extent,
              ...importedViewConfig.extent,
            },
            output: {
              ...experimentViewConfig.output,
              ...importedViewConfig.output,
            },
          }
        : experimentViewConfig;
      if (importedViewConfig && nextViewConfig.viewMode !== "2D_RECTANGULAR") {
        nextViewConfig.camera3D.orthographic = nextViewConfig.viewMode === "3D_ORTHOGRAPHIC";
      }
      const shouldApplyImportedView = Boolean(
        importedViewConfig?.viewMode || importedViewConfig?.extent || importedViewConfig?.camera3D,
      );

      if (importedConfig.age !== undefined) {
        setAge(importedConfig.age);
      }
      if (importedConfig.debugEnabled !== undefined) {
        setDebugEnabled(importedConfig.debugEnabled);
      }
      if (importedConfig.globeBaseColor) {
        setGlobeBaseColor(importedConfig.globeBaseColor);
      }
      if (importedConfig.level !== undefined) {
        setLevel(importedConfig.level);
      }
      if (importedConfig.polygonRenderIntent) {
        setPolygonRenderIntent(importedConfig.polygonRenderIntent);
      }
      if (importedConfig.primitiveTransformMode) {
        setPrimitiveTransformMode(importedConfig.primitiveTransformMode);
      }
      if (importedConfig.serviceConfig) {
        setServiceConfig(importedConfig.serviceConfig);
      }
      if (importedConfig.providerKey) {
        setProviderKey(importedConfig.providerKey);
      }
      if (importedConfig.referencePolygonColor) {
        setReferencePolygonColor(importedConfig.referencePolygonColor);
      }
      if (importedConfig.referencePolygonKey) {
        setReferencePolygonKey(importedConfig.referencePolygonKey);
      }
      if (importedConfig.rotationAnchorMode) {
        setRotationAnchorMode(importedConfig.rotationAnchorMode);
      }
      if (importedConfig.anchorPlateId !== undefined) {
        setAnchorPlateIdInput(importedConfig.anchorPlateId ?? DEFAULT_ANCHOR_PLATE_ID);
      }

      applyImportedFeatureSource(importedConfig.featureUrl, importedConfig.featurePresetKey);
      applyImportedRotationSources(importedConfig.rotUrls, importedConfig.rotPresetKey);

      if (importedViewConfig) {
        setExperimentViewConfig(nextViewConfig);
      }

      if (
        importedViewConfig?.output?.width !== undefined &&
        importedViewConfig.output.height !== undefined &&
        importedViewConfig.output.pixelRatio !== undefined
      ) {
        setAppliedOutputSize(
          makeAppliedOutputSize({
            width: importedViewConfig.output.width,
            height: importedViewConfig.output.height,
            pixelRatio: importedViewConfig.output.pixelRatio,
          }),
        );
      }

      if (shouldApplyImportedView && viewerRef.current) {
        applyExperimentView(viewerRef.current, nextViewConfig);
        setStatus(
          `Experiment config imported and view applied: ${file.name}.${rasterNotice}${modelNotice}`,
        );
        return;
      }

      setStatus(`Experiment config imported: ${file.name}.${rasterNotice}${modelNotice}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExportInfo = () => {
    try {
      const exportedAt = new Date();
      const exportBaseName = createExportBaseName(experimentViewConfig, age, exportedAt);
      const info = createCurrentExportInfo(exportedAt, exportBaseName);
      downloadJson(info, `${exportBaseName}.json`);
      setStatus(`Experiment info exported: ${exportBaseName}.json`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCaptureScreenshot = async () => {
    const viewer = viewerRef.current;
    if (!viewer) {
      setStatus("Viewer is not ready yet.");
      return;
    }

    setBusy(true);
    setStatus("Rendering screenshot...");
    try {
      const exportedAt = new Date();
      const exportBaseName = createExportBaseName(experimentViewConfig, age, exportedAt);
      await renderViewerFrame(viewer);
      const info = createCurrentExportInfo(exportedAt, exportBaseName);
      const pngBlob = await canvasToPngBlob(viewer.scene.canvas);
      downloadBlob(pngBlob, `${exportBaseName}.png`);
      downloadJson(info, `${exportBaseName}.json`);
      setStatus(`Screenshot and info exported: ${exportBaseName}.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return {
    handleCaptureScreenshot,
    handleExportInfo,
    handleImportExperimentConfig,
  };
}

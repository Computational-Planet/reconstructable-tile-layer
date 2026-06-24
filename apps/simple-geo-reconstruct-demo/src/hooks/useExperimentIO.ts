/** Wires experiment JSON import/export and screenshot downloads to app state. */
import type { MutableRefObject } from "react";
import type { Viewer } from "cesium";
import type {
  GeoTileStats,
  PolygonRenderIntentMode,
  PrimitiveTransformMode,
  SimpleGeoReconstructManager,
} from "simple-geo-reconstruct";
import type { CesiumTileProcesser } from "tile-processer-webgl";

import {
  applyExperimentView,
  makeAppliedOutputSize,
  renderViewerFrame,
} from "../cesium/cameraControls";
import type {
  ProviderKey,
  UrlTemplateProviderConfig,
} from "../cesium/providers";
import type {
  FeaturePresetKey,
  GplatesReferencePolygonKey,
  RotationAnchorMode,
  RotationPresetKey,
} from "../dataSources";
import { DEFAULT_ANCHOR_PLATE_ID } from "../dataSources";
import {
  createExperimentExportInfo,
  createExportBaseName,
  parseImportedExperimentConfig,
  type ExperimentOutputConfig,
  type ExperimentViewConfig,
} from "../experiment";
import { canvasToPngBlob, downloadBlob, downloadJson } from "../utils/downloads";

type UseExperimentIOOptions = {
  age: number;
  applyImportedFeatureSource: (
    importedFeatureUrl: string | undefined,
    importedFeaturePresetKey: FeaturePresetKey | undefined,
  ) => void;
  applyImportedRotationSources: (
    importedRotUrls: string[] | undefined,
    importedRotPresetKey: RotationPresetKey | undefined,
  ) => void;
  customProviderConfig: UrlTemplateProviderConfig;
  debugEnabled: boolean;
  experimentViewConfig: ExperimentViewConfig;
  featurePresetKey: FeaturePresetKey;
  featureUrl: string;
  globeBaseColor: string;
  initialized: boolean;
  level: number;
  managerRef: MutableRefObject<SimpleGeoReconstructManager | null>;
  polygonRenderIntent: PolygonRenderIntentMode;
  primitiveTransformMode: PrimitiveTransformMode;
  providerKey: ProviderKey;
  referencePolygonColor: string;
  referencePolygonKey: GplatesReferencePolygonKey;
  rotationAnchorMode: RotationAnchorMode;
  anchorPlateId: string | null;
  rotationSources: string[];
  rotPresetKey: RotationPresetKey;
  setAge: (value: number) => void;
  setAppliedOutputSize: (value: ExperimentOutputConfig | null) => void;
  setBusy: (value: boolean) => void;
  setCustomProviderConfig: (value: UrlTemplateProviderConfig) => void;
  setCustomProviderError: (value: string) => void;
  setDebugEnabled: (value: boolean) => void;
  setExperimentViewConfig: (
    value:
      | ExperimentViewConfig
      | ((current: ExperimentViewConfig) => ExperimentViewConfig),
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
  stats: GeoTileStats | null;
  status: string;
  tileProcesserRef: MutableRefObject<CesiumTileProcesser | null>;
  viewerRef: MutableRefObject<Viewer | null>;
};

export function useExperimentIO({
  age,
  applyImportedFeatureSource,
  applyImportedRotationSources,
  customProviderConfig,
  debugEnabled,
  experimentViewConfig,
  featurePresetKey,
  featureUrl,
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
  rotPresetKey,
  setAge,
  setAppliedOutputSize,
  setBusy,
  setCustomProviderConfig,
  setCustomProviderError,
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
  tileProcesserRef,
  viewerRef,
}: UseExperimentIOOptions) {
  const createCurrentExportInfo = (exportedAt: Date, exportBaseName: string) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      throw new Error("Viewer is not ready yet.");
    }

    return createExperimentExportInfo(
      {
        age,
        customProviderConfig,
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
        providerKey,
        referencePolygonColor,
        referencePolygonKey,
        rotationAnchorMode,
        anchorPlateId,
        rotationFiles: rotationSources,
        rotPresetKey,
        stats,
        status,
        tileProcesser: tileProcesserRef.current,
        viewer,
      },
      exportedAt,
      exportBaseName,
    );
  };

  const handleImportExperimentConfig = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const importedConfig = parseImportedExperimentConfig(parsedJson);
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
      const shouldApplyImportedView = Boolean(
        importedViewConfig?.viewMode ||
          importedViewConfig?.extent ||
          importedViewConfig?.camera3D,
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
      if (importedConfig.customProviderConfig) {
        setCustomProviderConfig(importedConfig.customProviderConfig);
        setCustomProviderError("");
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
        setAnchorPlateIdInput(
          importedConfig.anchorPlateId ?? DEFAULT_ANCHOR_PLATE_ID,
        );
      }

      applyImportedFeatureSource(
        importedConfig.featureUrl,
        importedConfig.featurePresetKey,
      );
      applyImportedRotationSources(
        importedConfig.rotUrls,
        importedConfig.rotPresetKey,
      );

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
        setStatus(`Experiment config imported and view applied: ${file.name}`);
        return;
      }

      setStatus(`Experiment config imported: ${file.name}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExportInfo = () => {
    try {
      const exportedAt = new Date();
      const exportBaseName = createExportBaseName(
        experimentViewConfig,
        age,
        exportedAt,
      );
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
      const exportBaseName = createExportBaseName(
        experimentViewConfig,
        age,
        exportedAt,
      );
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

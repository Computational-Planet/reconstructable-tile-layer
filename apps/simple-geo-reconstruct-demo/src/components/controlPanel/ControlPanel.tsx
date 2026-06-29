/** Composes the grouped control panel sections for the demo UI. */
import { useState } from "react";

import { CameraOutputSection } from "./CameraOutputSection";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { DataSourcesSection } from "./DataSourcesSection";
import { ExperimentExportSection } from "./ExperimentExportSection";
import { ExperimentImportSection } from "./ExperimentImportSection";
import { RenderingSection } from "./RenderingSection";
import { StatsSection } from "./StatsSection";
import { TimeTilesSection } from "./TimeTilesSection";
import type { ControlPanelProps } from "./ControlPanel.types";

export function ControlPanel(props: ControlPanelProps) {
  const [customProviderDialogOpen, setCustomProviderDialogOpen] =
    useState(false);

  return (
    <>
      <aside className="control-panel">
        <header>
          <p className="eyebrow">SimpleGeoReconstructManager</p>
          <h1>Deep Time Tile Demo</h1>
        </header>

        <ExperimentImportSection
          busy={props.busy}
          onImportExperimentConfig={props.onImportExperimentConfig}
        />

        <DataSourcesSection
          busy={props.busy}
          featurePresetKey={props.featurePresetKey}
          featurePresets={props.featurePresets}
          featureSourceLabel={props.featureSourceLabel}
          featureUrl={props.featureUrl}
          anchorPlateIdInput={props.anchorPlateIdInput}
          initialized={props.initialized}
          level={props.level}
          polygonRenderIntent={props.polygonRenderIntent}
          providerKey={props.providerKey}
          referencePolygonColor={props.referencePolygonColor}
          referencePolygonKey={props.referencePolygonKey}
          referencePolygonSources={props.referencePolygonSources}
          rotationAnchorMode={props.rotationAnchorMode}
          rotPresetKey={props.rotPresetKey}
          rotPresets={props.rotPresets}
          rotSourceLabels={props.rotSourceLabels}
          rotUrls={props.rotUrls}
          onConfigureCustomProvider={() => setCustomProviderDialogOpen(true)}
          onApplyProvider={props.onApplyProvider}
          onClear={props.onClear}
          onAnchorPlateIdInputChange={props.onAnchorPlateIdInputChange}
          onFeaturePresetChange={props.onFeaturePresetChange}
          onFeatureUpload={props.onFeatureUpload}
          onFeatureUrlChange={props.onFeatureUrlChange}
          onInit={props.onInit}
          onLevelChange={props.onLevelChange}
          onLoadFineInView={props.onLoadFineInView}
          onLoadLevel={props.onLoadLevel}
          onPolygonRenderIntentChange={props.onPolygonRenderIntentChange}
          onProviderKeyChange={props.onProviderKeyChange}
          onReferencePolygonColorChange={
            props.onReferencePolygonColorChange
          }
          onReferencePolygonKeyChange={props.onReferencePolygonKeyChange}
          onRotationAnchorModeChange={props.onRotationAnchorModeChange}
          onRotPresetChange={props.onRotPresetChange}
          onRotUpload={props.onRotUpload}
          onRotUrlsChange={props.onRotUrlsChange}
        />

        <CameraOutputSection
          busy={props.busy}
          experimentViewConfig={props.experimentViewConfig}
          onApplyExtentView={props.onApplyExtentView}
          onApplyOutputSize={props.onApplyOutputSize}
          onApplyPoseView={props.onApplyPoseView}
          onExperimentSceneModeChange={props.onExperimentSceneModeChange}
          onExperimentViewConfigChange={props.onExperimentViewConfigChange}
        />

        <TimeTilesSection
          age={props.age}
          onAgeChange={props.onAgeChange}
        />

        <RenderingSection
          busy={props.busy}
          debugEnabled={props.debugEnabled}
          globeBaseColor={props.globeBaseColor}
          initialized={props.initialized}
          primitiveTransformMode={props.primitiveTransformMode}
          onApplyTransformMode={props.onApplyTransformMode}
          onDebugEnabledChange={props.onDebugEnabledChange}
          onGlobeBaseColorChange={props.onGlobeBaseColorChange}
          onPrimitiveTransformModeChange={
            props.onPrimitiveTransformModeChange
          }
        />

        <ExperimentExportSection
          busy={props.busy}
          onCaptureScreenshot={props.onCaptureScreenshot}
          onExportInfo={props.onExportInfo}
        />

        <StatsSection stats={props.stats} status={props.status} />
      </aside>

      <CustomProviderDialog
        customProviderConfig={props.customProviderConfig}
        customProviderError={props.customProviderError}
        open={customProviderDialogOpen}
        onClose={() => setCustomProviderDialogOpen(false)}
        onCustomProviderConfigChange={props.onCustomProviderConfigChange}
        onSaveCustomProviderConfig={props.onSaveCustomProviderConfig}
      />
    </>
  );
}

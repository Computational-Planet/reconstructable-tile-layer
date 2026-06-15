/** Composes the grouped control panel sections for the demo UI. */
import { useState } from "react";

import { CameraOutputSection } from "./CameraOutputSection";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { DataSourcesSection } from "./DataSourcesSection";
import { ExperimentExportSection } from "./ExperimentExportSection";
import { ExperimentImportSection } from "./ExperimentImportSection";
import { ManagerSection } from "./ManagerSection";
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
          featurePresetKey={props.featurePresetKey}
          featurePresets={props.featurePresets}
          featureUrl={props.featureUrl}
          rotPresetKey={props.rotPresetKey}
          rotPresets={props.rotPresets}
          rotUrls={props.rotUrls}
          onFeaturePresetChange={props.onFeaturePresetChange}
          onFeatureUpload={props.onFeatureUpload}
          onFeatureUrlChange={props.onFeatureUrlChange}
          onRotPresetChange={props.onRotPresetChange}
          onRotUpload={props.onRotUpload}
          onRotUrlsChange={props.onRotUrlsChange}
        />

        <RenderingSection
          debugEnabled={props.debugEnabled}
          globeBaseColor={props.globeBaseColor}
          polygonRenderIntent={props.polygonRenderIntent}
          primitiveTransformMode={props.primitiveTransformMode}
          providerKey={props.providerKey}
          referencePolygonKey={props.referencePolygonKey}
          referencePolygonSources={props.referencePolygonSources}
          onConfigureCustomProvider={() => setCustomProviderDialogOpen(true)}
          onDebugEnabledChange={props.onDebugEnabledChange}
          onGlobeBaseColorChange={props.onGlobeBaseColorChange}
          onPolygonRenderIntentChange={props.onPolygonRenderIntentChange}
          onPrimitiveTransformModeChange={
            props.onPrimitiveTransformModeChange
          }
          onProviderKeyChange={props.onProviderKeyChange}
          onReferencePolygonKeyChange={props.onReferencePolygonKeyChange}
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

        <ManagerSection
          busy={props.busy}
          initialized={props.initialized}
          onApplyProvider={props.onApplyProvider}
          onApplyTransformMode={props.onApplyTransformMode}
          onInit={props.onInit}
        />

        <TimeTilesSection
          age={props.age}
          busy={props.busy}
          initialized={props.initialized}
          level={props.level}
          onAgeChange={props.onAgeChange}
          onClear={props.onClear}
          onLevelChange={props.onLevelChange}
          onLoadFineInView={props.onLoadFineInView}
          onLoadLevel={props.onLoadLevel}
          onLoadRoot={props.onLoadRoot}
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

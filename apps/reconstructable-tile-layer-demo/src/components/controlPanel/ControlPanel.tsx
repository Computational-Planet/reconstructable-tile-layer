/** Composes the grouped control panel sections for the demo UI. */

import { CameraOutputSection } from "./CameraOutputSection";
import { PlateModelSection } from "./PlateModelSection";
import { ImagerySourceSection } from "./ImagerySourceSection";
import { ReferenceSection } from "./ReferenceSection";
import { ExperimentExportSection } from "./ExperimentExportSection";
import { ExperimentImportSection } from "./ExperimentImportSection";
import { RenderingSection } from "./RenderingSection";
import { StatsSection } from "./StatsSection";
import { TimeTilesSection } from "./TimeTilesSection";
import type { ControlPanelProps } from "./ControlPanel.types";

export function ControlPanel(props: ControlPanelProps) {
  return (
    <>
      <aside className="control-panel">
        <header>
          <p className="eyebrow">Raster reconstruction</p>
          <h1>Reconstruction Tile Layer Demo</h1>
        </header>

        <PlateModelSection
          busy={props.busy}
          featurePresetKey={props.featurePresetKey}
          featurePresets={props.featurePresets}
          featureSourceLabel={props.featureSourceLabel}
          featureUrl={props.featureUrl}
          anchorPlateIdInput={props.anchorPlateIdInput}
          polygonRenderIntent={props.polygonRenderIntent}
          rotationAnchorMode={props.rotationAnchorMode}
          rotPresetKey={props.rotPresetKey}
          rotPresets={props.rotPresets}
          rotSourceLabels={props.rotSourceLabels}
          rotUrls={props.rotUrls}
          onAnchorPlateIdInputChange={props.onAnchorPlateIdInputChange}
          onFeaturePresetChange={props.onFeaturePresetChange}
          onFeatureUpload={props.onFeatureUpload}
          onFeatureUrlChange={props.onFeatureUrlChange}
          onPolygonRenderIntentChange={props.onPolygonRenderIntentChange}
          onRotationAnchorModeChange={props.onRotationAnchorModeChange}
          onRotPresetChange={props.onRotPresetChange}
          onRotUpload={props.onRotUpload}
          onRotUrlsChange={props.onRotUrlsChange}
        />

        <ImagerySourceSection
          selectedLayer={props.selectedLayer}
          serviceMode={props.serviceMode}
          onServiceModeChange={props.onServiceModeChange}
          age={props.age}
          busy={props.busy}
          localRaster={props.localRaster}
          sourceKind={props.sourceKind}
          onSourceKindChange={props.onSourceKindChange}
          providerKey={props.providerKey}
          onProviderKeyChange={props.onProviderKeyChange}
          onApplyProvider={props.onApplyProvider}
          initialized={props.initialized}
          appliedService={props.appliedService}
          modelNeedsApply={props.modelNeedsApply}
          serviceConfig={props.serviceConfig}
          onServiceConfigChange={props.onServiceConfigChange}
        />

        <TimeTilesSection
          selectedLayer={props.selectedLayer}
          age={props.age}
          onAgeChange={props.onAgeChange}
          busy={props.busy}
          initialized={props.initialized}
          localRaster={props.localRaster}
          modelNeedsApply={props.modelNeedsApply}
          level={props.level}
          tileLevelRange={props.tileLevelRange}
          onLevelChange={props.onLevelChange}
          onLoadLevel={props.onLoadLevel}
          onLoadFineInView={props.onLoadFineInView}
          onClear={props.onClear}
          status={props.status}
        />

        <ReferenceSection
          referencePolygonColor={props.referencePolygonColor}
          referencePolygonKey={props.referencePolygonKey}
          referencePolygonSources={props.referencePolygonSources}
          onReferencePolygonColorChange={props.onReferencePolygonColorChange}
          onReferencePolygonKeyChange={props.onReferencePolygonKeyChange}
        />

        <CameraOutputSection
          busy={props.busy}
          experimentViewConfig={props.experimentViewConfig}
          onApplyExtentView={props.onApplyExtentView}
          onApplyOutputSize={props.onApplyOutputSize}
          onApplyPoseView={props.onApplyPoseView}
          onApplyCameraPreset={props.onApplyCameraPreset}
          onExperimentSceneModeChange={props.onExperimentSceneModeChange}
          onExperimentViewConfigChange={props.onExperimentViewConfigChange}
        />

        <RenderingSection
          busy={props.busy}
          debugEnabled={props.debugEnabled}
          globeBaseColor={props.globeBaseColor}
          graticuleEnabled={props.graticuleEnabled}
          initialized={props.initialized}
          primitiveTransformMode={props.primitiveTransformMode}
          onApplyTransformMode={props.onApplyTransformMode}
          onDebugEnabledChange={props.onDebugEnabledChange}
          onGlobeBaseColorChange={props.onGlobeBaseColorChange}
          onGraticuleEnabledChange={props.onGraticuleEnabledChange}
          onPrimitiveTransformModeChange={props.onPrimitiveTransformModeChange}
        />

        <ExperimentImportSection
          busy={props.busy}
          onImportExperimentConfig={props.onImportExperimentConfig}
        />

        <ExperimentExportSection
          busy={props.busy}
          onCaptureScreenshot={props.onCaptureScreenshot}
          onExportInfo={props.onExportInfo}
        />

        <StatsSection stats={props.stats} />
      </aside>
    </>
  );
}

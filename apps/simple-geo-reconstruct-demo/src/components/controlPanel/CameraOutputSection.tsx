/** Renders experiment camera, extent, and output viewport controls. */
import { useState } from "react";

import type { ExperimentViewConfig, ExperimentViewMode } from "../../experiment";
import type { ControlPanelProps } from "./ControlPanel.types";

type CameraOutputSectionProps = Pick<
  ControlPanelProps,
  | "busy"
  | "experimentViewConfig"
  | "onApplyExtentView"
  | "onApplyOutputSize"
  | "onApplyPoseView"
  | "onExperimentSceneModeChange"
  | "onExperimentViewConfigChange"
>;

function formatRequiredNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

export function CameraOutputSection({
  busy,
  experimentViewConfig,
  onApplyExtentView,
  onApplyOutputSize,
  onApplyPoseView,
  onExperimentSceneModeChange,
  onExperimentViewConfigChange,
}: CameraOutputSectionProps) {
  const [viewPanelOpen, setViewPanelOpen] = useState(false);

  const updateExperimentViewConfig = (
    patch: Partial<ExperimentViewConfig>,
  ) => {
    onExperimentViewConfigChange({
      ...experimentViewConfig,
      ...patch,
    });
  };

  const updateExtent = (
    patch: Partial<ExperimentViewConfig["extent"]>,
  ) => {
    updateExperimentViewConfig({
      extent: {
        ...experimentViewConfig.extent,
        ...patch,
      },
    });
  };

  const updateCamera3D = (
    patch: Partial<ExperimentViewConfig["camera3D"]>,
  ) => {
    updateExperimentViewConfig({
      camera3D: {
        ...experimentViewConfig.camera3D,
        ...patch,
      },
    });
  };

  const updateOutput = (
    patch: Partial<ExperimentViewConfig["output"]>,
  ) => {
    updateExperimentViewConfig({
      output: {
        ...experimentViewConfig.output,
        ...patch,
      },
    });
  };

  return (
    <section className="panel-section">
      <h2>Camera & Output</h2>

      <button
        className="secondary-button"
        type="button"
        onClick={() => setViewPanelOpen((open) => !open)}
      >
        Camera / View
      </button>

      {viewPanelOpen ? (
        <div className="panel-subsection view-panel">
          <div className="grid-2">
            <label>
              Case ID
              <input
                value={experimentViewConfig.caseId}
                onChange={(event) =>
                  updateExperimentViewConfig({
                    caseId: event.target.value,
                  })
                }
              />
            </label>

            <label>
              Model name
              <input
                value={experimentViewConfig.modelName}
                onChange={(event) =>
                  updateExperimentViewConfig({
                    modelName: event.target.value,
                  })
                }
              />
            </label>

            <label>
              Scene mode
              <select
                disabled={busy}
                value={experimentViewConfig.viewMode}
                onChange={(event) =>
                  onExperimentSceneModeChange(
                    event.target.value as ExperimentViewMode,
                  )
                }
              >
                <option value="2D_RECTANGULAR">2D rectangular</option>
                <option value="3D_GLOBE">3D globe</option>
              </select>
            </label>
          </div>

          <h2>Extent</h2>
          <div className="grid-2">
            <label>
              West
              <input
                max={180}
                min={-180}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.extent.west)}
                onChange={(event) =>
                  updateExtent({ west: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              South
              <input
                max={90}
                min={-90}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.extent.south)}
                onChange={(event) =>
                  updateExtent({ south: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              East
              <input
                max={180}
                min={-180}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.extent.east)}
                onChange={(event) =>
                  updateExtent({ east: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              North
              <input
                max={90}
                min={-90}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.extent.north)}
                onChange={(event) =>
                  updateExtent({ north: event.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={onApplyExtentView}
          >
            Apply extent
          </button>

          <h2>3D pose</h2>
          <div className="grid-2">
            <label>
              Target lon
              <input
                max={180}
                min={-180}
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.targetLon,
                )}
                onChange={(event) =>
                  updateCamera3D({ targetLon: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Target lat
              <input
                max={90}
                min={-90}
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.targetLat,
                )}
                onChange={(event) =>
                  updateCamera3D({ targetLat: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Range meters
              <input
                min={1}
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.range,
                )}
                onChange={(event) =>
                  updateCamera3D({ range: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Heading deg
              <input
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.heading,
                )}
                onChange={(event) =>
                  updateCamera3D({ heading: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Pitch deg
              <input
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.pitch,
                )}
                onChange={(event) =>
                  updateCamera3D({ pitch: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Roll deg
              <input
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.camera3D.roll,
                )}
                onChange={(event) =>
                  updateCamera3D({ roll: event.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={experimentViewConfig.camera3D.orthographic}
              onChange={(event) =>
                updateCamera3D({ orthographic: event.target.checked })
              }
            />
            Orthographic 3D camera
          </label>
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={onApplyPoseView}
          >
            Apply pose
          </button>

          <h2>Output CSS viewport</h2>
          <div className="grid-2">
            <label>
              Width px
              <input
                min={1}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.output.width)}
                onChange={(event) =>
                  updateOutput({ width: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Height px
              <input
                min={1}
                type="number"
                value={formatRequiredNumber(experimentViewConfig.output.height)}
                onChange={(event) =>
                  updateOutput({ height: event.target.valueAsNumber })
                }
              />
            </label>

            <label>
              Pixel ratio
              <input
                max={4}
                min={0.1}
                step={0.1}
                type="number"
                value={formatRequiredNumber(
                  experimentViewConfig.output.pixelRatio,
                )}
                onChange={(event) =>
                  updateOutput({ pixelRatio: event.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={onApplyOutputSize}
          >
            Apply output size
          </button>
        </div>
      ) : null}
    </section>
  );
}

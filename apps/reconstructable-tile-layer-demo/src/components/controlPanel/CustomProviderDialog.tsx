/** Renders the modal form for custom URL-template imagery providers. */
import type {
  UrlTemplateProviderConfig,
  UrlTemplateTilingSchemeKey,
} from "../../cesium/providers";
import { GlobalModal } from "../GlobalModal";

type CustomProviderDialogProps = {
  customProviderConfig: UrlTemplateProviderConfig;
  customProviderError: string;
  open: boolean;
  onClose: () => void;
  onCustomProviderConfigChange: (value: UrlTemplateProviderConfig) => void;
  onSaveCustomProviderConfig: () => boolean;
};

function formatRequiredNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

export function CustomProviderDialog({
  customProviderConfig,
  customProviderError,
  open,
  onClose,
  onCustomProviderConfigChange,
  onSaveCustomProviderConfig,
}: CustomProviderDialogProps) {
  const updateCustomProviderConfig = (
    patch: Partial<UrlTemplateProviderConfig>,
  ) => {
    onCustomProviderConfigChange({
      ...customProviderConfig,
      ...patch,
    });
  };

  return (
    <GlobalModal
      labelledBy="custom-provider-title"
      open={open}
      onClose={onClose}
    >
      <form
        className="provider-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (onSaveCustomProviderConfig()) {
            onClose();
          }
        }}
      >
        <header>
          <h2 id="custom-provider-title">Custom provider</h2>
        </header>

        <label>
          URL template
          <input
            required
            placeholder="http://localhost:9003/image/wmts/HC4aVmBO/{z}/{x}/{y}"
            value={customProviderConfig.url}
            onChange={(event) =>
              updateCustomProviderConfig({ url: event.target.value })
            }
          />
        </label>

        <label>
          Tiling scheme
          <select
            required
            value={customProviderConfig.tilingSchemeKey}
            onChange={(event) =>
              updateCustomProviderConfig({
                tilingSchemeKey: event.target
                  .value as UrlTemplateTilingSchemeKey,
              })
            }
          >
            <option value="geographic">EPSG:4326 / Geographic</option>
            <option value="web-mercator">EPSG:3857 / Web Mercator</option>
          </select>
        </label>

        <div className="grid-2">
          <label>
            Min level
            <input
              min={0}
              required
              type="number"
              value={formatRequiredNumber(customProviderConfig.minimumLevel)}
              onChange={(event) =>
                updateCustomProviderConfig({
                  minimumLevel: event.target.valueAsNumber,
                })
              }
            />
          </label>

          <label>
            Max level
            <input
              min={0}
              required
              type="number"
              value={formatRequiredNumber(customProviderConfig.maximumLevel)}
              onChange={(event) =>
                updateCustomProviderConfig({
                  maximumLevel: event.target.valueAsNumber,
                })
              }
            />
          </label>
        </div>

        {customProviderError ? (
          <p className="form-error" role="alert">
            {customProviderError}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Use custom</button>
        </div>
      </form>
    </GlobalModal>
  );
}

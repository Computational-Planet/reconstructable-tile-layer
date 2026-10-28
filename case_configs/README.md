# Case Configs

English | [简体中文](README.zh-CN.md)

This directory is located at `case_configs/` in the repository root. It
contains JSON configurations for the cases demonstrated by the Reconstructable
Tile Layer demo. The subdirectories correspond to the individual cases.

## Usage

1. In **Experiment**, click **Import** and choose a JSON file from this directory.
2. The import restores the geological age, camera/output settings, reference overlay and
   reconstruction layer in the right-hand **Layers** panel.
3. Select the restored layer and click **Load tiles**. Its **Tile loading** setting specifies
   either **Specified level** or **Current view**. In current-view mode, **Lock view level**
   optionally fixes the level; leave it unchecked for automatic selection. Importing a case does
   not fetch reconstruction tiles; no additional **Add layer** action is needed.
4. Change the global timeline or view as needed. Load again after moving the camera when
   using current-view loading; new view tiles accumulate alongside existing tiles. Use **Clear tiles**
   to reset coverage. Use **Experiment → Export info** to save the configuration and
   measurements from the actual run.

## Configuration contents

Each file uses `schemaVersion: 3` and an explicit `layerStack`. Each reconstruction layer
contains its full service connection, plate-domain/ROT model, anchor plate, visibility,
opacity, `loadMode` and `level`. `source.config` defines requests; `source.exampleKey`
identifies the service example without replacing the saved connection.

- `loadMode: "level"` loads the specified source-tile `level`.
- `loadMode: "view"` uses an optional `viewLevel` to lock the source level (including L0), or
  selects automatically from the current camera and provider limits when it is omitted.
  The stored `level` is only the setting for a subsequent level-based load.
- `timeMa`, view/output settings and reference polygon settings apply to the whole scene.
- `sources` also initializes the source editor; each layer's `source` and `model` govern
  that layer independently of later editor changes.

`case3/Case3_120Ma_Load_by_View.json` uses current-view loading. The other cases use their
specified levels. Case 1 contains reconstruction comparisons, case 2A varies tile services,
case 2B varies plate models, and case 3 contains the Macrostrat examples.

These files contain reproducible inputs. Runtime status, timing, cache counts and device
measurements are produced by the demo's export actions. Model and reference files use
paths under the demo's `public/`; the bundled GPlates topography service uses `/tiles/`.
External services require network access and browser CORS support.

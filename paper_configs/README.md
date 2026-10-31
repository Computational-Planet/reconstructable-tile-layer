# Paper figure configurations

English | [简体中文](README.zh-CN.md)

Importable RTL Demo configurations for the manuscript's application case and visual evaluation. Files are named by figure and panel, with the same name stored in each JSON's `caseId` field. The `case/` directory covers Figures 5–7, and `evaluation/` covers Figures 8–9.

| Manuscript figure  | Content                                                  | Configurations       |
| ------------------ | -------------------------------------------------------- | -------------------- |
| 5(a–d)             | Macrostrat time sequence, 0/132/120/100 Ma, L4           | 4                    |
| 6(a–d)             | Local L4/L8 comparison, loaded coverage and loading UI   | 3 + 1 loading helper |
| 7(a–b)             | Zahirovic et al. (2022) / Seton et al. (2012), 120 Ma    | 2                    |
| 8(a–e), RTL panels | Global 2D and four orthographic comparison views, 120 Ma | 5                    |
| 9(b)               | Local 2D overlap comparison, RTL, 120 Ma                 | 1                    |

There are **15 map configurations and one loading helper**. The [case guide](case/README.md) covers Figures 5–7; the [evaluation guide](evaluation/README.md) covers Figures 8–9. Figure 6(d) records the controls and completion state of the Figure 6(b) loading operation and does not require a separate configuration. The evaluation files cover RTL views; they are not GPlates session files or performance benchmark scripts.

## Use in the Demo

Choose **Experiment → Import**, select the restored layer in the right-hand **Layers** panel and click **Load tiles** using the settings described in the relevant guide. No additional **Add layer** or separate initialization is needed. Model files and bundled map resources are resolved relative to the Demo; Macrostrat imagery is retrieved from its online service.

Import restores settings, not loaded imagery or loading history, and replaces existing layers. For Figure 6(b), load L4 before adding local L8 in the same layer. For Figure 6(c), use `case/steps/Figure_6c_Load_Local_First.json` to load the small view before zooming out.

All files use `schemaVersion: 3` and explicit `layerStack` entries. **Specified level**
uses `level`; **Current view** uses `viewLevel` when supplied, otherwise automatic
selection. Current-view loading retains existing tiles. Do not import another file
between operations that need to preserve accumulated coverage.

**Experiment → Screenshot** saves the map PNG and matching runtime JSON. It excludes
the control panels, legend list and workspace branding; use a browser/system screenshot
for Figure 6(d) or other UI illustrations. Macrostrat legend selections and results
are not stored in these configurations and must be queried separately.

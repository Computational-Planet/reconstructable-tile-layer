# Case figure configurations

English | [简体中文](README.zh-CN.md)

This directory contains nine map configurations for manuscript Figures 5–7 and one loading helper. Filenames and `caseId` values identify the corresponding figure panels.

## Figure mapping

Main configurations are in this directory; the loading helper is under `steps/`.

| Panel         | File                                     | Purpose                                                                                      |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Figure 5(a)   | `Figure_5a_0Ma_L4.json`                  | Zahirovic et al. (2022), 0 Ma, regional L4                                                   |
| Figure 5(b)   | `Figure_5b_132Ma_L4.json`                | Same regional view, 132 Ma, L4                                                               |
| Figure 5(c)   | `Figure_5c_120Ma_L4.json`                | Same regional view, 120 Ma, L4                                                               |
| Figure 5(d)   | `Figure_5d_100Ma_L4.json`                | Same regional view, 100 Ma, L4                                                               |
| Figure 6(a)   | `Figure_6a_120Ma_Local_L4.json`          | Zahirovic et al. (2022), 120 Ma, South American detail, L4                                   |
| Figure 6(b,d) | `Figure_6b_120Ma_Local_View_L8.json`     | Same detail, current-view loading at fixed L8; (d) records the completed operation in the UI |
| Figure 6(c)   | `Figure_6c_120Ma_Coverage_Overview.json` | Final zoomed-out view with topographic background and grey reference outlines                |
| Figure 7(a)   | `Figure_7a_120Ma_Zahirovic2022_L4.json`  | Zahirovic et al. (2022), 120 Ma, comparison view, L4                                         |
| Figure 7(b)   | `Figure_7b_120Ma_Seton2012_L4.json`      | Same view; Seton et al. (2012) visible, Zahirovic layer hidden, L4                           |

`steps/Figure_6c_Load_Local_First.json` combines the overview's layer stack with the detail view from Figure 6(a). Use it to load the detail view before composing the coverage overview.

## Import and load

Use **Experiment → Import** to restore the age, view, output settings, reference outlines and layer stack. Select a layer under **Layers**, check **Tile loading**, then click **Load tiles**. No additional **Add layer** action is required. All current-view configurations in this folder lock the source level to **L8**.

**Import replaces the layer stack and releases loaded results. Configurations do not store tile images, accumulated coverage or loading history.** Do not import another configuration between steps that need to retain existing L4 or L8 imagery.

### Figure 5: regional time sequence

Import each configuration and load L4, or import the 0 Ma configuration once, load L4 and change the global age successively to 132, 120 and 100 Ma. The four files share the same view.

### Figure 6(a,b,d): local L8 over retained L4

1. Import `Figure_6a_120Ma_Local_L4.json`, load the Macrostrat layer at **Specified level = 4**, and export (a).
2. Keep the same layer, age and camera. Switch to **Current view**, enable **Lock view level**, set **8**, and click **Load tiles**. This adds local L8 while retaining L4.
3. Use **Experiment → Screenshot** for (b), then use a browser/system screenshot to capture the actual fixed-L8 controls and completion message for (d). The map PNG does not include the panels.

The standalone (b) file stores the final settings. If starting from that file, load **Specified level = 4** first, then switch back to **Current view / fixed L8** and load again. Importing and loading L8 alone does not recreate the L4 background.

### Figure 6(c): loaded-coverage overview

1. Import `steps/Figure_6c_Load_Local_First.json`. It restores both layers at 120 Ma, their ordering, the small detail view and a 900 × 600 output setting.
2. Load **GPlates Topography** at specified L4 (opacity 0.5), and **Macrostrat Carto** for the current view at fixed L8. Do not add global Macrostrat L4 for this coverage illustration.
3. After loading, expand **Camera & Output → Detailed**, set **600 × 600, pixel ratio 2**, and click **Apply output size**. Enter the overview extent below and click **Apply extent**.
4. Export the overview with the retained tiles. Do not load L8 again for the larger view or import the final overview JSON. That JSON records the final composition but cannot restore the preceding small-view loading history.

| View                   |       West |      South |      East |      North | Configured output  |
| ---------------------- | ---------: | ---------: | --------: | ---------: | ------------------ |
| Figure 5 regional      | −81.379468 | −72.768463 | 55.921051 |  18.663286 | 900 × 600, ratio 2 |
| Figure 6 local loading | −13.677141 | −28.353388 | −9.212057 | −25.379980 | 900 × 600, ratio 2 |
| Figure 6(c) overview   | −56.899985 | −66.188197 | 13.685864 |   4.397653 | 600 × 600, ratio 2 |
| Figure 7 comparison    | −81.389933 | −72.768463 | 55.931516 |  18.663286 | 900 × 600, ratio 2 |

Coordinates describe the reconstructed view at 120 Ma, except that the Figure 5 extent is shared across all four ages. Output width and height are CSS pixels; exported dimensions also depend on device pixel ratio and browser zoom. **Screenshot** downloads both the PNG and matching JSON; check `output.canvasWidth` and `output.canvasHeight` in that JSON for the actual pixel dimensions.

### Figure 7: model comparison

Import (a) and (b) separately, loading visible layers at L4, or start with the two-layer (b) configuration and load both layers at L4. Show them in turn at 120 Ma and export separately. Each layer retains its own model. A hidden layer need only be loaded when it is to be shown. Both configurations use the same comparison view.

## Inputs and portability

- Macrostrat Carto uses `https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png` with a Web Mercator source grid. Display uses `2D_RECTANGULAR` with geographic coordinates.
- Zahirovic configurations pair `Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz` with `Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot`.
- Seton configurations pair `Seton_etal_ESR2012_StaticPolygons.1.gpmlz` with `Seton_etal_ESR2012_2012.1.rot`. Both models retain anchor 0 and `all-polygons-area`.
- The overview uses `/tiles/Gplates_Topography/{z}/{x}/{y}.png` and `/gplates_ref/geojson/reconstructed_120.00Ma.geojson`. These are bundled Demo resources.
- Files use `schemaVersion: 3` and a complete `layerStack`. Each layer's `source` and `model` govern its inputs; `sources` initializes the source editor.
- `viewLevel: 8` locks current-view loading. `level` is the setting for a later specified-level load, not an inventory of loaded levels.
- Panel letters, locator boxes, partial legends and UI cropping belong to figure preparation and are not Demo configuration fields.

For an interactive Macrostrat legend, expand **Reference & Legend → Macrostrat legend**,
set **Zoom (z)** to the source level being illustrated, and use **Select area** or
**Select point**. At nonzero ages, select the matching Macrostrat reconstruction layer.
The demo merges results by ID and then colour; the default limit is 1000 colour groups.
Legend state is not saved in these JSON files or included in the map PNG.

The Demo's model, topography and reference resources must be available at the configured URLs. Macrostrat imagery requires network access and CORS support.

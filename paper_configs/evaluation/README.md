# Evaluation figure configurations

English | [简体中文](README.zh-CN.md)

This directory contains six RTL configurations for manuscript Section 4.1, covering the RTL panels of Figure 8(a–e) and Figure 9(b). Performance benchmarks in Section 4.2 are separate from these scene configurations.

## Figure mapping

All configurations use **120 Ma, anchor plate 0 and `all-polygons-area`**, with the graticule enabled and background colour `#2f343b`.

| Configuration                                                                              | Panel and view                     | Imagery and loading                               | Output settings (width × height; pixelRatio) |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| [Figure_8a_RTL_Global2D_120Ma.json](Figure_8a_RTL_Global2D_120Ma.json)                     | Figure 8(a), global rectangular 2D | Topography tile service; specified L4             | 1800 × 900; 2                                |
| [Figure_8b_RTL_Orthographic_0_0_120Ma.json](Figure_8b_RTL_Orthographic_0_0_120Ma.json)     | Figure 8(b), orthographic 0°/0°    | As above                                          | 1000 × 1000; 2                               |
| [Figure_8c_RTL_Orthographic_180_0_120Ma.json](Figure_8c_RTL_Orthographic_180_0_120Ma.json) | Figure 8(c), orthographic 180°/0°  | As above                                          | 1000 × 1000; 2                               |
| [Figure_8d_RTL_NorthPole_120Ma.json](Figure_8d_RTL_NorthPole_120Ma.json)                   | Figure 8(d), North Pole            | As above                                          | 1000 × 1000; 2                               |
| [Figure_8e_RTL_SouthPole_120Ma.json](Figure_8e_RTL_SouthPole_120Ma.json)                   | Figure 8(e), South Pole            | As above                                          | 1000 × 1000; 2                               |
| [Figure_9b_RTL_Overlap2D_120Ma.json](Figure_9b_RTL_Overlap2D_120Ma.json)                   | Figure 9(b), local 2D overlap      | Topography tile service; specified L4 | 900 × 600; 2                                 |

The global extent is W −180°, S −90°, E 180°, N 90°. The local extent is W −4.012552°, S 9.5°, E 14.012552°, N 21.5°, centred approximately on 5°E, 15.5°N. These are reconstructed-view coordinates.

All four orthographic views use camera range `14016219.8`, pitch −90° and roll 0°. Heading is 180° for the South Pole and 360° for the other views. Each file retains its full `camera3D` settings.

## Import and load

1. Select a JSON file through **Experiment → Import** in the Demo. Import restores the age, view, output settings and layer list; it does not load tiles.
2. For Figure 8, select each restored online layer in **Layers**, confirm **Specified level / L4**, and click **Load tiles**. The configuration contains two visible topography layers. Load both layers in their listed order; no additional layer is needed.
3. For Figure 9(b), select the restored online layer in **Layers**, confirm **Specified level / L4**, and click **Load tiles**.
4. Export the screenshot after preparation and display have completed. Use **Export info** to record the new run's state if needed.

## Inputs and format

- Plate domains: `/features/Global_EarthByte_GPlates_PresentDay_StaticPlatePolygons.gpmlz`.
- Rotations: `/rotations/Zahirovic_etal_2022_OptimisedMantleRef_and_NNRMantleRef.rot`.
- Tile service: `/tiles/Gplates_Topography/{z}/{x}/{y}.png`, EPSG:4326, 256 × 256-pixel tiles, a 2 × 1 root grid, maximum L4.

These paths refer to the Demo's public assets. Files use `schemaVersion: 3` and explicit `layerStack` entries. Each layer's `source.config`, `model` and loading settings control its inputs; the top-level `sources` also restores the source editor.

Output dimensions specify the Demo's output settings; exported pixel dimensions also depend on browser zoom and device pixel ratio.

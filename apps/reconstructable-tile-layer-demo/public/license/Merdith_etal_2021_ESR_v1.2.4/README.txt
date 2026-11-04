 07 Feb 2020

This file describes the plate model accompanying Merdith et al. (2021), 'A continuous, kinematic full-plate motion model from 1 Ga to present'.  It is a compilation of four plate models:  Domeier (2016; 2018); Merdith et al. (2017); Young et al. (2019) and presented purely in a palaeomagnetic reference frame derived from Tetley (2018).

This directory contains Merdith_etal_2021_ESR_v1.2.4.gproj, which is a GPlates project file that will load the following:

1000_0_rotfile_Merdith_et_al.rot - the Global Rotation Model but with a purely paleomagnetic reference frame
1000_410-*{Convergence/Divergence/Transform/Topologies}-Merdith_etal.gpml - the plate topologies for 1000 to 410 Ma
410-250_plate_bounds_Merdith_et_al.gpml - the plate topologies for 410 to 250 Ma
250-0_plate_bounds_Merdith_etal.gpml - the plate topologies for 250 to 0 Ma
TopologyBuildingBlocks_Merdith_etal.gpml - building blocks for some topologies between 410 and 0 Ma
shapes_coastlines_Merdith_etal.gpml - a Global Coastline file (mainly for the past 400 Ma)
shapes_continents_Merdith_etal.gpml - a Global Continent shapes file (for the past 1 Ga)
shapes_cratons_Merdith_etal.gpml - a Global cratonic shapes file (for the past 1 Ga)
shapes_static_polygons_Merdith_etal.gpml - a Global static polygon file (for the past 1 Ga)
1000-410_poles.gpml - collection of palaeomagnetic data used to constrain the model between 1000 and 410 Ma (corresponds to Table 1 in the associated publication)

For the Mesozoic and Cenozoic, the plates comprising the Pacific Ocean traditionally move in a separate reference to the other ocean basins and continental motions, instead defined by hotspot motion. In order to preserve the plate motion of the Pacific relative to the continental domains where the new GAPWAP was implemented, we extracted relative plate rotations between the Pacific (plateID: 901) and Africa (plateID: 701) in 5 Ma intervals  between 250 and 83 Ma from the Young et al. (2019) model, which has been corrected for errata as discussed in Torsvik et al. (2019). This results in the same relative motion of all Pacific plates to continental plates, however it slightly alters the absolute position of the Pacific plates between 250 and 83 Ma. Studies interested in short(er) timescale (< 5 Ma) analysis or absolute plate motions should use a different model that explicitly links plate motion with the mantle (e.g. (Müller et al. 2019; Tetley et al. 2019)). To be clear, if you want to analyse the Pacific Ocean, including hotspot motion, Hawaiian-Emperor Bend kinematics etc. you should not use this model.

To load these datasets in GPlates do the following:

1.  Open GPlates
2.  Pull down the GPlates File menu and select Open Project
3.  Click to select the GPROJ file
4.  Click Open

Alternatively, drag and drop the GRPOJ file onto the globe.

You now have a global present day continents loaded in GPlates as well as the underlying rotation model and evolving plate topologies.  Play around with the GPlates buttons to make an animation, select features, draw features, etc. For more information, read the GPlates manual which can be downloaded from www.gplates.org.

## DECEMBER 2023

Topology artefacts have been corrected for the 1 Ga to 0 Ma timeframe. 

- 602 South China Plate at 480-475 Ma
- Central Tianshan at 490 Ma – 485 Ma topology break - 302 Baltica Plate 481 Ma
- 595 Ma Australia-AntarcHca boundary issue
- 530-520 boundary for topology of Erguna
- Izangi Ocean Plate 430-420
- Izangi Plate 248-245
- Eurasia topology 120-119
- Farallon 113-112 adjusted boundary to fix break o Izangitoo
- CAR_003_000 Boundary gap with Nazca; CAR_003_000becomes3.0-1.0,0.9-future, and Nazcaclosesgapat0MaattopofSAplate


## MARCH 2023

Alterations to 1 Ga plate model of Merdith++ 2021 (ESR)

Preamble

Some issues have been identified in the model where plate boundaries labelled 'transformed' had either a high convergence rate or high divergence rate. That is, even though they were labelled and conceptualised as transform boundaries (perhaps in some cases with an implied small amount of convergence or divergence motion), in the model they were clearly accommodation large amounts of crustal production or consumption. In the original intent of MER21++, the conceptualisation of plate boundaries was that plate motion moves orthogonally from a mid-ocean ridge towards a subduction zone (subduction does not have to be (sub)orthogonal). In a simple system, connecting a spreading ridge and subduction zone are a series of transform boundaries, (sub)parallel to the direction of movement:

—————————|>
||       |>
||       |>
——————   —|>
    ||    |>
    ||    |>
    ||    |>
    ——————|>

In this sense, reconstructing extinct ocean basins follows a simple procedure. Known subduction zones are mapped onto a continental motion model (e.g. as one defined from palaeomagnetic data), interpolation to connect regional subduction zones occurs. In ocean basins similar to the Atlantic or Indian oceans, mid-ocean ridges are inferred to be perpendicular to the direction of continental breakup (usually easiest when a supercontinent breaks up and clearly defined conjugate margins are preserved in the geological record). These mid-ocean ridges are typically easy to connect with subduction zones through a series of transform boundaries, much like the mid-Atlantic ridge connects through the Caribbean and Costa Rica with Pacific subduction, or through the Scotia-Sandiwch plates to Patagonia and the southern Pacific.

However, this approach does not work so well for large external ocean basins like the Pacific or Panthalassa Oceans, where there is a large ocean (>1/4 Earth surface) and a fragmentary record of subduction around the periphery. It is also compounded when the available data constraining plate motion of major cratons and continents are poor, as there are no constraints on both spreading rate and spreading direction. In these cases the approach of MER21++ (and also that of Domeier and Torsivk (2014) and Young et al. (2019)) is to ensure that at modelled mid-ocean ridges, divergence is occurring, and at known subduction zones, convergence is also occurring.

In this manner, the original MER21++ model mostly satisfied this constraint, however the model over-relied on transform boundaries to accommodate plate motion, such that many of the transform boundaries should be labelled (or considered) as 'inferred subduction zones'. Inferred, because the kinematic constraints of the constructed model (i.e. the location, orientation and spreading direction of synthetic mid-ocean ridges) require more subduction in order to accommodate a basic tenet of plate tectonic theory, that there is a balance of new crust created and destroyed over Ma timescales. In the original model, if one were to calculated total crustal production (spreading-ate • mid-ocean ridge length) and total crustal consumption (convergence rate • subduction zone length) they would not be equal.

Thus, the alterations offered in this update(?) pertain to either changing the labels of some transform boundaries that were identified to have a high convergence or divergence rate or to re-align these transform boundaries to better fit the small-circle orientation defined by the plate motion. We selected a convergence/divergence rate threshold of 2 cm/a as problematic (i.e. boundaries with rates higher than this were investigated) and also a plate boundary length greater than 500 km. The majority of these boundaries occurred in ocean basins away from large cratons, a few more major transform boundaries that were changed are identified below. Some oceanic plates had their plate velocity changed to either ensure that the revised boundaries were accommodated properly or mid-ocean ridge configuration altered (summarised below). No continental plate motion was changed. The majority of the changes occurred in the Neoproterozoic, until around 600 Ma, though a few boundaries were also changed in the Palaeozoic.

These changes have resulted in bringing gross crustal production and consumption curves into much better (but still not perfect) agreement. Pragmatically, the subduction zones in the original (published) model are a stronger reflection of subduction that is preserved (and conservatively interpolated, as one might interpolate subduction along the Andean margin through amagmatic regions) in the geological record, while this altered model also contains inferred subduction zones, as necessitated by our mid-ocean spreading ridges. The difference therefore is either a reflection of arcs (principally oceanic) that are lost to time, or some idea of the inherent uncertainty within making full-plate models in deep-time (i.e. how much more unknown subduction do we need to account for kinematically balancing global plate motion).

Major boundary changes

Mawson sea-spreading removed (1000–940 Ma)
Boundary separating Tarim from Mawson-sea simplified to a single transform boundary, one arm of the Mirovoi MOR triple junction was re-aligned (directly intersecting subduction outboard of Siberia) (1000–900 Ma)
Realigned transform boundaries in Mawson Sea (940–900 Ma)
Subduction outboard of Indo-Antarctica has been removed from 900–870 Ma (still present 870–850 Ma). In the original model this was inferred subduction based on plate motion and some sparse evidence of reactivated faults after Ruker collided with the Eastern Ghats-Raynor (NB could still work if a new ocean plate introduced).
Transform boundary connecting Mirovoi MOR with Tarim replaced with a MOR boundary to make a proper triple junction (900-800 Ma)
Ocean plate subdbucting under India simplified to a one plate system (850–800 Ma)
Transform outboard of Kalarhai Craton replaced with subduction zone (800-750 Ma)
Ocean plate subducting under India separated into a 'Tarim plate' and 'Ocean plate under India' (800-750 Ma)
Mirovoi triple junction extended to 750 Ma
Transform changed to subduction zone outboard of WAC (750-700 Ma)
Cadomia-Avalonia subduction extended eastward past SM into the ocean (600–580 Ma)
The long transform outboard of Baltica as the Iapetus opened is now an oceanic subduction zone (probably the most significant change) (585–520 Ma)
Tranform outboard of western Laurentian margin now a subduction zone (500-450 Ma)
A duplicate subduction zone between 760 and 751 has been removed

Ocean plate velocity changes

Mirovoi ocean plate subjecting under Siberia has velocity increased slightly (900-850 Ma)
Mawson sea velocity changed to ensure convergence under Australia (1000-850 Ma)

v 1.2.1 changes

* Changed rift feature to MOR between Australia and Antarctica from 90 to 40 Ma 
* Added Greater India continental polygon

v 1.2.2 changes

* fixed gpml property error in shapes_continents.gpml file.

v 1.2.3 changes

* bugs in shapes_continents.gpml fixed along the Aleutians and Kamchatka in the mid-late Cenozoic 

v 1.2.4 changes

plate ID bugs in shapes_continents.gpml fixed

------------------------------------------------------------------------------------------------------------------------------------------------------------

Supplementary Material to Merdith et al. (submitted)—'A continuous, kinematic full-plate motion model from 1 Ga to present'.

APWP path for Africa from 540 to 320 Ma. GAPWAP for Africa from 320 to 0 Ma

This was calculated after Tetley (2018) using a windowed mean (window=50, step=10). Two timesteps produced erratic behaviour, 430 and 420 Ma. However, there is no palaeomagnetic data from Gondwana to constrain the APWP at this time. In lieu of this we interpolated the APWP for these two time steps from the rotations at 440 and 410 Ma. These interpolated rotations are included below and in the rotation file of this model. The raw APWP poles that were calculated are given at the bottom of the file.

moving_plate Age Lat Lon Angle fixed_plate
701  0.0   90.0    0.0    0.0  000
701 10.0    0.0   97.19    5.31  000
701 20.0    0.0   91.92    6.71  000
701 30.0    0.0  102.08    8.54  000
701 40.0    0.0  117.34   13.73  000
701 50.0    0.0  124.39   15.27  000
701 60.0    0.0  129.74   16.83  000
701 70.0    0.0  138.56   18.91  000
701 80.0    0.0  142.15   19.77  000
701 90.0    0.0  151.23   20.74  000
701 100.0    0.0  159.7   23.92  000
701 110.0    0.0  165.43   28.74  000
701 120.0    0.0  169.28   32.69  000
701 130.0    0.0  168.73   35.79  000
701 140.0    0.0  168.24   39.3  000
701 150.0    0.0  166.55   41.89  000
701 160.0    0.0  165.22   35.73  000
701 170.0    0.0  164.81   33.63  000
701 180.0    0.0  161.57   29.21  000
701 190.0    0.0  156.99   26.56  000
701 200.0    0.0  152.7   26.13  000
701 210.0    0.0  147.26   26.82  000
701 220.0    0.0  146.59   29.53  000
701 230.0    0.0  148.46   37.21  000
701 240.0    0.0  150.42   42.82  000
701 250.0    0.0  152.87   47.36  000
701 260.0    0.0  152.55   51.43  000
701 270.0    0.0  150.95   51.36  000
701 280.0    0.0  148.21   53.97  000
701 290.0    0.0  145.23   57.94  000
701 300.0    0.0  141.98   57.87  000
701 310.0    0.0  140.57   58.66  000
701 320.0    0.0  139.46   63.67  000
701 330.0    0.0  137.91   66.09  000
701 340.0    0.0  128.47   70.9  000
701 350.0    0.0  116.38   78.48  000
701 360.0    0.0  110.03   83.68  000
701 370.0    0.0  108.08   85.39  000
701 380.0    0.0  107.56   86.03  000
701 390.0    0.0  106.38   80.23  000
701 400.0    0.0  103.55   82.08  000
701 410.0    0.0  103.95   68.31  000
*701 420.0    0.0  95.005   85.4002  000
*701 430.0    0.0  88.6223   103.487  000
701 440.0    0.0   83.68  122.11  000
701 450.0    0.0   89.0  126.0  000
701 460.0    0.0   93.06  124.89  000
701 470.0    0.0   94.96  124.8  000
701 480.0    0.0   97.71  120.83  000
701 490.0    0.0   99.15  117.75  000
701 500.0    0.0  101.03  114.0  000
701 510.0    0.0  100.46  112.02  000
701 520.0    0.0  -85.15 -109.96  000
701 530.0    0.0  -90.78 -105.02  000
701 540.0    0.0  -92.16 -100.45  000

*interpolated, below two lines are the calculated APWP poles
701 420.0 0.0 100.67   83.01 000
701 430.0 0.0   98.6   78.66 000

References
Tetley, M.G., 2018. Constraining Earth’s plate tectonic evolution through data mining and knowledge discovery. PhD Thesis.

------------------------------------------------------------------------------------------------------------------------------------------------------------

References
Domeier, M., 2016. A plate tectonic scenario for the Iapetus and Rheic oceans. Gondwana Research, 36, pp.275-295.
Domeier, M., 2018. Early Paleozoic tectonics of Asia: towards a full-plate model. Geoscience Frontiers, 9(3), pp.789-862.
Matthews, K.J., Maloney, K.T., Zahirovic, S., Williams, S.E., Seton, M. and Mueller, R.D., 2016. Global plate boundary evolution and kinematics since the late Paleozoic. Global and Planetary Change, 146, pp.226-250.
Merdith, A.S., Collins, A.S., Williams, S.E., Pisarevsky, S., Foden, J.D., Archibald, D.B., Blades, M.L., Alessio, B.L., Armistead, S., Plavsa, D. and Clark, C., 2017. A full-plate global reconstruction of the Neoproterozoic. Gondwana Research, 50, pp.84-134.
Tetley, M.G., 2018. Constraining Earth’s plate tectonic evolution through data mining and knowledge discovery. PhD Thesis
Torsvik, T.H., Steinberger, B., Shephard, G.E., Doubrovine, P.V., Gaina, C., Domeier, M., Conrad, C.P. and Sager, W.W., 2019. Pacific‐Panthalassic reconstructions: Overview, errata and the way forward. Geochemistry, Geophysics, Geosystems, 20(7), pp.3659-3689.
Young, A., Flament, N., Maloney, K., Williams, S., Matthews, K., Zahirovic, S. and Müller, R.D., 2019. Global kinematics of tectonic plates and subduction zones since the late Paleozoic Era. Geoscience Frontiers, 10(3), pp.989-1013.

Any questions, please email:

  Andrew merdith andrew.merdith@univ-lyon1.fr

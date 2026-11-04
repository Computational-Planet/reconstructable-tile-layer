Description of Resources - Seton et al. (2012)

This file provides a detailed description of all of the files that make up the data collection associated with the publication: Seton, M., Müller, R. D., Zahirovic, S., Gaina, C., Torsvik, T., Shephard, G., Talsma, A., Gurnis, M., Turner, M., Maus, S., Chandler, M. (2012). Global continental and ocean basin reconstructions since 200 Ma. Earth-Science Reviews, 113(3), 212-270. doi:10.1016/j.earscirev.2012.03.002
 
Note: For information on file formats and what programs to use to interact with various file formats, see "File Formats and Recommended Programs”.


The files associated with this data collection allow for the visualisation and/or manipulation of the global plate motion model presented by Seton et al. (2012), they include:
•	Rotations - Global rotation model that contains the reconstruction poles that describe the motions of the continents and oceans.
	*	Seton_etal_ESR2012_2012.1.rot (410 KB)
•	Plate IDs - A list of all the plate IDs used in the rotation and geometry files and their corresponding plate names.
	*	Seton_etal_ESR2012_PlateIDs.pdf (102 KB) 
•	Coastlines - Geometries of the present-day coastlines.
	*	Seton_etal_ESR2012_Coastline_2012.1.gpml (17.5 MB)
	*	Seton_etal_ESR2012_Coastline_2012.1_polyline.shp (3.3 MB inc. auxiliary files, datum-WGS 1984)
	*	Seton_etal_ESR2012_Coastline_2012.1_polyline.txt (2.7 MB)
	*	Seton_etal_ESR2012_Coastline_2012.1_polyline.kml (4.4 MB)
•	Continent-ocean boundaries (COBs) - Locations of the boundaries between oceanic and continental crust for plates involved in this study.
	*	Seton_etal_ESR2012_COB_2012.1.gpml (410 KB)
	*	Seton_etal_ESR2012_COB_2012.1.shp (152 KB inc. auxiliary files, datum-WGS 1984)
	*	Seton_etal_ESR2012_COB_2012.1.txt (86 KB)
	*	Seton_etal_ESR2012_COB_2012.1.kml (176 KB)
•	Plate polygons and boundary geometries - Topologically closed plate polygons are constructed from the intersection of ridges, transforms, subduction zones and other plate boundary geometries. These 'resolved topologies' are valid at 1 Myr intervals (0-200 Ma). The plate boundary geometries and plate polygons have been assigned plate reconstruction IDs to allow them to be reconstructed using the supplied rotation file. 
	*	Seton_etal_ESR2012_PP_2012.1.gpml (29.5 MB)

Note:
Paleo age grids used by Seton et al. (2012) are released in Müller et al. (2013) [Müller, R. D., Dutkiewicz, A., Seton, M., & Gaina, C. (2013). Seawater chemistry driven by supercontinent assembly, breakup, and dispersal. Geology, 41(8), 907-910. doi: 10.1130/g34405.1]

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

File Formats and Recommended Programs:
Researchers in the EarthByte Research Group make their data available in a variety of file formats. The file formats will be described below, along with a recommended program for using when visualising or interacting with the data. Note that some of the formats described below may not be in this data collection.

.avi - These files contain animations/movies. They can be viewed using the open source software VLC (http://www.videolan.org/vlc/index.html), and many other multimedia players.

.cpt - These files contain colour palette tables. Colour palette tables tell programs which colours to use and over which z-intervals when displaying data. These are generally used when displaying/plotting raster data. The Generic Mapping Tools (GMT) software allows .cpt files to be used to shade colour-filled symbols, as well as to plot raster data. These files can be used in GPlates and Panoply when loading in .nc (grid) files. The colours in .cpt files are often given as RGB values, but can also be given as HSV values. However, it is important to note that for compatibility with GPlates and Panoply the .cpt files must contain RGB values that are separated by a space (not hyphens or forward slashes).

.gpml - These are geometry files (written using the GPlates Markup Language) that may contain polygons, polylines and/or point geometries. The geometries will likely have been given plate ids so that they can be reconstructed using an associated rotation file (.rot) using the program GPlates.

.gpmlz - As above (see .gpml), however these are compressed files. They can be loaded directly into GPlates and do not need to be uncompressed first.

.jpg/.jpeg - These files contain images. JPEG is a commonly used raster format. These are not georeferenced. These files can be opened by double-clicking. By default they will usually be opened by Preview (Mac) or Windows Photo Viewer (PC).

.kml - These are Google Earth formatted files to be loaded in Google Earth. 

.kmz - These are Google Earth formatted files to be loaded in Google Earth. This is a compressed version of a .kml file.

.nc - These are NetCDF grid files that contain gridded data. These can be viewed using the open source software Panoply (http://www.giss.nasa.gov/tools/panoply/) or GPlates. These can be plotted using the open source Generic Mapping Tools (GMT) software (http://gmt.soest.hawaii.edu/).

.pdf - These Portable Document Format files enable documents to be presented independent of operating systems. They can display text and images and can be viewed using Preview (Mac) or Adobe Reader (most systems).

.png - These files contain images. PNG is a commonly used raster format. These are not georeferenced. These files can be opened by double-clicking. By default they will usually be opened by Preview (Mac) or Windows Photo Viewer (PC).

.rot - These are rotation files that contain a list of finite Euler rotation poles for each plate within the plate motion model. These rotation poles enable plates to be reconstructed through time. These are plain text files that can be opened and edited in any text editor. These files should be used in GPlates (http://gplates.org) in conjunction with an associated geometry file to allow the geometries to be reconstructed through time.

.shp - These are geospatial vector geometry files (written in the ESRI Shapefile format) that may contain polygons, polylines and/or point geometries. These can be loaded in ArcGIS, GPlates and QGIS. If the geometries have been assigned plate ids then they can be reconstructed using GPlates if a rotation file (.rot) is available.

.tif - These are georeferenced TIFF files (GeoTIFF). They will either be numerical GeoTIFFs or colour GeoTIFFs. Numerical GeoTIFFs only preserve the numerical values of the data and therefore require a colour palette when visualised. The colour GeoTIFFs have been created using a colour palette and do not preserve the original numerical values, rather they record RGB values. These can be opened using ArcGIS.

.txt - These are geometry files (written in plain text columns) that may contain polygons, polylines and/or point geometries. These files can be opened using a text editor. These data can be plotted using the open source Generic Mapping Tools (GMT) software (http://gmt.soest.hawaii.edu/).

"""Project-owned fixtures, independently encoded with netCDF4 (test tooling only)."""
from pathlib import Path

import netCDF4
import numpy as np

target = Path(__file__).parent / "fixtures"
target.mkdir(exist_ok=True)
with netCDF4.Dataset(target / "packed-record.nc", "w", format="NETCDF3_64BIT_OFFSET") as file:
    file.Conventions = "CF-1.10"
    file.createDimension("epoch", None)
    file.createDimension("column", 3)
    file.createDimension("row", 3)
    lon = file.createVariable("longitude", "f8", ("column",))
    lat = file.createVariable("latitude", "f8", ("row",))
    lon.units = "degrees_east"
    lat.units = "degrees_north"
    lon[:] = [0, 120, 240]
    lat[:] = [-45, 0, 45]
    data = file.createVariable("packed", "i2", ("epoch", "column", "row"), fill_value=-1)
    data.coordinates = "longitude latitude"
    data._Unsigned = "true"
    data.missing_value = np.int16(-2)
    data.valid_range = np.array([0, -3], dtype=np.int16)
    data.scale_factor = 0.5
    data.add_offset = 273.15
    data.units = "K"
    data.set_auto_maskandscale(False)
    values = np.fromfunction(lambda t, x, y: t * 100 + x * 10 + y, (2, 3, 3), dtype=int).astype("i2")
    values[0, 0, 0] = -1
    values[0, 1, 0] = -2
    values[0, 2, 0] = -4
    data[:] = values

with netCDF4.Dataset(target / "grouped-grid.nc", "w", format="NETCDF4") as file:
    file.Conventions = "CF-1.10"
    group = file.createGroup("ocean")
    for dimension, size in [("column", 3), ("epoch", 2), ("row", 3)]:
        group.createDimension(dimension, size)
    lon = group.createVariable("longitude", "f8", ("column",))
    lat = group.createVariable("latitude", "f8", ("row",))
    lon.units = "degrees_east"
    lat.units = "degrees_north"
    lon[:] = [0, 120, 240]
    lat[:] = [50, 0, -40]
    epoch = group.createVariable("epoch", "f8", ("epoch",))
    epoch.units = "days since 0000-01-01"
    epoch.calendar = "noleap"
    epoch[:] = [15, 45]
    data = group.createVariable("packed", "i2", ("column", "epoch", "row"), fill_value=-32767, zlib=True)
    data.coordinates = "longitude latitude"
    data.scale_factor = 0.5
    data.add_offset = 273.15
    data.units = "K"
    data.set_auto_maskandscale(False)
    data[:] = np.fromfunction(lambda x, t, y: t * 100 + x * 10 + y, (3, 2, 3), dtype=int).astype("i2")

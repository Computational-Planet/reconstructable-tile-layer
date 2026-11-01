"""Independent test oracle. Requires netCDF4, numpy and tifffile; never used by the app."""
import json
from pathlib import Path

import netCDF4
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp" / "raster-reference-data"
ATTRIBUTES = ["standard_name", "long_name", "units", "axis", "coordinates", "bounds",
              "grid_mapping", "calendar", "climatology", "scale_factor", "add_offset",
              "_FillValue", "missing_value", "valid_range", "positive"]


def plain(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return value


result = {"engines": {"netCDF4": netCDF4.__version__, "numpy": np.__version__}, "datasets": []}
for path in sorted(CACHE.glob("*.nc")):
    with netCDF4.Dataset(path) as dataset:
        entry = {"filename": path.name, "format": dataset.data_model,
                 "conventions": getattr(dataset, "Conventions", None),
                 "dimensions": {name: {"size": len(dim), "unlimited": dim.isunlimited()}
                                for name, dim in dataset.dimensions.items()}, "variables": {}}
        for name, variable in dataset.variables.items():
            variable.set_auto_maskandscale(False)
            info = {"dimensions": variable.dimensions, "shape": variable.shape,
                    "dtype": str(variable.dtype),
                    "attributes": {key: plain(variable.getncattr(key)) for key in ATTRIBUTES if key in variable.ncattrs()}}
            if variable.ndim == 1:
                values = np.asarray(variable[:])
                delta = np.diff(values.astype(float))
                info["axis"] = {"first": plain(values[0]), "last": plain(values[-1]),
                                "minimumStep": float(delta.min()) if delta.size else None,
                                "maximumStep": float(delta.max()) if delta.size else None}
            elif variable.ndim >= 2 and variable.size:
                origin = tuple(0 for _ in variable.shape)
                center = tuple(length // 2 for length in variable.shape)
                info["samples"] = [{"indices": origin, "raw": plain(variable[origin])},
                                   {"indices": center, "raw": plain(variable[center])}]
            entry["variables"][name] = info
        result["datasets"].append(entry)

try:
    import tifffile
except ImportError:
    tifffile = None
if tifffile is not None:
    result["engines"]["tifffile"] = tifffile.__version__
    for path in sorted(CACHE.glob("*.tif")):
        with tifffile.TiffFile(path) as dataset:
            page = dataset.pages[0]
            samples = page.asarray()
            result["datasets"].append({"filename": path.name, "format": "GeoTIFF", "shape": page.shape,
                "dtype": str(page.dtype), "isTiled": page.is_tiled,
                "geotiff": {key: plain(value) for key, value in dataset.geotiff_metadata.items()},
                "samples": [{"indices": [0, 0], "raw": plain(samples[0, 0])},
                            {"indices": [page.shape[0] // 2, page.shape[1] // 2], "raw": plain(samples[page.shape[0] // 2, page.shape[1] // 2])}]})

destination = CACHE / "reference-metadata.json"
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
for entry in result["datasets"]:
    print(entry["filename"], entry["format"], json.dumps(entry.get("dimensions", entry.get("shape"))))
print(destination)

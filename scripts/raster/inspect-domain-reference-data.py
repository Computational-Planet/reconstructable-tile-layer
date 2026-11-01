"""Independent NetCDF oracle for the pinned paleogeographic corpus (test tooling)."""

import hashlib
import json
import math
from pathlib import Path

import netCDF4
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp" / "paleo-domain-review"
MANIFEST = json.loads(
    Path(__file__).with_name("domain-reference-datasets.json").read_text(encoding="utf-8")
)
SAMPLES = {
    "paleodem-holocene": ("z", (90, 180)),
    "paleodem-cretaceous": ("z", (90, 180)),
    "deepmip-eocene-tas": ("tas", (0, 48, 72)),
    "deepmip-eocene-tos-curvilinear": ("tos", (0, 192, 160)),
}


def plain(value):
    if isinstance(value, np.ndarray):
        return plain(value.tolist())
    if isinstance(value, np.generic):
        return plain(value.item())
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    # JSON 不接受 NaN；证据用字符串保留缺失标记，不改变原始文件。
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    return value


result = {
    "engines": {"netCDF4": netCDF4.__version__, "numpy": np.__version__},
    "nonFiniteAttributeEncoding": "Strings nan, inf, -inf; original files unchanged",
    "datasets": [],
}
for fixture in MANIFEST:
    path = CACHE / fixture["filename"]
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    if checksum != fixture["sha256"]:
        raise ValueError(f"Unexpected fixture bytes: {path.name}")
    with netCDF4.Dataset(path) as dataset:
        entry = {
            "filename": path.name,
            "sha256": checksum,
            "bytes": path.stat().st_size,
            "format": dataset.data_model,
            "attributes": {key: plain(dataset.getncattr(key)) for key in dataset.ncattrs()},
            "dimensions": {
                name: {"size": len(dim), "unlimited": dim.isunlimited()}
                for name, dim in dataset.dimensions.items()
            },
            "variables": {},
        }
        sample_name, sample_indices = SAMPLES[fixture["id"]]
        for name, variable in dataset.variables.items():
            # 独立基准读取存储值；避免库自动缩放或掩膜掩盖浏览器读取错误。
            variable.set_auto_maskandscale(False)
            info = {
                "dimensions": variable.dimensions,
                "shape": variable.shape,
                "dtype": str(variable.dtype),
                "attributes": {
                    key: plain(variable.getncattr(key)) for key in variable.ncattrs()
                },
            }
            if variable.ndim == 1 and variable.size:
                values = np.asarray(variable[:])
                info["axisEndpoints"] = plain([values[0], values[-1]])
            if name == sample_name:
                info["sample"] = {
                    "indices": sample_indices,
                    "raw": plain(variable[sample_indices]),
                }
            entry["variables"][name] = info
        result["datasets"].append(entry)
        print(path.name, entry["format"], entry["variables"][sample_name]["sample"])

destination = CACHE / "domain-metadata.json"
destination.write_text(
    json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
)
print(destination)

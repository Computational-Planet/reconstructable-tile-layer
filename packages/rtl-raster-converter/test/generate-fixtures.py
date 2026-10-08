"""Independently encode the converter's project-owned, unreferenced TIFF fixture."""
from pathlib import Path

import numpy as np
import tifffile

target = Path(__file__).parent / "fixtures"
target.mkdir(exist_ok=True)
tifffile.imwrite(
    target / "unreferenced.tif",
    np.array([[0, 1, -999, 3], [4, 5, 6, 7]], dtype="int16"),
    photometric="minisblack",
    metadata=None,
    extratags=[(42113, "s", 0, "-999", False)],
)

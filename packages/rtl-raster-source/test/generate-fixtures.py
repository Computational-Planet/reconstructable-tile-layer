"""Reproduce the small owned TIFF fixture with tifffile and imagecodecs."""
from pathlib import Path
import numpy as np
import tifffile

destination = Path(__file__).parent / "fixtures" / "stripped-preview.tif"
destination.parent.mkdir(parents=True, exist_ok=True)
tifffile.imwrite(destination, np.arange(512 * 128, dtype=np.float32).reshape(128, 512),
                 rowsperstrip=4, compression="deflate", predictor=3, metadata=None,
                 extratags=[(33550, "d", 3, (0.1, 0.1, 0.0), False),
                            (33922, "d", 6, (0.0, 0.0, 0.0, 0.0, 20.0, 0.0), False),
                            (34735, "H", 16, (1, 1, 0, 3, 1024, 0, 1, 2,
                                              1025, 0, 1, 1, 2048, 0, 1, 4326), False)])
print(destination, destination.stat().st_size)

# 独立编码的 EPSG:3857 RGB 小图；投影半径固定为 CRS 的 6378137 m。
rgb_destination = destination.with_name("rgb-mercator.tif")
half_world = np.pi * 6378137
rgb = np.array([[[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]],
                [[0, 255, 255], [255, 0, 255], [255, 128, 0], [0, 0, 0]]], dtype=np.uint8)
tifffile.imwrite(rgb_destination, rgb, photometric="rgb", compression="deflate", metadata=None,
                 extratags=[(33550, "d", 3, (half_world / 2, half_world / 2, 0), False),
                            (33922, "d", 6, (0, 0, 0, -half_world, half_world / 2, 0), False),
                            (34735, "H", 16, (1, 1, 0, 3, 1024, 0, 1, 1,
                                              1025, 0, 1, 1, 3072, 0, 1, 3857), False)])
print(rgb_destination, rgb_destination.stat().st_size)

"""What stands above the ground, from the laser points: the highest return in each 2 m cell, less the elevation model.

Reading a tile's four sheets takes minutes, so the result is kept beside the raw
data and only made once. `python laser.py L2343C [more]` makes several at a time.
"""

import sys
from multiprocessing import Pool
from pathlib import Path

import laspy
import numpy as np
import rasterio

from grid import SAMPLE_M, SAMPLES, Tile, tile_from_name
from sources import RAW, dem_path, laser_paths

KEPT = RAW.parent / "derived" / "above-ground"
GROUND, NOISE, WATER = 2, 7, 9
CHUNK_POINTS = 4_000_000
# Above any tree here: what's left over this is a bird or a stray return.
TALLEST_M = 40.0


def above_ground(tile: Tile) -> np.ndarray:
    """Metres above the ground, 3000×3000, rows north to south. Kept in decimetres."""
    path = KEPT / f"{tile.name}.npy"
    if path.exists():
        return np.load(path).astype(np.float32) / 10
    with rasterio.open(dem_path(tile)) as dataset:
        ground = dataset.read(1)
    highest = np.full((SAMPLES, SAMPLES), -np.inf, dtype=np.float32)
    for sheet in laser_paths(tile):
        with laspy.open(sheet) as reader:
            for points in reader.chunk_iterator(CHUNK_POINTS):
                kind = np.asarray(points.classification)
                kept = (kind != GROUND) & (kind != NOISE) & (kind != WATER)
                column = ((np.asarray(points.x)[kept] - tile.west) / SAMPLE_M).astype(np.int32)
                row = ((tile.north - np.asarray(points.y)[kept]) / SAMPLE_M).astype(np.int32)
                inside = (column >= 0) & (column < SAMPLES) & (row >= 0) & (row < SAMPLES)
                np.maximum.at(highest, (row[inside], column[inside]), np.asarray(points.z)[kept][inside].astype(np.float32))
    height = np.clip(np.where(np.isfinite(highest), highest - ground, 0), 0, TALLEST_M)
    height[(highest - ground) > TALLEST_M] = 0
    KEPT.mkdir(parents=True, exist_ok=True)
    np.save(path, np.round(height * 10).astype(np.uint16))
    return height


def _make(name: str) -> str:
    above_ground(tile_from_name(name))
    return name


if __name__ == "__main__":
    with Pool(int(sys.argv[1])) as pool:
        for done in pool.imap_unordered(_make, sys.argv[2:]):
            print(done, flush=True)

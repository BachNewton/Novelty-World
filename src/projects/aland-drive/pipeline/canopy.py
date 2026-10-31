"""Where trees stand and how tall, at 4 m: what the render grows a forest from.

The laser says what stands above the ground, but it was flown years before the
photo and it sees buildings too. So what's kept is what's tall, dark in the photo
(so a stand felled since is gone), off the water, and clear of roads and buildings.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from grid import SAMPLES, TILE_SIZE_M

TREE_FROM_M = 3.0
UNIT_M = 0.25
PIXELS = 1500
QUALITY = 55
# Bright in the photo means a field, a clearing or a rock, whatever stood there when the laser flew.
DARKEST_OPEN_LUMA = 150
CLEAR_OF_BUILDINGS_M = 3.0
# Metres of bare ground beyond each tier's road surface.
CLEAR_OF_ROADS_M = (5.0, 3.0, 1.5)


def _road_clearing(ribbons: list[tuple[np.ndarray, np.ndarray]], west: float, north: float) -> np.ndarray:
    """True on 2 m cells too near a road for a tree."""
    scale = SAMPLES / TILE_SIZE_M
    clear = np.zeros((SAMPLES, SAMPLES), dtype=bool)
    for tier, metres in enumerate(CLEAR_OF_ROADS_M):
        canvas = Image.new("1", (SAMPLES, SAMPLES), 0)
        pen = ImageDraw.Draw(canvas)
        for rings, tiers in ribbons:
            columns, rows = (rings[:, :, 0] - west) * scale, (north - rings[:, :, 1]) * scale
            for section in np.flatnonzero(tiers[:-1] == tier):
                pen.polygon([(columns[section, 0], rows[section, 0]), (columns[section, 4], rows[section, 4]), (columns[section + 1, 4], rows[section + 1, 4]), (columns[section + 1, 0], rows[section + 1, 0])], fill=1)
        clear |= ndimage.binary_dilation(np.array(canvas), iterations=round(metres * scale))
    return clear


def bake(above: np.ndarray, photo: np.ndarray, water: np.ndarray, buildings: np.ndarray, ribbons: list[tuple[np.ndarray, np.ndarray]], west: float, north: float, folder: Path) -> np.ndarray:
    """Writes `canopy.webp`, a tree's height in quarter metres, and returns which 2 m cells are under trees."""
    luma = ndimage.uniform_filter(photo @ np.array([0.3, 0.59, 0.11]), 5)
    tall = ndimage.maximum_filter(above, 3)
    trees = (tall >= TREE_FROM_M) & (luma < DARKEST_OPEN_LUMA) & ~water
    trees &= ~ndimage.binary_dilation(buildings, iterations=round(CLEAR_OF_BUILDINGS_M / 2))
    trees &= ~_road_clearing(ribbons, west, north)
    # A lone speck is a fence post or a car as often as a tree.
    trees = ndimage.binary_opening(trees)
    height = np.where(trees, tall, 0).reshape(PIXELS, 2, PIXELS, 2).max(axis=(1, 3))
    units = np.clip(np.round(height / UNIT_M), 0, 255).astype(np.uint8)
    Image.fromarray(units).save(folder / "canopy.webp", quality=QUALITY, method=5)
    return trees

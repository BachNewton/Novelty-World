"""The land's colour, from the NLS orthophotos.

The 0.5 m photo is reduced to the 2 m lattice of the shading. Alpha says how much
of the photo shows over the game's own water: all of it on land and in the
shallows by a shore, where the rocks, reeds and sand are the photo's, fading out
into open water, whose glints and flight lines shouldn't show.
"""

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from scipy import ndimage

from grid import SAMPLE_M, SAMPLES, Tile
from sources import ortho_path
from terrain import RIM_SAMPLES

SHALLOWS_M = 36.0
# Not zero: a browser drops a pixel's colour with its alpha, and mips would pull the shore towards black.
OPEN_WATER_ALPHA = 0.04
QUALITY = 62
FAR_PIXELS = 750
FAR_QUALITY = 70
# The photos are flown high and in spring, so haze sits on every channel, most of all the blue. One grade for every
# tile, not one fitted to each, or tiles would step at their seams.
HAZE = np.array([40.0, 54.0, 80.0])
BRIGHTEST = np.array([250.0, 240.0, 244.0])
SATURATION = 1.25
DARK_GREY = 0.08
FULL_COLOUR_GREY = 0.3
# Under trees the ground is in shade, and the photo there is treetops, not ground.
UNDER_TREES_LIGHT = 0.5
UNDER_TREES_SOFTNESS_SAMPLES = 2


def read_photo(tile: Tile) -> np.ndarray:
    """The tile's photo on the 2 m lattice, RGB bytes, rows north to south."""
    with rasterio.open(ortho_path(tile)) as dataset:
        if tuple(dataset.bounds) != (tile.west, tile.south, tile.east, tile.north):
            raise ValueError(f"{tile.name}: the photo covers {tuple(dataset.bounds)}")
        return np.moveaxis(dataset.read((1, 2, 3), out_shape=(3, SAMPLES, SAMPLES), resampling=Resampling.average), 0, -1)


def graded(photo: np.ndarray) -> np.ndarray:
    """The photo with its haze taken off, as bytes."""
    clear = np.clip((photo.astype(np.float32) - HAZE) / (BRIGHTEST - HAZE), 0, 1)
    grey = clear.mean(axis=2, keepdims=True)
    # Shadows hold the sky's blue, which reads as paint on the ground, so colour comes in only with the light.
    saturation = SATURATION * np.clip((grey - DARK_GREY) / (FULL_COLOUR_GREY - DARK_GREY), 0.15, 1)
    return np.round(255 * np.clip(grey + saturation * (clear - grey), 0, 1)).astype(np.uint8)


def bake(photo: np.ndarray, water_with_rim: np.ndarray, trees: np.ndarray, folder: Path) -> None:
    """`ground.webp` at the shading's size and `ground-far.webp` for every tile's far data."""
    shaded = ndimage.gaussian_filter(trees.astype(np.float32), UNDER_TREES_SOFTNESS_SAMPLES)
    photo = np.round(photo * (1 - (1 - UNDER_TREES_LIGHT) * shaded)[..., None]).astype(np.uint8)
    into_water = ndimage.distance_transform_edt(water_with_rim)[RIM_SAMPLES:-RIM_SAMPLES, RIM_SAMPLES:-RIM_SAMPLES] * SAMPLE_M
    alpha = 1 - (1 - OPEN_WATER_ALPHA) * np.clip(into_water / SHALLOWS_M, 0, 1)
    image = Image.fromarray(np.dstack((photo, np.round(alpha * 255).astype(np.uint8))), "RGBA")
    image.save(folder / "ground.webp", quality=QUALITY, alpha_quality=70, method=5)
    image.reduce(SAMPLES // FAR_PIXELS).save(folder / "ground-far.webp", quality=FAR_QUALITY, alpha_quality=70, method=5)

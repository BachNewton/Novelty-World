"""Heights in; the game's height grid, baked shading and water mask out.

Grid nodes sit on the corners of the 2 m samples, each the mean of the four
samples round it, so a tile's nodes run exactly from one edge to the other and
two neighbours compute the same numbers on the row they share. That needs a rim
of each neighbour, and so does the shading: a shadow cast across a tile edge
must land the same from either side.
"""

import numpy as np
import rasterio
from scipy import ndimage

from grid import SAMPLE_M, SAMPLES, Tile, neighbour
from sources import dem_path

RIM_SAMPLES = 200
CORNER_RIM = RIM_SAMPLES - 1
# The mirror's own sea surface sits about here where it does have a tile.
ABSENT_TILE_HEIGHT_M = 0.1
HEIGHT_STEP_SAMPLES = 2

SUN_AZIMUTH_DEG = 215  # Clockwise from grid north.
SUN_ELEVATION_DEG = 30
SUN_SHARE = 0.85
SKY_SHARE = 0.38
SHADOW_SOFTNESS_M = 1.5
SHADOW_REACH_SAMPLES = (*range(1, 16), *range(16, 40, 2), *range(40, 100, 5), *range(100, 200, 10))
SKY_DIRECTIONS = 8
SKY_REACH_SAMPLES = (1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 160)

# A lake or the sea is written as one exact level, which real ground never is.
WATER_FLATNESS_M = 0.002
WATER_MIN_SAMPLES = 2500  # One hectare.


def read_with_rim(tile: Tile) -> np.ndarray:
    """The tile's samples with RIM_SAMPLES of its neighbours round them, north-first."""
    size = SAMPLES + 2 * RIM_SAMPLES
    mosaic = np.full((size, size), ABSENT_TILE_HEIGHT_M, dtype=np.float32)
    for steps_north in (1, 0, -1):
        for steps_east in (-1, 0, 1):
            path = dem_path(neighbour(tile, steps_east, steps_north))
            if path is None:
                continue
            with rasterio.open(path) as dataset:
                if dataset.width != SAMPLES or dataset.height != SAMPLES or dataset.res != (SAMPLE_M, SAMPLE_M):
                    raise ValueError(f"{path.name}: not a 3000×3000 2 m grid")
                samples = dataset.read(1)
                if dataset.nodata is not None and (samples == dataset.nodata).any():
                    raise ValueError(f"{path.name}: has nodata samples, which no tile checked so far did")
            row = RIM_SAMPLES - steps_north * SAMPLES
            column = RIM_SAMPLES + steps_east * SAMPLES
            top, left = max(row, 0), max(column, 0)
            bottom, right = min(row + SAMPLES, size), min(column + SAMPLES, size)
            mosaic[top:bottom, left:right] = samples[top - row : bottom - row, left - column : right - column]
    return mosaic


def sample_corners(mosaic: np.ndarray) -> np.ndarray:
    """Heights on the corners of the samples, each the mean of the four round it."""
    return (mosaic[:-1, :-1] + mosaic[1:, :-1] + mosaic[:-1, 1:] + mosaic[1:, 1:]) / 4


def tile_corners(corners: np.ndarray) -> np.ndarray:
    return corners[CORNER_RIM:-CORNER_RIM, CORNER_RIM:-CORNER_RIM]


def height_nodes(tile: np.ndarray) -> np.ndarray:
    """A tile's corners thinned to the mesh's nodes, from the north-west corner."""
    return tile[:: HEIGHT_STEP_SAMPLES, :: HEIGHT_STEP_SAMPLES]


def with_ground_moved(mosaic: np.ndarray, was: np.ndarray, now: np.ndarray) -> np.ndarray:
    """The mosaic with a tile's corners moved from `was` to `now`, for shading what the game really draws."""
    moved = now - was
    shifted = mosaic.copy()
    shifted[RIM_SAMPLES:-RIM_SAMPLES, RIM_SAMPLES:-RIM_SAMPLES] += (moved[:-1, :-1] + moved[1:, :-1] + moved[:-1, 1:] + moved[1:, 1:]) / 4
    return shifted


def _shifted(heights: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """What each cell sees (rows, columns) away, the mosaic's edge repeated beyond itself."""
    tall, wide = heights.shape
    row_index = np.clip(np.arange(tall) + rows, 0, tall - 1)
    column_index = np.clip(np.arange(wide) + columns, 0, wide - 1)
    return heights[row_index[:, None], column_index]


def _steps_towards(azimuth_deg: float) -> tuple[float, float]:
    """One sample's worth of (rows, columns) along a compass bearing: rows run south, columns east."""
    azimuth = np.radians(azimuth_deg)
    return -np.cos(azimuth), np.sin(azimuth)


def bake_shade(mosaic: np.ndarray) -> np.ndarray:
    """Light reaching the ground, 0–1, for the tile's samples: sun, soft cast shadow and open sky."""
    heights = mosaic.astype(np.float32)
    along_rows, along_columns = np.gradient(heights, SAMPLE_M)
    slope_east, slope_north = along_columns, -along_rows
    normal_length = np.sqrt(slope_east**2 + slope_north**2 + 1)
    elevation = np.radians(SUN_ELEVATION_DEG)
    sun_row, sun_column = _steps_towards(SUN_AZIMUTH_DEG)
    sun_east, sun_north = sun_column * np.cos(elevation), -sun_row * np.cos(elevation)
    lambert = np.clip((-slope_east * sun_east - slope_north * sun_north + np.sin(elevation)) / normal_length, 0, 1)

    sun_clearance = np.full(heights.shape, np.inf, dtype=np.float32)
    rise_per_sample = float(np.tan(elevation)) * SAMPLE_M
    for reach in SHADOW_REACH_SAMPLES:
        blocker = _shifted(heights, round(sun_row * reach), round(sun_column * reach))
        sun_clearance = np.minimum(sun_clearance, heights + reach * rise_per_sample - blocker)
    sunlit = np.clip(sun_clearance / SHADOW_SOFTNESS_M, 0, 1)

    sky = np.zeros(heights.shape, dtype=np.float32)
    for direction in range(SKY_DIRECTIONS):
        step_row, step_column = _steps_towards(direction * 360 / SKY_DIRECTIONS)
        horizon = np.zeros(heights.shape, dtype=np.float32)
        for reach in SKY_REACH_SAMPLES:
            blocker = _shifted(heights, round(step_row * reach), round(step_column * reach))
            horizon = np.maximum(horizon, (blocker - heights) / (reach * SAMPLE_M))
        sky += 1 / (1 + horizon**2)  # cos² of the horizon angle: the sky left open that way.
    sky /= SKY_DIRECTIONS

    light = SUN_SHARE * lambert * sunlit + SKY_SHARE * sky
    return light[RIM_SAMPLES:-RIM_SAMPLES, RIM_SAMPLES:-RIM_SAMPLES]


def water_mask(mosaic: np.ndarray) -> np.ndarray:
    """True on the tile's samples that are lake or sea: large areas of one exact level."""
    spread = ndimage.maximum_filter(mosaic, 3) - ndimage.minimum_filter(mosaic, 3)
    labels, _ = ndimage.label(spread <= WATER_FLATNESS_M)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    water = sizes[labels] >= WATER_MIN_SAMPLES
    # The flatness test loses the cell next to every shore, and the line where two tiles'
    # water levels meet, a few centimetres apart: give both back.
    water = ndimage.binary_closing(ndimage.binary_dilation(water))
    return water[RIM_SAMPLES:-RIM_SAMPLES, RIM_SAMPLES:-RIM_SAMPLES]

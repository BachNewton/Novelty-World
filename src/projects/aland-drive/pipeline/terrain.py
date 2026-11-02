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
# The drawn surface sits this far under the model's flat water, so the lowest shore stands
# clear of it and the two never flicker through each other.
WATERLINE_BELOW_FLAT_M = 0.15
# The ground under water falls this much a metre out from the shore, to at most this.
SEABED_SLOPE = 0.22
DEEPEST_M = 3.5
# The model's flat water stops a sample or two short of the shore, at ground within a few
# centimetres of it that is shallow water in the photo: up to this far out and this high,
# the seabed takes it too.
SHALLOWS_GROW_SAMPLES = 3
SHALLOWS_ABOVE_M = 0.06
# Shore lines follow the samples in steps; this much blur turns the steps into a curve.
SHORE_BLUR_SAMPLES = 1.5
# Past this, how far from the shore no longer matters: wider than a triangle of the farthest ring that draws water.
FARTHEST_SHORE_M = 64.0
# How far beyond water a corner still carries its level: past a triangle of the coarsest ring that draws it.
LEVEL_REACH_M = 40.0
LEVEL_BLUR_SAMPLES = 4
DRY_LEVEL_M = -300.0


def read_with_rim(tile: Tile, nodata_is_sea: bool = False) -> np.ndarray:
    """The tile's samples with RIM_SAMPLES of its neighbours round them, north-first. Far out, a sheet's survey can stop in open sea."""
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
                    if not nodata_is_sea:
                        raise ValueError(f"{path.name}: has nodata samples, which no tile checked so far did")
                    samples[samples == dataset.nodata] = ABSENT_TILE_HEIGHT_M
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


def flat_water(mosaic: np.ndarray) -> np.ndarray:
    """True on samples that are surely lake or sea: inside a large area of one exact level."""
    spread = ndimage.maximum_filter(mosaic, 3) - ndimage.minimum_filter(mosaic, 3)
    labels, _ = ndimage.label(spread <= WATER_FLATNESS_M)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return sizes[labels] >= WATER_MIN_SAMPLES


def water_mask(mosaic: np.ndarray) -> np.ndarray:
    """True on the mosaic's samples, rim included, that are lake or sea."""
    return water_around(flat_water(mosaic))


def water_around(flat: np.ndarray) -> np.ndarray:
    """The flat water, with what the flatness test loses round it."""
    # The flatness test loses the cell next to every shore, and the line where two tiles'
    # water levels meet, a few centimetres apart: give both back.
    return ndimage.binary_closing(ndimage.binary_dilation(flat))


def _on_corners(samples: np.ndarray) -> np.ndarray:
    """A field on the samples, read at the tile's corners as the mean of the four samples round each."""
    return tile_corners(sample_corners(samples))


def flat_levels(mosaic: np.ndarray, flat: np.ndarray) -> np.ndarray:
    """The level of the flat water nearest each sample of the mosaic. There must be some."""
    # An average over the flat water nearby rather than the nearest sample, which ties where two levels meet and
    # would break the tie one way from each side of a seam.
    weight = ndimage.gaussian_filter(flat.astype(np.float64), LEVEL_BLUR_SAMPLES)
    known = weight > 1e-3
    blurred = ndimage.gaussian_filter(np.where(flat, mosaic, 0).astype(np.float64), LEVEL_BLUR_SAMPLES) / np.where(known, weight, 1)
    _, (rows, columns) = ndimage.distance_transform_edt(~known, return_indices=True)
    return blurred[rows, columns]


def water_levels(mosaic: np.ndarray, flat: np.ndarray) -> np.ndarray:
    """The drawn water surface at each of the tile's corners, or DRY_LEVEL_M beyond LEVEL_REACH_M of water.

    A corner takes the level of the nearest water, so the surface runs on flat under the
    shore's first metres and the land, not the surface, decides where the waterline falls.
    """
    if not flat.any():
        return np.full(tile_corners(sample_corners(mosaic)).shape, DRY_LEVEL_M, dtype=np.float32)
    to_water = ndimage.distance_transform_edt(~flat)
    levels = np.where(to_water * SAMPLE_M <= LEVEL_REACH_M, flat_levels(mosaic, flat) - WATERLINE_BELOW_FLAT_M, np.nan)
    # Every corner reads its four samples, and one of them in reach is enough: the surface must reach the land.
    corners = np.fmax(np.fmax(levels[:-1, :-1], levels[1:, :-1]), np.fmax(levels[:-1, 1:], levels[1:, 1:]))
    return np.nan_to_num(tile_corners(corners), nan=DRY_LEVEL_M)


def shallows(mosaic: np.ndarray, flat: np.ndarray, water: np.ndarray) -> np.ndarray:
    """The water with the ground just beyond it that is no higher than the water: the photo's shallows."""
    low = mosaic <= flat_levels(mosaic, flat) + SHALLOWS_ABOVE_M
    return ndimage.binary_dilation(water, iterations=SHALLOWS_GROW_SAMPLES, mask=low | water)


def shore_distance(mosaic: np.ndarray, flat: np.ndarray, water: np.ndarray) -> np.ndarray:
    """Metres from the shore at each of the tile's corners, out into the water and below zero on land, to FARTHEST_SHORE_M.

    The shore is a smooth line round the water, shallows and all, so the waterline drawn
    from it is a curve rather than the samples' steps or the mesh's.
    """
    if not flat.any():
        return np.full(tile_corners(sample_corners(mosaic)).shape, -FARTHEST_SHORE_M)
    wet = shallows(mosaic, flat, water)
    # A sample's distance to the shore is from its middle, half a sample short of what the transform counts.
    signed = (ndimage.distance_transform_edt(wet) - 0.5 * wet) - (ndimage.distance_transform_edt(~wet) - 0.5 * ~wet)
    return np.clip(_on_corners(ndimage.gaussian_filter(signed, SHORE_BLUR_SAMPLES) * SAMPLE_M), -FARTHEST_SHORE_M, FARTHEST_SHORE_M)


def seabed(corners: np.ndarray, untouched: np.ndarray, shore: np.ndarray, levels: np.ndarray) -> np.ndarray:
    """The tile's corners with the ground under water falling away from the shore, below the drawn surface.

    The model writes water as its flat surface, so without this the land meets the water
    on a slope of nothing and the shore has no line. The seabed starts at the drawn surface
    on the shore's line. Corners another rule shaped (`untouched` false: the ground under a
    road and just beside it) keep their height.
    """
    depth = np.minimum(SEABED_SLOPE * shore, DEEPEST_M)
    under = (shore > 0) & untouched & (levels > DRY_LEVEL_M)
    return np.where(under, np.minimum(corners, levels - depth), corners)

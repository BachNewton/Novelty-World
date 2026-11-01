"""The whole world small enough to have at the start, whatever its size: land past where far tiles reach.

Heights every 80 m with the forest standing on them, and one image of the land's
colour with its light already in it. Both are read back from the built tiles, so
they can't disagree with them. The render draws this past the far tiles, and the
maps draw it as their land. Past the tiles it takes the outer islands from
outlying.py, which have no tile of their own.
"""

import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from grid import tile_from_name, to_local
from outlying import OUTLYING_FILE, baked_path

STEP_M = 80
IMAGE_M = 40
HEIGHT_FILE = "overview-heights.bin.gz"
IMAGE_FILE = "overview.webp"
QUALITY = 60
LAND_ALPHA = 200
SHORE_PIXELS = 3
# Below the sea of any tile, for ground no tile covers (`SEA_HEIGHT_M` in sim/world.ts).
NO_TILE_HEIGHT_M = -1.0
# How the render lights the photo (`FLAT_LIGHT` and `SHADE_SHARE` in render/game.ts).
FLAT_LIGHT = 0.8
SHADE_SHARE = 0.65


def _far_heights(folder: Path, file: str, nodes: int) -> np.ndarray:
    deltas = np.frombuffer(gzip.decompress((folder / file).read_bytes()), dtype="<i2").reshape(nodes, nodes)
    return np.cumsum(deltas.astype(np.int32), axis=1).astype(np.float64)


def _lit_colour(ground: Image.Image, shade_image: Image.Image, shade_gamma: float, pixels: int) -> np.ndarray:
    """A far photo as the render draws it, RGBA, `pixels` wide."""
    shade = np.asarray(shade_image.convert("L").resize((pixels, pixels), Image.Resampling.BOX), dtype=np.float32) / 255
    rgba = np.asarray(ground.convert("RGBA").resize((pixels, pixels), Image.Resampling.BOX), dtype=np.float32).copy()
    light = 1 + SHADE_SHARE * (shade**shade_gamma / FLAT_LIGHT - 1)
    rgba[..., :3] = 255 * np.clip((rgba[..., :3] / 255) ** 2.2 * light[..., None], 0, 1) ** (1 / 2.2)
    return rgba


def _matched_to_tiles(image: np.ndarray, outlying: np.ndarray) -> None:
    """The outer islands were flown in another season, and have no forest shade: one gain for all of them, or they'd look like another country."""
    land = image[..., 3] > LAND_ALPHA
    tiled = (image[..., 3] > 0) & ~outlying
    gain = image[land & tiled][:, :3].mean(axis=0) / image[land & outlying][:, :3].mean(axis=0)
    image[outlying, :3] *= gain


def _without_cut_islands(image: np.ndarray, heights: np.ndarray, pixels_per_node: int) -> None:
    """Any island the overview's edge cuts goes whole, so land only ever ends at a shore."""
    islands, _ = ndimage.label(image[..., 3] > LAND_ALPHA)
    cut = np.unique(np.concatenate((islands[0], islands[-1], islands[:, 0], islands[:, -1])))
    gone = ndimage.binary_dilation(np.isin(islands, cut[cut > 0]), iterations=SHORE_PIXELS)
    image[gone, 3] = 0
    heights[:-1, :-1][gone[::pixels_per_node, ::pixels_per_node]] = NO_TILE_HEIGHT_M


def build(output: Path, manifests: list[dict], tile_m: int, unit_m: float) -> dict:
    """Writes the overview's two files beside the tiles and returns what `world.json` says of them."""
    far = manifests[0]["far"]
    outlying = [tile_from_name(name) for name in json.loads(OUTLYING_FILE.read_text(encoding="utf-8"))]
    places = [(manifest["bounds"]["west"], manifest["bounds"]["north"]) for manifest in manifests] + [to_local(tile.west, tile.north) for tile in outlying]
    west = min(place[0] for place in places)
    north = max(place[1] for place in places)
    columns = (max(place[0] for place in places) + tile_m - west) // tile_m
    rows = (north + tile_m - min(place[1] for place in places)) // tile_m

    per_tile = tile_m // STEP_M
    heights = np.full((rows * per_tile + 1, columns * per_tile + 1), NO_TILE_HEIGHT_M, dtype=np.float64)
    pixels = tile_m // IMAGE_M
    image = np.zeros((rows * pixels, columns * pixels, 4), dtype=np.float32)
    stride = STEP_M // int(far["stepM"])
    for manifest in manifests:
        folder = output / manifest["tile"]
        column = (manifest["bounds"]["west"] - west) // tile_m
        row = (north - manifest["bounds"]["north"]) // tile_m
        ground = _far_heights(folder, far["heightsFile"], far["nodes"])[::stride, ::stride] * unit_m
        canopy = np.asarray(Image.open(folder / "canopy.webp").convert("L"), dtype=np.float32) * manifest["canopy"]["unitM"]
        block = manifest["canopy"]["pixels"] // per_tile
        forest = canopy.reshape(per_tile, block, per_tile, block).mean(axis=(1, 3))
        top, left = row * per_tile, column * per_tile
        heights[top : top + per_tile + 1, left : left + per_tile + 1] = ground
        heights[top : top + per_tile, left : left + per_tile] += forest
        image[row * pixels : (row + 1) * pixels, column * pixels : (column + 1) * pixels] = _lit_colour(Image.open(folder / "ground-far.webp"), Image.open(folder / "shade-far.webp"), manifest["shade"]["gamma"], pixels)

    shade_gamma = manifests[0]["shade"]["gamma"]
    outer = np.zeros(image.shape[:2], dtype=bool)
    for tile in outlying:
        baked = np.load(baked_path(tile.name))
        local_west, local_north = to_local(tile.west, tile.north)
        column = (local_west - west) // tile_m
        row = (north - local_north) // tile_m
        top, left = row * per_tile, column * per_tile
        heights[top : top + per_tile + 1, left : left + per_tile + 1] = baked["heights"]
        image[row * pixels : (row + 1) * pixels, column * pixels : (column + 1) * pixels] = _lit_colour(Image.fromarray(baked["colour"], "RGBA"), Image.fromarray(baked["shade"]), shade_gamma, pixels)
        outer[row * pixels : (row + 1) * pixels, column * pixels : (column + 1) * pixels] = True
    _matched_to_tiles(image, outer)
    _without_cut_islands(image, heights, pixels // per_tile)

    units = np.round(heights / unit_m).astype(np.int32)
    (output / HEIGHT_FILE).write_bytes(gzip.compress(np.diff(units, axis=1, prepend=0).astype("<i2").tobytes(), 9, mtime=0))
    Image.fromarray(np.round(image).astype(np.uint8), "RGBA").save(output / IMAGE_FILE, quality=QUALITY, alpha_quality=60, method=5)
    return {
        "west": west,
        "north": north,
        "columns": heights.shape[1],
        "rows": heights.shape[0],
        "stepM": STEP_M,
        "unitM": unit_m,
        "heightsFile": HEIGHT_FILE,
        "imageFile": IMAGE_FILE,
        "imageWidth": image.shape[1],
        "imageHeight": image.shape[0],
    }

"""The whole world small enough to have at the start, whatever its size: land past where far tiles reach.

Heights every 80 m with the forest standing on them, and one image of the land's
colour with its light already in it. Both are read back from the built tiles, so
they can't disagree with them. The render draws this past the far tiles, and the
maps draw it as their land.
"""

import gzip
from pathlib import Path

import numpy as np
from PIL import Image

STEP_M = 80
IMAGE_M = 40
HEIGHT_FILE = "overview-heights.bin.gz"
IMAGE_FILE = "overview.webp"
QUALITY = 60
# Below the sea of any tile, for ground no tile covers (`SEA_HEIGHT_M` in sim/world.ts).
NO_TILE_HEIGHT_M = -1.0
# How the render lights the photo (`FLAT_LIGHT` and `SHADE_SHARE` in render/game.ts).
FLAT_LIGHT = 0.8
SHADE_SHARE = 0.65


def _far_heights(folder: Path, file: str, nodes: int) -> np.ndarray:
    deltas = np.frombuffer(gzip.decompress((folder / file).read_bytes()), dtype="<i2").reshape(nodes, nodes)
    return np.cumsum(deltas.astype(np.int32), axis=1).astype(np.float64)


def _lit_colour(folder: Path, shade_gamma: float, pixels: int) -> np.ndarray:
    """The far photo as the render draws it, RGBA, `pixels` wide."""
    ground = Image.open(folder / "ground-far.webp").convert("RGBA").resize((pixels, pixels), Image.Resampling.BOX)
    shade = np.asarray(Image.open(folder / "shade-far.webp").convert("L").resize((pixels, pixels), Image.Resampling.BOX), dtype=np.float32) / 255
    rgba = np.asarray(ground, dtype=np.float32).copy()
    light = 1 + SHADE_SHARE * (shade**shade_gamma / FLAT_LIGHT - 1)
    rgba[..., :3] = 255 * np.clip((rgba[..., :3] / 255) ** 2.2 * light[..., None], 0, 1) ** (1 / 2.2)
    return rgba


def build(output: Path, manifests: list[dict], tile_m: int, unit_m: float) -> dict:
    """Writes the overview's two files beside the tiles and returns what `world.json` says of them."""
    far = manifests[0]["far"]
    west = min(manifest["bounds"]["west"] for manifest in manifests)
    north = max(manifest["bounds"]["north"] for manifest in manifests)
    columns = (max(manifest["bounds"]["east"] for manifest in manifests) - west) // tile_m
    rows = (north - min(manifest["bounds"]["south"] for manifest in manifests)) // tile_m

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
        image[row * pixels : (row + 1) * pixels, column * pixels : (column + 1) * pixels] = _lit_colour(folder, manifest["shade"]["gamma"], pixels)

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

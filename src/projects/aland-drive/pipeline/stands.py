"""What kind of forest stands where: Luke's MS-NFI 2023, as a small image per tile.

`canopy.py` says where trees stand and how tall. This says what they are and how
thickly they stand, because the laser can't tell a pine from a birch. A pixel of
MS-NFI is a satellite's guess from nearby field plots, wrong by a lot alone and
right over a few hectares, so it's only read through a kernel the size of a stand.

Density is the look of the forest, not a count of stems: the share of the lattice's
places that should hold a tree for our crowns to cover the ground as much as the
real canopy does. Stems per hectare would say more trees than the lattice has.

Also a command, to add the image to tiles already built, with nothing else rebuilt:

    python stands.py [--folder FOLDER] L2343C [more tiles]
"""

import argparse
import gzip
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from canopy import PIXELS as CANOPY_PIXELS, UNIT_M as CANOPY_UNIT_M
from grid import Tile, tile_from_name
from sources import MSNFI_NODATA_FROM, MSNFI_PIXEL_M, MSNFI_RIM_PIXELS, msnfi_path

PIXEL_M = 48
PIXELS = 125
BLOCK = PIXEL_M // MSNFI_PIXEL_M
MSNFI_PIXELS = PIXELS * BLOCK
FILE = "stands.bin.gz"
MANIFEST = {
    "file": FILE,
    "pixels": PIXELS,
    "encoding": "gzip of bytes, 4 a pixel, rows north to south, west to east: the shares of pine, spruce and birch, 0 to 255, what's left being other broadleaf, then the share of lattice places holding a tree",
}

# About three hectares under the kernel, the size of a real stand: past that the map's error has mostly averaged out.
STAND_SIGMA_M = 48
# Where nothing near has a value (a garden, a field's edge, a shore), the neighbourhood answers.
WIDE_SIGMA_M = 240
WIDE_WEIGHT = 0.02
SPECIES = ("pine", "spruce", "birch", "other")
# Only for land with no value within reach, weighted so little it can't touch land with one. By volume, across the island.
ISLAND_MIX = np.array([0.60, 0.15, 0.13, 0.12])
ISLAND_COVER = 0.41
EMPTY_WEIGHT = 1e-6

# These restate render/tree-place.ts and forest.ts, which draw what this plans for: a lattice of 6 m, each place
# jittered by a share of a cell, a tree the canopy times a roll, and each species' widest ring when grown, as a share
# of height (render/tree-shapes.ts). Other broadleaf is two shapes, so it takes the mean of their areas.
LATTICE_M = 6
JITTER = 0.8
HEIGHT_RANGE = (1.05, 1.35)
CROWN_SHARE = np.array([0.17, 0.21, 0.16, 0.2])
MEAN_HEIGHT_SHARE = sum(HEIGHT_RANGE) / 2

# A place in a stand can't be all crown once they're jittered, and a share near 1 would ask for infinitely many.
MOST_COVER = 0.97
_RADII = np.arange(0.5, 10.01, 0.25)
_OCCUPANCIES = np.linspace(0, 1, 41)
_COVERS = np.linspace(0, 1, 101)


@dataclass
class Stands:
    """Each theme read through the kernel, at MS-NFI's 16 m, rim cut off."""

    shares: np.ndarray  # species first, summing to 1
    cover: np.ndarray  # 0 to 1
    stems_ha: np.ndarray
    mean_height_m: np.ndarray
    known: np.ndarray  # True on pixels MS-NFI itself holds, rim cut off


def _kernel(weights: np.ndarray) -> np.ndarray:
    """What a place hears: its stand, and very faintly the neighbourhood, which only matters where the stand is silent."""
    near = ndimage.gaussian_filter(weights, STAND_SIGMA_M / MSNFI_PIXEL_M, mode="nearest")
    wide = ndimage.gaussian_filter(weights, WIDE_SIGMA_M / MSNFI_PIXEL_M, mode="nearest")
    return near + WIDE_WEIGHT * wide


def read_stands(cut: dict[str, np.ndarray]) -> Stands:
    """A tile's themes with a rim of MSNFI_RIM_PIXELS, as uint16 in the source's units, into what's known at each pixel."""
    known = np.all([values < MSNFI_NODATA_FROM for values in cut.values()], axis=0)
    of = lambda theme: np.where(known, cut[theme].astype(np.float64), 0)
    volumes = np.stack([_kernel(of(name)) for name in SPECIES])
    volumes += EMPTY_WEIGHT * ISLAND_MIX[:, None, None]
    shares = volumes / volumes.sum(axis=0)
    weight = _kernel(known.astype(np.float64)) + EMPTY_WEIGHT
    cover = (_kernel(of("cover") / 100) + EMPTY_WEIGHT * ISLAND_COVER) / weight
    # Basal area's mean over a place; diameter and height are basal-weighted means, as MS-NFI defines them.
    basal_weight = _kernel(of("basal")) + EMPTY_WEIGHT
    basal = basal_weight / weight
    diameter_m = _kernel(of("basal") * of("diameter") / 100) / basal_weight
    height_m = _kernel(of("basal") * of("height") / 10) / basal_weight
    stems = basal / (np.pi / 4 * np.maximum(diameter_m, 0.01) ** 2)
    rim = (slice(MSNFI_RIM_PIXELS, -MSNFI_RIM_PIXELS),) * 2
    return Stands(shares[(slice(None), *rim)], cover[rim], stems[rim], height_m[rim], known[rim])


@lru_cache(maxsize=1)
def _occupancy_table() -> np.ndarray:
    """For each crown radius and cover, the share of places needed, found by throwing points at the real lattice.

    Crowns on a jittered lattice overlap less than crowns thrown anywhere, so the usual
    1 - exp(-density × crown) reads a full lattice of 3.3 m crowns as 61% when it's about 80%.
    """
    rng = np.random.default_rng(1)
    points = rng.uniform(0, LATTICE_M, (30_000, 2))
    reach = 5
    cells = np.mgrid[-reach : reach + 1, -reach : reach + 1].reshape(2, -1).T * LATTICE_M
    jitter = (rng.uniform(size=(len(points), len(cells), 2)) - 0.5) * JITTER * LATTICE_M
    away = np.linalg.norm(cells + jitter - points[:, None, :], axis=2)
    # A radius is a stand's mean: each tree's own is scaled by its height's roll.
    away /= rng.uniform(*HEIGHT_RANGE, away.shape) / MEAN_HEIGHT_SHARE
    rolls = rng.uniform(size=away.shape)
    nearest = np.stack([np.where(rolls < share, away, np.inf).min(axis=1) for share in _OCCUPANCIES])
    covers = (nearest[:, None, :] <= _RADII[None, :, None]).mean(axis=2)
    return np.stack([np.interp(_COVERS, np.maximum.accumulate(covers[:, column]) + np.arange(len(_OCCUPANCIES)) * 1e-9, _OCCUPANCIES) for column in range(len(_RADII))])


def occupancy_for(cover: np.ndarray, radius_m: np.ndarray) -> np.ndarray:
    """The share of lattice places that should hold a tree for crowns of this radius to cover this share of the ground. 1 where even a full lattice falls short."""
    columns = (np.clip(radius_m, _RADII[0], _RADII[-1]) - _RADII[0]) / (_RADII[1] - _RADII[0])
    rows = np.clip(cover, 0, 1) * (len(_COVERS) - 1)
    return ndimage.map_coordinates(_occupancy_table(), [columns, rows], order=1, mode="nearest")


def read_canopy(folder: Path) -> np.ndarray:
    """The tile's canopy image in metres."""
    return np.asarray(Image.open(folder / "canopy.webp").convert("L"), dtype=np.float64) * CANOPY_UNIT_M


def laser_stands(canopy_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Through the same kernel at 16 m: the share of ground the canopy image has trees on, and how tall they are there."""
    per_pixel = CANOPY_PIXELS // MSNFI_PIXELS
    block = canopy_m.reshape(MSNFI_PIXELS, per_pixel, MSNFI_PIXELS, per_pixel)
    trees = (block > 0).mean(axis=(1, 3))
    tall = block.mean(axis=(1, 3))
    sigma = STAND_SIGMA_M / MSNFI_PIXEL_M
    near_trees = ndimage.gaussian_filter(trees, sigma, mode="nearest")
    near_tall = ndimage.gaussian_filter(tall, sigma, mode="nearest")
    return near_trees, near_tall / np.maximum(near_trees, EMPTY_WEIGHT)


def density(stands: Stands, tree_share: np.ndarray, canopy_height_m: np.ndarray) -> np.ndarray:
    """The share of the places under trees that should hold one. The canopy image has already said where the gaps are, so only what's left is thinned."""
    crown = np.sqrt((stands.shares * CROWN_SHARE[:, None, None] ** 2).sum(axis=0)) * canopy_height_m * MEAN_HEIGHT_SHARE
    wanted = np.divide(stands.cover, tree_share, out=np.zeros_like(tree_share), where=tree_share > EMPTY_WEIGHT)
    return occupancy_for(np.minimum(wanted, MOST_COVER), crown)


def _reduced(pixels: np.ndarray) -> np.ndarray:
    return pixels.reshape(PIXELS, BLOCK, PIXELS, BLOCK).mean(axis=(1, 3))


def encode(shares: np.ndarray, occupancy: np.ndarray) -> bytes:
    """Rounded so the three shares kept never add past 255, which would make the fourth negative."""
    kept = np.round(np.stack([_reduced(share) for share in shares[:3]]) * 255)
    over = np.maximum(kept.sum(axis=0) - 255, 0)
    largest = np.argmax(kept, axis=0)
    kept -= np.stack([(largest == index) * over for index in range(3)])
    layers = np.concatenate([kept, np.round(_reduced(occupancy) * 255)[None]])
    return gzip.compress(np.moveaxis(layers, 0, -1).astype(np.uint8).tobytes(), 9, mtime=0)


def decode(data: bytes) -> tuple[np.ndarray, np.ndarray]:
    """The file back: all four shares, then the occupancy, each 0 to 1 at PIXEL_M."""
    pixels = np.frombuffer(gzip.decompress(data), dtype=np.uint8).reshape(PIXELS, PIXELS, 4) / 255
    return np.stack([pixels[..., 0], pixels[..., 1], pixels[..., 2], 1 - pixels[..., :3].sum(axis=2)]), pixels[..., 3]


def bake(tile: Tile, folder: Path) -> Stands:
    """Writes `stands.bin.gz` beside the tile's canopy image."""
    with np.load(msnfi_path(tile)) as kept:
        stands = read_stands({theme: kept[theme] for theme in kept.files})
    tree_share, canopy_height = laser_stands(read_canopy(folder))
    (folder / FILE).write_bytes(encode(stands.shares, density(stands, tree_share, canopy_height)))
    return stands


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        folder = arguments.folder / name
        bake(tile_from_name(name), folder)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        (folder / "tile.json").write_text(json.dumps({**manifest, "stands": MANIFEST}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(name, f"{(folder / FILE).stat().st_size / 1000:.1f} kB")


if __name__ == "__main__":
    main()

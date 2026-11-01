"""The land past the tiles, for the overview only: Åland's outer islands, which no road reaches.

    pipeline/.venv/Scripts/python pipeline/outlying.py [--jobs N]

Finds which sheets in Åland's box have land, writes outlying.json, and bakes each
one's overview heights and colour the way a built tile's come out, without the
forest, under .data/derived/outlying. `build.py` draws them into the overview
whenever it writes the world, so they need no tile and nothing streams.
"""

import argparse
import json
import os
from multiprocessing import get_context
from pathlib import Path

for setting in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "GDAL_NUM_THREADS"):
    os.environ[setting] = "1"

import numpy as np
import rasterio
from PIL import Image

import ground
import terrain
from grid import SAMPLES, TILE_SIZE_M, WORLD_ORIGIN, Tile, tile_at, tile_from_name
from sources import RAW, dem_path

OUTLYING_FILE = Path(__file__).resolve().parent / "outlying.json"
BAKED = RAW.parent / "derived" / "outlying"
# Åland's box, in tiles from the world's origin: Finland's own islands begin just past its east side.
WEST_COLUMN, EAST_COLUMN = -8, 11
SOUTH_ROW, NORTH_ROW = -9, 11
# A sheet with less than this is a rock or two, or a level the sea drifted over.
LEAST_LAND_KM2 = 0.05
LAND_ABOVE_M = 0.5
SAMPLE_KM2 = 4e-6
HEIGHT_NODES_STEP = 40


def land_km2(tile: Tile) -> float:
    path = dem_path(tile)
    if path is None:
        return 0.0
    with rasterio.open(path) as dataset:
        return float((dataset.read(1) > LAND_ABOVE_M).sum()) * SAMPLE_KM2


def baked_path(name: str) -> Path:
    return BAKED / f"{name}.npz"


def bake(tile: Tile) -> None:
    mosaic = terrain.read_with_rim(tile, nodata_is_sea=True)
    water = terrain.water_mask(mosaic)
    heights = terrain.tile_corners(terrain.sample_corners(mosaic))[::HEIGHT_NODES_STEP, ::HEIGHT_NODES_STEP]
    colour = np.dstack((ground.graded(ground.read_photo(tile)), np.round(ground.land_alpha(water) * 255).astype(np.uint8)))
    shade = np.round(255 * np.clip(terrain.bake_shade(mosaic), 0, 1) ** (1 / 2.2)).astype(np.uint8)
    far = SAMPLES // ground.FAR_PIXELS
    BAKED.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(baked_path(tile.name), heights=heights.astype(np.float32), colour=np.asarray(Image.fromarray(colour, "RGBA").reduce(far)), shade=np.asarray(Image.fromarray(shade).reduce(far)))
    print(tile.name, flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jobs", type=int, default=1, help="sheets baked side by side, on a core each")
    parser.add_argument("--list-only", action="store_true", help="find the sheets, and bake nothing")
    arguments = parser.parse_args()

    island = json.loads((Path(__file__).resolve().parent / "island.json").read_text(encoding="utf-8"))
    built = set(island["roadTiles"]) | set(island["around"])
    found = {}
    for column in range(WEST_COLUMN, EAST_COLUMN):
        for row in range(SOUTH_ROW, NORTH_ROW):
            tile = tile_at(WORLD_ORIGIN[0] + column * TILE_SIZE_M, WORLD_ORIGIN[1] + row * TILE_SIZE_M)
            if tile.name in built:
                continue
            land = land_km2(tile)
            if land >= LEAST_LAND_KM2:
                found[tile.name] = land
    print(f"{len(found)} sheets, {sum(found.values()):.0f} km² of land", flush=True)
    OUTLYING_FILE.write_text(json.dumps(sorted(found), indent=1) + "\n", encoding="utf-8")
    if arguments.list_only:
        return
    waiting = [tile_from_name(name) for name in sorted(found) if not baked_path(name).exists()]
    with get_context("spawn").Pool(arguments.jobs) as pool:
        pool.map(bake, waiting, chunksize=1)


if __name__ == "__main__":
    main()

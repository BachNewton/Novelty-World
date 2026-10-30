"""Builds game-ready tiles. Run through run.py, which sets up the environment.

Each tile is a folder of plain files described by its tile.json, under
public/aland-drive/tiles/. Nothing here knows about the game's code.
"""

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image

import terrain
import vectors
from grid import SAMPLE_M, SAMPLES, TILE_SIZE_M, WORLD_ORIGIN, Tile, tile_from_name, to_local
from sources import dem_path, osm_path

REPO = Path(__file__).resolve().parents[4]
OUTPUT = REPO / "public" / "aland-drive" / "tiles"
HEIGHT_UNIT_M = 0.01
SHADE_QUALITY = 90
SHADE_GAMMA = 2.2
FORMAT = 1
ATTRIBUTION = [
    "Elevation: National Land Survey of Finland, 2 m elevation model, CC BY 4.0",
    "Roads and buildings: © OpenStreetMap contributors, ODbL 1.0",
]


def encode_heights(nodes: np.ndarray) -> bytes:
    """Whole units as int16, each row as differences along itself, gzipped."""
    units = np.round(nodes / HEIGHT_UNIT_M).astype(np.int32)
    if units.min() < -32768 or units.max() > 32767:
        raise ValueError("heights outside int16 at this unit")
    return gzip.compress(np.diff(units, axis=1, prepend=0).astype("<i2").tobytes(), 9, mtime=0)


def build_tile(tile: Tile, refresh_osm: bool, with_vectors: bool = True) -> None:
    if dem_path(tile) is None:
        raise SystemExit(f"{tile.name}: the mirror has no such tile")
    folder = OUTPUT / tile.name
    folder.mkdir(parents=True, exist_ok=True)

    mosaic = terrain.read_with_rim(tile)
    nodes = terrain.height_nodes(mosaic)
    (folder / "heights.bin.gz").write_bytes(encode_heights(nodes))

    shade = terrain.bake_shade(mosaic)
    encoded = np.round(255 * np.clip(shade, 0, 1) ** (1 / SHADE_GAMMA)).astype(np.uint8)
    Image.fromarray(encoded).save(folder / "shade.webp", quality=SHADE_QUALITY, method=6)

    water = terrain.water_mask(mosaic)
    Image.fromarray(water).save(folder / "water.png", optimize=True)

    roads: list[dict] = []
    buildings: list[dict] = []
    if with_vectors:
        roads, buildings, osm_timestamp = vectors.build(osm_path(tile, refresh_osm), tile)
        osm_licence = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors", "asOf": osm_timestamp}
        compact = {"ensure_ascii": False, "separators": (",", ":")}
        (folder / "roads.json").write_text(json.dumps({**osm_licence, "roads": roads}, **compact), encoding="utf-8")
        (folder / "buildings.json").write_text(json.dumps({**osm_licence, "buildings": buildings}, **compact), encoding="utf-8")

    west, south = to_local(tile.west, tile.south)
    east, north = to_local(tile.east, tile.north)
    manifest = {
        "format": FORMAT,
        "tile": tile.name,
        "crs": "EPSG:3067",
        "worldOrigin": {"east": WORLD_ORIGIN[0], "north": WORLD_ORIGIN[1]},
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "heights": {
            "file": "heights.bin.gz",
            "nodes": nodes.shape[0],
            "stepM": TILE_SIZE_M / (nodes.shape[0] - 1),
            "unitM": HEIGHT_UNIT_M,
            "encoding": "gzip of int16le; rows north to south, west to east; each value the difference from the one to its west",
            "min": round(float(nodes.min()), 2),
            "max": round(float(nodes.max()), 2),
        },
        "shade": {"file": "shade.webp", "pixels": SAMPLES, "pixelM": SAMPLE_M, "gamma": SHADE_GAMMA},
        "sun": {"azimuthDeg": terrain.SUN_AZIMUTH_DEG, "elevationDeg": terrain.SUN_ELEVATION_DEG},
        "water": {"file": "water.png", "pixels": SAMPLES, "pixelM": SAMPLE_M},
        "roads": {"file": "roads.json", "count": len(roads)},
        "buildings": {"file": "buildings.json", "count": len(buildings)},
        "attribution": ATTRIBUTION,
    }
    (folder / "tile.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    sizes = {path.name: path.stat().st_size for path in sorted(folder.iterdir())}
    print(tile.name, f"{sum(sizes.values()) / 1e6:.2f} MB", {name: f"{size / 1e6:.2f}" for name, size in sizes.items()})
    print(f"  {len(roads)} road parts, {len(buildings)} buildings, heights {nodes.min():.2f} to {nodes.max():.2f} m, water {water.mean():.1%}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--refresh-osm", action="store_true", help="ask Overpass again instead of reusing the kept copy")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        build_tile(tile_from_name(name), arguments.refresh_osm)


if __name__ == "__main__":
    main()

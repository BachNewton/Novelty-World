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

import roads as road_surface
import terrain
import vectors
from grid import SAMPLE_M, SAMPLES, TILE_SIZE_M, WORLD_ORIGIN, Tile, tile_from_name, to_local
from sources import dem_path, osm_path

REPO = Path(__file__).resolve().parents[4]
OUTPUT = REPO / "public" / "aland-drive" / "tiles"
HEIGHT_UNIT_M = 0.01
SHADE_QUALITY = 90
SHADE_GAMMA = 2.2
FORMAT = 2
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


def water_nodes(water: np.ndarray) -> np.ndarray:
    """A byte for each height node: 1 where the 2 m mask holds water at the node's corner."""
    padded = np.pad(water, ((0, 1), (0, 1)), mode="edge")
    return padded[:: terrain.HEIGHT_STEP_SAMPLES, :: terrain.HEIGHT_STEP_SAMPLES].astype(np.uint8)


def encode_road_surface(ribbons: list[tuple[np.ndarray, np.ndarray]]) -> bytes:
    """Every ribbon's rings of (east, north, height) as float32, then every section's tier as a byte."""
    rings = b"".join(ring.astype("<f4").tobytes() for ring, _ in ribbons)
    tiers = b"".join(tier.astype("u1").tobytes() for _, tier in ribbons)
    return gzip.compress(rings + tiers, 9, mtime=0)


def build_tile(tile: Tile, refresh_osm: bool, with_vectors: bool = True) -> None:
    if dem_path(tile) is None:
        raise SystemExit(f"{tile.name}: the mirror has no such tile")
    folder = OUTPUT / tile.name
    folder.mkdir(parents=True, exist_ok=True)

    mosaic = terrain.read_with_rim(tile)
    water = terrain.water_mask(mosaic)
    Image.fromarray(water).save(folder / "water.png", optimize=True)

    west, south = to_local(tile.west, tile.south)
    east, north = to_local(tile.east, tile.north)
    corners = terrain.sample_corners(mosaic)
    raw = terrain.tile_corners(corners)
    conformed = raw

    roads: list[dict] = []
    buildings: list[dict] = []
    surface_manifest = None
    if with_vectors:
        roads, buildings, osm_timestamp = vectors.build(osm_path(tile, refresh_osm), tile)
        osm_licence = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors", "asOf": osm_timestamp}
        compact = {"ensure_ascii": False, "separators": (",", ":")}
        (folder / "roads.json").write_text(json.dumps({**osm_licence, "roads": roads}, **compact), encoding="utf-8")
        (folder / "buildings.json").write_text(json.dumps({**osm_licence, "buildings": buildings}, **compact), encoding="utf-8")

        ground = road_surface.Ground(corners, west, north, terrain.CORNER_RIM)
        surface = road_surface.lay_roads(roads, ground)
        conformed = surface.conformed
        if not all(np.array_equal(conformed[edge], raw[edge]) for edge in ((0, ...), (-1, ...), (..., 0), (..., -1))):
            raise ValueError(f"{tile.name}: laying the roads changed a row of heights a neighbour shares")
        mesh_nodes = terrain.height_nodes(conformed)
        ribbons = road_surface.ribbons(surface, mesh_nodes, TILE_SIZE_M / (mesh_nodes.shape[0] - 1), west, north)
        (folder / "road-surface.bin.gz").write_bytes(encode_road_surface([(ring, tier) for _, ring, tier in ribbons]))
        surface_manifest = {
            "file": "road-surface.bin.gz",
            "encoding": "gzip of float32le rings of (east, north, height) in world metres, then one tier byte per section, in chain order",
            "ring": ["outer left", "edge left", "centre", "edge right", "outer right"],
            "tiers": road_surface.TIERS,
            "chains": [
                {key: value for key, value in {"sections": len(ring), "kind": chain.kind_name, "ref": chain.tag("ref"), "name": chain.tag("name"), "motor": chain.motor}.items() if value is not None}
                for chain, ring, _ in ribbons
            ],
            **osm_licence,
        }

    nodes = terrain.height_nodes(conformed)
    (folder / "heights.bin.gz").write_bytes(encode_heights(nodes))
    (folder / "water-nodes.bin.gz").write_bytes(gzip.compress(water_nodes(water).tobytes(), 9, mtime=0))

    shade = terrain.bake_shade(terrain.with_ground_moved(mosaic, raw, conformed))
    encoded = np.round(255 * np.clip(shade, 0, 1) ** (1 / SHADE_GAMMA)).astype(np.uint8)
    Image.fromarray(encoded).save(folder / "shade.webp", quality=SHADE_QUALITY, method=6)

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
        "water": {"file": "water.png", "pixels": SAMPLES, "pixelM": SAMPLE_M, "nodesFile": "water-nodes.bin.gz"},
        "roads": {"file": "roads.json", "count": len(roads)},
        "buildings": {"file": "buildings.json", "count": len(buildings)},
        "attribution": ATTRIBUTION,
    }
    if surface_manifest is not None:
        manifest["roadSurface"] = surface_manifest
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

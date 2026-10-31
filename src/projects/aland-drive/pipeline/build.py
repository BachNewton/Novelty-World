"""Builds game-ready tiles. Run through run.py, which sets up the environment.

Each tile is a folder of plain files described by its tile.json, under
.data/tiles/, and world.json there lists them. `upload.py` publishes that folder.
Nothing here knows about the game's code.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import buildings as solids
import canopy
import ground as ground_colour
import laser
import roads as road_surface
import terrain
import vectors
from grid import SAMPLE_M, SAMPLES, TILE_SIZE_M, WORLD_ORIGIN, Tile, tile_from_name, to_local
from sources import dem_path, osm_path

OUTPUT = Path(__file__).resolve().parent.parent / ".data" / "tiles"
HEIGHT_UNIT_M = 0.01
SHADE_QUALITY = 90
SHADE_GAMMA = 2.2
FORMAT = 4
# Far terrain: every fourth height node, so the nodes it shares with the 4 m grid, edges included, are the same numbers.
FAR_NODE_STRIDE = 4
FAR_SHADE_PIXELS = 750
FAR_SHADE_QUALITY = 80
MASK_PIXELS = 1500
# The drive starts here, on this tile's main road.
START_TILE = "L2343C"
ATTRIBUTION = [
    "Land: National Land Survey of Finland (elevation, orthophotos, laser scanning, 3D buildings, Topographic Database), CC BY 4.0",
    "Roads: © OpenStreetMap contributors, ODbL 1.0",
]


def encode_heights(nodes: np.ndarray) -> bytes:
    """Whole units as int16, each row as differences along itself, gzipped."""
    # In double precision whatever the array's type: two tiles round their shared row alike only if they divide alike.
    units = np.round(np.asarray(nodes, dtype=np.float64) / HEIGHT_UNIT_M).astype(np.int32)
    if units.min() < -32768 or units.max() > 32767:
        raise ValueError("heights outside int16 at this unit")
    return gzip.compress(np.diff(units, axis=1, prepend=0).astype("<i2").tobytes(), 9, mtime=0)


def surface_mask(water: np.ndarray, ribbons: list[tuple[np.ndarray, np.ndarray]], west: float, north: float) -> Image.Image:
    """What far terrain paints: water in red, the coverage of main roads in green and of lesser ones in blue, at 4 m."""
    scale = SAMPLES / TILE_SIZE_M
    canvases = [Image.new("L", (SAMPLES, SAMPLES), 0) for _ in range(2)]
    pens = [ImageDraw.Draw(canvas) for canvas in canvases]
    for rings, tiers in ribbons:
        columns = (rings[:, 1:4, 0] - west) * scale
        rows = (north - rings[:, 1:4, 1]) * scale
        for section in range(len(rings) - 1):
            quad = [(columns[section, 0], rows[section, 0]), (columns[section, 2], rows[section, 2]), (columns[section + 1, 2], rows[section + 1, 2]), (columns[section + 1, 0], rows[section + 1, 0])]
            pens[0 if tiers[section] == 0 else 1].polygon(quad, fill=255)
    wet = Image.fromarray(water.astype(np.uint8) * 255)
    return Image.merge("RGB", [channel.reduce(SAMPLES // MASK_PIXELS) for channel in (wet, *canvases)])


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
    folder = OUTPUT / tile.name
    folder.mkdir(parents=True, exist_ok=True)

    mosaic = terrain.read_with_rim(tile)
    water_with_rim = terrain.water_mask(mosaic)
    water = water_with_rim[terrain.RIM_SAMPLES : -terrain.RIM_SAMPLES, terrain.RIM_SAMPLES : -terrain.RIM_SAMPLES]

    west, south = to_local(tile.west, tile.south)
    east, north = to_local(tile.east, tile.north)
    corners = terrain.sample_corners(mosaic)
    raw = terrain.tile_corners(corners)
    conformed = raw

    roads: list[dict] = []
    buildings: list[dict] = []
    surface_manifest = None
    baked: list[tuple[np.ndarray, np.ndarray]] = []
    motor_roads: list[tuple[np.ndarray, np.ndarray]] = []
    if with_vectors:
        roads, buildings, osm_timestamp = vectors.build(osm_path(tile, refresh_osm), tile)
        osm_licence = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors", "asOf": osm_timestamp}
        compact = {"ensure_ascii": False, "separators": (",", ":")}
        (folder / "roads.json").write_text(json.dumps({**osm_licence, "roads": roads}, **compact), encoding="utf-8")
        (folder / "buildings.json").write_text(json.dumps({**osm_licence, "buildings": buildings}, **compact), encoding="utf-8")

        ground = road_surface.Ground(corners, west, north, terrain.CORNER_RIM)
        ribbons = []
        if roads:
            surface = road_surface.lay_roads(roads, ground)
            conformed = surface.conformed
            if not all(np.array_equal(conformed[edge], raw[edge]) for edge in ((0, ...), (-1, ...), (..., 0), (..., -1))):
                raise ValueError(f"{tile.name}: laying the roads changed a row of heights a neighbour shares")
            mesh_nodes = terrain.height_nodes(conformed)
            ribbons = road_surface.ribbons(surface, mesh_nodes, TILE_SIZE_M / (mesh_nodes.shape[0] - 1), west, north)
        baked = [(ring, tier) for _, ring, tier in ribbons]
        motor_roads = [(ring, tier) for chain, ring, tier in ribbons if chain.motor]
        (folder / "road-surface.bin.gz").write_bytes(encode_road_surface(baked))
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
    (folder / "heights-far.bin.gz").write_bytes(encode_heights(nodes[:: FAR_NODE_STRIDE, :: FAR_NODE_STRIDE]))
    (folder / "water-nodes.bin.gz").write_bytes(gzip.compress(water_nodes(water).tobytes(), 9, mtime=0))
    surface_mask(water, baked, west, north).save(folder / "mask.png", optimize=True)

    shade = terrain.bake_shade(terrain.with_ground_moved(mosaic, raw, conformed))
    encoded = np.round(255 * np.clip(shade, 0, 1) ** (1 / SHADE_GAMMA)).astype(np.uint8)
    Image.fromarray(encoded).save(folder / "shade.webp", quality=SHADE_QUALITY, method=6)
    Image.fromarray(encoded).reduce(SAMPLES // FAR_SHADE_PIXELS).save(folder / "shade-far.webp", quality=FAR_SHADE_QUALITY, method=6)

    raw_photo = ground_colour.read_photo(tile)
    photo = ground_colour.graded(raw_photo)
    above = laser.above_ground(tile)
    solids_manifest, built = solids.build(tile, conformed, above, photo, motor_roads, folder)
    trees = canopy.bake(above, raw_photo, water, built, baked, west, north, folder)
    ground_colour.bake(photo, water_with_rim, trees, built, folder)
    print(f"  {trees.mean():.1%} under trees")

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
        "far": {"heightsFile": "heights-far.bin.gz", "nodes": nodes[:: FAR_NODE_STRIDE, :: FAR_NODE_STRIDE].shape[0], "stepM": FAR_NODE_STRIDE * TILE_SIZE_M / (nodes.shape[0] - 1), "shadeFile": "shade-far.webp", "shadePixels": FAR_SHADE_PIXELS},
        "shade": {"file": "shade.webp", "pixels": SAMPLES, "pixelM": SAMPLE_M, "gamma": SHADE_GAMMA},
        "sun": {"azimuthDeg": terrain.SUN_AZIMUTH_DEG, "elevationDeg": terrain.SUN_ELEVATION_DEG},
        "mask": {"file": "mask.png", "pixels": MASK_PIXELS, "channels": ["water", "main road", "lesser road"]},
        "ground": {"file": "ground.webp", "pixels": SAMPLES, "farFile": "ground-far.webp", "farPixels": ground_colour.FAR_PIXELS},
        "canopy": {"file": "canopy.webp", "pixels": canopy.PIXELS, "unitM": canopy.UNIT_M},
        "solids": solids_manifest,
        "water": {"nodesFile": "water-nodes.bin.gz"},
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


def write_world(output: Path = OUTPUT) -> dict:
    """world.json lists the tiles built, and hashes them into the version that names a published copy."""
    manifests = [json.loads((folder / "tile.json").read_text(encoding="utf-8")) for folder in sorted(output.iterdir()) if (folder / "tile.json").exists()]
    digest = hashlib.sha256()
    for path in sorted(path for path in output.rglob("*") if path.is_file() and path.name != "world.json"):
        digest.update(path.relative_to(output).as_posix().encode())
        digest.update(path.read_bytes())
    first = manifests[0]
    world = {
        "format": FORMAT,
        "version": digest.hexdigest()[:12],
        "worldOrigin": first["worldOrigin"],
        "tileM": TILE_SIZE_M,
        "tiles": [{"name": manifest["tile"], "west": manifest["bounds"]["west"], "north": manifest["bounds"]["north"]} for manifest in manifests],
        "start": {"tile": START_TILE if any(manifest["tile"] == START_TILE for manifest in manifests) else first["tile"], "chain": 0},
        "heights": first["heights"],
        "far": first["far"],
        "shade": first["shade"],
        "mask": first["mask"],
        "ground": first["ground"],
        "canopy": first["canopy"],
        "water": first["water"],
        "sun": first["sun"],
        "attribution": ATTRIBUTION,
    }
    (output / "world.json").write_text(json.dumps(world, ensure_ascii=False, indent=2), encoding="utf-8")
    return world


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--refresh-osm", action="store_true", help="ask Overpass again instead of reusing the kept copy")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        tile = tile_from_name(name)
        if dem_path(tile) is None:
            print(f"{name}: the mirror has no such tile, which means open sea, so it stays out of the world")
            continue
        build_tile(tile, arguments.refresh_osm)
    world = write_world()
    print(f"world {world['version']}: {len(world['tiles'])} tiles")


if __name__ == "__main__":
    main()

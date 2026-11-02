"""Measures the rock `rocks.py` bakes against what else says where rock is.

For built tiles with `rock.bin.gz`: how much of the land is rock, how much of OSM's
`natural=bare_rock` lies in it and how much of it OSM maps, how much of it stands
under trees, and how much of it the photo reads as stone (the game's own reading,
`groundKinds` in `art/surfaces/ground.ts`), against open land that isn't rock.

    python rock_audit.py [--folder FOLDER] L2343C [more tiles]
"""

import argparse
import xml.etree.ElementTree as ElementTree
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import rocks
from grid import TILE_SIZE_M, lonlat_to_grid, tile_from_name
from sources import RAW

TREE_M = 2


def stone_share(photo: np.ndarray) -> np.ndarray:
    """`groundKinds` in `art/surfaces/ground.ts`, with no drift: how much of a pixel the photo says is stone."""
    linear = photo ** 2.2
    red, green, blue = linear[..., 0], linear[..., 1], linear[..., 2]
    brightest = np.maximum(np.maximum(red, green), blue).clip(0.001)
    green_lean = (green - np.maximum(red, blue) * 0.92) / brightest
    warmth = (red - blue) / brightest

    def smooth(low, high, value):
        t = np.clip((value - low) / (high - low), 0, 1)
        return t * t * (3 - 2 * t)

    grass = smooth(0.03, 0.14, green_lean) * smooth(0.04, 0.08, brightest)
    grey = (1 - smooth(0.09, 0.15, warmth)) * smooth(0.14, 0.22, brightest)
    return np.minimum(1 - grass, grey)


def bare_rock(tile) -> np.ndarray:
    """OSM's closed `natural=bare_rock` ways and multipolygons' outer ways, drawn at the rock image's 4 m."""
    root = ElementTree.parse(RAW / "osm-api" / f"{tile.name}.xml").getroot()
    nodes = {node.get("id"): (float(node.get("lon")), float(node.get("lat"))) for node in root.iter("node")}
    ways = {way.get("id"): [ref.get("ref") for ref in way.iter("nd")] for way in root.iter("way")}
    rings = [ways[way.get("id")] for way in root.iter("way") if any(tag.get("k") == "natural" and tag.get("v") == "bare_rock" for tag in way.iter("tag"))]
    for relation in root.iter("relation"):
        if any(tag.get("k") == "natural" and tag.get("v") == "bare_rock" for tag in relation.iter("tag")):
            rings += [ways[member.get("ref")] for member in relation.iter("member") if member.get("type") == "way" and member.get("role") == "outer" and member.get("ref") in ways]
    canvas = Image.new("L", (rocks.PIXELS, rocks.PIXELS), 0)
    pen = ImageDraw.Draw(canvas)
    per_m = rocks.PIXELS / TILE_SIZE_M
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1] or not all(ref in nodes for ref in ring):
            continue
        east, north = lonlat_to_grid(*np.array([nodes[ref] for ref in ring]).T)
        pen.polygon(list(zip((east - tile.west) * per_m, (tile.north - north) * per_m)), fill=255)
    return np.asarray(canvas) > 127


def audit(name: str, folder: Path) -> dict:
    tile = tile_from_name(name)
    rock = rocks.decode((folder / rocks.FILE).read_bytes()) > 0.5
    water = np.asarray(Image.open(folder / "mask.png").convert("RGB"))[..., 0] > 127
    canopy_unit = 0.25
    trees = np.asarray(Image.open(folder / "canopy.webp").convert("L"), dtype=np.float32) * canopy_unit > TREE_M
    photo = np.asarray(Image.open(folder / "ground.webp").convert("RGB").reduce(2), dtype=np.float32) / 255
    stone = stone_share(photo) > 0.5
    osm = bare_rock(tile)
    land = ~water
    open_rock, open_other = rock & ~trees, land & ~rock & ~trees
    return {
        "rock of land": rock.sum() / max(land.sum(), 1),
        "osm bare rock in rock": (osm & rock).sum() / max(osm.sum(), 1),
        "rock osm maps": (osm & rock).sum() / max(rock.sum(), 1),
        "osm km2": osm.sum() * rocks.PIXEL_M**2 / 1e6,
        "rock under trees": (rock & trees).sum() / max(rock.sum(), 1),
        "stone on open rock": (stone & open_rock).sum() / max(open_rock.sum(), 1),
        "stone on open other land": (stone & open_other).sum() / max(open_other.sum(), 1),
        "stone on rock under trees": (stone & rock & trees).sum() / max((rock & trees).sum(), 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        print(name, {key: round(float(value), 3) for key, value in audit(name, arguments.folder / name).items()})


if __name__ == "__main__":
    main()

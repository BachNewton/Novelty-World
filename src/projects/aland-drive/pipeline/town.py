"""The ground of a town, baked for a built tile: what its parks, squares, yards and paving are, and each road section's class.

`town_ground.bake_surface` does the work from what the tile already has (its road surface, its buildings, the 2 m photo
and the water in its mask) and OSM's areas, kept apart from the roads in `.data/raw/osm-town/`. It writes:

- `town.rgba.gz`: the surface image, RGBA bytes at 2 m, north up, as `town_ground` describes. The terrain draws it.
- `town-ribbons.bin.gz`: a byte per section of the road surface, in its order: the class each ribbon is drawn as.

Also a command, to add both to tiles already built, with nothing else rebuilt:

    python town.py [--folder FOLDER] [--pixel-m 4] L2334E [more tiles]

`--pixel-m 4` halves the image's resolution, for comparing what 2 m buys.
"""

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
import shapely
from PIL import Image

import town_ground
from grid import TILE_SIZE_M, Tile, tile_from_name, to_local
from sources import osm_town_path
from vectors import line_to_grid

FILE = "town.rgba.gz"
RIBBONS_FILE = "town-ribbons.bin.gz"
SECTION_FLOATS = 15
# What a section's class says, by bit, for the manifest's reader: red, green and blue of `town_ground`'s classes.
CHANNELS = ["hard edge", "leafy edge", "tarred edge", "paving direction"]


def _local(geometry: list[dict]) -> np.ndarray:
    return np.column_stack(to_local(*line_to_grid(geometry).T))


def _polygons(element: dict) -> list[shapely.Polygon]:
    if element["type"] == "way":
        outers, inners = [element["geometry"]], []
    else:
        outers = [member["geometry"] for member in element["members"] if member["role"] == "outer"]
        inners = [member["geometry"] for member in element["members"] if member["role"] == "inner"]
    to_lines = lambda rings: [shapely.LineString(_local(ring)) for ring in rings if len(ring) >= 2]
    filled = [shapely.union_all(list(shapely.get_parts(shapely.polygonize(to_lines(rings))))) for rings in (outers, inners)]
    area = shapely.difference(filled[0], filled[1]).buffer(0)
    return [part for part in shapely.get_parts(area) if isinstance(part, shapely.Polygon)]


def osm_elements(path: Path, window: shapely.Polygon) -> list[dict]:
    """The kept town file as `town_ground.classify_osm` reads it: tags and a shapely geometry in the game's metres."""
    elements = []
    for element in json.loads(path.read_text(encoding="utf-8"))["elements"]:
        tags = element["tags"]
        if element["type"] == "node":
            elements.append({"tags": tags, "geometry": shapely.Point(_local([element])[0])})
            continue
        geometry = element.get("geometry", [])
        closed = element["type"] == "relation" or (len(geometry) > 3 and geometry[0] == geometry[-1])
        if not closed or "barrier" in tags:
            if len(geometry) >= 2:
                elements.append({"tags": tags, "geometry": shapely.LineString(_local(geometry))})
            continue
        elements += [{"tags": tags, "geometry": polygon} for polygon in _polygons(element) if polygon.intersects(window)]
    return elements


def read_ribbons(folder: Path, manifest: dict) -> list[town_ground.Ribbon]:
    surface = manifest["roadSurface"]
    total = sum(chain["sections"] for chain in surface["chains"])
    raw = gzip.decompress((folder / surface["file"]).read_bytes())
    rings = np.frombuffer(raw, "<f4", total * SECTION_FLOATS).reshape(total, 5, 3).astype(np.float64)
    ribbons, first = [], 0
    for chain in surface["chains"]:
        ribbons.append(town_ground.Ribbon(rings[first : first + chain["sections"], :, :2], chain["kind"], chain["motor"]))
        first += chain["sections"]
    return ribbons


def coarser(image: np.ndarray, factor: int) -> np.ndarray:
    """The image at a coarser pixel: distances averaged, which keeps them distances, and the paving's direction taken as it is."""
    size = image.shape[0] // factor
    distances = image[: size * factor, : size * factor, :3].reshape(size, factor, size, factor, 3).astype(np.float32).mean(axis=(1, 3))
    return np.dstack((np.round(distances).astype(np.uint8), image[::factor, ::factor, 3][:size, :size]))


def bake(tile: Tile, folder: Path, pixel_m: float = town_ground.PIXEL_M) -> dict:
    """Writes the two files, and returns the manifest's `town` entry."""
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    bounds = manifest["bounds"]
    window = shapely.box(bounds["west"] - town_ground.RIM_M, bounds["south"] - town_ground.RIM_M, bounds["east"] + town_ground.RIM_M, bounds["north"] + town_ground.RIM_M)
    layers = town_ground.classify_osm(osm_elements(osm_town_path(tile), window))
    ribbons = read_ribbons(folder, manifest)
    photo = np.asarray(Image.open(folder / manifest["ground"]["file"]).convert("RGB"), np.float32) / 255
    water = np.asarray(Image.open(folder / manifest["mask"]["file"]))[..., 0] > 128
    rings = json.loads((folder / "buildings.json").read_text(encoding="utf-8"))["buildings"]
    footprints = [part for item in rings for part in shapely.get_parts(shapely.Polygon(item["ring"]).buffer(0)) if isinstance(part, shapely.Polygon) and part.area > 0]
    surface = town_ground.bake_surface(bounds["west"], bounds["north"], TILE_SIZE_M, layers, ribbons, footprints, photo, water)
    roads = json.loads((folder / "roads.json").read_text(encoding="utf-8"))["roads"]
    ways = [{**road, "line": shapely.LineString(road["line"])} for road in roads if len(road["line"]) >= 2]
    town_ground.apply_way_surfaces(ribbons, surface, ways)

    image = surface.image if pixel_m == town_ground.PIXEL_M else coarser(surface.image, round(pixel_m / town_ground.PIXEL_M))
    (folder / FILE).write_bytes(gzip.compress(np.ascontiguousarray(image).tobytes(), 9))
    classes = np.concatenate(surface.ribbon_classes).astype(np.uint8) if ribbons else np.zeros(0, np.uint8)
    (folder / RIBBONS_FILE).write_bytes(gzip.compress(classes.tobytes(), 9))
    return {"file": FILE, "pixels": image.shape[0], "ribbons": RIBBONS_FILE, "channels": CHANNELS, "rangeM": list(town_ground.RANGE_M)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2334E")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--pixel-m", type=float, default=town_ground.PIXEL_M, help="the image's pixel in metres: 2, or 4 to compare")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        folder = arguments.folder / name
        town = bake(tile_from_name(name), folder, arguments.pixel_m)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        (folder / "tile.json").write_text(json.dumps({**manifest, "town": town}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(name, f"{(folder / FILE).stat().st_size / 1e6:.2f} MB at {arguments.pixel_m:g} m")
    world_file = arguments.folder / "world.json"
    world = json.loads(world_file.read_text(encoding="utf-8"))
    world_file.write_text(json.dumps({**world, "town": world_town(town)}, ensure_ascii=False, indent=2), encoding="utf-8")


def world_town(town: dict) -> dict:
    """What every tile's image shares, which sizes the game's layers: a tile without one is drawn with none."""
    return {key: town[key] for key in ("pixels", "channels", "rangeM")}


if __name__ == "__main__":
    main()

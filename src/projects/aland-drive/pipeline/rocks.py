"""Where Åland's granite breaks through: the Topographic Database's rock, as an image and a list per tile.

The Topographic Database maps rock areas (34100) wherever bedrock is at or near the
surface, bare or under thin pine, and single boulders big enough to steer by (34600)
and fields of them (34700). The rock areas go in `rock.bin.gz`, each 4 m pixel's
share of rock, clear of water, carriageways and buildings: the game lays its slabs
and its rock relief from that. The boulders go in `models.json` beside the
boathouses and sheds, each a seed of the rural kit's boulder and its width across.

The rock's own shape needs nothing here: bare rock has no vegetation for the
elevation model to remove, so its domes and steps are already the ground.

Also a command, to add both to tiles already built, with nothing else rebuilt:

    python rocks.py [--folder FOLDER] L2343C [more tiles]
"""

import argparse
import gzip
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import shapefile
from PIL import Image, ImageDraw
from shapely import STRtree, prepared
from shapely.geometry import Point, Polygon, shape

from grid import SAMPLES, TILE_SIZE_M, Tile, tile_from_name, to_local
from outbuildings import LICENCE
from sources import topographic_path

PIXELS = 1500
PIXEL_M = TILE_SIZE_M // PIXELS
FILE = "rock.bin.gz"
MANIFEST = {
    "file": FILE,
    "pixels": PIXELS,
    "encoding": "gzip of bytes, rows north to south, west to east: each pixel's share of rock, 0 to 255",
}

ROCK_AREA = 34100
BOULDER = 34600
BOULDER_FIELD = 34700
# The rural kit's boulder seeds (art/rural/rocks.ts, ROCK_SEEDS), one model each.
BOULDER_MODELS = ("boulder-3", "boulder-11", "boulder-24", "boulder-37")
# A mapped boulder is one worth steering by: big. A field's are the ordinary run of stones.
MAPPED_WIDTH_M = (1.8, 3.6)
FIELD_WIDTH_M = (0.7, 1.5)
FIELD_LATTICE_M = 5
FIELD_SHARE = 0.12
# Rock is kept this far off a building's walls, and a boulder this far off a carriageway.
BUILDING_CLEAR_M = 2
ROAD_CLEAR_PIXELS = 1
WET = 0.5
# Every class of building the Topographic Database draws.
BUILDING_CLASSES = set(range(42000, 43000))


def _layer(archive: zipfile.ZipFile, base: str) -> shapefile.Reader | None:
    if f"{base}.shp" not in archive.namelist():
        return None
    return shapefile.Reader(shp=io.BytesIO(archive.read(f"{base}.shp")), shx=io.BytesIO(archive.read(f"{base}.shx")), dbf=io.BytesIO(archive.read(f"{base}.dbf")), encoding="latin1")


def _features(tile: Tile, group: str, geometry: str, classes: set[int]):
    """The half sheet's features of some classes, as (class, shapely geometry) in ETRS-TM35FIN, those reaching the tile."""
    bounds = Polygon.from_bounds(tile.west, tile.south, tile.east, tile.north)
    with zipfile.ZipFile(topographic_path(tile)) as archive:
        for base in sorted(name[:-4] for name in archive.namelist() if name.startswith(f"{group}_") and name.endswith(f"_{geometry}.shp")):
            reader = _layer(archive, base)
            if reader is None:
                continue
            kinds = [entry[0] for entry in reader.fields[1:]].index("LUOKKA")
            for record in reader.iterShapeRecords():
                kind = record.record[kinds]
                if kind not in classes:
                    continue
                found = shape(record.shape.__geo_interface__)
                if found.intersects(bounds):
                    yield kind, found


def _pixel_ring(ring, tile: Tile, per_m: float) -> list[tuple[float, float]]:
    return [((x - tile.west) * per_m, (tile.north - y) * per_m) for x, y in ring]


def _fill(pen: ImageDraw.ImageDraw, polygon, tile: Tile, per_m: float) -> None:
    for part in getattr(polygon, "geoms", [polygon]):
        if part.is_empty or part.geom_type != "Polygon":
            continue
        pen.polygon(_pixel_ring(part.exterior.coords, tile, per_m), fill=255)
        for hole in part.interiors:
            pen.polygon(_pixel_ring(hole.coords, tile, per_m), fill=0)


def _mask(folder: Path) -> np.ndarray:
    """The tile's surface mask, 0 to 1: water, main roads, lesser roads."""
    return np.asarray(Image.open(folder / "mask.png").convert("RGB"), dtype=np.float32) / 255


def rock_cover(tile: Tile, mask: np.ndarray) -> np.ndarray:
    """Each 4 m pixel's share of rock, drawn at 2 m, off water, carriageways and buildings."""
    per_m = SAMPLES / TILE_SIZE_M
    rock = Image.new("L", (SAMPLES, SAMPLES), 0)
    pen = ImageDraw.Draw(rock)
    for _, area in _features(tile, "m", "p", {ROCK_AREA}):
        _fill(pen, area, tile, per_m)
    for _, building in _features(tile, "r", "p", BUILDING_CLASSES):
        grown = building.buffer(BUILDING_CLEAR_M)
        for part in getattr(grown, "geoms", [grown]):
            pen.polygon(_pixel_ring(part.exterior.coords, tile, per_m), fill=0)
    cover = np.asarray(rock.reduce(SAMPLES // PIXELS), dtype=np.float32) / 255
    water, roads = mask[..., 0], np.maximum(mask[..., 1], mask[..., 2])
    return cover * (1 - water) * (1 - roads)


def encode(cover: np.ndarray) -> bytes:
    return gzip.compress(np.round(np.clip(cover, 0, 1) * 255).astype(np.uint8).tobytes(), 9, mtime=0)


def decode(data: bytes) -> np.ndarray:
    return np.frombuffer(gzip.decompress(data), dtype=np.uint8).reshape(PIXELS, PIXELS) / 255


class Heights:
    """The tile's 4 m height nodes, read on the mesh's own triangles, whose diagonal runs north-east to south-west."""

    def __init__(self, nodes: np.ndarray, step: float, west: float, north: float):
        self.nodes, self.step, self.west, self.north = nodes, step, west, north

    @classmethod
    def of_tile(cls, folder: Path, manifest: dict) -> "Heights":
        count = manifest["heights"]["nodes"]
        deltas = np.frombuffer(gzip.decompress((folder / manifest["heights"]["file"]).read_bytes()), dtype="<i2").reshape(count, count)
        nodes = np.cumsum(deltas.astype(np.int32), axis=1) * manifest["heights"]["unitM"]
        return cls(nodes, manifest["heights"]["stepM"], manifest["bounds"]["west"], manifest["bounds"]["north"])

    def at(self, east: float, north: float) -> float:
        column, row = (east - self.west) / self.step, (self.north - north) / self.step
        last = self.nodes.shape[0] - 2
        c, r = min(max(int(column), 0), last), min(max(int(row), 0), last)
        across, down = column - c, row - r
        h = self.nodes
        if across + down <= 1:
            return float(h[r, c] + across * (h[r, c + 1] - h[r, c]) + down * (h[r + 1, c] - h[r, c]))
        return float(h[r + 1, c + 1] + (1 - across) * (h[r + 1, c] - h[r + 1, c + 1]) + (1 - down) * (h[r, c + 1] - h[r + 1, c + 1]))


def _roll(east: float, north: float, salt: float) -> float:
    """A share from 0 to 1 that a place always gets the same, so a rebuild places the same stones."""
    value = np.sin(east * 12.9898 + north * 78.233 + salt * 37.719) * 43758.5453
    return float(value - np.floor(value))


def boulders(tile: Tile, mask: np.ndarray, heights: Heights) -> dict[str, list[list[float]]]:
    """The mapped boulders, and a field's scattered over it, off water, roads and other tiles."""
    water, roads = mask[..., 0], np.maximum(mask[..., 1], mask[..., 2])
    near_road = roads.copy()
    for shift in range(1, ROAD_CLEAR_PIXELS + 1):
        for axis in (0, 1):
            near_road = np.maximum(near_road, np.maximum(np.roll(roads, shift, axis), np.roll(roads, -shift, axis)))
    buildings = STRtree([found.buffer(BUILDING_CLEAR_M) for _, found in _features(tile, "r", "p", BUILDING_CLASSES)])

    def clear(east: float, north: float) -> bool:
        if not (tile.west <= east < tile.east and tile.south <= north < tile.north):
            return False
        column, row = int((east - tile.west) / PIXEL_M), int((tile.north - north) / PIXEL_M)
        if water[row, column] > WET or near_road[row, column] > 0:
            return False
        return len(buildings.query(Point(east, north), predicate="within")) == 0

    stones: list[tuple[float, float, float]] = []
    for _, found in _features(tile, "m", "s", {BOULDER}):
        stones.append((found.x, found.y, MAPPED_WIDTH_M[0] + _roll(found.x, found.y, 1) * (MAPPED_WIDTH_M[1] - MAPPED_WIDTH_M[0])))
    for _, field in _features(tile, "m", "p", {BOULDER_FIELD}):
        west, south, east, north = field.bounds
        field = prepared.prep(field)
        for column in range(int(west // FIELD_LATTICE_M), int(east // FIELD_LATTICE_M) + 1):
            for row in range(int(south // FIELD_LATTICE_M), int(north // FIELD_LATTICE_M) + 1):
                x = (column + 0.2 + 0.6 * _roll(column, row, 2)) * FIELD_LATTICE_M
                y = (row + 0.2 + 0.6 * _roll(column, row, 3)) * FIELD_LATTICE_M
                if _roll(column, row, 4) < FIELD_SHARE and field.contains(Point(x, y)):
                    stones.append((x, y, FIELD_WIDTH_M[0] + _roll(x, y, 5) * (FIELD_WIDTH_M[1] - FIELD_WIDTH_M[0])))

    placed: dict[str, list[list[float]]] = {}
    for east, north, width in stones:
        if not clear(east, north):
            continue
        x, z = to_local(east, north)
        model = BOULDER_MODELS[int(_roll(east, north, 6) * len(BOULDER_MODELS))]
        yaw = _roll(east, north, 7) * 2 * np.pi
        placed.setdefault(model, []).append([round(float(x), 2), round(heights.at(x, z), 2), round(float(-z), 2), round(float(yaw), 4), round(width, 2), round(width, 2)])
    return placed


def bake(tile: Tile, folder: Path) -> tuple[dict, dict]:
    """Writes `rock.bin.gz`, and the boulders into `models.json` in place of any it held: the rock's manifest and the models'."""
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    mask = _mask(folder)
    (folder / FILE).write_bytes(encode(rock_cover(tile, mask)))
    models_file = folder / "models.json"
    kept = json.loads(models_file.read_text(encoding="utf-8"))["models"] if models_file.exists() else {}
    models = {name: places for name, places in kept.items() if name not in BOULDER_MODELS} | boulders(tile, mask, Heights.of_tile(folder, manifest))
    models_file.write_text(json.dumps({**LICENCE, "models": models}, separators=(",", ":")), encoding="utf-8")
    return MANIFEST, {"file": "models.json", "count": {model: len(places) for model, places in sorted(models.items())}, "place": ["x", "y", "z", "yaw", "width", "length"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        folder = arguments.folder / name
        rock, models = bake(tile_from_name(name), folder)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        (folder / "tile.json").write_text(json.dumps({**manifest, "rock": rock, "models": models}, ensure_ascii=False, indent=2), encoding="utf-8")
        boulder_count = sum(count for model, count in models["count"].items() if model in BOULDER_MODELS)
        print(name, f"{(folder / FILE).stat().st_size / 1000:.1f} kB, {decode((folder / FILE).read_bytes()).mean():.1%} rock, {boulder_count} boulders")
    # The world says every tile has rock, so it's added only once they all do.
    world_file = arguments.folder / "world.json"
    world = json.loads(world_file.read_text(encoding="utf-8"))
    if all((arguments.folder / tile["name"] / FILE).exists() for tile in world["tiles"]):
        world_file.write_text(json.dumps({**world, "rock": MANIFEST}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

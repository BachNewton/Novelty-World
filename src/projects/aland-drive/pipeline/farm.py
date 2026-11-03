"""The countryside: Åland's post mills where they stand, and the bales, tractors and sheep of a summer's farmland.

Windmills are OSM's (`man_made=windmill`): 93 outlines and 3 points on the island's
tiles, checked by hand against the laser and the 2025 photo. Nearly every outline has
a mill in both, its post-mill shadow long across the grass in the photo and 8–14 m
tall in the laser (a few lower, built or rebuilt since the 2013 scan). The three
points have none, and one outline is a square house under a pyramid roof, so those
are left out. An outline is the mill's body seen from above, 3–7 m, so its long
side is the line the sails turn on, and the sails face whichever end lies to the
south-west, into the prevailing wind. A mill replaces any building the data has
under its outline (`landmarks.Landmarks.replace_also`), and a tile lists its own in
`tile.json`, which `world.json` carries, so the game stands every mill from the start,
as it does the church towers.

The rest is by rule, on the Topographic Database's fields (32611) and meadows (32800),
sparse as a summer's day, each roll from where the thing is, so a rebuild gives the
same countryside:

- **Bales** on a share of the grass fields: green in the spring photo, which a ploughed
  field isn't. Half are wrapped silage stacked in a row by the field's edge nearest a
  road, where they're fetched from; half lie where the baler dropped them, hay or
  wrapped, in lines across the field.
- **Sheep** on a share of the open meadows, more often on a shore meadow, in a flock
  that grazes round one spot, a few of them lambs or grey.
- **A tractor** by a third of the fields with bales, and outside an odd barn near the
  fields, in its yard.

Each keeps clear of roads, buildings, water, stone walls, boulders, the roadside and
each other, so it runs after the roadside. The props go in `models.json` beside the
boathouses and boulders, as `[x, y, z, yaw, scale, scale]` in the scene.

Also a command, to add the countryside to tiles already built (the mills replace what
stands under them only when the tile itself is rebuilt):

    python farm.py [--folder FOLDER] [--count] L2343C [more tiles]
"""

import argparse
import json
import math
import xml.etree.ElementTree as ElementTree
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon

import walls
from grid import SAMPLE_M, SAMPLES, WORLD_ORIGIN, Tile, lonlat_to_grid, tile_from_name, to_local
from landmarks import Site
from rocks import Heights
from sources import osm_xml
from walls import roll

LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}
FIELD, MEADOW = 32611, 32800
OUTBUILDINGS = (42260, 42261, 42262)

# Outlines that aren't post mills, by OSM way, and why: what the hand check found.
NOT_MILLS = {"715077437": "Holkkvarn: a square house under a pyramid roof in the photo, not a post mill"}
# A mill near the tile, though not in it, still replaces what stands under it here: a solid lives in the tile holding its middle.
MILL_REACH_M = 50
# What a mill replaces: its outline and this much round it.
MILL_PLAN_GROW_M = 1.0
# The kit's mill stands on pads this far out from its post, which mustn't float on a slope.
MILL_PADS_M = 3.1
# The way the sails face, in the scene (x east, z south): the south-west, where the wind mostly comes from.
INTO_WIND = np.array([-1.0, 1.0]) / math.sqrt(2)

GREEN = 0.6
BALE_FIELD_HA = 1.0
BALED = 0.14
STACKED = 0.5
STACK_INSIDE_M = 5
STACK_EVERY_M = 1.3
STACK_COUNT = (6, 16)
DOUBLE_ROW = 0.3
STACK_ROWS_M = 1.55
DROPPED_ALONG_M = 30
DROPPED_ACROSS_M = 16
DROPPED_JITTER_M = 7
DROPPED_KEPT = 0.55
DROPPED_INSIDE_M = 6
DROPPED_MOST = 40
HAY = 0.55

FIELD_TRACTOR = 0.35
TRACTOR_INSIDE_M = 4
BARN_M2 = 120
BARN_NEAR_FIELD_M = 60
BARN_TRACTOR = 0.07
YARD_OUT_M = (4.5, 6.5)

MEADOW_HA = 0.25
# The database maps wooded meadows too, gone over to trees: a flock grazes open ones, read every few metres.
MEADOW_OPEN = 0.6
OPEN_EVERY_M = 6
SHORE_M = 60
GRAZED = {"shore": 0.45, "inland": 0.2}
SHEEP_PER_HA = 8
FLOCK = (5, 24)
FLOCK_SPREAD_M = (8, 28)
SHEEP_INSIDE_M = 2
LAMB, LAMB_SCALE = 0.22, 0.6
GREY = 0.15
GRAZING = 0.7

# How much room each needs round its middle, and what it keeps from a road's laid surface beyond that.
ROOM_M = {"bale": 0.9, "tractor": 2.0, "sheep": 0.6}
ROAD_GAP_M = 1.5
BUILDING_GAP_M = 1.0
WATER_GAP_M = 3
OBSTACLE_GAP_M = 0.5
TAKEN_CELL_M = 10

FARM_MODELS = ("bale-wrapped", "bale-hay", "tractor", "sheep-grazing", "sheep-standing", "sheep-grazing-grey", "sheep-standing-grey")


def _osm_mills(tile: Tile) -> list[tuple[str, Polygon]]:
    """OSM's windmill outlines in the tile's box and margin, in ETRS metres, less those that aren't post mills."""
    roots = [ElementTree.parse(path).getroot() for path in osm_xml(tile)]
    nodes = {node.get("id"): lonlat_to_grid(float(node.get("lon")), float(node.get("lat"))) for root in roots for node in root.iter("node")}
    mills = {}
    for root in roots:
        for way in root.iter("way"):
            tags = {tag.get("k"): tag.get("v") for tag in way.findall("tag")}
            if tags.get("man_made") != "windmill" or way.get("id") in NOT_MILLS:
                continue
            points = [nodes[nd.get("ref")] for nd in way.findall("nd") if nd.get("ref") in nodes]
            if len(points) >= 4:
                mills[way.get("id")] = shapely.make_valid(Polygon(points))
    return sorted(mills.items())


def _near(tile: Tile, point: Point, margin: float) -> bool:
    return tile.west - margin <= point.x < tile.east + margin and tile.south - margin <= point.y < tile.north + margin


def windmill_sites(tile: Tile) -> list[Site]:
    """The mills in or just past the tile, as sites that replace every building under them."""
    return [
        Site(f"windmill {way}", outline.centroid.x, outline.centroid.y, None, frozenset(), True, outline.buffer(MILL_PLAN_GROW_M))
        for way, outline in _osm_mills(tile)
        if _near(tile, outline.centroid, MILL_REACH_M)
    ]


def _axis(outline: Polygon) -> tuple[np.ndarray, float, float]:
    """An outline's smallest rectangle: the direction of its long side in the scene, and its short and long sides."""
    corners = np.array(outline.minimum_rotated_rectangle.exterior.coords)[:3]
    sides = [corners[1] - corners[0], corners[2] - corners[1]]
    short, long = sorted(sides, key=lambda side: np.hypot(*side))
    along = np.array([long[0], -long[1]]) / np.hypot(*long)
    return along, float(np.hypot(*short)), float(np.hypot(*long))


def yaw_of(direction: np.ndarray) -> float:
    """The yaw that turns a model's +z to a direction in the scene."""
    return float(math.atan2(direction[0], direction[1]))


def lying_along(direction: np.ndarray) -> float:
    """The yaw that turns a model's +x to a direction in the scene: a bale's axis along its row."""
    return yaw_of(direction) - math.pi / 2


def mill_yaw(outline: Polygon) -> float:
    """A mill turns its sails along its body's long side, to whichever end faces into the wind."""
    along, _, _ = _axis(outline)
    return yaw_of(along if along @ INTO_WIND >= 0 else -along)


def windmills(tile: Tile, heights: Heights) -> list[list[float]]:
    """The tile's own mills as `[x, y, z, yaw, width, length]` in the scene: the body's outline, its sails into the wind."""
    placed = []
    for _, outline in _osm_mills(tile):
        middle = outline.centroid
        if not _near(tile, middle, 0):
            continue
        _, short, long = _axis(outline)
        x, north = to_local(middle.x, middle.y)
        pads = [heights.at(x + dx, north + dz) for dx, dz in ((0, 0), (MILL_PADS_M, 0), (-MILL_PADS_M, 0), (0, MILL_PADS_M), (0, -MILL_PADS_M))]
        placed.append([round(float(x), 2), round(min(pads), 2), round(float(-north), 2), round(mill_yaw(outline), 4), round(short, 2), round(long, 2)])
    return placed


class Farmland:
    """What the props stand among on one built tile, in ETRS metres."""

    def __init__(self, tile: Tile, folder: Path, manifest: dict):
        self.tile = tile
        fields, buildings = walls.read_classed(tile)
        self.fields, self.buildings = fields, buildings
        self.around = walls.Surroundings(folder, manifest, tile, [shape for shape, _ in fields], [shape for shape, _ in buildings])
        self.heights = Heights.of_tile(folder, manifest)
        photo = np.asarray(Image.open(folder / "ground.webp").convert("RGB"), dtype=np.float32)
        self.green = photo[..., 1] > photo[..., 0] * 1.04
        water = np.asarray(Image.open(folder / "mask.png"))[..., 0] > 127
        self.shore_m = ndimage.distance_transform_edt(~water) * (SAMPLE_M * SAMPLES / water.shape[0])
        self.labels = features.rasterize(((shape, index + 1) for index, (shape, _) in enumerate(fields)), out_shape=(SAMPLES, SAMPLES), transform=from_origin(tile.west, tile.north, SAMPLE_M, SAMPLE_M), dtype="int32")
        self.obstacles = shapely.STRtree(_obstacles(folder, manifest))
        # What's been placed, by 10 m cell: where, and the room it needs.
        self.taken: dict[tuple[int, int], list[tuple[float, float, float]]] = {}

    def _read(self, image: np.ndarray, points: np.ndarray) -> np.ndarray:
        values, inside = self.around._read(image, points)
        return np.where(inside, values, 0)

    def green_share(self, index: int) -> float:
        cells = self.labels == index + 1
        return float(self.green[cells].mean()) if cells.any() else 0.0

    def open_share(self, field: Polygon) -> float:
        """The share of a field with no trees over it."""
        west, south, east, north = field.bounds
        grid = np.array([[x, y] for x in np.arange(west, east, OPEN_EVERY_M) for y in np.arange(south, north, OPEN_EVERY_M)])
        inside = grid[shapely.contains_xy(field, grid[:, 0], grid[:, 1])] if len(grid) else grid
        return float(1 - self.around.forest(inside).mean()) if len(inside) else 0.0

    def by_shore(self, field: Polygon) -> bool:
        metres, inside = self.around._read(self.shore_m, np.array(field.exterior.coords))
        return bool(np.any(inside & (metres < SHORE_M)))

    def clear(self, east: float, north: float, kind: str) -> bool:
        """Whether a prop of this kind can stand here: on the tile, off roads, buildings, water and trees, and clear of
        what's already standing."""
        room = ROOM_M[kind]
        point = np.array([[east, north]])
        if not (self.tile.west <= east < self.tile.east and self.tile.south <= north < self.tile.north):
            return False
        if self._read(self.around.road_clear_m, point)[0] < ROAD_GAP_M + room or self._read(self.around.building_clear_m, point)[0] < BUILDING_GAP_M + room:
            return False
        reach = room + WATER_GAP_M
        if any(self.around.wet(point + offset)[0] for offset in ((0, 0), (reach, 0), (-reach, 0), (0, reach), (0, -reach))):
            return False
        if self.around.forest(point)[0]:
            return False
        if len(self.obstacles.query(Point(east, north), predicate="dwithin", distance=room + OBSTACLE_GAP_M)):
            return False
        cell = (int(east // TAKEN_CELL_M), int(north // TAKEN_CELL_M))
        nearby = (other for dx in (-1, 0, 1) for dy in (-1, 0, 1) for other in self.taken.get((cell[0] + dx, cell[1] + dy), []))
        return all(math.hypot(east - x, north - y) >= room + other_room for x, y, other_room in nearby)

    def take(self, east: float, north: float, kind: str) -> None:
        self.taken.setdefault((int(east // TAKEN_CELL_M), int(north // TAKEN_CELL_M)), []).append((east, north, ROOM_M[kind]))


def _obstacles(folder: Path, manifest: dict) -> list[shapely.Geometry]:
    """Stone walls, boulders and the roadside's walls already on the tile, in ETRS metres."""
    to_etrs = lambda x, z: (x + WORLD_ORIGIN[0], -z + WORLD_ORIGIN[1])
    found: list[shapely.Geometry] = []
    if manifest.get("walls"):
        for line in json.loads((folder / manifest["walls"]["file"]).read_text(encoding="utf-8"))["walls"]:
            found.append(LineString([to_etrs(x, z) for x, z in line]))
    if manifest.get("models"):
        for name, places in json.loads((folder / manifest["models"]["file"]).read_text(encoding="utf-8"))["models"].items():
            if name not in FARM_MODELS:
                found += [Point(to_etrs(x, z)).buffer(width / 2) for x, _, z, _, width, _ in places]
    if manifest.get("roadside"):
        for x0, z0, x1, z1 in json.loads((folder / manifest["roadside"]["file"]).read_text(encoding="utf-8"))["walls"]:
            found.append(LineString([to_etrs(x0, z0), to_etrs(x1, z1)]))
    return found


def _gauss(*key: int) -> float:
    """A normal deviate that a place always gets the same."""
    return math.sqrt(-2 * math.log(max(roll(*key, 1), 1e-9))) * math.cos(2 * math.pi * roll(*key, 2))


class Placer:
    """The props as the game reads them, by model."""

    def __init__(self, land: Farmland):
        self.land = land
        self.models: dict[str, list[list[float]]] = {}

    def put(self, model: str, east: float, north: float, yaw: float, scale: float = 1.0) -> bool:
        kind = model.split("-")[0]
        if not self.land.clear(east, north, kind):
            return False
        self.land.take(east, north, kind)
        x, local_north = to_local(east, north)
        height = self.land.heights.at(x, local_north)
        self.models.setdefault(model, []).append([round(float(x), 2), round(height, 2), round(float(-local_north), 2), round(yaw % (2 * math.pi), 4), scale, scale])
        return True


def _scene_dir(east: float, north: float) -> np.ndarray:
    """An ETRS direction in the scene's axes."""
    return np.array([east, -north]) / math.hypot(east, north)


def _nearest_road_station(line: LineString, land: Farmland) -> float:
    """How far along a line its station nearest a road lies."""
    stations = np.arange(0, line.length, 4.0)
    points = np.array([line.interpolate(at).coords[0] for at in stations])
    metres, _ = land.around.road(points)
    return float(stations[int(np.argmin(metres))])


def _bales(field: Polygon, key: tuple[int, int], placer: Placer) -> tuple[np.ndarray, float] | None:
    """Bales on one field; where a tractor would stand by them, and its yaw, or None if none were laid."""
    land = placer.land
    if roll(*key, 10) < STACKED:
        inner = field.buffer(-STACK_INSIDE_M)
        if inner.is_empty or inner.geom_type != "Polygon":
            return None
        edge = inner.exterior
        start = _nearest_road_station(edge, land)
        count = STACK_COUNT[0] + int(roll(*key, 11) * (STACK_COUNT[1] - STACK_COUNT[0]))
        rows = 2 if roll(*key, 12) < DOUBLE_ROW else 1
        laid = 0
        last = None
        for bale in range(count):
            at = (start + bale * STACK_EVERY_M) % edge.length
            here = np.array(edge.interpolate(at).coords[0])
            ahead = np.array(edge.interpolate((at + 0.5) % edge.length).coords[0]) - here
            if not np.any(ahead):
                continue
            ahead /= np.hypot(*ahead)
            inward = np.array([-ahead[1], ahead[0]])
            if not field.contains(Point(*(here + inward))):
                inward = -inward
            yaw = lying_along(_scene_dir(*ahead))
            for row in range(rows):
                place = here + inward * row * STACK_ROWS_M
                if placer.put("bale-wrapped", place[0], place[1], yaw):
                    laid += 1
                    last = (place, ahead)
        if last is None:
            return None
        place, ahead = last
        return place + ahead * 4.5, yaw_of(_scene_dir(*ahead))

    along, _, _ = _axis(field)
    travel = np.array([along[0], -along[1]])
    across = np.array([-travel[1], travel[0]])
    inner = field.buffer(-DROPPED_INSIDE_M)
    if inner.is_empty:
        return None
    middle = np.array(field.centroid.coords[0])
    reach = math.hypot(field.bounds[2] - field.bounds[0], field.bounds[3] - field.bounds[1]) / 2
    model = "bale-hay" if roll(*key, 13) < HAY else "bale-wrapped"
    laid = 0
    for line in range(-int(reach // DROPPED_ACROSS_M), int(reach // DROPPED_ACROSS_M) + 1):
        for step in range(-int(reach // DROPPED_ALONG_M), int(reach // DROPPED_ALONG_M) + 1):
            if laid >= DROPPED_MOST or roll(*key, line, step, 14) >= DROPPED_KEPT:
                continue
            place = middle + across * line * DROPPED_ACROSS_M + travel * (step * DROPPED_ALONG_M + (roll(*key, line, step, 15) - 0.5) * 2 * DROPPED_JITTER_M) + across * (roll(*key, line, step, 16) - 0.5) * 2 * DROPPED_JITTER_M
            if not inner.contains(Point(*place)):
                continue
            # A round baler drops its bale lying across the way it drives: the model's +z along the line.
            yaw = yaw_of(_scene_dir(*travel)) + (roll(*key, line, step, 17) - 0.5) * 0.6
            if placer.put(model, place[0], place[1], yaw):
                laid += 1
    if laid == 0:
        return None
    edge = field.buffer(-TRACTOR_INSIDE_M)
    if edge.is_empty or edge.geom_type != "Polygon":
        return None
    at = _nearest_road_station(edge.exterior, land)
    here = np.array(edge.exterior.interpolate(at).coords[0])
    ahead = np.array(edge.exterior.interpolate((at + 1) % edge.exterior.length).coords[0]) - here
    return here, yaw_of(_scene_dir(*ahead)) if np.any(ahead) else 0.0


def _flock(field: Polygon, key: tuple[int, int], placer: Placer, shore: bool) -> None:
    inner = field.buffer(-SHEEP_INSIDE_M)
    if inner.is_empty:
        return
    west, south, east, north = inner.bounds
    for attempt in range(12):
        centre = Point(west + roll(*key, attempt, 20) * (east - west), south + roll(*key, attempt, 21) * (north - south))
        if inner.contains(centre):
            break
    else:
        return
    hectares = field.area / 1e4
    wanted = int(np.clip(round(hectares * SHEEP_PER_HA * (0.6 + 0.6 * roll(*key, 22))), *FLOCK)) + (2 if shore else 0)
    spread = float(np.clip(math.sqrt(field.area) / 3, *FLOCK_SPREAD_M))
    laid = 0
    for sheep in range(wanted * 4):
        if laid >= wanted:
            break
        east, north = centre.x + _gauss(*key, sheep, 23) * spread, centre.y + _gauss(*key, sheep, 24) * spread
        if not inner.contains(Point(east, north)):
            continue
        pose = "grazing" if roll(*key, sheep, 25) < GRAZING else "standing"
        coat = "-grey" if roll(*key, sheep, 26) < GREY else ""
        scale = LAMB_SCALE if roll(*key, sheep, 27) < LAMB else 1.0
        if placer.put(f"sheep-{pose}{coat}", east, north, roll(*key, sheep, 28) * 2 * math.pi, scale):
            laid += 1


def _yard_tractor(barn: Polygon, key: tuple[int, int], placer: Placer) -> None:
    along, short, long = _axis(barn)
    etrs_along = np.array([along[0], -along[1]])
    out = np.array([-etrs_along[1], etrs_along[0]]) * (1 if roll(*key, 30) < 0.5 else -1)
    middle = np.array(barn.centroid.coords[0])
    shift = (roll(*key, 31) - 0.5) * max(long - 6, 0)
    distance = short / 2 + YARD_OUT_M[0] + roll(*key, 32) * (YARD_OUT_M[1] - YARD_OUT_M[0])
    place = middle + etrs_along * shift + out * distance
    heading = along if roll(*key, 33) < 0.5 else -along
    placer.put("tractor", place[0], place[1], yaw_of(heading))


def place(tile: Tile, folder: Path, manifest: dict) -> dict[str, list[list[float]]]:
    """The tile's bales, tractors and sheep by model."""
    land = Farmland(tile, folder, manifest)
    placer = Placer(land)
    for index, (field, kind) in enumerate(land.fields):
        middle = field.centroid
        key = (round(middle.x), round(middle.y))
        if not field.intersects(shapely.box(tile.west, tile.south, tile.east, tile.north)):
            continue
        hectares = field.area / 1e4
        if kind == FIELD and hectares >= BALE_FIELD_HA and roll(*key, 1) < BALED and land.green_share(index) >= GREEN:
            tractor = _bales(field, key, placer)
            if tractor is not None and roll(*key, 2) < FIELD_TRACTOR:
                (east, north), yaw = tractor
                placer.put("tractor", east, north, yaw)
        elif kind == MEADOW and hectares >= MEADOW_HA and land.open_share(field) >= MEADOW_OPEN:
            shore = land.by_shore(field)
            if roll(*key, 3) < GRAZED["shore" if shore else "inland"]:
                _flock(field, key, placer, shore)
    farmland = shapely.STRtree([field for field, _ in land.fields])
    for barn, kind in land.buildings:
        middle = barn.centroid
        key = (round(middle.x), round(middle.y))
        if kind in OUTBUILDINGS and barn.area >= BARN_M2 and roll(*key, 4) < BARN_TRACTOR and len(farmland.query(barn, predicate="dwithin", distance=BARN_NEAR_FIELD_M)):
            _yard_tractor(barn, key, placer)
    return placer.models


def bake(tile: Tile, folder: Path) -> tuple[dict, list[list[float]]]:
    """Writes the props into `models.json` in place of any it held, and returns the models' manifest and the tile's mills."""
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    models_file = folder / "models.json"
    kept = json.loads(models_file.read_text(encoding="utf-8"))["models"] if models_file.exists() else {}
    models = {name: places for name, places in kept.items() if name not in FARM_MODELS} | place(tile, folder, manifest)
    models_file.write_text(json.dumps({**LICENCE, "models": models}, separators=(",", ":")), encoding="utf-8")
    listed = {"file": "models.json", "count": {model: len(places) for model, places in sorted(models.items())}, "place": ["x", "y", "z", "yaw", "width", "length"]}
    return listed, windmills(tile, Heights.of_tile(folder, manifest))


def bake_tiles(names: list[str], tiles: Path) -> None:
    """Adds the countryside to built tiles, once their roadside is there to keep clear of."""
    for name in names:
        folder = tiles / name
        listed, mills = bake(tile_from_name(name), folder)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        manifest = {**manifest, "models": listed}
        manifest.pop("windmills", None)
        if mills:
            manifest["windmills"] = mills
        (folder / "tile.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        counts = {model: count for model, count in listed["count"].items() if model in FARM_MODELS}
        print(name, len(mills), "windmills", json.dumps(counts))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    arguments = parser.parse_args()
    bake_tiles(arguments.tiles, arguments.folder)


if __name__ == "__main__":
    main()

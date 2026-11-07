"""Dry-stone walls (stengärdesgårdar): the low walls of cleared field stones that edge Åland's farmland.

Mapped walls are few. OSM has about 5 km of `barrier=wall` on the island, most of it in
Mariehamn's gardens, round churchyards and in Bomarsund's ruins, and the Topographic
Database has no class for a stone wall at all (its 44211 is any built fence). So a wall
is where OSM maps one in the country, and otherwise placed by rule along the edges of
the Topographic Database's fields and meadows (32611, 32800), the lines a wall of stones
cleared from a field marks: against the forest, between two fields, beside a lane. Each
side of a field draws a roll of its own, by what lies beyond it, so walls stay a share of
the edges and no field is ringed by rule. Both sides of a stretch of lane share a roll,
so a walled lane has its walls either side.

A wall stands clear of what it can't cross: it stops short of every road, track and
apron the tile lays, with a gap where one meets it, and keeps off buildings and water.
Churchyards, cemeteries and castles are left to the churches and landmarks, whose walls
are their own.

The list is lines, in scene metres (x east, z south): the game lays the wall's sections
along each and stands them on the ground it draws, so a wall follows its ground whatever
the build. It's ODbL, as OSM's walls are in it.

Also a command, to add the walls to tiles already built, with nothing else rebuilt:

    python walls.py [--folder FOLDER] [--audit] L2343C [more tiles]
"""

import argparse
import gzip
import io
import json
import math
import urllib.error
import xml.etree.ElementTree as ElementTree
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import shapefile
import shapely
from PIL import Image
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, substring, unary_union

from grid import SAMPLE_M, SAMPLES, TILE_SIZE_M, WORLD_ORIGIN, Tile, lonlat_to_grid, neighbour, tile_from_name
from paving_file import read_paving
from sources import osm_xml, topographic_path

FILE = "walls.json"
LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}
# The Topographic Database's field and meadow, and its buildings.
FIELD_CLASSES = (32611, 32800)
BUILDING_CLASSES = range(42000, 43000)
# Fields this far past the tile are read too, so a field that crosses its edge is whole and both tiles roll it alike.
RIM_M = 400
# The database's sheets cut a field in two on their edges, which lie on the tiles' grid: a line there is no edge.
SHEET_CUT_M = 0.5

# A side of a field is one run between corners sharper than this, and no longer than the next.
CORNER_DEG = 35
LONGEST_RUN_M = 250
SHORTEST_WALL_M = 12
# What lies beyond a side is read this far out from it, both ways, every few metres along.
BEYOND_M = 9
READ_EVERY_M = 6
FOREST_M = 3.0
# A side runs beside a road when its middle is this close to one; both sides of a lane share their roll along this much of it.
LANE_M = 12
LANE_STRETCH_M = 120
TIERS = ("main", "minor", "track")

# Of each kind of side, the share that has a wall. A run is one kind by what most of it has beyond it.
WALLED = {"forest": 0.12, "field": 0.15, "lane main": 0.05, "lane minor": 0.22, "lane track": 0.22, "open": 0.04}

# What a wall keeps clear of: a road's whole surface, shoulders and all, then this; a building; water.
ROAD_GAP_M = 1.5
BUILDING_GAP_M = 2.5
# A field that runs down to the water ends at a shore, which takes no wall.
WATER_GAP_M = 12
STATION_M = 1.0

# What's left to the churches and landmarks: OSM areas of these, and a margin round them.
KEPT_FOR_OTHERS = {"landuse": {"cemetery", "religious"}, "amenity": {"grave_yard", "place_of_worship"}, "historic": {"castle", "fort", "ruins", "church", "archaeological_site"}, "building": {"church", "chapel"}}
KEPT_MARGIN_M = 25
# A mapped wall in town is a garden's or a yard's, mortared or brick, and not this kit's: by how many buildings stand round it.
TOWN_BUILDINGS = 12
TOWN_REACH_M = 80


def _to_scene(line: LineString) -> list[list[float]]:
    return [[round(x - WORLD_ORIGIN[0], 2), round(-(y - WORLD_ORIGIN[1]), 2)] for x, y in line.coords]


def _sheets(tile: Tile) -> list[Path]:
    """The half sheets of the tile and every neighbour, once each: fields near an edge come whole. A neighbour's
    sheet the mirror doesn't have is open sea, and only a 404 means that."""
    paths = {}
    for east in (-1, 0, 1):
        for north in (-1, 0, 1):
            try:
                path = topographic_path(neighbour(tile, east, north))
            except urllib.error.HTTPError as error:
                if error.code != 404 or (east, north) == (0, 0):
                    raise
                continue
            paths[path.name] = path
    return [paths[name] for name in sorted(paths)]


def _polygon(shape_record) -> Polygon | None:
    points = shape_record.shape.points
    ends = [*shape_record.shape.parts, len(points)]
    rings = [points[ends[part] : ends[part + 1]] for part in range(len(ends) - 1)]
    polygon = shapely.make_valid(Polygon(rings[0], rings[1:]))
    if polygon.geom_type == "Polygon":
        return polygon
    return max((part for part in getattr(polygon, "geoms", []) if part.geom_type == "Polygon"), key=lambda part: part.area, default=None)


def read_topographic(tile: Tile) -> tuple[list[Polygon], list[Polygon]]:
    """The fields and meadows near the tile, and its buildings, in ETRS metres."""
    fields, buildings = read_classed(tile)
    return [shape for shape, _ in fields], [shape for shape, _ in buildings]


def read_classed(tile: Tile) -> tuple[list[tuple[Polygon, int]], list[tuple[Polygon, int]]]:
    """The fields and meadows near the tile, and its buildings, each with its class, in ETRS metres."""
    box = shapely.box(tile.west - RIM_M, tile.south - RIM_M, tile.east + RIM_M, tile.north + RIM_M)
    fields, buildings = [], []
    for path in _sheets(tile):
        with zipfile.ZipFile(path) as archive:
            for base in sorted(name[:-4] for name in archive.namelist() if name.endswith("_p.shp") and name[:2] in ("m_", "r_")):
                reader = shapefile.Reader(shp=io.BytesIO(archive.read(f"{base}.shp")), shx=io.BytesIO(archive.read(f"{base}.shx")), dbf=io.BytesIO(archive.read(f"{base}.dbf")), encoding="latin1")
                kinds = [entry[0] for entry in reader.fields[1:]].index("LUOKKA")
                wanted = FIELD_CLASSES if base.startswith("m_") else BUILDING_CLASSES
                for shape_record in reader.iterShapeRecords():
                    if shape_record.record[kinds] not in wanted or not box.intersects(shapely.box(*shape_record.shape.bbox)):
                        continue
                    polygon = _polygon(shape_record)
                    if polygon is not None:
                        (fields if base.startswith("m_") else buildings).append((polygon, shape_record.record[kinds]))
    return fields, buildings


def _on_sheet_cut(a: tuple, b: tuple, tile: Tile) -> bool:
    for axis, origin in ((0, tile.west), (1, tile.south)):
        offsets = [(point[axis] - origin) % TILE_SIZE_M for point in (a, b)]
        if all(min(offset, TILE_SIZE_M - offset) < SHEET_CUT_M for offset in offsets):
            return True
    return False


def field_edges(fields: list[Polygon], tile: Tile) -> list[LineString]:
    """Every field's outline as lines, an edge two fields share once, less the sheets' cuts."""
    pieces = []
    for field in fields:
        for ring in [field.exterior, *field.interiors]:
            coords = list(ring.coords)
            pieces += [LineString([a, b]) for a, b in zip(coords, coords[1:]) if a != b and not _on_sheet_cut(a, b, tile)]
    merged = linemerge(unary_union(pieces))
    return list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]


def _turn_deg(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    first, second = b - a, c - b
    cos = float(first @ second / max(np.hypot(*first) * np.hypot(*second), 1e-9))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def runs(line: LineString) -> list[LineString]:
    """A line cut at its sharp corners, and into equal parts where it's long: a field's sides, each rolled alone."""
    points = np.array(line.coords)
    cuts = [0] + [index for index in range(1, len(points) - 1) if _turn_deg(points[index - 1], points[index], points[index + 1]) > CORNER_DEG] + [len(points) - 1]
    found = []
    for start, end in zip(cuts, cuts[1:]):
        side = LineString(points[start : end + 1])
        parts = max(1, math.ceil(side.length / LONGEST_RUN_M))
        found += [substring(side, side.length * part / parts, side.length * (part + 1) / parts) for part in range(parts)]
    return [run for run in found if run.length > 0]


def roll(*key: int) -> float:
    """A share from 0 to 1 from whole numbers, the same in any tile that asks: FNV-1a over their text."""
    value = 2166136261
    for byte in ",".join(map(str, key)).encode():
        value = ((value ^ byte) * 16777619) % 2**32
    return value / 2**32


def _stations(line: LineString, every_m: float, ends: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """Points along a line about `every_m` apart (its ends included, or the middles of equal parts), and the direction there."""
    count = max(2, math.ceil(line.length / every_m) + 1) if ends else max(1, math.ceil(line.length / every_m))
    along = np.linspace(0, line.length, count) if ends else (np.arange(count) + 0.5) * line.length / count
    points = shapely.get_coordinates(shapely.line_interpolate_point(line, along))
    step = min(0.5, line.length / 4)
    ahead = shapely.get_coordinates(shapely.line_interpolate_point(line, np.minimum(along + step, line.length))) - shapely.get_coordinates(shapely.line_interpolate_point(line, np.maximum(along - step, 0)))
    return points, ahead / np.maximum(np.hypot(ahead[:, 0], ahead[:, 1]), 1e-9)[:, None]


class Surroundings:
    """What lies round a place on the tile, from its own images, road surface and the database's shapes, in ETRS metres."""

    def __init__(self, folder: Path, manifest: dict, tile: Tile, fields: list[Polygon], buildings: list[Polygon]):
        self.tile = tile
        self.canopy = np.asarray(Image.open(folder / "canopy.webp").convert("L"), dtype=np.float32) * manifest["canopy"]["unitM"]
        self.water = np.asarray(Image.open(folder / "mask.png"))[..., 0] > 127
        drawn = lambda shapes, dtype="uint8": features.rasterize(shapes, out_shape=(SAMPLES, SAMPLES), transform=from_origin(tile.west, tile.north, SAMPLE_M, SAMPLE_M), dtype=dtype, all_touched=True)
        surface, centres, tiers = road_surface(folder, manifest)
        # A wall's distance from what it keeps clear of, by its 2 m cell: a cell touched by the shape is 0.
        self.road_clear_m = ndimage.distance_transform_edt(drawn((shape, 1) for shape in surface) == 0) * SAMPLE_M if surface else np.full((SAMPLES, SAMPLES), np.inf)
        self.building_clear_m = ndimage.distance_transform_edt(drawn((shape, 1) for shape in buildings) == 0) * SAMPLE_M if buildings else np.full((SAMPLES, SAMPLES), np.inf)
        self.fields = drawn((shape, 1) for shape in fields).astype(bool) if fields else np.zeros((SAMPLES, SAMPLES), bool)
        # A pair across the NaN between two chains isn't a section, and neither is one of no length.
        pairs = np.stack((centres[:-1], centres[1:]), axis=1) if len(centres) > 1 else np.zeros((0, 2, 2))
        drawable = np.isfinite(pairs).all(axis=(1, 2)) & (np.abs(pairs[:, 1] - pairs[:, 0]).sum(axis=1) > 0)
        lines = drawn(((LineString(pairs[index]), index + 1) for index in np.flatnonzero(drawable)), "int32") if drawable.any() else np.zeros((SAMPLES, SAMPLES), np.int32)
        distance, (rows, columns) = ndimage.distance_transform_edt(lines == 0, return_indices=True)
        self.road_m = distance * SAMPLE_M
        self.nearest = lines[rows, columns] - 1
        self.centres, self.tiers = centres, tiers

    def _read(self, image: np.ndarray, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        pixel = TILE_SIZE_M / image.shape[0]
        columns = np.floor((points[:, 0] - self.tile.west) / pixel).astype(int)
        rows = np.floor((self.tile.north - points[:, 1]) / pixel).astype(int)
        inside = (columns >= 0) & (columns < image.shape[1]) & (rows >= 0) & (rows < image.shape[0])
        return image[np.clip(rows, 0, image.shape[0] - 1), np.clip(columns, 0, image.shape[1] - 1)], inside

    def forest(self, points: np.ndarray) -> np.ndarray:
        height, inside = self._read(self.canopy, points)
        return inside & (height >= FOREST_M)

    def wet(self, points: np.ndarray) -> np.ndarray:
        wet, inside = self._read(self.water, points)
        return inside & wet

    def in_field(self, points: np.ndarray) -> np.ndarray:
        field, inside = self._read(self.fields, points)
        return inside & field

    def too_close(self, points: np.ndarray) -> np.ndarray:
        """Whether a wall here would stand on or by a road, or a building."""
        road, inside = self._read(self.road_clear_m, points)
        building, _ = self._read(self.building_clear_m, points)
        return inside & ((road < ROAD_GAP_M) | (building < BUILDING_GAP_M))

    def road(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Metres to the nearest road's centre line, and which section of it that is (-1 for none)."""
        metres, inside = self._read(self.road_m, points)
        section, _ = self._read(self.nearest, points)
        return np.where(inside, metres, np.inf), np.where(inside, section, -1)


def road_surface(folder: Path, manifest: dict) -> tuple[list[Polygon], np.ndarray, np.ndarray]:
    """The tile's laid roads, shoulders and aprons as shapes, then every section's centre and tier with a chain's
    last one repeated as NaN so no line joins two chains, all in ETRS metres: what a wall stops short of."""
    surface = manifest.get("roadSurface")
    if surface is None:
        return [], np.zeros((0, 2)), np.zeros(0, np.uint8)
    data = gzip.decompress((folder / surface["file"]).read_bytes())
    sections = sum(chain["sections"] for chain in surface["chains"])
    rings = np.frombuffer(data, "<f4", count=sections * 15).reshape(sections, 5, 3)[..., :2].astype(np.float64) + WORLD_ORIGIN
    tiers = np.frombuffer(data, "u1", count=sections, offset=sections * 15 * 4)
    shapes, centres, centre_tiers = [], [], []
    first = 0
    for chain in surface["chains"]:
        chain_rings = rings[first : first + chain["sections"]]
        shapes += [Polygon([a[0], a[4], b[4], b[0]]) for a, b in zip(chain_rings, chain_rings[1:])]
        centres += [*chain_rings[:, 2], (np.nan, np.nan)]
        centre_tiers += [*tiers[first : first + chain["sections"]], 0]
        first += chain["sections"]
    laid = read_paving(folder, manifest)
    points = laid.points[:, :2] + WORLD_ORIGIN
    shapes += [Polygon(points[triangle]) for triangle in laid.triangles]
    return shapes, np.array(centres), np.array(centre_tiers, np.uint8)


class Mapped:
    """OSM's walls, and the places left to the churches and landmarks, in ETRS metres."""

    def __init__(self, tile: Tile):
        roots = [ElementTree.parse(path).getroot() for path in osm_xml(tile)]
        nodes = {node.get("id"): lonlat_to_grid(float(node.get("lon")), float(node.get("lat"))) for root in roots for node in root.iter("node")}
        tags_of = lambda element: {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
        kept_here = lambda tags: any(tags.get(key) in values for key, values in KEPT_FOR_OTHERS.items())
        self.walls: list[LineString] = []
        kept: list[shapely.Geometry] = []
        seen = set()
        for root in roots:
            for way in root.iter("way"):
                if way.get("id") in seen:
                    continue
                seen.add(way.get("id"))
                tags = tags_of(way)
                points = [nodes[nd.get("ref")] for nd in way.findall("nd") if nd.get("ref") in nodes]
                if len(points) < 2:
                    continue
                if tags.get("barrier") == "wall":
                    self.walls.append(LineString(points))
                if kept_here(tags):
                    shape = Polygon(points) if len(points) >= 4 and points[0] == points[-1] else LineString(points)
                    kept.append(shapely.make_valid(shape).buffer(KEPT_MARGIN_M))
            for node in root.iter("node"):
                if node.find("tag") is not None and kept_here(tags_of(node)):
                    kept.append(Point(nodes[node.get("id")]).buffer(KEPT_MARGIN_M * 2))
        self.kept = unary_union(kept) if kept else Polygon()


def clear_parts(line: LineString, blocked) -> list[LineString]:
    """The parts of a line whose stations are all clear and that are long enough to be a wall."""
    points, _ = _stations(line, STATION_M)
    along = shapely.line_locate_point(line, shapely.points(points))
    clear = ~blocked(points)
    parts = []
    start = None
    for index, ok in enumerate([*clear, False]):
        if ok and start is None:
            start = index
        elif not ok and start is not None:
            if along[index - 1] - along[start] >= SHORTEST_WALL_M:
                parts.append(substring(line, along[start], along[index - 1]))
            start = None
    return parts


def kind_of(run: LineString, around: Surroundings) -> tuple[str, float]:
    """What lies beyond a run, by what most of its stations have either side, and its roll: a lane's from the road's
    stretch it runs beside, so both sides share it, and any other's from where the run's middle is."""
    points, ahead = _stations(run, READ_EVERY_M, ends=False)
    across = np.column_stack([-ahead[:, 1], ahead[:, 0]]) * BEYOND_M
    near = np.concatenate([points + across, points - across])
    in_field = around.in_field(near).reshape(2, -1)
    forest = around.forest(near).reshape(2, -1) & ~in_field
    road_m, section = around.road(points)
    lane = road_m < LANE_M
    kinds = np.where(lane, 0, np.where(in_field.all(axis=0), 1, np.where(forest.any(axis=0), 2, 3)))
    kind = int(np.bincount(kinds, minlength=4).argmax())
    if kind == 0:
        middle = section[lane][len(section[lane]) // 2]
        stretch = np.floor(np.array(around.centres[middle]) / LANE_STRETCH_M).astype(int)
        return f"lane {TIERS[around.tiers[middle]]}", roll(*stretch)
    middle = run.interpolate(0.5, normalized=True)
    return ("field", "forest", "open")[kind - 1], roll(round(middle.x), round(middle.y))


def place(tile: Tile, folder: Path, manifest: dict) -> tuple[list[tuple[LineString, str]], Counter]:
    """The tile's walls in ETRS metres, each with where it came from, and the metres of each kind of edge seen.
    `manifest` is the tile's, whose canopy, mask and road surface are already in its folder."""
    fields, buildings = read_topographic(tile)
    around = Surroundings(folder, manifest, tile, fields, buildings)
    mapped = Mapped(tile)
    box = shapely.box(tile.west, tile.south, tile.east, tile.north)
    shapely.prepare(mapped.kept)
    town = shapely.STRtree([building.centroid for building in buildings]) if buildings else None
    reach = [(0, 0)] + [(radius * math.cos(angle), radius * math.sin(angle)) for radius in (WATER_GAP_M / 2, WATER_GAP_M) for angle in np.arange(8) * math.pi / 4]

    def blocked(points: np.ndarray) -> np.ndarray:
        wet = np.any([around.wet(points + offset) for offset in reach], axis=0)
        return wet | around.too_close(points) | shapely.contains_xy(mapped.kept, points[:, 0], points[:, 1])

    walls: list[tuple[LineString, str]] = []
    seen = Counter()
    for line in mapped.walls:
        clipped = line.intersection(box)
        if clipped.is_empty or clipped.intersects(mapped.kept):
            continue
        if town is not None and len(town.query(clipped.centroid.buffer(TOWN_REACH_M))) >= TOWN_BUILDINGS:
            continue
        for part in getattr(clipped, "geoms", [clipped]):
            walls += [(wall, "mapped") for wall in clear_parts(part, blocked)]
    near_mapped = unary_union([wall for wall, _ in walls]).buffer(LANE_M) if walls else Polygon()

    for edge in field_edges(fields, tile):
        if not edge.intersects(box):
            continue
        for run in runs(edge):
            kind, chance = kind_of(run, around)
            inside = run.intersection(box)
            seen[kind] += inside.length
            if chance >= WALLED[kind]:
                continue
            for part in getattr(inside.difference(near_mapped), "geoms", [inside.difference(near_mapped)]):
                if part.geom_type == "LineString" and part.length >= SHORTEST_WALL_M:
                    walls += [(wall, kind) for wall in clear_parts(part, blocked)]
    return walls, seen


def write(walls: list[tuple[LineString, str]], folder: Path) -> dict:
    lines = [_to_scene(wall) for wall, _ in walls]
    (folder / FILE).write_text(json.dumps({**LICENCE, "walls": lines}, separators=(",", ":")), encoding="utf-8")
    lengths = Counter()
    for wall, kind in walls:
        lengths[kind] += wall.length
    return {"file": FILE, "count": len(lines), "lengthM": {kind: round(length) for kind, length in sorted(lengths.items())}, "line": ["x", "z"]}


def bake(tile: Tile, folder: Path, manifest: dict) -> dict:
    """Writes `walls.json` and returns its manifest."""
    walls, _ = place(tile, folder, manifest)
    return write(walls, folder)


def audit(tile: Tile, walls: list[tuple[LineString, str]], seen: Counter) -> dict:
    """How the rule meets OSM's walls in the country here: how many lie on a field's edge, how many the rule walls, and how much it puts where none is mapped."""
    mapped = Mapped(tile)
    box = shapely.box(tile.west, tile.south, tile.east, tile.north)
    country = [wall for wall, kind in walls if kind == "mapped"]
    ruled = unary_union([wall for wall, kind in walls if kind != "mapped"])
    fields, _ = read_topographic(tile)
    edges = unary_union([edge.intersection(box) for edge in field_edges(fields, tile)])
    near = lambda shape: shape.buffer(LANE_M) if not shape.is_empty else Polygon()
    return {
        "OSM walls": len(mapped.walls),
        "in the country, m": round(sum(line.length for line in country)),
        "on a field's edge, m": round(sum(line.intersection(near(edges)).length for line in country)),
        "walled by the rule, m": round(sum(line.intersection(near(ruled)).length for line in country)),
        "field edges, m": {kind: round(length) for kind, length in sorted(seen.items())},
        "rule, m": round(ruled.length),
        "rule with no OSM wall near, m": round(ruled.difference(near(unary_union(country))).length) if country else round(ruled.length),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--audit", action="store_true", help="measure the rule against OSM's mapped walls")
    arguments = parser.parse_args()
    for name in arguments.tiles:
        folder = arguments.folder / name
        tile = tile_from_name(name)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        walls, seen = place(tile, folder, manifest)
        listed = write(walls, folder)
        (folder / "tile.json").write_text(json.dumps({**manifest, "walls": listed}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(name, listed["count"], "walls", json.dumps(listed["lengthM"]))
        if arguments.audit:
            print("  audit", json.dumps(audit(tile, walls, seen)))


if __name__ == "__main__":
    main()

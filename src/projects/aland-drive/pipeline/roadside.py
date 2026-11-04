"""What stands beside the roads: lamps, power poles and their wires, signs, guard rails, edge posts, mailboxes and bus shelters.

Each tile gets a list per object, read off the road surface as it was laid, so
everything stands where the drawn road is, never where OSM's line is. OSM places
what it has (lamps, poles and minor power lines, give-way and stop signs, bus
stops, marked crossings, guard rails), and rules place the rest from the road
surface and OSM's road tags:

- lamps along roads OSM tags as lit, and a town's streets it doesn't tag, on one side;
- edge posts along unlit main roads, both sides;
- guard rails on embankments and either side of a bridge;
- a give-way sign where a lesser road meets a main one;
- a speed sign wherever OSM's limit changes along a road;
- mailboxes at the mouth of a country drive that leads to a house, outside a town.

Street furniture (benches, bins, bike racks, café terraces) and the seats on it
are `furniture.py`'s, placed in the same lists once these stand.
A built-up place's lesser streets get the town's post-top lamp, not the road's. The
town's things come from OSM where it maps them: traffic lights at its signal nodes,
a village's sign where a road comes into it, and street names at a town junction of
two named streets.

Traffic keeps right, so a sign stands on the right of the traffic it's for and faces
it. The list also holds the walls the car can't pass: poles, lamps, signal poles, rails
and shelters. A breakaway sign post, a street-name post, a village's wooden sign, an
edge post or a mailbox stops no car.

Run alone, it adds `roadside.json` to tiles already built, which needs no rebuild.
"""

import argparse
import gzip
import json
import math
import os
from dataclasses import dataclass
from functools import cached_property
from multiprocessing import get_context
from pathlib import Path

import numpy as np
import shapely

import furniture
from shapely.geometry import LineString, Point, Polygon

from grid import TILE_SIZE_M, WORLD_ORIGIN, Tile, lonlat_to_grid, neighbour, tile_at, tile_from_name, to_local
from roads import CLASSES
from progress import Progress
from sources import osm_path, osm_roadside_path
from vectors import FOOT_OR_BIKE, NOT_A_ROAD

FILE = "roadside.json"
RINGS = 5
OUTER_LEFT, EDGE_LEFT, CENTRE, EDGE_RIGHT, OUTER_RIGHT = range(RINGS)
APRON_FLOATS = 5
# Placed from OSM's objects as well as its roads, so the list is ODbL, as the roads are.
LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}

# Ranks (roads.CLASSES): 0 primary, 1 secondary, 2 tertiary, 3 unclassified and residential, 4 service, 5 track.
MAIN_RANK = 2
STREET_RANK = 3
# OSM's road under a section is the nearest way of the same kind within this.
TAG_REACH_M = 6.0
# What an object keeps clear of: any carriageway or apron, and buildings.
CLEAR_M = 0.4
BUILDING_CLEAR_M = 1.0

LAMP_SPACING_M = 32.0
LAMP_OUT_M = 1.2
# In town a sidewalk runs beside the kerb, so a lamp or a sign steps out past it, as far as this, to stand off the paving.
STEP_OUT_M = (1.5, 2.5, 3.5, 4.5, 5.5)
# A rule's lamp gives way to one OSM has mapped this near.
MAPPED_LAMP_M = 20.0
# A town's post-top lamp has no arm over the road: it stands at the kerb's back.
TOWN_LAMP_OUT_M = 0.7

# A signalled junction: OSM's signal nodes this near one another are one junction's, its own node and the crossings round it.
SIGNAL_CLUSTER_M = 40.0
# A road passing this near the junction's middle is one of its roads, and leaves it as an arm if it runs on this far.
SIGNAL_ARM_REACH_M = 12.0
SIGNAL_ARM_SHORTEST_M = 8.0
# Two arms leaving within this angle are one: a road drawn as two chains, or a chain ending on another.
SIGNAL_ARM_MERGE = math.cos(math.radians(30))
# Two arms this near opposite are one road's two ends, which go together; the crossing road waits half a cycle.
SIGNAL_SAME_ROAD = math.cos(math.radians(45))
# A head stands a crosswalk's width back from the crossing road's edge.
SIGNAL_CROSSWALK_M = 3.0
SIGNAL_BACK_MOST_M = 15.0

# A street-name post stands at one corner of a town junction of two named streets, this far back from the crossing street's edge.
NAME_BACK_M = 1.5
NAME_BACK_MOST_M = 10.0
NAME_OUT_M = 0.8
# A chain's end this near the crossing street's edge lands on it.
NAME_LANDING_M = 3.0
# One post a junction: a pair of names already given this near is the same junction.
NAME_JUNCTION_APART_M = 40.0

# A village's sign stands where a road comes this near its OSM node, on the right of the traffic coming in.
VILLAGE_REACH_M = {"village": 200.0, "hamlet": 150.0}
# The roads that lead into a village from elsewhere: a residential street is the village's own.
VILLAGE_ROADS = {"primary", "secondary", "tertiary", "unclassified"}
# The board is 2 m across the traffic, so its middle stands out far enough for its near post to clear the road.
VILLAGE_OUT_M = 2.4
VILLAGE_CLEAR_M = 1.3
VILLAGE_STEP_M = 4.0
VILLAGE_STEPS = 5
VILLAGE_SIGNS_APART_M = 60.0

POST_SPACING_M = 50.0
POST_OUT_M = 0.9
# An edge post keeps this clear of another road's carriageway, so none stands in a junction's mouth.
JUNCTION_CLEAR_M = 4.0
# And this clear of anything else placed beside the road: a rail, a sign, a mailbox, a shelter.
POST_CLEAR_M = 6.0

RAIL_OUT_M = 0.7
RAIL_SECTION_M = 4.0
# An embankment: the ground this far out from the carriageway's edge lies this far below it.
EMBANKMENT_PROBE_M = 9.0
EMBANKMENT_DROP_M = 2.5
EMBANKMENT_SHORTEST_M = 40.0
RAIL_GAP_JOINED_M = 25.0
RAIL_RUN_ON_M = 8.0
BRIDGE_APPROACH_M = 40.0
SHORTEST_RAIL_M = 12.0

SIGN_OUT_M = 1.0
# How far back from the road it meets a junction's sign stands at least, and at most.
SIGN_BACK_M = (4.0, 30.0)
SIGN_JUNCTION_CLEAR_M = 2.5
# Two posts this close are one: the later sign is left out.
SIGN_APART_M = 2.0
SPEEDS = (30, 40, 50, 60, 70, 80, 90, 100, 120)
# A speed change this near a road's end belongs to the junction, whose own signs aren't drawn.
SPEED_CHANGE_FROM_END_M = 30.0
# A limit read for less than this is a crossing road's, read where it crosses: a real zone runs far longer.
SHORTEST_LIMIT_M = 50.0
# A node this near a road's end is that junction's sign.
MAPPED_SIGN_M = 50.0
NOT_MARKED = {"no", "unmarked", "informal", "traffic_signals"}
BUS_STOP_REACH_M = 25.0
SHELTER_OUT_M = 3.2
SHELTER_ALONG_M = 4.0

# A drive's mouth: its end within this of the greater road's carriageway.
MOUTH_M = 8.0
HOUSE_NEAR_DRIVE_M = 60.0
# Built up: this many buildings within this of a drive's mouth. A town's post goes through the door.
BUILT_UP_BUILDINGS = 20
BUILT_UP_M = 120.0
MAILBOX_OUT_M = 1.6
MAILBOX_ALONG_M = (5.0, 7.0)
MAILBOX_APART_M = 0.45
MAILBOX_SHARE = 0.85
MAILBOX_COUNTS = ((1, 0.6), (2, 0.25), (3, 0.15))

# Minor power lines have a pole at every node; a longer gap is a node left out, and gets poles every so far.
POLE_SPAN_M = 70.0
LONGEST_WIRE_M = 120.0

# Collision squares, half a side, and a shelter's half-sizes.
POLE_HALF_M = 0.18
SHELTER_HALF_M = (1.8, 1.0)


@dataclass
class Chain:
    index: int
    kind: str
    rank: int
    motor: bool
    rings: np.ndarray  # (sections, RINGS, 3) of east, north, height.
    spans: list[tuple[int, int]]
    name: str = ""

    def __post_init__(self):
        centre = self.rings[:, CENTRE, :2]
        steps = np.hypot(*np.diff(centre, axis=0).T)
        self.along = np.concatenate(([0.0], np.cumsum(steps)))
        self.length = float(self.along[-1])
        self.line = LineString(centre) if len(centre) > 1 else None

    def section_at(self, along: float) -> tuple[int, float]:
        index = int(np.clip(np.searchsorted(self.along, along, side="right") - 1, 0, len(self.along) - 2))
        step = self.along[index + 1] - self.along[index]
        return index, 0.0 if step == 0 else (along - self.along[index]) / step

    def ring_at(self, along: float) -> np.ndarray:
        index, share = self.section_at(along)
        return self.rings[index] * (1 - share) + self.rings[index + 1] * share

    def direction_at(self, along: float) -> np.ndarray:
        index, _ = self.section_at(along)
        step = self.rings[index + 1, CENTRE, :2] - self.rings[index, CENTRE, :2]
        return step / max(float(np.hypot(*step)), 1e-6)

    def on_span(self, along: float, margin: float = 0.0) -> bool:
        return any(self.along[first] - margin <= along <= self.along[last] + margin for first, last in self.spans)


def side_name(side: int) -> tuple[int, int]:
    """A side's carriageway edge and shoulder's outer point in a ring: +1 is the right as the chain runs."""
    return (EDGE_RIGHT, OUTER_RIGHT) if side > 0 else (EDGE_LEFT, OUTER_LEFT)


class Heights:
    """The ground of any built tile, as drawn: bilinear between its 4 m nodes. A pole by a tile's edge reads its neighbour's."""

    def __init__(self, folder: Path):
        self.folder = folder
        self.grids: dict[str, tuple[np.ndarray, float] | None] = {}

    def _grid(self, east: float, north: float) -> tuple[np.ndarray, float] | None:
        name = tile_at(east + WORLD_ORIGIN[0], north + WORLD_ORIGIN[1]).name
        if name not in self.grids:
            path = self.folder / name / "tile.json"
            if not path.exists():
                self.grids[name] = None
            else:
                heights = json.loads(path.read_text(encoding="utf-8"))["heights"]
                deltas = np.frombuffer(gzip.decompress((self.folder / name / heights["file"]).read_bytes()), dtype="<i2").reshape(heights["nodes"], heights["nodes"])
                self.grids[name] = (np.cumsum(deltas.astype(np.int32), axis=1) * heights["unitM"], heights["stepM"])
        return self.grids[name]

    def at(self, east: float, north: float) -> float:
        """The ground at a point, or sea level off every built tile."""
        found = self._grid(east, north)
        if found is None:
            return 0.0
        grid, step = found
        west = math.floor(east / TILE_SIZE_M) * TILE_SIZE_M
        top = math.floor(north / TILE_SIZE_M) * TILE_SIZE_M + TILE_SIZE_M
        last = grid.shape[0] - 1.0001
        column, row = min((east - west) / step, last), min((top - north) / step, last)
        c, r = int(column), int(row)
        fc, fr = column - c, row - r
        return float(grid[r, c] * (1 - fc) * (1 - fr) + grid[r, c + 1] * fc * (1 - fr) + grid[r + 1, c] * (1 - fc) * fr + grid[r + 1, c + 1] * fc * fr)


def read_surface(folder: Path, manifest: dict) -> tuple[list[Chain], list[Polygon]]:
    surface = manifest["roadSurface"]
    sections = sum(chain["sections"] for chain in surface["chains"])
    data = gzip.decompress((folder / surface["file"]).read_bytes())
    rings = np.frombuffer(data, dtype="<f4", count=sections * RINGS * 3).reshape(sections, RINGS, 3).astype(np.float64)
    chains = []
    first = 0
    for index, chain in enumerate(surface["chains"]):
        kind = chain["kind"]
        rank = CLASSES[kind].rank if kind in CLASSES else 6
        chains.append(Chain(index, kind, rank, chain["motor"], rings[first : first + chain["sections"]], [tuple(span) for span in chain.get("spans", [])], chain.get("name") or ""))
        first += chain["sections"]
    aprons = surface["aprons"]
    start = sections * RINGS * 12 + sections
    points = np.frombuffer(data, dtype="<f4", count=aprons["points"] * APRON_FLOATS, offset=start).reshape(-1, APRON_FLOATS)
    triangles = np.frombuffer(data, dtype="<u4", count=aprons["triangles"] * 3, offset=start + points.nbytes).reshape(-1, 3)
    return [chain for chain in chains if len(chain.rings) > 1], [Polygon(points[triangle, :2]) for triangle in triangles]


class Paved:
    """Every carriageway and apron as small polygons, each knowing its chain (-1 for an apron)."""

    def __init__(self, chains: list[Chain], aprons: list[Polygon]):
        shapes, owners = [], []
        for chain in chains:
            left, right = chain.rings[:, EDGE_LEFT, :2], chain.rings[:, EDGE_RIGHT, :2]
            for index in range(len(left) - 1):
                quad = Polygon([left[index], left[index + 1], right[index + 1], right[index]])
                if quad.is_valid and quad.area > 0:
                    shapes.append(quad)
                    owners.append(chain.index)
        for apron in aprons:
            if apron.is_valid and apron.area > 0:
                shapes.append(apron)
                owners.append(-1)
        self.shapes = shapes
        self.owners = np.array(owners)
        self.tree = shapely.STRtree(shapes)

    def clear(self, point: np.ndarray, metres: float, besides: int | None = None) -> bool:
        """Nothing paved within `metres`, leaving out one chain's own carriageway."""
        near = self.tree.query(Point(point), predicate="dwithin", distance=metres)
        return not any(self.owners[index] != besides for index in near) if besides is not None else len(near) == 0


class Ways:
    """OSM's tags under a point of a motor road, from the nearest way a car can use: a chain runs on through ways of lesser kinds."""

    def __init__(self, osm_file: Path):
        osm = json.loads(osm_file.read_text(encoding="utf-8"))
        self.lines, self.tags = [], []
        for element in osm["elements"]:
            tags = element.get("tags", {})
            if element["type"] != "way" or tags.get("highway", "path") in FOOT_OR_BIKE | NOT_A_ROAD or len(element["geometry"]) < 2:
                continue
            east, north = lonlat_to_grid([point["lon"] for point in element["geometry"]], [point["lat"] for point in element["geometry"]])
            self.lines.append(LineString(np.column_stack(to_local(np.array(east), np.array(north)))))
            self.tags.append(tags)
        self.tree = shapely.STRtree(self.lines)

    def at(self, point: np.ndarray) -> dict:
        at = Point(point)
        best, found = TAG_REACH_M, {}
        for index in self.tree.query(at, predicate="dwithin", distance=TAG_REACH_M):
            distance = self.lines[index].distance(at)
            if distance < best:
                best, found = distance, self.tags[index]
        return found


def speed_of(tags: dict) -> int | None:
    value = tags.get("maxspeed", "")
    return int(value) if value.isdigit() and int(value) in SPEEDS else None


def roll(*keys: float) -> float:
    """A repeatable share from 0 to 1 for a place, so a rebuild places the same."""
    value = math.sin(sum(key * factor for key, factor in zip(keys, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return value - math.floor(value)


def pick(share: float, choices: tuple) -> int:
    for value, chance in choices:
        share -= chance
        if share < 0:
            return value
    return choices[0][0]


def facing(east: float, north: float) -> float:
    """The yaw that turns a model's +z to a way on the ground (the scene's z is south)."""
    return math.atan2(east, -north)


def along_yaw(east: float, north: float) -> float:
    """The yaw that lays a model's +x along a way on the ground."""
    return math.atan2(north, east)


class Roadside:
    def __init__(self, tile: Tile, folder: Path, tiles: Path):
        self.tile = tile
        self.manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        bounds = self.manifest["bounds"]
        self.box = (bounds["west"], bounds["south"], bounds["east"], bounds["north"])
        self.heights = Heights(tiles)
        self.chains, aprons = read_surface(folder, self.manifest) if "roadSurface" in self.manifest else ([], [])
        self.paved = Paved(self.chains, aprons)
        self.ways = Ways(osm_path(tile))
        # A tile built with no vectors, as the edge checks build, has no buildings and no roads.
        buildings = json.loads((folder / "buildings.json").read_text(encoding="utf-8"))["buildings"] if (folder / "buildings.json").exists() else []
        self.buildings = [Polygon(building["ring"]) for building in buildings if len(building["ring"]) >= 4]
        self.building_tree = shapely.STRtree(self.buildings)
        self.osm = json.loads(osm_roadside_path(tile).read_text(encoding="utf-8"))
        self.models: dict[str, list[list[float]]] = {}
        self.signs: dict[str, list[list[float]]] = {}
        self.wires: list[list[float]] = []
        self.walls: list[list[float]] = []
        self.posts: list[np.ndarray] = []
        self.town_signs()

    def town_signs(self) -> None:
        """What the town's things carry beyond a place, each in the order of its model's places."""
        self.signal_phases: list[float] = []
        self.street_names: list[list] = []
        self.village_names: list[str] = []
        self.signalled: list[np.ndarray] = []

    # Places

    def inside(self, point: np.ndarray) -> bool:
        west, south, east, north = self.box
        return west <= point[0] < east and south <= point[1] < north

    def free(self, point: np.ndarray, paved_m: float = CLEAR_M, besides: int | None = None) -> bool:
        if not self.inside(point) or not self.paved.clear(point, paved_m, besides):
            return False
        return len(self.building_tree.query(Point(point), predicate="dwithin", distance=BUILDING_CLEAR_M)) == 0

    def beside(self, chain: Chain, along: float, side: int, out_m: float) -> tuple[np.ndarray, float, np.ndarray]:
        """A point `out_m` past a side's carriageway edge, the height of what's drawn there, and the way out from the road."""
        ring = chain.ring_at(along)
        edge_index, outer_index = side_name(side)
        edge, outer = ring[edge_index], ring[outer_index]
        out = outer[:2] - edge[:2]
        shoulder = float(np.hypot(*out))
        if shoulder < 0.05:
            out = (edge[:2] - ring[CENTRE, :2]) / max(float(np.hypot(*(edge[:2] - ring[CENTRE, :2]))), 1e-6)
            shoulder = 0.0
        else:
            out = out / shoulder
        point = edge[:2] + out * out_m
        height = edge[2] + (outer[2] - edge[2]) * out_m / shoulder if out_m <= shoulder else self.heights.at(*point)
        return point, float(height), out

    def standing(self, chain: Chain, along: float, side: int, out_m: float, clear_m: float = CLEAR_M) -> tuple[np.ndarray, float, np.ndarray] | None:
        """The first spot off the paving, `out_m` past the carriageway's edge or stepping out past a sidewalk."""
        for out in (out_m, *(step for step in STEP_OUT_M if step > out_m)):
            spot = self.beside(chain, along, side, out)
            if self.free(spot[0], clear_m, besides=chain.index):
                return spot
        return None

    def place(self, model: str, point: np.ndarray, height: float, yaw: float, stretch: float = 1.0, shear: float = 0.0) -> None:
        self.models.setdefault(model, []).append([round(float(point[0]), 2), round(height, 2), round(float(-point[1]), 2), round(yaw, 4), round(stretch, 3), round(shear, 4)])

    def sign(self, name: str, point: np.ndarray, height: float, face: np.ndarray) -> bool:
        if any(np.hypot(*(point - post)) < SIGN_APART_M for post in self.posts):
            return False
        self.posts.append(point)
        self.signs.setdefault(name, []).append([round(float(point[0]), 2), round(height, 2), round(float(-point[1]), 2), round(facing(*face), 4)])
        return True

    def wall_ring(self, centre: np.ndarray, half: tuple[float, float], yaw: float) -> None:
        """A rectangle the car can't pass, `yaw` laying its first half along the model's +x."""
        along = np.array([math.cos(yaw), math.sin(yaw)])
        across = np.array([-along[1], along[0]])
        corners = [centre + along * a * half[0] + across * b * half[1] for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for first, second in zip(corners, corners[1:] + corners[:1]):
            self.wall(first, second)

    def wall(self, first: np.ndarray, second: np.ndarray) -> None:
        self.walls.append([round(float(first[0]), 2), round(float(-first[1]), 2), round(float(second[0]), 2), round(float(-second[1]), 2)])

    def nearest_road(self, point: np.ndarray, reach: float, most_rank: int = 4) -> tuple[Chain, float, int] | None:
        """The nearest motor road's chain, how far along it, and which side of it the point lies."""
        best = None
        at = Point(point)
        for chain in self.chains:
            if not chain.motor or chain.rank > most_rank or chain.line is None:
                continue
            distance = chain.line.distance(at)
            if distance < reach and (best is None or distance < best[0]):
                best = (distance, chain)
        if best is None:
            return None
        chain = best[1]
        along = chain.line.project(at)
        direction = chain.direction_at(along)
        offset = point - np.array(chain.line.interpolate(along).coords[0])
        return chain, along, 1 if direction[0] * offset[1] - direction[1] * offset[0] < 0 else -1

    def walk(self, chain: Chain, spacing: float, start: float):
        along = start
        while along < chain.length:
            yield along
            along += spacing

    def built_up(self, point: np.ndarray) -> bool:
        return len(self.building_tree.query(Point(point), predicate="dwithin", distance=BUILT_UP_M)) >= BUILT_UP_BUILDINGS

    def lit(self, chain: Chain, along: float) -> bool:
        """OSM's word, and a town's street where it has none: OSM leaves most of Mariehamn's untagged."""
        centre = chain.ring_at(along)[CENTRE, :2]
        tagged = self.ways.at(centre).get("lit")
        return tagged == "yes" or tagged is None and self.built_up(centre)

    # Rules

    def lamps(self) -> None:
        mapped = []
        for element in self.osm["elements"]:
            if element["type"] == "node" and element["tags"].get("highway") == "street_lamp":
                point = self.local(element)
                mapped.append(point)
                road = self.nearest_road(point, 30.0, STREET_RANK)
                if road is None:
                    if self.free(point):
                        self.lamp(point, self.heights.at(*point), roll(*point) * 2 * math.pi, self.built_up(point))
                    continue
                chain, along, side = road
                town = self.town_street(chain, point)
                out_m = TOWN_LAMP_OUT_M if town else LAMP_OUT_M
                ring = chain.ring_at(along)
                edge = ring[side_name(side)[0], :2]
                if np.hypot(*(point - ring[CENTRE, :2])) < np.hypot(*(edge - ring[CENTRE, :2])) + out_m:
                    point, height, out = self.beside(chain, along, side, out_m)
                else:
                    height, out = self.heights.at(*point), (point - ring[CENTRE, :2]) / np.hypot(*(point - ring[CENTRE, :2]))
                if self.free(point):
                    self.lamp(point, height, facing(*-out), town)
        for chain in self.chains:
            if not chain.motor or chain.rank > STREET_RANK:
                continue
            side = 1 if roll(chain.rings[0, CENTRE, 0], chain.rings[0, CENTRE, 1]) < 0.5 else -1
            for along in self.walk(chain, LAMP_SPACING_M, LAMP_SPACING_M / 3):
                if chain.on_span(along, 2.0) or not self.lit(chain, along):
                    continue
                town = self.town_street(chain, chain.ring_at(along)[CENTRE, :2])
                spot = self.standing(chain, along, side, TOWN_LAMP_OUT_M if town else LAMP_OUT_M)
                if spot is None or any(np.hypot(*(spot[0] - lamp)) < MAPPED_LAMP_M for lamp in mapped):
                    continue
                point, height, out = spot
                self.lamp(point, height, facing(*-out), town)

    def town_street(self, chain: Chain, point: np.ndarray) -> bool:
        """A built-up place's lesser street, whose lamps are the town's post-tops: a main road keeps its lamps' arms over the road."""
        return chain.rank > MAIN_RANK and self.built_up(point)

    def lamp(self, point: np.ndarray, height: float, yaw: float, town: bool = False) -> None:
        self.place("town-lamp" if town else "lamp", point, height, yaw)
        self.wall_ring(point, (POLE_HALF_M, POLE_HALF_M), 0.0)

    def local(self, element: dict) -> np.ndarray:
        east, north = lonlat_to_grid([element["lon"]], [element["lat"]])
        return np.array(to_local(east[0], north[0]))

    def power(self) -> None:
        on_lines = set()
        for element in self.osm["elements"]:
            if element["type"] != "way" or element["tags"].get("power") != "minor_line":
                continue
            east, north = lonlat_to_grid([point["lon"] for point in element["geometry"]], [point["lat"] for point in element["geometry"]])
            nodes = np.column_stack(to_local(np.array(east), np.array(north)))
            on_lines.update((round(float(e), 1), round(float(n), 1)) for e, n in nodes)
            poles = [nodes[0]]
            for first, second in zip(nodes, nodes[1:]):
                gap = float(np.hypot(*(second - first)))
                extra = max(0, math.ceil(gap / POLE_SPAN_M) - 1)
                poles += [first + (second - first) * (step + 1) / (extra + 1) for step in range(extra)] + [second]
            poles = np.array(poles)
            standing = []
            for index, point in enumerate(poles):
                way_in = point - poles[max(index - 1, 0)]
                way_out = poles[min(index + 1, len(poles) - 1)] - point
                ways = [way / np.hypot(*way) for way in (way_in, way_out) if np.hypot(*way) > 0.01]
                through = sum(ways) if ways else np.array([1.0, 0.0])
                yaw = along_yaw(*through) if np.hypot(*through) > 1e-6 else along_yaw(*ways[0])
                # Off this tile a pole is the neighbour's to place, but its wire may still be this tile's.
                clear = self.paved.clear(point, CLEAR_M + POLE_HALF_M) and len(self.building_tree.query(Point(point), predicate="dwithin", distance=BUILDING_CLEAR_M)) == 0
                standing.append((point, self.heights.at(*point), yaw, clear))
                if clear and self.inside(point):
                    self.place("pole", point, standing[-1][1], yaw)
                    self.wall_ring(point, (POLE_HALF_M, POLE_HALF_M), yaw)
            for (a, ay, ayaw, aclear), (b, by, byaw, bclear) in zip(standing, standing[1:]):
                if aclear and bclear and np.hypot(*(b - a)) <= LONGEST_WIRE_M and self.inside((a + b) / 2):
                    self.wires.append([round(float(a[0]), 2), round(ay, 2), round(float(-a[1]), 2), round(ayaw, 4), round(float(b[0]), 2), round(by, 2), round(float(-b[1]), 2), round(byaw, 4)])
        for element in self.osm["elements"]:
            if element["type"] == "node" and element["tags"].get("power") == "pole":
                point = self.local(element)
                if (round(float(point[0]), 1), round(float(point[1]), 1)) in on_lines or not self.free(point, CLEAR_M + POLE_HALF_M):
                    continue
                road = self.nearest_road(point, 40.0)
                yaw = along_yaw(*road[0].direction_at(road[1])) if road else roll(*point) * math.pi
                self.place("pole", point, self.heights.at(*point), yaw)
                self.wall_ring(point, (POLE_HALF_M, POLE_HALF_M), yaw)

    def rails(self) -> None:
        for element in self.osm["elements"]:
            if element["type"] == "way" and element["tags"].get("barrier") == "guard_rail" and len(element["geometry"]) > 1:
                east, north = lonlat_to_grid([point["lon"] for point in element["geometry"]], [point["lat"] for point in element["geometry"]])
                line = np.column_stack(to_local(np.array(east), np.array(north)))
                road = self.nearest_road(line[len(line) // 2], 30.0)
                middle = np.array(road[0].line.interpolate(road[1]).coords[0]) if road else line.mean(axis=0)
                self.rail_run([(point, self.heights.at(*point)) for point in densify(line, RAIL_SECTION_M)], middle)
        for chain in self.chains:
            if not chain.motor or chain.rank > STREET_RANK:
                continue
            for side in (1, -1):
                ranges = [(chain.along[first] - BRIDGE_APPROACH_M, chain.along[first]) for first, _ in chain.spans]
                ranges += [(chain.along[last], chain.along[last] + BRIDGE_APPROACH_M) for _, last in chain.spans]
                ranges += self.embankments(chain, side)
                for start, end in merged(ranges, 0.0):
                    self.rail_along(chain, side, max(start, 0.0), min(end, chain.length))

    def embankments(self, chain: Chain, side: int) -> list[tuple[float, float]]:
        steep = []
        for index, ring in enumerate(chain.rings):
            if chain.on_span(chain.along[index], 1.0):
                continue
            edge, outer = ring[side_name(side)[0]], ring[side_name(side)[1]]
            out = outer[:2] - edge[:2]
            if np.hypot(*out) < 0.05:
                continue
            probe = edge[:2] + out / np.hypot(*out) * EMBANKMENT_PROBE_M
            if self.inside(probe) and edge[2] - self.heights.at(*probe) >= EMBANKMENT_DROP_M:
                steep.append((chain.along[index], chain.along[index]))
        runs = merged(steep, RAIL_GAP_JOINED_M)
        return [(start - RAIL_RUN_ON_M, end + RAIL_RUN_ON_M) for start, end in runs if end - start >= EMBANKMENT_SHORTEST_M]

    def rail_along(self, chain: Chain, side: int, start: float, end: float) -> None:
        """A run beside a chain, broken where another road comes in and left off over a bridge, whose own parapet is there."""
        run: list[tuple[np.ndarray, float]] = []
        middle = chain.ring_at((start + end) / 2)[CENTRE, :2]
        for along in np.arange(start, end + 0.01, 2.0):
            point, height, _ = self.beside(chain, float(along), side, RAIL_OUT_M)
            if chain.on_span(float(along)) or not self.free(point, CLEAR_M, besides=chain.index):
                self.rail_run(run, middle)
                run = []
            else:
                run.append((point, height))
        self.rail_run(run, middle)

    def rail_run(self, run: list[tuple[np.ndarray, float]], road: np.ndarray) -> None:
        if len(run) < 2 or sum(float(np.hypot(*(b[0] - a[0]))) for a, b in zip(run, run[1:])) < SHORTEST_RAIL_M:
            return
        points = np.array([point for point, _ in run])
        heights = np.array([height for _, height in run])
        stops = resample(points, heights, RAIL_SECTION_M)
        first, second = stops[0][0], stops[1][0]
        way = second - first
        # The model's road side is its +z, which is the run's right: so it runs with the road on that side.
        if (road - first) @ np.array([way[1], -way[0]]) < 0:
            stops = stops[::-1]
        for (a, ay), (b, by) in zip(stops, stops[1:]):
            chord = float(np.hypot(*(b - a)))
            if chord < 0.1:
                continue
            yaw = along_yaw(*(b - a))
            self.place("rail", a, ay, yaw, chord / RAIL_SECTION_M, (by - ay) / chord)
            self.wall(a, b)
        (a, ay), (b, _) = stops[0], stops[1]
        self.place("rail-end", a, ay, along_yaw(*(b - a)), -1.0)
        (a, _), (b, by) = stops[-2], stops[-1]
        self.place("rail-end", b, by, along_yaw(*(b - a)))

    def edge_posts(self, others: list[np.ndarray]) -> None:
        others_tree = shapely.STRtree([Point(point) for point in others]) if others else None
        for chain in self.chains:
            if not chain.motor or chain.rank > MAIN_RANK:
                continue
            for along in self.walk(chain, POST_SPACING_M, POST_SPACING_M / 2):
                if chain.on_span(along, BRIDGE_APPROACH_M) or self.lit(chain, along) or (speed_of(self.ways.at(chain.ring_at(along)[CENTRE, :2])) or 80) < 60:
                    continue
                direction = chain.direction_at(along)
                for side in (1, -1):
                    point, height, _ = self.beside(chain, along, side, POST_OUT_M)
                    if others_tree is not None and len(others_tree.query(Point(point), predicate="dwithin", distance=POST_CLEAR_M)) > 0:
                        continue
                    if self.free(point, besides=chain.index) and self.paved.clear(point, JUNCTION_CLEAR_M, besides=chain.index):
                        # Its reflectors face the traffic coming towards it, which keeps right.
                        self.place("reflector-post", point, height, facing(*(-direction * side)))

    def landings(self) -> list[tuple[Chain, float, int, Chain]]:
        """Where a lesser road's end meets a greater one: the lesser chain, the end's along, which way traffic runs to it, the greater chain."""
        found = []
        for chain in self.chains:
            if not chain.motor or chain.rank > 5:
                continue
            for along, towards in ((0.0, -1), (chain.length, 1)):
                end = chain.ring_at(along)[CENTRE, :2]
                best = None
                for other in self.chains:
                    if not other.motor or other.rank >= chain.rank or other.line is None:
                        continue
                    distance = other.line.distance(Point(end))
                    ring = other.ring_at(other.line.project(Point(end)))
                    half = float(np.hypot(*(ring[EDGE_RIGHT, :2] - ring[EDGE_LEFT, :2]))) / 2
                    if distance < half + MOUTH_M and (best is None or other.rank < best.rank):
                        best = other
                if best is not None and other_than_seam(end, self.box):
                    found.append((chain, along, towards, best))
        return found

    @cached_property
    def mapped_signs(self) -> list[tuple[np.ndarray, str]]:
        return [(self.local(element), "stop" if element["tags"]["highway"] == "stop" else "give-way") for element in self.osm["elements"] if element["type"] == "node" and element["tags"].get("highway") in ("give_way", "stop")]

    def junction_sign(self, chain: Chain, along: float, greater: Chain) -> str | None:
        """The sign a lesser road's end has where it meets a greater one, "stop" or "give-way", or None. The lane map's right of way
        reads the same, so what traffic does can't disagree with what a player sees."""
        end = chain.ring_at(along)[CENTRE, :2]
        nodes = [kind for point, kind in self.mapped_signs if np.hypot(*(point - end)) < MAPPED_SIGN_M]
        by_rule = greater.rank <= MAIN_RANK and 1 <= chain.rank <= STREET_RANK
        if not nodes and not by_rule or self.near_signals(end):
            return None
        return "stop" if "stop" in nodes else "give-way"

    def junction_signs(self, landings: list) -> None:
        for chain, along, towards, greater in landings:
            name = self.junction_sign(chain, along, greater)
            if name is None:
                continue
            # Traffic heading for the end keeps right: the chain's right side if it runs to the last section, its left if to the first.
            side, travel = (1, chain.direction_at(along)) if towards > 0 else (-1, -chain.direction_at(along))
            back = SIGN_BACK_M[0]
            while back <= min(SIGN_BACK_M[1], chain.length):
                at = along - back * towards
                point, height, _ = self.beside(chain, at, side, SIGN_OUT_M)
                if self.free(point, SIGN_JUNCTION_CLEAR_M, besides=chain.index):
                    self.sign(name, point, height, -travel)
                    break
                back += 2.0

    def speed_signs(self) -> None:
        for chain in self.chains:
            if not chain.motor or chain.rank > STREET_RANK:
                continue
            speeds = [speed_of(self.ways.at(ring[CENTRE, :2])) for ring in chain.rings]
            known = limit_changes(chain.along, speeds)
            for (_, before), (index, after) in zip(known, known[1:]):
                along = float(chain.along[index])
                if before == after or along < SPEED_CHANGE_FROM_END_M or along > chain.length - SPEED_CHANGE_FROM_END_M:
                    continue
                direction = chain.direction_at(along)
                for side, speed, travel in ((1, after, direction), (-1, before, -direction)):
                    spot = self.standing(chain, along, side, SIGN_OUT_M, SIGN_JUNCTION_CLEAR_M)
                    if spot is not None:
                        self.sign(f"speed-{speed}", spot[0], spot[1], -travel)

    def stops_and_crossings(self) -> None:
        for element in self.osm["elements"]:
            highway = element["tags"].get("highway") if element["type"] == "node" else None
            if highway == "bus_stop":
                point = self.local(element)
                road = self.nearest_road(point, BUS_STOP_REACH_M)
                if road is None or not self.inside(point):
                    continue
                chain, along, side = road
                travel = chain.direction_at(along) * side
                spot = self.standing(chain, along, side, SIGN_OUT_M)
                if spot is not None:
                    self.sign("bus-stop", spot[0], spot[1], -travel)
                if element["tags"].get("shelter") == "yes":
                    shelter, height, out = self.beside(chain, min(along + SHELTER_ALONG_M * side, chain.length), side, SHELTER_OUT_M)
                    if self.free(shelter, CLEAR_M + SHELTER_HALF_M[1], besides=chain.index):
                        self.place("bus-shelter", shelter, height, facing(*-out))
                        self.wall_ring(shelter, SHELTER_HALF_M, along_yaw(*out) + math.pi / 2)
            elif highway == "crossing" and element["tags"].get("crossing", "") not in NOT_MARKED:
                point = self.local(element)
                road = self.nearest_road(point, 2.0, STREET_RANK)
                if road is None or not self.inside(point):
                    continue
                chain, along, _ = road
                direction = chain.direction_at(along)
                for side in (1, -1):
                    spot = self.standing(chain, along, side, SIGN_OUT_M)
                    if spot is not None:
                        self.sign("pedestrian-crossing", spot[0], spot[1], -direction * side)

    # The town's things

    def taken(self, point: np.ndarray, metres: float = SIGN_APART_M) -> bool:
        """A post, a lamp or a pole already stands this near."""
        if any(np.hypot(*(point - post)) < metres for post in self.posts):
            return True
        return any(math.hypot(place[0] - point[0], -place[2] - point[1]) < metres for name in ("lamp", "town-lamp", "pole") for place in self.models.get(name, []))

    def near_signals(self, point: np.ndarray) -> bool:
        return any(np.hypot(*(point - centre)) < SIGNAL_CLUSTER_M for centre in self.signalled)

    def signals(self) -> None:
        for centre in self.signal_centres():
            self.signal_junction(centre)

    def signal_centres(self) -> list[np.ndarray]:
        """OSM's signal nodes, a junction's grouped: its own node and the signalled crossings round it. A fire station's signals stay dark, so they get none."""
        nodes = []
        for element in self.osm["elements"]:
            tags = element["tags"] if element["type"] == "node" else {}
            signalled = tags.get("highway") == "traffic_signals" or tags.get("highway") == "crossing" and tags.get("crossing") == "traffic_signals"
            if signalled and tags.get("traffic_signals") != "emergency":
                nodes.append((self.local(element), tags.get("highway") == "traffic_signals"))
        groups: list[list[tuple[np.ndarray, bool]]] = []
        for node in nodes:
            joined = [group for group in groups if any(np.hypot(*(node[0] - other)) < SIGNAL_CLUSTER_M for other, _ in group)]
            groups = [group for group in groups if not any(group is other for other in joined)] + [[node, *(member for group in joined for member in group)]]
        return [np.mean([point for point, own in group if own] or [point for point, _ in group], axis=0) for group in groups]

    def arms(self, centre: np.ndarray) -> list[tuple[Chain, float, int, np.ndarray]]:
        """The roads leaving a junction: each one's chain, how far along it the junction is, which way along it the arm runs, and its way out on the ground."""
        found: list[tuple[Chain, float, int, np.ndarray]] = []
        for chain in sorted(self.chains, key=lambda chain: chain.rank):
            if not chain.motor or chain.rank > STREET_RANK or chain.line is None or chain.line.distance(Point(centre)) > SIGNAL_ARM_REACH_M:
                continue
            at = chain.line.project(Point(centre))
            for way in (1, -1):
                if (chain.length - at if way > 0 else at) < SIGNAL_ARM_SHORTEST_M:
                    continue
                out = chain.ring_at(at + way * SIGNAL_ARM_SHORTEST_M)[CENTRE, :2] - chain.ring_at(at)[CENTRE, :2]
                out = out / max(float(np.hypot(*out)), 1e-6)
                if all(out @ other[3] < SIGNAL_ARM_MERGE for other in found):
                    found.append((chain, at, way, out))
        return found

    def signal_junction(self, centre: np.ndarray) -> None:
        """A head on each arm, on the right of the traffic coming in and facing it, a crosswalk back from the crossing road.
        A road's two arms share a start in the cycle and the crossing road takes the other half; a crossing on one road is that road's two arms."""
        arms = self.arms(centre)
        if not arms:
            return
        self.signalled.append(centre)
        start = roll(*centre, 5.3)
        for chain, at, way, out in arms:
            crossing = [other for other in arms if abs(other[3] @ out) < SIGNAL_SAME_ROAD]
            half = max((carriageway_half(other[0], other[1]) for other in crossing), default=0.0)
            # Traffic coming in runs against the arm: with the chain if the arm runs back along it, so its right is the chain's right.
            side = -way
            back = half + SIGNAL_CROSSWALK_M
            while back <= half + SIGNAL_BACK_MOST_M:
                along = at + way * back
                if not 0.0 <= along <= chain.length:
                    break
                spot = self.standing(chain, along, side, SIGN_OUT_M)
                if spot is not None and not self.taken(spot[0]):
                    point, height, _ = spot
                    self.place("traffic-light", point, height, facing(*(chain.direction_at(along) * way)))
                    self.signal_phases.append(round((start + (0.0 if abs(out @ arms[0][3]) > SIGNAL_SAME_ROAD else 0.5)) % 1.0, 3))
                    self.wall_ring(point, (POLE_HALF_M, POLE_HALF_M), 0.0)
                    self.posts.append(point)
                    break
                back += 1.5

    def name_posts(self) -> None:
        """A post at one corner of each town junction of two named streets, a blade along each. Real towns name a junction once, not at every corner."""
        named = [chain for chain in self.chains if chain.motor and chain.rank <= STREET_RANK and chain.name and chain.line is not None]
        if not named:
            return
        tree = shapely.STRtree([chain.line for chain in named])
        given: list[tuple[frozenset, np.ndarray]] = []
        for chain in named:
            for index in tree.query(chain.line, predicate="dwithin", distance=NAME_LANDING_M + 6.0):
                other = named[index]
                if other.name == chain.name:
                    continue
                for junction, along, towards in self.meetings(chain, other):
                    pair = frozenset((chain.name, other.name))
                    if not other_than_seam(junction, self.box) or not self.built_up(junction) or any(names == pair and np.hypot(*(junction - at)) < NAME_JUNCTION_APART_M for names, at in given):
                        continue
                    if self.name_post(chain, along, towards, other, junction):
                        given.append((pair, junction))

    def meetings(self, chain: Chain, other: Chain) -> list[tuple[np.ndarray, float, int]]:
        """Where a chain meets another: each place, how far along the chain, and which way along it traffic comes to it.
        A chain ending on the other comes to it from its own side; one crossing it, from the side with room for a post."""
        found = []
        for along, towards in ((0.0, -1), (chain.length, 1)):
            end = chain.ring_at(along)[CENTRE, :2]
            if other.line.distance(Point(end)) <= carriageway_half(other, other.line.project(Point(end))) + NAME_LANDING_M:
                found.append((end, along, towards))
        crossing = chain.line.intersection(other.line)
        for point in shapely.get_parts(crossing):
            if point.geom_type != "Point":
                continue
            along = chain.line.project(point)
            if min(along, chain.length - along) > NAME_BACK_MOST_M:
                found.append((np.array(point.coords[0]), along, 1))
        return found

    def name_post(self, chain: Chain, along: float, towards: int, other: Chain, junction: np.ndarray) -> bool:
        """The post on the corner left of the traffic coming along `chain`, where no junction sign of its own stands, a blade along each street."""
        reach = carriageway_half(other, other.line.project(Point(junction)))
        back = max(0.0, reach - float(other.line.distance(Point(chain.ring_at(along)[CENTRE, :2])))) + NAME_BACK_M
        while back <= NAME_BACK_MOST_M + reach:
            at = along - towards * back
            if not 0.0 <= at <= chain.length:
                return False
            spot = self.standing(chain, at, -towards, NAME_OUT_M)
            if spot is not None and not self.taken(spot[0]):
                point, height, _ = spot
                across = other.direction_at(other.line.project(Point(junction)))
                across = across if across @ (point - junction) > 0 else -across
                self.place("name-post", point, height, 0.0)
                self.street_names.append([round(along_yaw(*(-towards * chain.direction_at(at))), 4), chain.name, round(along_yaw(*across), 4), other.name])
                self.posts.append(point)
                return True
            back += 1.0
        return False

    def villages(self) -> None:
        """A village's sign where each road leading in comes within its reach of OSM's node, on the right of the traffic coming in and facing it."""
        for element in self.osm["elements"]:
            tags = element["tags"] if element["type"] == "node" else {}
            if tags.get("place") not in VILLAGE_REACH_M or not tags.get("name"):
                continue
            centre = self.local(element)
            boundary = Point(centre).buffer(VILLAGE_REACH_M[tags["place"]]).exterior
            placed: list[np.ndarray] = []
            for chain in self.chains:
                if not chain.motor or chain.kind not in VILLAGE_ROADS or chain.line is None:
                    continue
                for point in shapely.get_parts(chain.line.intersection(boundary)):
                    if point.geom_type != "Point":
                        continue
                    at = chain.line.project(point)
                    ahead, behind = (chain.ring_at(min(at + 5.0, chain.length))[CENTRE, :2], chain.ring_at(max(at - 5.0, 0.0))[CENTRE, :2])
                    inwards = 1 if np.hypot(*(ahead - centre)) < np.hypot(*(behind - centre)) else -1
                    for step in range(VILLAGE_STEPS):
                        along = at - inwards * step * VILLAGE_STEP_M
                        if not 0.0 <= along <= chain.length:
                            break
                        spot = self.standing(chain, along, inwards, VILLAGE_OUT_M, VILLAGE_CLEAR_M)
                        if spot is None or self.taken(spot[0], VILLAGE_CLEAR_M + SIGN_APART_M):
                            continue
                        if any(np.hypot(*(spot[0] - other)) < VILLAGE_SIGNS_APART_M for other in placed):
                            break
                        self.place("village-sign", spot[0], spot[1], facing(*(-chain.direction_at(along) * inwards)))
                        self.village_names.append(tags["name"])
                        self.posts.append(spot[0])
                        placed.append(spot[0])
                        break

    def mailboxes(self, landings: list) -> None:
        for chain, along, towards, greater in landings:
            if chain.rank < STREET_RANK or greater.rank > STREET_RANK or chain.length < 20:
                continue
            end = chain.ring_at(along)[CENTRE, :2]
            if roll(*end) > MAILBOX_SHARE or not len(self.building_tree.query(chain.line, predicate="dwithin", distance=HOUSE_NEAR_DRIVE_M)):
                continue
            mouth = greater.line.project(Point(end))
            if self.lit(greater, mouth) or self.built_up(end):
                continue
            offset = end - np.array(greater.line.interpolate(mouth).coords[0])
            direction = greater.direction_at(mouth)
            side = 1 if direction[0] * offset[1] - direction[1] * offset[0] < 0 else -1
            count = pick(roll(end[1], end[0]), MAILBOX_COUNTS)
            away = MAILBOX_ALONG_M[0] + roll(end[0], 3.1) * (MAILBOX_ALONG_M[1] - MAILBOX_ALONG_M[0])
            for way in ((1, -1) if roll(end[0], end[1], 7.7) < 0.5 else (-1, 1)):
                spots = [self.beside(greater, mouth + way * (away + box * MAILBOX_APART_M), side, MAILBOX_OUT_M) for box in range(count)]
                if all(self.free(point, besides=greater.index) for point, _, _ in spots):
                    for point, height, out in spots:
                        self.place("mailbox", point, height, facing(*-out))
                    break

    def bake(self) -> dict:
        self.power()
        self.lamps()
        self.rails()
        landings = self.landings()
        # Before the junctions' signs, which a signalled junction has no need of.
        self.signals()
        self.junction_signs(landings)
        self.speed_signs()
        self.stops_and_crossings()
        self.name_posts()
        self.villages()
        self.mailboxes(landings)
        seats = furniture.place(self)
        # Last, so an edge post makes way for everything else at the roadside.
        placed = [np.array([place[0], -place[2]]) for name in ("rail", "rail-end", "mailbox", "bus-shelter") for place in self.models.get(name, [])]
        self.edge_posts(placed + self.posts)
        return {**LICENCE, "asOf": self.osm["asOf"], "models": self.models, "signs": self.signs, "wires": self.wires, "walls": self.walls, "seats": seats, **self.town_lists()}

    def town_lists(self) -> dict:
        """Each in the order of its model's places: a head's start in its cycle, a name post's two blades (yaw and name each), a village sign's name."""
        return {"signalPhases": self.signal_phases, "streetNames": self.street_names, "villageNames": self.village_names}


def limit_changes(along: np.ndarray, speeds: list[int | None]) -> list[tuple[int, int]]:
    """Where each limit along a road starts, leaving out any that holds for less than the shortest a limit runs."""
    runs: list[tuple[int, int]] = []
    for index, speed in enumerate(speeds):
        if speed is not None and (not runs or runs[-1][1] != speed):
            runs.append((index, speed))
    ends = [float(along[start]) for start, _ in runs[1:]] + [float(along[-1])]
    kept: list[tuple[int, int]] = []
    for (start, speed), end in zip(runs, ends):
        if end - float(along[start]) >= SHORTEST_LIMIT_M and (not kept or kept[-1][1] != speed):
            kept.append((start, speed))
    return kept


def carriageway_half(chain: Chain, along: float) -> float:
    ring = chain.ring_at(along)
    return float(np.hypot(*(ring[EDGE_RIGHT, :2] - ring[EDGE_LEFT, :2]))) / 2


def other_than_seam(point: np.ndarray, box: tuple[float, float, float, float]) -> bool:
    """A chain's end on the tile's edge is where it was cut, not where it meets a road."""
    west, south, east, north = box
    return min(point[0] - west, east - point[0], point[1] - south, north - point[1]) > 1.0


def merged(ranges: list[tuple[float, float]], gap: float) -> list[tuple[float, float]]:
    runs: list[list[float]] = []
    for start, end in sorted(ranges):
        if runs and start - runs[-1][1] <= gap:
            runs[-1][1] = max(runs[-1][1], end)
        else:
            runs.append([start, end])
    return [(start, end) for start, end in runs]


def densify(line: np.ndarray, step: float) -> np.ndarray:
    points = [line[0]]
    for a, b in zip(line, line[1:]):
        count = max(1, math.ceil(np.hypot(*(b - a)) / step))
        points += [a + (b - a) * (index + 1) / count for index in range(count)]
    return np.array(points)


def resample(points: np.ndarray, heights: np.ndarray, step: float) -> list[tuple[np.ndarray, float]]:
    """Points every `step` along a line, and the last point, each with its height."""
    lengths = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    stops = list(np.arange(0.0, lengths[-1], step))
    if lengths[-1] - stops[-1] > step * 0.25:
        stops.append(lengths[-1])
    else:
        stops[-1] = lengths[-1]
    return [(np.array([np.interp(at, lengths, points[:, 0]), np.interp(at, lengths, points[:, 1])]), float(np.interp(at, lengths, heights))) for at in stops]


def bake(tile: Tile, folder: Path, tiles: Path) -> dict:
    """Writes the tile's roadside list and returns its manifest entry."""
    placed = Roadside(tile, folder, tiles).bake()
    replace_text(folder / FILE, json.dumps(placed, separators=(",", ":")))
    count = {**{name: len(places) for name, places in placed["models"].items()}, **{f"sign {name}": len(places) for name, places in placed["signs"].items()}, "wires": len(placed["wires"]), "walls": len(placed["walls"]), **{f"seat {pose}": len(places) for pose, places in placed["seats"].items()}}
    return {"file": FILE, "count": dict(sorted(count.items()))}


def replace_text(path: Path, text: str) -> None:
    """Writes a file anew rather than over itself, so a copy of a tile made of links to another stays apart from it."""
    temporary = path.with_suffix(path.suffix + ".new")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def bake_named(job: tuple[str, Path]) -> str:
    """Adds the roadside to one built tile, reading its neighbours' ground and writing only its own files."""
    name, tiles = job
    folder = tiles / name
    entry = bake(tile_from_name(name), folder, tiles)
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    replace_text(folder / "tile.json", json.dumps({**manifest, "roadside": entry}, ensure_ascii=False, indent=2))
    return name


def bake_tiles(names: list[str], tiles: Path, jobs: int = 1) -> None:
    """Adds the roadside to built tiles. Run once every tile is built: a pole by an edge stands on its neighbour's ground.
    A tile writes only its own files, so tiles go side by side, a core each."""
    progress = Progress("roadside", len(names))
    work = [(name, tiles) for name in names]
    if jobs > 1:
        with get_context("spawn").Pool(jobs, maxtasksperchild=1) as pool:
            for name in pool.imap_unordered(bake_named, work):
                progress.finished(name)
    else:
        for job in work:
            progress.finished(bake_named(job))


def with_neighbours(names: list[str], tiles: Path) -> list[str]:
    """The tiles named and the built ones round them, whose poles and wires may stand on their ground."""
    around = {neighbour(tile_from_name(name), east, north).name for name in names for east in (-1, 0, 1) for north in (-1, 0, 1)}
    return sorted(name for name in around if (tiles / name / "tile.json").exists())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="*", help="NLS sheet names, such as L2343C; every built tile if none")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--jobs", type=int, default=1, help="tiles placed side by side, on a core each")
    arguments = parser.parse_args()
    bake_tiles(arguments.tiles or sorted(path.parent.name for path in arguments.folder.glob("*/tile.json")), arguments.folder, arguments.jobs)


if __name__ == "__main__":
    main()

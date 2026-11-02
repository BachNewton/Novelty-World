"""Jetties, piers and pontoons from OSM's piers, and the boats moored at them.

OSM maps a pier as a line or an outline (`man_made=pier`), and a floating one as
`floating=yes`. Many in a marina also carry a footway, the line people walk, which
laid as a road over water was a span, and so a road bridge with a parapet. A dock is
the shore kit's instead: what lies on a pier isn't laid as a road, and the pier is a
row of timber sections at a deck height of its own over the water.

A pier is one of three kinds. Floating, it's a pontoon, its deck just above the
water. Inside or by a marina, or wide, or long, or with a footway on it, it's a
harbour pier. Otherwise it's a private jetty, which may have a rowing boat at its
end and a head with a bench. A pier that carries a motor road (a ferry or fish
quay) is the road's, drawn by the bridge kit as a quay, and gets nothing here.

Every place's height is the water's, the level of the water round it in the
elevation model, which is the level the terrain draws there. A jetty within reach
of a boathouse is run on to its wall. Boats are by rule: berths down both sides of
a marina's piers and of every pontoon, each bow to the pier, where the whole hull is on
open water clear of every dock and other boat.

A dock's outline goes to the car as walls, as a building's does: a car can't drive
along a footbridge, so it stops at a pier's root.
"""

import json
import math
import re
import zlib
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

from grid import SAMPLE_M, Tile, lonlat_to_grid, to_local

LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}

# Each kind's width when OSM gives none, and its deck over the water. The widths are the shore kit's sections'
# (`art/rural/shore.ts`), so a dock with no width of its own is drawn as built.
WIDE_M = {"jetty": 1.4, "pier": 2.4, "pontoon": 2.4}
DECK_M = {"jetty": 0.7, "pier": 0.95, "pontoon": 0.42}
# A width tag past these is a mapping slip or a quay's, not a timber deck's.
WIDTH_TAG_M = (0.8, 6.0)
# A pier this wide, or this long, or near a marina, is a harbour's.
HARBOUR_WIDE_M = 2.0
HARBOUR_LONG_M = 40.0
MARINA_NEAR_M = 50.0
# How much of a road lies on a pier for the road to be its: a footway is then the pier's and isn't laid, and a motor
# road makes the pier a quay.
ON_PIER_SHARE = 0.6
PIER_MARGIN_M = 0.5
ROAD_LEFT_M = 2.0
# An outline is cut into straight runs, on a grid this fine, until what's left is this share of it.
CELL_M = 0.5
OUTLINE_LEFT = 0.1
NARROWEST_RUN_M = 1.0
# A run whose deck lies under the ground is trimmed back to where it comes out; one with no water near isn't a dock.
BURIED_M = 0.1
WATER_NEAR_M = (15.0, 60.0)
SHORTEST_RUN_M = 1.5
# A jetty this near a boathouse is run on to its wall.
BOATHOUSE_REACH_M = 8.0

# Boats, by the kit that draws them, with their length and beam for the room they take. The lengths and beams are
# `art/boats`' and `art/rural`'s.
HULLS = {
    "rowing-boat-white": (4.2, 1.6),
    "rowing-boat-blue": (4.2, 1.6),
    "rowing-boat-wood": (4.2, 1.6),
    "sailboat": (7.0, 2.3),
    "cruiser": (10.0, 3.3),
    "large": (13.7, 4.2),
    "folkboat": (7.7, 2.2),
    "launch": (7.25, 2.1),
    "rib": (7.0, 2.6),
}
# A jetty head's length and width (`buildJettyHead`).
JETTY_HEAD_M = (3.2, 3.0)
JETTY_BOAT_SHARE = 0.45
# A jetty shorter than this is a landing stage with no head.
JETTY_HEAD_LONGEST = 5.0
ROWING_PAINTS = (("rowing-boat-white", 0.5), ("rowing-boat-blue", 0.25), ("rowing-boat-wood", 0.25))
JETTY_SAILBOAT_SHARE = 0.08
# A guest harbour's mix, by share of its berths (`MARINA_MIX` in `art/boats/placement.ts`, with its launches for motor boats).
BERTHS = (("cruiser", 0.42), ("launch", 0.2), ("rib", 0.06), ("large", 0.14), ("folkboat", 0.18))
BERTH_GAP_M = 1.0
BERTHS_TAKEN = 0.7
# A boat's bow stands this far off the pier, and its first berth this far from the pier's root.
BOW_GAP_M = 0.8
FIRST_BERTH_M = 4.0


def _roll(*key) -> float:
    return zlib.crc32(":".join(map(str, key)).encode()) / 2**32


def _pick(roll: float, choices: tuple) -> str:
    for value, chance in choices:
        roll -= chance
        if roll < 0:
            return value
    return choices[-1][0]


def _local(geometry: list[dict]) -> np.ndarray:
    east, north = lonlat_to_grid([point["lon"] for point in geometry], [point["lat"] for point in geometry])
    return np.column_stack(to_local(np.asarray(east), np.asarray(north)))


def _width(tags: dict) -> float | None:
    found = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*(m)?\s*$", tags.get("width", ""))
    if not found:
        return None
    width = float(found.group(1).replace(",", "."))
    return width if WIDTH_TAG_M[0] <= width <= WIDTH_TAG_M[1] else None


class Pier:
    """One of OSM's piers: its line or its outline, in the game's metric space."""

    def __init__(self, id: int, tags: dict, line: np.ndarray | None, outline: shapely.Geometry | None):
        self.id, self.tags, self.line, self.outline = id, tags, line, outline
        self.floating = tags.get("floating") == "yes"
        self.width = _width(tags)
        if outline is not None:
            self.shape = outline.buffer(PIER_MARGIN_M, join_style="mitre")
        else:
            self.shape = LineString(line).buffer((self.width or WIDE_M["jetty"]) / 2 + PIER_MARGIN_M, cap_style="flat")


def read(osm_file: Path) -> tuple[list[Pier], list[shapely.Geometry]]:
    """Every pier and marina in a tile's kept OSM."""
    piers, marinas = [], []
    for element in json.loads(osm_file.read_text(encoding="utf-8"))["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "way":
            rings = [element["geometry"]]
        else:
            rings = [member["geometry"] for member in element.get("members", []) if member.get("role") == "outer" and len(member["geometry"]) >= 2]
        lines = [_local(ring) for ring in rings if len(ring) >= 2]
        closed = [line for line in lines if len(line) >= 4 and np.allclose(line[0], line[-1])]
        if tags.get("leisure") == "marina":
            marinas += [shapely.make_valid(Polygon(line)) for line in closed]
        if tags.get("man_made") != "pier":
            continue
        for index, line in enumerate(lines):
            is_area = any(line is ring for ring in closed) and tags.get("area") != "no"
            pier_id = element["id"] * 16 + index
            if is_area:
                outline = shapely.make_valid(Polygon(line))
                if outline.area > 0:
                    piers.append(Pier(pier_id, tags, None, outline))
            elif LineString(line).length > 0:
                piers.append(Pier(pier_id, tags, line, None))
    return piers, marinas


def _share_on(line: LineString, shape: shapely.Geometry) -> float:
    return shapely.intersection(line, shape).length / line.length if line.length > 0 else 0.0


def quays(roads: list[dict], piers: list[Pier]) -> list[Pier]:
    """The piers that carry a motor road: the road draws them."""
    motor = [LineString(road["line"]) for road in roads if road["motor"] and len(road["line"]) >= 2]
    if not motor:
        return []
    tree = shapely.STRtree(motor)
    return [pier for pier in piers if (pier.line is not None and "highway" in pier.tags and pier.tags["highway"] not in ("footway", "path", "pedestrian", "steps", "cycleway")) or any(_share_on(motor[index], pier.shape) >= ON_PIER_SHARE for index in tree.query(pier.shape))]


def off_piers(roads: list[dict], piers: list[Pier]) -> list[dict]:
    """The roads as laid: a footway or path on a pier is the pier's, so only what runs off it stays a road."""
    decks = shapely.union_all([pier.shape for pier in piers]) if piers else None
    kept = []
    for road in roads:
        if road["motor"] or decks is None or len(road["line"]) < 2 or not LineString(road["line"]).intersects(decks):
            kept.append(road)
            continue
        off = shapely.difference(LineString(road["line"]), decks)
        kept += [{**road, "line": [[round(x, 2), round(y, 2)] for x, y in shapely.get_coordinates(part)]} for part in shapely.get_parts(off) if part.length >= ROAD_LEFT_M]
    return kept


def _runs_of_outline(outline: shapely.Geometry) -> list[tuple[np.ndarray, np.ndarray, float]]:
    """An outline as straight runs: (start, end, width). Each is the largest rectangle left on a grid in the outline's own frame."""
    corners = np.array(outline.minimum_rotated_rectangle.exterior.coords)[:4]
    along = corners[1] - corners[0]
    if np.hypot(*along) < np.hypot(*(corners[2] - corners[1])):
        along = corners[2] - corners[1]
    along /= np.hypot(*along)
    across = np.array([-along[1], along[0]])
    points = np.array(outline.exterior.coords) if isinstance(outline, Polygon) else shapely.get_coordinates(outline)
    u, v = points @ along, points @ across
    u0, v0 = u.min(), v.min()
    columns, rows = max(1, int(math.ceil((u.max() - u0) / CELL_M))), max(1, int(math.ceil((v.max() - v0) / CELL_M)))
    centres_u = u0 + (np.arange(columns) + 0.5) * CELL_M
    centres_v = v0 + (np.arange(rows) + 0.5) * CELL_M
    grid_u, grid_v = np.meshgrid(centres_u, centres_v)
    world = grid_u[..., None] * along + grid_v[..., None] * across
    filled = shapely.contains_xy(outline, world[..., 0], world[..., 1])
    total = filled.sum()
    runs = []
    while total and filled.sum() > OUTLINE_LEFT * total:
        best = _largest_rectangle(filled)
        if best is None:
            break
        row0, row1, column0, column1 = best
        if (row1 - row0) * CELL_M < NARROWEST_RUN_M and (column1 - column0) * CELL_M < NARROWEST_RUN_M:
            break
        filled[row0:row1, column0:column1] = False
        lo_u, hi_u = u0 + column0 * CELL_M, u0 + column1 * CELL_M
        lo_v, hi_v = v0 + row0 * CELL_M, v0 + row1 * CELL_M
        if hi_u - lo_u >= hi_v - lo_v:
            mid = (lo_v + hi_v) / 2
            runs.append((lo_u * along + mid * across, hi_u * along + mid * across, hi_v - lo_v))
        else:
            mid = (lo_u + hi_u) / 2
            runs.append((mid * along + lo_v * across, mid * along + hi_v * across, hi_u - lo_u))
    return runs


def _largest_rectangle(filled: np.ndarray) -> tuple[int, int, int, int] | None:
    """The largest all-True rectangle of a grid, as (first row, past row, first column, past column), by the histogram method."""
    heights = np.zeros(filled.shape[1], dtype=int)
    best, found = 0, None
    for row in range(filled.shape[0]):
        heights = np.where(filled[row], heights + 1, 0)
        stack: list[int] = []
        for column in range(len(heights) + 1):
            height = heights[column] if column < len(heights) else 0
            while stack and heights[stack[-1]] >= height:
                top = stack.pop()
                left = stack[-1] + 1 if stack else 0
                area = heights[top] * (column - left)
                if area > best:
                    best, found = area, (row - heights[top] + 1, row + 1, left, column)
            stack.append(column)
    return found


class Land:
    """The tile's 2 m ground and water, read at any point (clamped to the tile)."""

    def __init__(self, ground: np.ndarray, water: np.ndarray, west: float, north: float):
        self.ground, self.water, self.west, self.north = ground, water, west, north

    def _index(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        last = self.water.shape[0] - 1
        columns = np.clip(((points[:, 0] - self.west) / SAMPLE_M).astype(int), 0, last)
        rows = np.clip(((self.north - points[:, 1]) / SAMPLE_M).astype(int), 0, last)
        return rows, columns

    def height(self, points: np.ndarray) -> np.ndarray:
        return self.ground[self._index(points)]

    def wet(self, points: np.ndarray) -> np.ndarray:
        return self.water[self._index(points)]

    def level_near(self, points: np.ndarray) -> float | None:
        """The water's level round some points: the median of the water samples within reach, the nearer reach first."""
        for reach in WATER_NEAR_M:
            box = shapely.box(*(points.min(axis=0) - reach), *(points.max(axis=0) + reach))
            west, south, east, north = box.bounds
            last = self.water.shape[0] - 1
            c0, c1 = (np.clip(int((x - self.west) / SAMPLE_M), 0, last) for x in (west, east))
            r0, r1 = (np.clip(int((self.north - y) / SAMPLE_M), 0, last) for y in (north, south))
            water = self.water[r0 : r1 + 1, c0 : c1 + 1]
            if water.any():
                return float(np.median(self.ground[r0 : r1 + 1, c0 : c1 + 1][water]))
        return None


class Docks:
    """A tile's docks and boats, as the game reads them: per model, (x, y, z, yaw, width, length) in the scene."""

    def __init__(self, tile: Tile, land: Land, boathouses: list[list[float]]):
        self.west, self.south = to_local(tile.west, tile.south)
        self.east, self.north = to_local(tile.east, tile.north)
        self.land = land
        self.boathouses = [_boathouse_outline(place) for place in boathouses]
        self.models: dict[str, list[list[float]]] = {}
        self.walls: list[list[float]] = []
        self.taken: list[shapely.Geometry] = []

    def _owns(self, shape: shapely.Geometry) -> bool:
        middle = shape.centroid
        return self.west <= middle.x < self.east and self.south <= middle.y < self.north

    @staticmethod
    def _at_marina(pier: Pier, marinas: shapely.Geometry | None) -> bool:
        return marinas is not None and pier.shape.distance(marinas) <= MARINA_NEAR_M

    def _kind(self, pier: Pier, marinas: shapely.Geometry | None) -> str:
        if pier.floating:
            return "pontoon"
        near_marina = self._at_marina(pier, marinas)
        length = LineString(pier.line).length if pier.line is not None else 0.0
        if pier.outline is not None:
            corners = np.array(pier.outline.minimum_rotated_rectangle.exterior.coords)[:3]
            sides = np.hypot(*np.diff(corners, axis=0).T)
            length, wide = float(sides.max()), float(sides.min())
        else:
            wide = pier.width or 0.0
        if near_marina or "highway" in pier.tags or wide >= HARBOUR_WIDE_M or length >= HARBOUR_LONG_M:
            return "pier"
        return "jetty"

    def place(self, piers: list[Pier], marinas: list[shapely.Geometry], quay_piers: list[Pier]) -> None:
        marina = shapely.union_all(marinas) if marinas else None
        skipped = {id(pier) for pier in quay_piers}
        berthed: list[tuple[Pier, np.ndarray, np.ndarray, float, float]] = []
        for pier in piers:
            if id(pier) in skipped or not self._owns(pier.shape):
                continue
            kind = self._kind(pier, marina)
            if pier.line is not None:
                width = pier.width or WIDE_M[kind]
                segments = [(pier.line[index], pier.line[index + 1], width) for index in range(len(pier.line) - 1)]
            else:
                segments = _runs_of_outline(pier.outline)
            level = self.land.level_near(np.array([point for start, end, _ in segments for point in (start, end)]))
            if level is None:
                continue
            laid = []
            for index, (start, end, width) in enumerate(segments):
                run = self._trimmed(kind, start, end, level)
                if run is not None:
                    laid.append((*run, width))
            if not laid:
                continue
            if kind == "jetty" and pier.line is not None:
                laid = self._to_boathouse(laid)
            for start, end, width in laid:
                self._run(kind, start, end, width, level)
                if pier.floating or (kind == "pier" and self._at_marina(pier, marina)):
                    berthed.append((pier, start, end, width, level))
            if kind == "jetty" and pier.line is not None:
                self._jetty_end(pier, min(laid, key=lambda run: self.land.height(np.array(run[:2])).min()), level)
        for pier, start, end, width, level in berthed:
            self._berths(pier, start, end, width, level)

    def _trimmed(self, kind: str, start: np.ndarray, end: np.ndarray, level: float) -> tuple[np.ndarray, np.ndarray] | None:
        """A run cut back to where its deck stands clear of the ground, or for a pontoon to where it floats."""
        length = float(np.hypot(*(end - start)))
        if length < 1e-3:
            return None
        shares = np.linspace(0, 1, max(2, int(length) + 1))
        points = start + shares[:, None] * (end - start)
        if kind == "pontoon":
            clear = self.land.wet(points) | (self.land.height(points) <= level + BURIED_M)
        else:
            clear = self.land.height(points) < level + DECK_M[kind] - BURIED_M
        if not clear.any():
            return None
        first, last = int(np.argmax(clear)), len(clear) - 1 - int(np.argmax(clear[::-1]))
        start, end = points[first], points[last]
        return (start, end) if np.hypot(*(end - start)) >= SHORTEST_RUN_M else None

    def _to_boathouse(self, laid: list) -> list:
        """A jetty that stops short of a boathouse is run on to its wall, along its own line."""
        start, end, width = laid[0]
        root, out = (start, end) if self.land.height(start[None])[0] >= self.land.height(end[None])[0] else (end, start)
        direction = (root - out) / max(np.hypot(*(root - out)), 1e-6)
        reach = LineString([root, root + direction * BOATHOUSE_REACH_M])
        hits = [shapely.intersection(reach, outline) for outline in self.boathouses if outline.distance(Point(root)) <= BOATHOUSE_REACH_M]
        hits = [hit for hit in hits if not hit.is_empty]
        if not hits:
            return laid
        nearest = min((Point(point) for hit in hits for point in shapely.get_coordinates(hit)), key=lambda point: point.distance(Point(root)))
        meet = np.array([nearest.x, nearest.y])
        laid[0] = (meet, out, width) if root is start else (out, meet, width)
        return laid

    def _place(self, model: str, x: float, y: float, z: float, yaw: float, width: float = 0.0, length: float = 0.0) -> None:
        self.models.setdefault(model, []).append([round(x, 2), round(y, 2), round(z, 2), round(yaw, 4), round(width, 2), round(length, 2)])

    def _run(self, kind: str, start: np.ndarray, end: np.ndarray, width: float, level: float) -> None:
        along = end - start
        length = float(np.hypot(*along))
        # The model's +x runs from its place to the run's end; in the scene, whose z is south, that's (cos yaw, -sin yaw).
        yaw = math.atan2(along[1], along[0])
        self._place(kind, float(start[0]), level, float(-start[1]), yaw, width, length)
        outline = LineString([start, end]).buffer(width / 2, cap_style="flat")
        self.taken.append(outline)
        ring = np.array(outline.exterior.coords)
        for a, b in zip(ring[:-1], ring[1:]):
            self.walls.append([round(float(a[0]), 2), round(float(-a[1]), 2), round(float(b[0]), 2), round(float(-b[1]), 2)])

    def _jetty_end(self, pier: Pier, run: tuple, level: float) -> None:
        """A private jetty's head, and a share of them with a boat alongside."""
        start, end, width = run
        if self.land.height(start[None])[0] < self.land.height(end[None])[0]:
            start, end = end, start
        along = end - start
        length = float(np.hypot(*along))
        if length < JETTY_HEAD_LONGEST or not self.land.wet(end[None])[0]:
            return
        direction = along / length
        side = np.array([-direction[1], direction[0]]) * (1 if _roll(pier.id, "side") < 0.5 else -1)
        self._place("jetty-head", float(end[0]), level, float(-end[1]), math.atan2(direction[1], direction[0]))
        self.taken.append(LineString([end, end + direction * JETTY_HEAD_M[0]]).buffer(JETTY_HEAD_M[1] / 2, cap_style="flat"))
        if _roll(pier.id, "boat") < JETTY_BOAT_SHARE:
            model = _pick(_roll(pier.id, "paint"), ROWING_PAINTS)
            beam = HULLS[model][1]
            self._boat(model, end - direction * 2.6 + side * (width / 2 + beam / 2 + 0.3), direction, level)
        elif _roll(pier.id, "boat") < JETTY_BOAT_SHARE + JETTY_SAILBOAT_SHARE:
            self._boat("sailboat", end + direction * (1.5 + HULLS["sailboat"][0] / 2), -direction, level)

    def _boat(self, model: str, centre: np.ndarray, bow: np.ndarray, level: float) -> bool:
        """A boat whose bow points along `bow`, if its whole hull is on open water and clear of every dock and boat."""
        length, beam = HULLS[model]
        across = np.array([-bow[1], bow[0]])
        hull = Polygon([centre + bow * length / 2 * a + across * beam / 2 * b for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))])
        probes = np.array([centre, *np.array(hull.exterior.coords)[:4]])
        if not self.land.wet(probes).all() or any(hull.intersects(taken) for taken in self.taken):
            return False
        self.taken.append(hull)
        # A boat's bow is its +z, which turns to (sin yaw, cos yaw) in the scene, whose z is south.
        self._place(model, float(centre[0]), level, float(-centre[1]), math.atan2(bow[0], -bow[1]))
        return True

    def _berths(self, pier: Pier, start: np.ndarray, end: np.ndarray, width: float, level: float) -> None:
        """Boats down both sides of a harbour run, each bow to the pier, where there's room."""
        along = end - start
        length = float(np.hypot(*along))
        direction = along / max(length, 1e-6)
        if self.land.height(start[None])[0] < self.land.height(end[None])[0]:
            start, direction = end, -direction
        for sign in (1, -1):
            outward = np.array([-direction[1], direction[0]]) * sign
            at = FIRST_BERTH_M
            berth = 0
            while at < length:
                key = (pier.id, round(float(start[0])), round(float(start[1])), sign, berth)
                model = _pick(_roll(*key, "kind"), BERTHS)
                beam = HULLS[model][1]
                at += beam / 2
                if at + beam / 2 > length:
                    break
                if _roll(*key, "taken") < BERTHS_TAKEN:
                    centre = start + direction * at + outward * (width / 2 + BOW_GAP_M + HULLS[model][0] / 2)
                    self._boat(model, centre, -outward, level)
                at += beam / 2 + BERTH_GAP_M
                berth += 1

    def write(self, folder: Path) -> dict:
        (folder / "docks.json").write_text(json.dumps({**LICENCE, "models": self.models, "walls": self.walls}, separators=(",", ":")), encoding="utf-8")
        return {"file": "docks.json", "count": {model: len(places) for model, places in sorted(self.models.items())}, "walls": len(self.walls), "place": ["x", "y", "z", "yaw", "width", "length"]}


def _boathouse_outline(place: list[float]) -> Polygon:
    """A placed boathouse's walls, from its place in the scene (`outbuildings.Placed`)."""
    x, _, z, yaw, width, length = place
    front = np.array([math.sin(yaw), -math.cos(yaw)])
    across = np.array([front[1], -front[0]])
    centre = np.array([x, -z])
    return Polygon([centre + front * length / 2 * a + across * width / 2 * b for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))])


def quay_spans(motor: bool, rings: np.ndarray, spans: list[tuple[int, int]], quay_piers: list[Pier]) -> list[int]:
    """Which of a motor road's spans run along a quay's pier, as indices into its spans: the bridge kit draws those as quays."""
    if not motor or not quay_piers:
        return []
    decks = shapely.union_all([pier.shape for pier in quay_piers])
    return [index for index, (first, last) in enumerate(spans) if last > first and _share_on(LineString(rings[first : last + 1, 2, :2]), decks) >= ON_PIER_SHARE]

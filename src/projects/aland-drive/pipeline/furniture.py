"""Street furniture: benches, bins, bike racks and café terraces, and the seats on them.

Placed in the roadside list (`roadside.py` calls `Furniture.place` once its own
objects and what `dressing.py` stands from OSM stand), so it streams, draws and
stops the car as the roadside does. OSM places what it maps: benches, waste
baskets, bicycle parking, and a terrace at a café, bar or restaurant with
outdoor seating, against the wall of its building that faces its street. OSM maps little of it, so rules place the rest:

- benches along the paths of a park and a pedestrian street, a bin by every other;
- benches along a town's waterside paths, facing the water, a bin by every third;
- a bin at a town's bus stop;
- bike racks against the street wall of a supermarket, school, library and the like.

Nothing stands on a carriageway, a path, an apron or in a building, except that a
terrace may stand on a sidewalk, as real ones do. A bench and a bike rack stop
the car, being iron anchored in the ground; a bin, a table, a chair and a parasol
don't, being things a real car would knock flying.

Every bench seat and café chair is also a seat: where a person sits, the way they
face and the pose that fits it (`art/people`'s `sit-bench` or `sit-cafe`), so a
seated person and their seat come from the same placement.
"""

import gzip
import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point, Polygon, box
from shapely.affinity import rotate, translate

from grid import lonlat_to_grid, to_local
from sources import osm_furniture_path

# The art's own measures (`art/street/furniture.ts`, `art/people/poses.ts`); `furniture.test.ts` holds them equal.
BENCH_SEATS_X = (-0.45, 0.45)
CAFE_CHAIR_Z = 0.62
BIKE_RACK_M = 2.4
BIKES_PER_RACK = 8

# Each model's footprint in its own axes, +x along and +z its front: west, south (back), east, north (front).
FOOTPRINTS = {
    "bench": (-0.95, -0.38, 0.95, 0.32),
    "bin": (-0.25, -0.22, 0.25, 0.3),
    "cafe-set": (-0.45, -1.05, 0.45, 1.05),
    "bike-rack": (-0.15, -0.45, BIKE_RACK_M + 0.15, 0.45),
}
# How far a parasol's canopy reaches, so a terrace with them spaces its tables wider and stands further off the wall.
PARASOL_RADIUS_M = 1.5

# What furniture keeps clear of: paving of any kind, buildings, and what's placed already.
PAVED_CLEAR_M = 0.25
BUILDING_CLEAR_M = 0.3
APART_M = 0.3
# A terrace may stand on a sidewalk, but this clear of a carriageway or an apron.
TERRACE_CARRIAGEWAY_CLEAR_M = 0.6
# A mapped object off the paving by up to this is moved off it, away from what it would stand on.
NUDGE_M = 3.0
# An object faces the nearest road or path within this; otherwise, water within it; otherwise a roll.
FACE_PATH_M = 15.0

TERRACE_KINDS = {"cafe", "restaurant", "ice_cream", "bar", "pub", "fast_food"}
# Untagged, these kinds have a terrace: Åland's cafés and bars put tables out all summer.
TERRACE_UNTAGGED = {"cafe": 1.0, "ice_cream": 1.0, "bar": 1.0, "pub": 1.0, "restaurant": 0.5, "fast_food": 0.0}
TERRACE_SETS = ((2, 0.3), (3, 0.4), (4, 0.3))
TERRACE_PITCH_M = 2.3
TERRACE_OUT_M = (1.05, 1.8, 2.6)
VENUE_BUILDING_M = 20.0
VENUE_STREET_M = 60.0
SHORTEST_WALL_M = 3.0
PARASOL_SHARE = 0.6
SEATING_GRID_M = (2.6, 3.2)

PATH_KINDS = {"footway", "path", "pedestrian", "cycleway", "steps", "living_street"}
PARK_BENCH_SPACING_M = 30.0
PROMENADE_BENCH_SPACING_M = 40.0
BENCH_OUT_M = 0.75
BENCH_NEAR_M = 20.0
# A waterside path: the land beside it this far from the shore, and still land under the bench.
WATERSIDE_M = 25.0
BENCH_ON_LAND_M = 1.5
BIN_BESIDE_M = 1.35

BUS_STOP_BIN_M = 1.4
DESTINATIONS = {("shop", "supermarket"): 2, ("shop", "department_store"): 2, ("shop", "mall"): 2, ("amenity", "school"): 3, ("amenity", "college"): 2, ("amenity", "library"): 1, ("amenity", "townhall"): 1, ("amenity", "ferry_terminal"): 2, ("amenity", "cinema"): 1}
RACK_OUT_M = 1.2
RACKS_APART_M = 30.0
RACK_GAP_M = 0.8
MOST_RACKS = 4


def roll(*keys: float) -> float:
    value = math.sin(sum(key * factor for key, factor in zip(keys, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return value - math.floor(value)


def facing(east: float, north: float) -> float:
    """The yaw that turns a model's +z to a way on the ground (the scene's z is south)."""
    return math.atan2(east, -north)


def along_yaw(east: float, north: float) -> float:
    """The yaw that lays a model's +x along a way on the ground."""
    return math.atan2(north, east)


def on_ground(point: np.ndarray, yaw: float, x: float, z: float) -> np.ndarray:
    """A point in a model's own axes (+x along, +z its front), on the ground as east and north."""
    cos, sin = math.cos(yaw), math.sin(yaw)
    return point + np.array([x * cos + z * sin, x * sin - z * cos])


def footprint(model: str, point: np.ndarray, yaw: float, length: float | None = None) -> Polygon:
    west, back, east, front = FOOTPRINTS[model]
    if length is not None:
        east = length + 0.15
    shape = box(west, -front, east, -back)  # x east, y north: a model's +z is its south.
    return translate(rotate(shape, yaw, origin=(0, 0), use_radians=True), *point)


class Surface:
    """The height of what's drawn at a point: the road surface on a carriageway, path or apron, else the ground."""

    def __init__(self, folder: Path, manifest: dict, heights):
        self.heights = heights
        triangles: list[np.ndarray] = []
        if "roadSurface" in manifest:
            surface = manifest["roadSurface"]
            sections = sum(chain["sections"] for chain in surface["chains"])
            data = gzip.decompress((folder / surface["file"]).read_bytes())
            rings = np.frombuffer(data, dtype="<f4", count=sections * 15).reshape(sections, 5, 3).astype(np.float64)
            first = 0
            for chain in surface["chains"]:
                part = rings[first : first + chain["sections"]]
                first += chain["sections"]
                for a, b in zip(part, part[1:]):
                    for left, right in ((1, 2), (2, 3)):
                        triangles += [np.array([a[left], b[left], b[right]]), np.array([a[left], b[right], a[right]])]
            aprons = surface["aprons"]
            start = sections * 15 * 4 + sections
            points = np.frombuffer(data, dtype="<f4", count=aprons["points"] * 5, offset=start).reshape(-1, 5)[:, :3].astype(np.float64)
            corners = np.frombuffer(data, dtype="<u4", count=aprons["triangles"] * 3, offset=start + aprons["points"] * 20).reshape(-1, 3)
            triangles += list(points[corners])
        self.triangles = triangles
        self.tree = shapely.STRtree([Polygon(triangle[:, :2]) for triangle in triangles]) if triangles else None

    def at(self, point: np.ndarray) -> float:
        ground = self.heights.at(*point)
        if self.tree is None:
            return ground
        highest = None
        for index in self.tree.query(Point(point), predicate="intersects"):
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = self.triangles[index]
            area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(area) < 1e-9:
                continue
            wa = ((by - cy) * (point[0] - cx) + (cx - bx) * (point[1] - cy)) / area
            wb = ((cy - ay) * (point[0] - cx) + (ax - cx) * (point[1] - cy)) / area
            height = wa * az + wb * bz + (1 - wa - wb) * cz
            highest = height if highest is None else max(highest, height)
        return ground if highest is None else max(ground, highest)


class Shore:
    """Metres from the shore at a point, out into the water and below zero on land, as the tile drew it."""

    def __init__(self, folder: Path, manifest: dict):
        heights, water = manifest["heights"], manifest.get("water")
        self.grid = None
        if water is not None and (folder / water["shoreFile"]).exists():
            deltas = np.frombuffer(gzip.decompress((folder / water["shoreFile"]).read_bytes()), dtype="<i2").reshape(heights["nodes"], heights["nodes"])
            self.grid = np.cumsum(deltas.astype(np.int32), axis=1) * heights["unitM"]
        self.step = heights["stepM"]
        bounds = manifest["bounds"]
        self.west, self.north = bounds["west"], bounds["north"]

    def at(self, point: np.ndarray) -> float:
        """Far inland where the tile has no shore."""
        if self.grid is None:
            return -1e3
        column = int(round((point[0] - self.west) / self.step))
        row = int(round((self.north - point[1]) / self.step))
        if not (0 <= row < self.grid.shape[0] and 0 <= column < self.grid.shape[1]):
            return -1e3
        return float(self.grid[row, column])


class Furniture:
    def __init__(self, roadside):
        self.roadside = roadside
        folder = roadside.heights.folder / roadside.tile.name
        self.surface = Surface(folder, roadside.manifest, roadside.heights)
        self.shore = Shore(folder, roadside.manifest)
        self.osm = json.loads(osm_furniture_path(roadside.tile).read_text(encoding="utf-8"))
        self.chains = {chain.index: chain for chain in roadside.chains}
        self.paths = [chain for chain in roadside.chains if chain.line is not None]
        self.path_tree = shapely.STRtree([chain.line for chain in self.paths]) if self.paths else None
        self.taken: list[Polygon] = []
        self.taken_tree = None
        self.added_since = 0
        self.benches: list[np.ndarray] = []
        self.racks: list[np.ndarray] = []
        self.seats: dict[str, list[list[float]]] = {"sit-bench": [], "sit-cafe": []}
        # What the roadside stood up first keeps its place: a lamp, a pole, a sign, a mailbox.
        for places in roadside.models.values():
            for place in places:
                self.take(Point(place[0], -place[2]).buffer(0.25))
        for posts in roadside.signs.values():
            for post in posts:
                self.take(Point(post[0], -post[2]).buffer(0.2))

    # Places

    def take(self, shape: Polygon) -> None:
        self.taken.append(shape)
        self.added_since += 1

    def overlaps(self, shape: Polygon) -> bool:
        if self.added_since > 0:
            self.taken_tree = shapely.STRtree(self.taken)
            self.added_since = 0
        return self.taken_tree is not None and len(self.taken_tree.query(shape, predicate="dwithin", distance=APART_M)) > 0

    def fits(self, shape: Polygon, terrace: bool = False) -> bool:
        west, south, east, north = self.roadside.box
        if not shape.within(box(west, south, east, north)):
            return False
        if self.roadside.building_tree.query(shape, predicate="dwithin", distance=BUILDING_CLEAR_M).size > 0:
            return False
        paved = self.roadside.paved
        if terrace:
            for index in paved.tree.query(shape, predicate="dwithin", distance=TERRACE_CARRIAGEWAY_CLEAR_M):
                owner = int(paved.owners[index])
                if owner < 0 or self.chains[owner].motor:
                    return False
        elif paved.tree.query(shape, predicate="dwithin", distance=PAVED_CLEAR_M).size > 0:
            return False
        return not self.overlaps(shape)

    def nearest_path(self, point: np.ndarray, reach: float, motor_only: bool = False):
        """The nearest laid road or path within reach, and the point on its centre line nearest this."""
        if self.path_tree is None:
            return None
        at = Point(point)
        best = None
        for index in self.path_tree.query(at, predicate="dwithin", distance=reach):
            chain = self.paths[index]
            if motor_only and not chain.motor:
                continue
            distance = chain.line.distance(at)
            if best is None or distance < best[0]:
                best = (distance, chain)
        if best is None:
            return None
        chain = best[1]
        return chain, np.array(chain.line.interpolate(chain.line.project(at)).coords[0])

    def face_of(self, point: np.ndarray) -> float:
        """Towards the nearest road or path, else the water, else a roll."""
        path = self.nearest_path(point, FACE_PATH_M)
        if path is not None and np.hypot(*(path[1] - point)) > 0.01:
            return facing(*(path[1] - point))
        best = max(((self.shore.at(point + 10 * np.array([math.cos(a), math.sin(a)])), a) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)))
        if best[0] > -FACE_PATH_M:
            return facing(math.cos(best[1]), math.sin(best[1]))
        return roll(*point) * 2 * math.pi

    def settle(self, model: str, point: np.ndarray, yaw: float, length: float | None = None, terrace: bool = False) -> np.ndarray | None:
        """A mapped object's spot, moved off the paving it would stand on, away from the nearest road or path."""
        return self.settle_shape(lambda at: footprint(model, at, yaw, length), point, terrace)

    def settle_shape(self, shape_at, point: np.ndarray, terrace: bool = False) -> np.ndarray | None:
        """The same for any footprint, `shape_at` giving it at a spot."""
        if self.fits(shape_at(point), terrace):
            return point
        path = self.nearest_path(point, FACE_PATH_M)
        if path is None or np.hypot(*(point - path[1])) < 0.01:
            return None
        away = (point - path[1]) / np.hypot(*(point - path[1]))
        for step in np.arange(0.5, NUDGE_M + 0.01, 0.5):
            moved = point + away * step
            if self.fits(shape_at(moved), terrace):
                return moved
        return None

    def put(self, model: str, point: np.ndarray, yaw: float, length: float | None = None) -> None:
        self.take(footprint(model, point, yaw, length))
        self.roadside.place(model, point, self.surface.at(point), yaw)

    def bench(self, point: np.ndarray, yaw: float) -> None:
        self.put("bench", point, yaw)
        self.benches.append(point)
        middle = on_ground(point, yaw, 0.0, -0.03)
        self.roadside.wall_ring(middle, (0.92, 0.3), yaw)
        for x in BENCH_SEATS_X:
            self.seat("sit-bench", on_ground(point, yaw, x, 0.0), yaw)

    def seat(self, pose: str, point: np.ndarray, yaw: float) -> None:
        self.seats[pose].append([round(float(point[0]), 2), round(self.surface.at(point), 2), round(float(-point[1]), 2), round(yaw % (2 * math.pi), 4)])

    def cafe_set(self, point: np.ndarray, yaw: float, parasol: bool) -> None:
        """A table with a chair either side along its +z, each chair facing the table."""
        self.put("cafe-set", point, yaw)
        if parasol:
            self.roadside.place("parasol", point, self.surface.at(point), yaw)
        for side in (-1, 1):
            self.seat("sit-cafe", on_ground(point, yaw, 0.0, side * CAFE_CHAIR_Z), yaw if side < 0 else yaw + math.pi)

    def bike_racks(self, point: np.ndarray, yaw: float, count: int) -> None:
        """`count` racks end to end, their row centred on `point`, open ends facing the yaw's +z."""
        length = count * BIKE_RACK_M + (count - 1) * RACK_GAP_M
        start = on_ground(point, yaw, -length / 2, 0.0)
        self.take(footprint("bike-rack", start, yaw, length))
        for rack in range(count):
            at = on_ground(start, yaw, rack * (BIKE_RACK_M + RACK_GAP_M), 0.0)
            self.roadside.place("bike-rack", at, self.surface.at(at), yaw)
        self.roadside.wall_ring(on_ground(start, yaw, length / 2, 0.0), (length / 2 + 0.05, 0.42), yaw)
        self.racks.append(point)

    def local(self, element: dict) -> np.ndarray:
        """A node's place, or an outline's middle."""
        points = [element] if element["type"] == "node" else element["geometry"]
        east, north = lonlat_to_grid([point["lon"] for point in points], [point["lat"] for point in points])
        local = np.column_stack(to_local(np.array(east), np.array(north)))
        if len(local) >= 4 and np.allclose(local[0], local[-1]):
            middle = Polygon(local).centroid
            return np.array([middle.x, middle.y])
        return local.mean(axis=0)

    def outline(self, element: dict) -> Polygon | None:
        if element["type"] != "way" or len(element["geometry"]) < 4:
            return None
        east, north = lonlat_to_grid([point["lon"] for point in element["geometry"]], [point["lat"] for point in element["geometry"]])
        shape = Polygon(np.column_stack(to_local(np.array(east), np.array(north))))
        return shape if shape.is_valid and shape.area > 1 else None

    def elements(self, key: str, values: set[str]):
        for element in self.osm["elements"]:
            if element["tags"].get(key) in values:
                yield element

    # OSM's own

    def mapped(self) -> None:
        for element in self.elements("amenity", {"bench"}):
            point = self.local(element)
            yaw = self.face_of(point)
            spot = self.settle("bench", point, yaw)
            if spot is not None:
                self.bench(spot, yaw)
        for element in self.elements("amenity", {"waste_basket"}):
            point = self.local(element)
            yaw = self.face_of(point)
            spot = self.settle("bin", point, yaw)
            if spot is not None:
                self.put("bin", spot, yaw)
        for element in self.elements("amenity", {"bicycle_parking"}):
            point = self.local(element)
            capacity = element["tags"].get("capacity", "")
            count = min(MOST_RACKS, max(1, math.ceil(int(capacity) / BIKES_PER_RACK))) if capacity.isdigit() else 1
            path = self.nearest_path(point, FACE_PATH_M)
            if path is None:
                continue
            chain, nearest = path
            yaw = along_yaw(*chain.direction_at(chain.line.project(Point(nearest))))
            if (nearest - point) @ np.array([math.sin(yaw), -math.cos(yaw)]) < 0:
                yaw += math.pi
            length = count * BIKE_RACK_M + (count - 1) * RACK_GAP_M
            start = self.settle("bike-rack", on_ground(point, yaw, -length / 2, 0.0), yaw, length)
            if start is not None:
                self.bike_racks(on_ground(start, yaw, length / 2, 0.0), yaw, count)

    def terraces(self) -> None:
        for element in self.elements("leisure", {"outdoor_seating"}):
            area = self.outline(element)
            if area is not None:
                self.seating_area(area)
        for element in self.elements("amenity", TERRACE_KINDS):
            kind = element["tags"]["amenity"]
            seating = element["tags"].get("outdoor_seating")
            point = self.local(element)
            if seating == "no" or (seating is None and roll(*point, 5.3) >= TERRACE_UNTAGGED[kind]):
                continue
            self.terrace(point)

    def street_wall(self, point: np.ndarray, reach: float):
        """The wall of the building at `point` (or nearest it) that faces its street: the wall's ends and its way out."""
        near = self.roadside.building_tree.query(Point(point), predicate="dwithin", distance=reach)
        if len(near) == 0:
            return None
        building = min((self.roadside.buildings[index] for index in near), key=lambda shape: shape.distance(Point(point)))
        street = self.nearest_path(point, VENUE_STREET_M, motor_only=True)
        if street is None:
            return None
        ring = np.array(building.exterior.coords)
        clockwise = not building.exterior.is_ccw
        best = None
        for a, b in zip(ring, ring[1:]):
            length = float(np.hypot(*(b - a)))
            if length < SHORTEST_WALL_M:
                continue
            along = (b - a) / length
            # The outward way: right of a counter-clockwise ring's edge.
            out = np.array([along[1], -along[0]]) * (-1 if clockwise else 1)
            middle = (a + b) / 2
            if (street[0].line.interpolate(street[0].line.project(Point(middle))).coords[0] - middle) @ out <= 0:
                continue
            score = street[0].line.distance(Point(middle)) + 0.3 * np.hypot(*(middle - point))
            if best is None or score < best[0]:
                best = (score, a, b, out)
        return None if best is None else best[1:]

    def terrace(self, point: np.ndarray) -> None:
        wall = self.street_wall(point, VENUE_BUILDING_M)
        if wall is None:
            return
        a, b, out = wall
        length = float(np.hypot(*(b - a)))
        along = (b - a) / length
        parasols = roll(*point, 2.2) < PARASOL_SHARE
        pitch = max(TERRACE_PITCH_M, 2 * PARASOL_RADIUS_M + 0.1) if parasols else TERRACE_PITCH_M
        wanted = pick(roll(point[1], point[0], 1.7), TERRACE_SETS)
        middle = float(np.clip((point - a) @ along, pitch / 2, length - pitch / 2))
        # The set's +x points out from the wall, so its chairs sit along it.
        yaw = along_yaw(*out)
        for out_m in TERRACE_OUT_M:
            first = PARASOL_RADIUS_M + 0.1 if parasols else 0.0
            if out_m < first:
                continue
            spots = [a + along * (middle + (index - (wanted - 1) / 2) * pitch) + out * out_m for index in range(wanted)]
            kept = [spot for spot in spots if 0 <= (spot - a) @ along <= length and self.fits(footprint("cafe-set", spot, yaw), terrace=True)]
            if len(kept) >= max(1, wanted - 1):
                for spot in kept:
                    self.cafe_set(spot, yaw, parasols)
                return

    def seating_area(self, area: Polygon) -> None:
        """A mapped terrace's outline, filled with tables in rows along its longest side."""
        ring = np.array(area.exterior.coords)
        edges = [(float(np.hypot(*(b - a))), b - a) for a, b in zip(ring, ring[1:])]
        _, longest = max(edges, key=lambda edge: edge[0])
        yaw = along_yaw(*longest) + math.pi / 2
        middle = np.array(area.centroid.coords[0])
        parasols = roll(*middle, 2.2) < PARASOL_SHARE
        step_x, step_z = (2 * PARASOL_RADIUS_M + 0.1, 2 * PARASOL_RADIUS_M + 0.1) if parasols else SEATING_GRID_M
        reach = math.ceil(math.sqrt(area.area)) + 2
        for i in np.arange(-reach, reach, step_x):
            for j in np.arange(-reach, reach, step_z):
                spot = on_ground(middle, yaw, float(i), float(j))
                shape = footprint("cafe-set", spot, yaw)
                if shape.buffer(0.1).within(area) and self.fits(shape, terrace=True):
                    self.cafe_set(spot, yaw, parasols)

    # Rules

    def path_benches(self) -> None:
        """Benches along a park's paths and a pedestrian street, facing the path, and by a town's water, facing the water."""
        parks = [shape for shape in (self.outline(element) for element in self.elements("leisure", {"park"})) if shape is not None]
        park_tree = shapely.STRtree(parks) if parks else None
        for chain in self.paths:
            if chain.motor and chain.kind != "living_street" or chain.kind not in PATH_KINDS:
                continue
            first = roll(*chain.rings[0, 2, :2])
            placed = 0
            for along in np.arange(first * 12.0 + 6.0, chain.length - 4.0, 2.0):
                along = float(along)
                if chain.on_span(along, 2.0):
                    continue
                centre = chain.ring_at(along)[2, :2]
                in_park = park_tree is not None and len(park_tree.query(Point(centre), predicate="within")) > 0
                waterside = self.waterside(chain, along)
                if not (in_park or chain.kind == "pedestrian" or waterside is not None):
                    continue
                spacing = PARK_BENCH_SPACING_M if in_park or chain.kind == "pedestrian" else PROMENADE_BENCH_SPACING_M
                if any(np.hypot(*(centre - bench)) < max(BENCH_NEAR_M, spacing * 0.8) for bench in self.benches):
                    continue
                sides = [waterside] if waterside is not None else ([1, -1] if roll(along, chain.index) < 0.5 else [-1, 1])
                for side in sides:
                    point, _, out = self.roadside.beside(chain, along, side, BENCH_OUT_M + 0.35)
                    # On a waterside path the bench looks out over the water; elsewhere at the path.
                    yaw = facing(*out) if waterside is not None else facing(*-out)
                    if waterside is not None and self.shore.at(on_ground(point, yaw, 0.0, 0.5)) > -BENCH_ON_LAND_M:
                        continue
                    if not self.fits(footprint("bench", point, yaw)):
                        continue
                    self.bench(point, yaw)
                    placed += 1
                    if placed % (3 if waterside is not None else 2) == 1:
                        bin_at = on_ground(point, yaw, BIN_BESIDE_M * (1 if roll(*point) < 0.5 else -1), 0.0)
                        if self.fits(footprint("bin", bin_at, yaw)):
                            self.put("bin", bin_at, yaw)
                    break

    def waterside(self, chain, along: float) -> int | None:
        """The side of a town's path that looks over water near by, if one does."""
        if not self.roadside.built_up(chain.ring_at(along)[2, :2]):
            return None
        best = None
        for side in (1, -1):
            point, _, out = self.roadside.beside(chain, along, side, 2.0)
            reach = max(self.shore.at(point + out * metres) for metres in (5.0, 10.0, 15.0, 20.0))
            if reach > 0 and self.shore.at(point) > -WATERSIDE_M and (best is None or reach > best[0]):
                best = (reach, side)
        return None if best is None else best[1]

    def bus_stop_bins(self) -> None:
        for post in self.roadside.signs.get("bus-stop", []):
            point = np.array([post[0], -post[2]])
            if not self.roadside.built_up(point):
                continue
            for turn in np.linspace(0, 2 * math.pi, 8, endpoint=False) + roll(*point):
                spot = point + BUS_STOP_BIN_M * np.array([math.cos(turn), math.sin(turn)])
                yaw = self.face_of(spot)
                if self.fits(footprint("bin", spot, yaw)):
                    self.put("bin", spot, yaw)
                    break

    def destination_racks(self) -> None:
        for (key, value), count in DESTINATIONS.items():
            for element in self.elements(key, {value}):
                point = self.local(element)
                if any(np.hypot(*(point - rack)) < RACKS_APART_M for rack in self.racks):
                    continue
                wall = self.street_wall(point, VENUE_BUILDING_M)
                if wall is None:
                    continue
                a, b, out = wall
                length = float(np.hypot(*(b - a)))
                along = (b - a) / length
                yaw = along_yaw(*along)
                if np.array([math.sin(yaw), -math.cos(yaw)]) @ out < 0:
                    yaw += math.pi
                for racks in range(count, 0, -1):
                    row = racks * BIKE_RACK_M + (racks - 1) * RACK_GAP_M
                    if row > length:
                        continue
                    middle = a + along * float(np.clip((point - a) @ along, row / 2, length - row / 2)) + out * RACK_OUT_M
                    start = on_ground(middle, yaw, -row / 2, 0.0)
                    if self.fits(footprint("bike-rack", start, yaw, row)):
                        self.bike_racks(middle, yaw, racks)
                        break

    def place(self) -> dict[str, list[list[float]]]:
        self.mapped()
        self.terraces()
        self.destination_racks()
        self.path_benches()
        self.bus_stop_bins()
        return self.seats


def pick(share: float, choices: tuple) -> int:
    for value, chance in choices:
        share -= chance
        if share < 0:
            return value
    return choices[0][0]

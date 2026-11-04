"""Town dressing: lindens, flag and midsummer poles, fences, planters, picnic tables and viewpoints.

Placed in the roadside list beside the street furniture (`furniture.py`), so it streams,
draws and stops the car as the roadside does. What OSM maps stands first, before the
furniture, since it is where it really is; what rules place comes after, round it.

- **Lindens** where OSM maps a broadleaf tree in town, or a lime anywhere, and along every
  broadleaf tree row, the avenues of Mariehamn's esplanades and the island's manors, each
  as tall as OSM says or a roll for a grown street tree. A trunk stops the car.
- **Flag poles** where OSM maps them, and one before a town hall, a ferry terminal or a
  hotel, flying Åland's flag (Finland's where OSM names it), every flag in one south-westerly.
- **Midsummer poles** where OSM maps one: a village's pole stands all year.
- **Fences** along OSM's wooden or untagged fences: a white picket fence in town, a
  roundpole fence in the country, broken where a road or path crosses. A car goes through.
- **Planters** down a pedestrian street, wooden boxes of flowers either side, and round
  concrete bowls across each end where it meets a street, which keep cars out.
- **Picnic tables** where OSM maps them, and by rule at picnic sites, rest areas, bathing
  places and in a town's parks.
- **Viewing towers** where OSM maps an observation tower, and a **viewpoint platform**
  at a mapped viewpoint without one, its open side away from the road.
"""

import json
import math

import numpy as np
from shapely.affinity import rotate, translate
from shapely.geometry import LineString, Point, Polygon, box

import shapely

from furniture import Furniture, along_yaw, facing, roll
from grid import lonlat_to_grid, to_local
from landmarks import Landmarks
from sources import osm_dressing_path

# Each model's footprint in its own axes, +x along and +z its front: west, south (back), east, north (front).
FOOTPRINTS = {
    "linden": (-0.35, -0.35, 0.35, 0.35),
    "flagpole-aland": (-0.15, -0.15, 0.15, 0.15),
    "flagpole-finland": (-0.15, -0.15, 0.15, 0.15),
    "midsummer-pole": (-0.4, -0.4, 0.4, 0.4),
    "planter": (-0.45, -0.45, 0.45, 0.45),
    "planter-round": (-0.6, -0.6, 0.6, 0.6),
    "picnic-table": (-1.0, -0.95, 1.0, 0.95),
    "viewing-tower": (-2.6, -2.6, 2.6, 2.6),
    "viewpoint-platform": (-2.6, -4.4, 2.6, 1.8),
}

# A street tree's height when OSM doesn't say: a grown linden.
LINDEN_HEIGHT_M = (10.0, 16.0)
# A trunk's half width, as a share of the tree's height, for the wall the car meets.
TRUNK_SHARE = 0.03
TREE_ROW_SPACING_M = 8.0
TREE_ROW_INSET_M = 2.0
# A tree stands this clear of a carriageway: a row may stand in the strip between a street and its sidewalk.
TREE_CARRIAGEWAY_CLEAR_M = 0.6

# A summer's south-westerly: the flags all fly north-east.
WIND = (1.0, 1.0)
FLAG_RULE = {("amenity", "townhall"), ("amenity", "ferry_terminal"), ("tourism", "hotel")}
FLAG_OUT_M = 3.5
FLAG_BUILDING_M = 30.0
POLE_HALF_M = 0.1

FENCE_TYPES = {None, "wood", "picket", "split_rail", "round_pole", "pole"}
TOWN_FENCE_M = 2.0
FARM_FENCE_M = 2.4
# A fence keeps this clear of anything paved and of buildings, and a part shorter than this is left out.
FENCE_CLEAR_M = 0.4
SHORTEST_FENCE_M = 3.0
FENCE_STEP_M = 0.5

PLANTER_SPACING_M = 24.0
PLANTER_IN_M = 0.7
BOWL_BACK_M = 2.5
BOWL_IN_M = 0.8
BOWL_HALF_M = 0.55

PICNIC_SITES = {("tourism", "picnic_site"): 2, ("highway", "rest_area"): 2, ("leisure", "swimming_area"): 2, ("leisure", "beach_resort"): 2}
# A site has its own tables already if OSM maps one this near.
MAPPED_TABLE_M = 40.0
TABLE_SEARCH_M = 14.0
TABLE_APART_M = 4.0
# A park in town gets a table for every so many square metres, up to a few, near one of its paths.
PARK_TABLE_M2 = 4000.0
PARK_SMALLEST_M2 = 2000.0
MOST_PARK_TABLES = 3
PARK_TABLE_PATH_M = 12.0

# One viewpoint to a place: OSM often maps several points of one view.
VIEWPOINTS_APART_M = 80.0
# A view looks where the land falls away most, read this far out round the point.
VIEW_PROBE_M = (40.0, 80.0)
VIEW_WAYS = 16
# A landmark is its own model with its own surroundings: nothing stands this near its plan.
LANDMARK_CLEAR_M = 8.0
VIEW_BUILDING_CLEAR_M = 3.0


def footprint(model: str, point: np.ndarray, yaw: float) -> Polygon:
    west, back, east, front = FOOTPRINTS[model]
    shape = box(west, -front, east, -back)
    return translate(rotate(shape, yaw, origin=(0, 0), use_radians=True), *point)


class Dressing:
    def __init__(self, furniture: Furniture):
        self.furniture = furniture
        self.roadside = furniture.roadside
        self.osm = json.loads(osm_dressing_path(self.roadside.tile).read_text(encoding="utf-8"))
        self.tables: list[np.ndarray] = []
        plans = Landmarks(self.roadside.tile).footprints()
        self.landmarks = shapely.STRtree(plans) if plans else None

    # Places

    def elements(self, key: str, values: set[str]):
        for element in self.osm["elements"]:
            if element["tags"].get(key) in values:
                yield element

    def line(self, element: dict) -> np.ndarray:
        east, north = lonlat_to_grid([point["lon"] for point in element["geometry"]], [point["lat"] for point in element["geometry"]])
        return np.column_stack(to_local(np.array(east), np.array(north)))

    def fits(self, model: str, point: np.ndarray, yaw: float, sidewalk: bool = False) -> bool:
        return not self.by_landmark(point) and self.furniture.fits(footprint(model, point, yaw), terrace=sidewalk)

    def settle(self, model: str, point: np.ndarray, yaw: float) -> np.ndarray | None:
        """A mapped object's spot, moved off the paving as the furniture's is, and never by a landmark."""
        return None if self.by_landmark(point) else self.furniture.settle_shape(lambda at: footprint(model, at, yaw), point)

    def by_landmark(self, point: np.ndarray) -> bool:
        return self.landmarks is not None and len(self.landmarks.query(Point(point), predicate="dwithin", distance=LANDMARK_CLEAR_M)) > 0

    def put(self, model: str, point: np.ndarray, yaw: float, scale: float | None = None, wall_half: float | None = None) -> None:
        self.furniture.take(footprint(model, point, yaw))
        self.roadside.place(model, point, self.furniture.surface.at(point), yaw, scale=scale)
        if wall_half is not None:
            self.roadside.wall_ring(point, (wall_half, wall_half), yaw)

    def clear_of_carriageways(self, point: np.ndarray, metres: float) -> bool:
        """No motor road's carriageway within `metres`: a tree may stand on a sidewalk or the strip beside it."""
        paved = self.roadside.paved
        for index in paved.tree.query(Point(point), predicate="dwithin", distance=metres):
            owner = int(paved.owners[index])
            if owner >= 0 and self.furniture.chains[owner].motor:
                return False
        return True

    # OSM's own

    def lindens(self) -> None:
        for element in self.elements("natural", {"tree"}):
            tags = element["tags"]
            point = self.furniture.local(element)
            lime = tags.get("genus") == "Tilia" or "Tilia" in tags.get("species", "")
            if tags.get("leaf_type") == "needleleaved" or not (lime or self.roadside.built_up(point)):
                continue
            self.linden(point, height_of(tags, point))
        for element in self.elements("natural", {"tree_row"}):
            if element["type"] != "way" or len(element["geometry"]) < 2 or element["tags"].get("leaf_type") == "needleleaved":
                continue
            self.tree_row(LineString(self.line(element)), element["tags"])

    def tree_row(self, line: LineString, tags: dict) -> None:
        """Lindens evenly along a row, in from its ends, each where it can stand."""
        usable = line.length - 2 * TREE_ROW_INSET_M
        count = max(1, round(usable / TREE_ROW_SPACING_M) + 1) if usable > 0 else 1
        for index in range(count):
            along = line.length / 2 if count == 1 else TREE_ROW_INSET_M + usable * index / (count - 1)
            point = np.array(line.interpolate(along).coords[0])
            self.linden(point, height_of(tags, point))

    def linden(self, point: np.ndarray, height: float) -> None:
        yaw = roll(*point, 9.1) * 2 * math.pi
        if not self.clear_of_carriageways(point, TREE_CARRIAGEWAY_CLEAR_M) or not self.fits("linden", point, yaw, sidewalk=True):
            return
        self.put("linden", point, yaw, scale=round(height, 2), wall_half=height * TRUNK_SHARE)

    def flagpoles(self) -> None:
        yaw = along_yaw(*WIND)
        for element in self.elements("man_made", {"flagpole"}):
            if is_midsummer(element["tags"]):
                continue
            flag = "finland" if any(word in str(element["tags"]).lower() for word in ("finland", "suomi")) else "aland"
            point = self.furniture.local(element)
            spot = self.settle("flagpole-aland", point, yaw)
            if spot is not None:
                self.put(f"flagpole-{flag}", spot, yaw, wall_half=POLE_HALF_M)

    def midsummer_poles(self) -> None:
        for element in [*self.elements("man_made", {"maypole"}), *(element for element in self.elements("man_made", {"flagpole"}) if is_midsummer(element["tags"]))]:
            point = self.furniture.local(element)
            # Its bar across faces the road, as a village's pole is set up to be seen.
            yaw = self.furniture.face_of(point)
            spot = self.settle("midsummer-pole", point, yaw)
            if spot is not None:
                self.put("midsummer-pole", spot, yaw, wall_half=0.25)

    def fences(self) -> None:
        for element in self.elements("barrier", {"fence"}):
            if element["type"] != "way" or len(element["geometry"]) < 2 or element["tags"].get("fence_type") not in FENCE_TYPES:
                continue
            line = self.line(element)
            town = self.roadside.built_up(line[len(line) // 2])
            section = TOWN_FENCE_M if town else FARM_FENCE_M
            kind = "fence-town" if town else "fence-farm"
            for run in self.fence_runs(LineString(line)):
                self.fence_run(run, kind, section)

    def fence_runs(self, line: LineString) -> list[LineString]:
        """The parts of a line clear of paving and buildings, inside the tile."""
        runs, run = [], []
        for along in np.arange(0.0, line.length + FENCE_STEP_M / 2, FENCE_STEP_M):
            point = np.array(line.interpolate(min(along, line.length)).coords[0])
            if self.roadside.free(point, FENCE_CLEAR_M):
                run.append(point)
            else:
                runs.append(run)
                run = []
        runs.append(run)
        return [LineString(run) for run in runs if len(run) > 1 and LineString(run).length >= SHORTEST_FENCE_M]

    def fence_run(self, run: LineString, kind: str, section: float) -> None:
        count = max(1, round(run.length / section))
        stops = [np.array(run.interpolate(run.length * index / count).coords[0]) for index in range(count + 1)]
        heights = [self.roadside.heights.at(*stop) for stop in stops]
        for (a, ay), (b, by) in zip(zip(stops, heights), zip(stops[1:], heights[1:])):
            chord = float(np.hypot(*(b - a)))
            self.roadside.place(kind, a, ay, along_yaw(*(b - a)), chord / section, (by - ay) / chord)
        self.roadside.place(f"{kind}-post", stops[-1], heights[-1], along_yaw(*(stops[-1] - stops[-2])))
        self.furniture.take(run.buffer(0.15))

    def picnic_tables(self) -> None:
        mapped = [self.furniture.local(element) for element in self.elements("leisure", {"picnic_table"})]
        for point in mapped:
            yaw = self.furniture.face_of(point)
            spot = self.settle("picnic-table", point, yaw)
            if spot is not None:
                self.table(spot, yaw)
        for (key, value), wanted in PICNIC_SITES.items():
            for element in self.elements(key, {value}):
                point = self.furniture.local(element)
                if any(np.hypot(*(point - table)) < MAPPED_TABLE_M for table in mapped):
                    continue
                self.tables_near(point, wanted, TABLE_SEARCH_M)

    def table(self, point: np.ndarray, yaw: float) -> None:
        self.put("picnic-table", point, yaw)
        self.tables.append(point)

    def tables_near(self, point: np.ndarray, wanted: int, reach: float, within: Polygon | None = None) -> None:
        """Up to `wanted` tables on a spiral out from a point, clear of each other and of everything placed."""
        placed = 0
        for step in range(1, 120):
            if placed >= wanted:
                return
            turn = step * 2.39996 + roll(*point, 4.4) * 2 * math.pi
            spot = point + math.sqrt(step / 120) * reach * np.array([math.cos(turn), math.sin(turn)])
            yaw = roll(*spot, 1.3) * math.pi
            if within is not None and not within.contains(Point(spot)):
                continue
            if any(np.hypot(*(spot - table)) < TABLE_APART_M for table in self.tables) or not self.fits("picnic-table", spot, yaw):
                continue
            self.table(spot, yaw)
            placed += 1

    def viewpoints(self) -> None:
        views: list[np.ndarray] = []
        for element in self.elements("tower:type", {"observation"}):
            point = self.furniture.local(element)
            yaw = self.view_of(point)
            if self.building_near(point) or not self.fits("viewing-tower", point, yaw):
                continue
            self.put("viewing-tower", point, yaw, wall_half=2.4)
            views.append(point)
        for element in self.elements("tourism", {"viewpoint"}):
            point = self.furniture.local(element)
            if element["type"] != "node" or any(np.hypot(*(point - view)) < VIEWPOINTS_APART_M for view in views) or self.building_near(point):
                continue
            yaw = self.view_of(point)
            spot = self.settle("viewpoint-platform", point, yaw)
            if spot is not None:
                self.put("viewpoint-platform", spot, yaw)
                views.append(spot)

    def view_of(self, point: np.ndarray) -> float:
        """The yaw that turns a model's front to the view: the way the ground round about lies lowest, water lowest of all."""
        def lowness(way: np.ndarray) -> float:
            return sum(self.roadside.heights.at(*(point + way * metres)) for metres in VIEW_PROBE_M)

        ways = [np.array([math.cos(turn), math.sin(turn)]) for turn in np.linspace(0, 2 * math.pi, VIEW_WAYS, endpoint=False)]
        return facing(*min(ways, key=lowness))

    def building_near(self, point: np.ndarray) -> bool:
        return len(self.roadside.building_tree.query(Point(point), predicate="dwithin", distance=VIEW_BUILDING_CLEAR_M)) > 0

    # Rules

    def flag_rule(self) -> None:
        yaw = along_yaw(*WIND)
        for key, value in FLAG_RULE:
            for element in self.elements(key, {value}):
                point = self.furniture.local(element)
                wall = self.furniture.street_wall(point, FLAG_BUILDING_M)
                if wall is None:
                    continue
                a, b, out = wall
                spot = (a + b) / 2 + out * FLAG_OUT_M
                if self.fits("flagpole-aland", spot, yaw):
                    self.put("flagpole-aland", spot, yaw, wall_half=POLE_HALF_M)

    def planters(self) -> None:
        for chain in self.furniture.paths:
            if chain.kind != "pedestrian":
                continue
            first = roll(*chain.rings[0, 2, :2], 6.6) * PLANTER_SPACING_M
            for index, along in enumerate(np.arange(first + PLANTER_SPACING_M / 2, chain.length - 2.0, PLANTER_SPACING_M)):
                side = 1 if index % 2 == 0 else -1
                point, _, out = self.roadside.beside(chain, float(along), side, -PLANTER_IN_M)
                yaw = facing(*-out)
                if self.fits("planter", point, yaw, sidewalk=True):
                    self.put("planter", point, yaw, wall_half=0.42)
            for along, towards in ((0.0, 1), (chain.length, -1)):
                end = chain.ring_at(along)[2, :2]
                if self.roadside.nearest_road(end, 8.0) is None:
                    continue
                back = along + towards * BOWL_BACK_M
                ring = chain.ring_at(back)
                half = float(np.hypot(*(ring[3, :2] - ring[1, :2]))) / 2
                if half < BOWL_IN_M + BOWL_HALF_M:
                    continue
                for side in (1, -1):
                    point, _, _ = self.roadside.beside(chain, back, side, -BOWL_IN_M - BOWL_HALF_M)
                    if self.fits("planter-round", point, 0.0, sidewalk=True):
                        self.put("planter-round", point, roll(*point) * math.pi, wall_half=0.5)

    def park_tables(self) -> None:
        for element in self.furniture.elements("leisure", {"park"}):
            park = self.furniture.outline(element)
            if park is None or park.area < PARK_SMALLEST_M2 or not self.roadside.built_up(np.array(park.centroid.coords[0])):
                continue
            wanted = min(MOST_PARK_TABLES, int(park.area // PARK_TABLE_M2) + 1)
            near_paths = [chain.line for chain in self.furniture.paths if not chain.motor and chain.line.intersects(park)]
            if not near_paths:
                continue
            middle = np.array(near_paths[0].interpolate(near_paths[0].length / 2).coords[0])
            self.tables_near(middle, wanted, PARK_TABLE_PATH_M, within=park)

    def place_mapped(self) -> None:
        """What OSM maps, before the furniture, which keeps clear of it."""
        self.lindens()
        self.midsummer_poles()
        self.flagpoles()
        self.viewpoints()
        self.picnic_tables()
        self.fences()

    def place_rules(self) -> None:
        """What rules place, after the furniture."""
        self.flag_rule()
        self.planters()
        self.park_tables()


def is_midsummer(tags: dict) -> bool:
    return any("midsommar" in str(value).lower() for value in tags.values()) or tags.get("man_made") == "maypole"


def height_of(tags: dict, point: np.ndarray) -> float:
    """OSM's height where it gives a believable one, else a grown tree's."""
    try:
        height = float(tags.get("height", "").replace("m", "").strip())
        if 4.0 <= height <= 30.0:
            return height
    except ValueError:
        pass
    low, high = LINDEN_HEIGHT_M
    return low + roll(*point, 2.9) * (high - low)

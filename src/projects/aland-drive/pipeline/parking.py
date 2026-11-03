"""Parked cars: in OSM's car parks, in rows that follow each one's shape, and along a town's kerbs.

A car park (`amenity=parking` on the ground) is filled to a share of its bays:
along each of its mapped aisles (`service=parking_aisle`) a row of bays either
side, nose to the aisle, and where it has none, rows laid along its longest side,
each pair back to back between aisles. A kerb takes cars where OSM's `parking:*`
says so, and on a town's lesser streets where it says nothing, sparsely: OSM tags
few of Mariehamn's. A kerb's car stands just past the carriageway, on the kerb as
Mariehamn's do, facing the way its side's traffic goes.

Nothing stands on a carriageway or a path, in a junction's or a drive's mouth, by a
marked crossing or a bus stop, on a bridge, against a building or the roadside's
lamps and signs. The list holds only where each bay's car stands: the game picks
its model and paint by its place, and stands walls round it the car can't pass.

Run alone, it adds `parked.json` to tiles already built, after `roadside.py`.
"""

import argparse
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

from furniture import FOOTPRINTS, footprint
from grid import Tile, tile_from_name
from roadside import CENTRE, EDGE_LEFT, EDGE_RIGHT, LICENCE, RINGS, STREET_RANK, Chain, Roadside, facing, replace_text, roll, side_name
from sources import osm_path
from vectors import tagged_paved_areas

FILE = "parked.json"
APRON_FLOATS = 5

# A bay, and the room a car takes in one: the biggest world car is 5.0 m by 1.84 m.
BAY_WIDE_M = 2.5
BAY_DEEP_M = 5.0
AISLE_M = 6.0
CAR_HALF_M = (0.95, 2.45)
# A car's room keeps this inside its car park's outline, and this clear of any carriageway or path.
INSIDE_M = 0.2
ROAD_CLEAR_M = 0.3
BUILDING_CLEAR_M = 0.5
# And this clear of whatever stands beside the road: a lamp, a pole, a sign, a shelter.
ROADSIDE_CLEAR_M = 0.6
# Most of a row faces its aisle; the rest backed in.
BACKED_IN_SHARE = 0.2
# How full a car park is, by who it's for. Each park rolls its own day around that.
FILL_BY_ACCESS = {"customers": 0.55, "private": 0.45, "destination": 0.5}
FILL = 0.5
STREET_SIDE_FILL = 0.7
DAY_SPREAD = 0.4

KERB_BAY_M = 6.0
# Between the carriageway's edge and a kerb car's side.
KERB_GAP_M = 0.2
TAGGED_KERB_FILL = 0.6
# A town's lesser street with no word from OSM: a few cars, both sides.
UNTAGGED_KERB_FILL = 0.15
# A kerb car keeps this clear of another motor road, so none stands in a junction's or a drive's mouth.
MOUTH_CLEAR_M = 5.0
CROSSING_CLEAR_M = 6.0
BUS_STOP_CLEAR_M = 15.0
BRIDGE_CLEAR_M = 10.0
# OSM's way under a kerb is the nearest within this.
WAY_REACH_M = 6.0

PARKING_YES = {"yes", "lane", "street_side", "on_kerb", "half_on_kerb", "shoulder", "parallel", "diagonal", "perpendicular", "marked", "painted_area_only"}
PARKING_NO = {"no", "no_parking", "no_stopping", "separate", "fire_lane", "none"}

TAKEN_CELL_M = 10.0


class Aprons:
    """How high the aprons stand as drawn, car parks among them."""

    def __init__(self, folder: Path, manifest: dict):
        surface = manifest["roadSurface"]
        sections = sum(chain["sections"] for chain in surface["chains"])
        data = gzip.decompress((folder / surface["file"]).read_bytes())
        start = sections * RINGS * 12 + sections
        aprons = surface["aprons"]
        points = np.frombuffer(data, dtype="<f4", count=aprons["points"] * APRON_FLOATS, offset=start).reshape(-1, APRON_FLOATS).astype(np.float64)
        indices = np.frombuffer(data, dtype="<u4", count=aprons["triangles"] * 3, offset=start + points.size * 4).reshape(-1, 3)
        self.triangles = points[indices][:, :, :3]
        self.tree = shapely.STRtree(shapely.polygons(np.concatenate((self.triangles[:, :, :2], self.triangles[:, :1, :2]), axis=1)))

    def height(self, point: np.ndarray) -> float | None:
        for index in self.tree.query(Point(point), predicate="intersects"):
            a, b, c = self.triangles[index]
            across = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(across) < 1e-9:
                continue
            first = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / across
            second = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / across
            return float(first * a[2] + second * b[2] + (1 - first - second) * c[2])
        return None


def room(centre: np.ndarray, nose: np.ndarray) -> Polygon:
    """The ground a car takes, its length along `nose`."""
    across = np.array([-nose[1], nose[0]])
    wide, long = CAR_HALF_M
    return Polygon([centre + nose * a * long + across * b * wide for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def kerb_parking(tags: dict, side: str) -> bool | None:
    """Whether OSM lets cars park on one side of a way, `left` or `right` as it runs; None where it says nothing."""
    for key in (f"parking:{side}", "parking:both", f"parking:lane:{side}", "parking:lane:both"):
        value = tags.get(key)
        if value in PARKING_NO:
            return False
        if value in PARKING_YES:
            return True
    return None


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / max(float(np.hypot(*vector)), 1e-9)


def standing(roadside_file: dict) -> shapely.STRtree:
    """What stands beside the road: a lamp, pole or sign at its place, and street furniture by its whole footprint, since a café table and its chairs reach a metre either side."""
    shapes = [footprint(model, np.array([place[0], -place[2]]), place[3]) if model in FOOTPRINTS else Point(place[0], -place[2]) for model, places in roadside_file.get("models", {}).items() for place in places]
    shapes += [Point(post[0], -post[2]) for posts in roadside_file.get("signs", {}).values() for post in posts]
    return shapely.STRtree(shapes)


def points_tree(points: list[np.ndarray]) -> shapely.STRtree:
    return shapely.STRtree(shapely.points(np.array(points).reshape(-1, 2)))


class Parking:
    def __init__(self, roadside: Roadside, aprons: Aprons, parks: list[tuple[Polygon, dict]], roadside_file: dict):
        self.roadside = roadside
        self.aprons = aprons
        self.parks = parks
        self.aisles = [line for line, tags in zip(roadside.ways.lines, roadside.ways.tags) if tags.get("service") == "parking_aisle"]
        self.cars: list[list[float]] = []
        self.counts = {"car park": 0, "kerb": 0}
        self.taken: dict[tuple[int, int], list[Polygon]] = defaultdict(list)
        # Carriageways and paths, each knowing its chain: a car park's own paving is where its cars stand, so aprons aren't here.
        quads, owners = [], []
        for chain in roadside.chains:
            left, right = chain.rings[:, EDGE_LEFT, :2], chain.rings[:, EDGE_RIGHT, :2]
            for index in range(len(left) - 1):
                quad = Polygon([left[index], left[index + 1], right[index + 1], right[index]])
                if quad.is_valid and quad.area > 0:
                    quads.append(quad)
                    owners.append(chain)
        self.roads, self.owners = shapely.STRtree(quads), owners
        self.standing = standing(roadside_file)
        nodes = [element for element in roadside.osm["elements"] if element["type"] == "node"]
        self.crossings = points_tree([roadside.local(node) for node in nodes if node["tags"].get("highway") == "crossing"])
        self.bus_stops = points_tree([roadside.local(node) for node in nodes if node["tags"].get("highway") == "bus_stop"])

    def roads_near(self, shape: shapely.Geometry, metres: float) -> list[Chain]:
        return [self.owners[index] for index in self.roads.query(shape, predicate="dwithin", distance=metres)]

    def free(self, ground: Polygon, kerb: Chain | None = None) -> bool:
        """In the tile, off every road and path but the kerb's own, clear of buildings, the roadside and the cars already parked."""
        if not self.roadside.inside(np.array(ground.centroid.coords[0])) or any(road is not kerb for road in self.roads_near(ground, ROAD_CLEAR_M)):
            return False
        if len(self.roadside.building_tree.query(ground, predicate="dwithin", distance=BUILDING_CLEAR_M)) or len(self.standing.query(ground, predicate="dwithin", distance=ROADSIDE_CLEAR_M)):
            return False
        return not any(ground.intersects(other) for other in self.taken[self.cell(ground)])

    def cell(self, ground: Polygon) -> tuple[int, int]:
        x, y = ground.centroid.coords[0]
        return math.floor(x / TAKEN_CELL_M), math.floor(y / TAKEN_CELL_M)

    def claim(self, ground: Polygon) -> None:
        column, row = self.cell(ground)
        # A car is shorter than a cell, so the cells round its own hold every room it can overlap.
        for east in (-1, 0, 1):
            for north in (-1, 0, 1):
                self.taken[column + east, row + north].append(ground)

    def park(self, kind: str, centre: np.ndarray, nose: np.ndarray, height: float) -> None:
        self.cars.append([round(float(centre[0]), 2), round(height, 2), round(float(-centre[1]), 2), round(facing(*-nose), 4)])
        self.counts[kind] += 1

    def height_at(self, point: np.ndarray) -> float:
        drawn = self.aprons.height(point)
        return drawn if drawn is not None else self.roadside.heights.at(*point)

    # Car parks

    def car_parks(self) -> None:
        for area, tags in self.parks:
            fill = STREET_SIDE_FILL if tags.get("parking") == "street_side" else FILL_BY_ACCESS.get(tags.get("access", ""), FILL)
            fill *= 1 + (roll(*area.representative_point().coords[0]) - 0.5) * DAY_SPREAD
            inside = area.buffer(-INSIDE_M)
            if inside.is_empty:
                continue
            # A car park's mapped aisles are its layout, longest first, so a row down the park wins over a stub across it.
            aisles = sorted((aisle for aisle in self.aisles if aisle.intersects(area)), key=lambda aisle: -aisle.length)
            bays = [bay for aisle in aisles for bay in along_aisle(aisle)] if aisles else self.in_rows(area)
            for centre, nose in bays:
                ground = room(centre, nose)
                # An empty bay is still a bay: it keeps its room, so no row across another takes it.
                if inside.contains(ground) and self.free(ground) and not any(aisle.distance(ground) < AISLE_M / 2 - INSIDE_M for aisle in aisles):
                    self.claim(ground)
                    if roll(centre[0], centre[1], 5.3) <= fill:
                        self.park("car park", centre, nose if roll(centre[1], centre[0], 2.9) > BACKED_IN_SHARE else -nose, self.height_at(centre))

    def in_rows(self, area: Polygon):
        """Rows along a car park's longest side, a pair back to back between aisles; a strip one row deep faces its road."""
        corners = np.array(area.minimum_rotated_rectangle.exterior.coords[:4])
        sides = np.diff(np.vstack((corners, corners[:1])), axis=0)
        along = unit(sides[np.argmax(np.hypot(*sides.T))])
        across = np.array([-along[1], along[0]])
        u, v = corners @ along, corners @ across
        rows, at, sign = [], v.min() + BAY_DEEP_M / 2, 1
        while at + BAY_DEEP_M / 2 <= v.max() + 1e-6:
            rows.append((at, sign))
            at += AISLE_M + BAY_DEEP_M if sign > 0 else BAY_DEEP_M
            sign = -sign
        for at, sign in rows:
            for step in np.arange(u.min() + BAY_WIDE_M / 2, u.max() - BAY_WIDE_M / 2 + 1e-6, BAY_WIDE_M):
                centre = along * step + across * at
                yield centre, self.towards_road(centre, across) if len(rows) == 1 else across * sign

    def towards_road(self, centre: np.ndarray, across: np.ndarray) -> np.ndarray:
        reach = [len(self.roads_near(Point(centre + across * sign * BAY_DEEP_M), AISLE_M)) for sign in (1, -1)]
        return across if reach[0] >= reach[1] else -across

    # Kerbs

    def kerbs(self) -> None:
        for chain in self.roadside.chains:
            if not chain.motor or not STREET_RANK - 1 <= chain.rank <= STREET_RANK or chain.line is None:
                continue
            for along in np.arange(KERB_BAY_M / 2, chain.length - KERB_BAY_M / 2, KERB_BAY_M):
                if chain.on_span(along, BRIDGE_CLEAR_M):
                    continue
                for side in (1, -1):
                    if roll(along, chain.index, side * 1.7) < self.kerb_fill(chain, along, side):
                        self.kerb_car(chain, along, side)

    def kerb_fill(self, chain: Chain, along: float, side: int) -> float:
        centre = chain.ring_at(along)[CENTRE, :2]
        tags, direction = self.way_at(centre)
        # OSM names a side as its way runs, which may be against the chain.
        right = (side > 0) == (direction is None or float(np.dot(direction, chain.direction_at(along))) >= 0)
        said = kerb_parking(tags, "right" if right else "left")
        if said is not None:
            return TAGGED_KERB_FILL if said else 0.0
        return UNTAGGED_KERB_FILL if chain.rank == STREET_RANK and tags.get("highway") != "living_street" and self.roadside.built_up(centre) else 0.0

    def way_at(self, point: np.ndarray) -> tuple[dict, np.ndarray | None]:
        """OSM's tags at a point of a road, and the way its line runs there."""
        ways = self.roadside.ways
        at = Point(point)
        near = ways.tree.query(at, predicate="dwithin", distance=WAY_REACH_M)
        if not len(near):
            return {}, None
        nearest = min(near, key=lambda index: ways.lines[index].distance(at))
        line = ways.lines[nearest]
        along = line.project(at)
        return ways.tags[nearest], np.array(line.interpolate(min(along + 1.0, line.length)).coords[0]) - np.array(line.interpolate(max(along - 1.0, 0.0)).coords[0])

    def kerb_car(self, chain: Chain, along: float, side: int) -> None:
        edge = chain.ring_at(along)[side_name(side)[0]]
        out = unit(edge[:2] - chain.ring_at(along)[CENTRE, :2])
        centre = edge[:2] + out * (KERB_GAP_M + CAR_HALF_M[0])
        nose = chain.direction_at(along) * side
        ground = room(centre, nose)
        if not self.free(ground, chain) or any(road is not chain and road.motor for road in self.roads_near(ground, MOUTH_CLEAR_M)):
            return
        if len(self.crossings.query(ground, predicate="dwithin", distance=CROSSING_CLEAR_M)) or len(self.bus_stops.query(ground, predicate="dwithin", distance=BUS_STOP_CLEAR_M)):
            return
        _, height, _ = self.roadside.beside(chain, along, side, KERB_GAP_M + CAR_HALF_M[0])
        self.claim(ground)
        self.park("kerb", centre, nose, height)

    def bake(self) -> dict:
        self.car_parks()
        self.kerbs()
        return {**LICENCE, "cars": self.cars}


def along_aisle(aisle: LineString):
    """A bay either side of a mapped aisle every bay's width, each car's nose to it."""
    out = AISLE_M / 2 + BAY_DEEP_M / 2
    for along in np.arange(BAY_WIDE_M / 2, aisle.length, BAY_WIDE_M):
        direction = unit(np.array(aisle.interpolate(min(along + 1.0, aisle.length)).coords[0]) - np.array(aisle.interpolate(max(along - 1.0, 0.0)).coords[0]))
        point = np.array(aisle.interpolate(along).coords[0])
        for side in (1, -1):
            across = np.array([direction[1], -direction[0]]) * side
            yield point + across * out, -across


def car_parks(osm_file: Path, tile: Tile) -> list[tuple[Polygon, dict]]:
    """Each car park on the ground reaching into the tile, with its tags; a bus station has no cars to park."""
    return [(area, tags) for area, tags in tagged_paved_areas(osm_file, tile) if tags.get("amenity") == "parking"]


def bake(tile: Tile, folder: Path, tiles: Path) -> dict:
    """Writes the tile's parked cars and returns its manifest entry."""
    roadside = Roadside(tile, folder, tiles)
    roadside_file = json.loads((folder / "roadside.json").read_text(encoding="utf-8")) if (folder / "roadside.json").exists() else {}
    parking = Parking(roadside, Aprons(folder, roadside.manifest), car_parks(osm_path(tile), tile), roadside_file)
    replace_text(folder / FILE, json.dumps(parking.bake(), separators=(",", ":")))
    return {"file": FILE, "count": parking.counts}


def bake_tiles(names: list[str], tiles: Path) -> None:
    """Adds parked cars to built tiles, once their roadside is there to keep clear of."""
    for name in names:
        folder = tiles / name
        entry = bake(tile_from_name(name), folder, tiles)
        manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        replace_text(folder / "tile.json", json.dumps({**manifest, "parked": entry}, ensure_ascii=False, indent=2))
        print(name, entry["count"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="*", help="NLS sheet names, such as L2343C; every built tile if none")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    arguments = parser.parse_args()
    bake_tiles(arguments.tiles or sorted(path.parent.name for path in arguments.folder.glob("*/tile.json")), arguments.folder)


if __name__ == "__main__":
    main()

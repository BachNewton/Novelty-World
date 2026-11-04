"""OpenStreetMap's roads and buildings, in the game's metric space."""

import json
from pathlib import Path

import numpy as np
import shapely

from grid import Tile, lonlat_to_grid, to_local
from roads import CLASSES, GAP_PAVED_M
from sources import PAVED_AMENITIES

# Highway tags that aren't a surface anyone can use.
NOT_A_ROAD = {"proposed", "construction", "abandoned", "razed", "raceway", "bus_stop", "platform", "rest_area", "services"}
FOOT_OR_BIKE = {"footway", "path", "cycleway", "steps", "bridleway", "pedestrian", "corridor"}
# A car park on the ground: the others are buildings, or under one.
PARKING_ON_THE_GROUND = {None, "surface", "lane", "street_side", "layby"}
KEPT_TAGS = ("name", "ref", "surface", "footway", "lanes", "width", "oneway", "bridge", "tunnel", "covered", "maxspeed", "junction")
# Far enough along the line either side of a tile edge to read the road's direction, not one kink's.
SEAM_CHORD_M = 30.0


def line_to_grid(geometry: list[dict]) -> np.ndarray:
    east, north = lonlat_to_grid([p["lon"] for p in geometry], [p["lat"] for p in geometry])
    return np.column_stack((east, north))


# A line that nicks a tile's corner or edge leaves a stub this short, which rounding to the centimetre makes one point.
SHORTEST_PART_M = 0.02
DEAD_END_CLEAR_M = 1.0


def clip_line(line: np.ndarray, tile: Tile) -> list[np.ndarray]:
    """The parts of a line inside the tile, cut exactly on its edges so neighbours meet."""
    parts: list[np.ndarray] = []
    current: list[np.ndarray] = []

    def finish() -> None:
        if len(current) > 1 and np.hypot(*np.diff(current, axis=0).T).sum() >= SHORTEST_PART_M:
            parts.append(np.array(current))
        current.clear()

    for start, end in zip(line[:-1], line[1:]):
        enter, leave = 0.0, 1.0
        step = end - start
        for axis, low, high in ((0, tile.west, tile.east), (1, tile.south, tile.north)):
            if step[axis] == 0:
                if not low <= start[axis] <= high:
                    enter, leave = 1.0, 0.0
                continue
            near, far = sorted(((low - start[axis]) / step[axis], (high - start[axis]) / step[axis]))
            enter, leave = max(enter, near), min(leave, far)
        # Only touching the edge is outside: that part would be a road of no length.
        if enter >= leave:
            finish()
            continue
        if not current:
            current.append(start + enter * step)
        current.append(start + leave * step)
        if leave < 1.0:
            finish()
    finish()
    return parts


def seam_direction(line: np.ndarray, point: np.ndarray) -> np.ndarray:
    """The way a whole line runs at a point on it, from a chord centred there: both tiles it crosses read the same."""
    lengths = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))))
    steps = line[1:] - line[:-1]
    shares = np.clip(((point - line[:-1]) * steps).sum(axis=1) / np.maximum((steps**2).sum(axis=1), 1e-12), 0, 1)
    nearest = np.hypot(*(line[:-1] + shares[:, None] * steps - point).T).argmin()
    along = lengths[nearest] + shares[nearest] * (lengths[nearest + 1] - lengths[nearest])
    at = lambda distance: np.array([np.interp(distance, lengths, line[:, axis]) for axis in (0, 1)])
    chord = at(along + SEAM_CHORD_M) - at(along - SEAM_CHORD_M)
    return chord / np.hypot(*chord)


def stop_short_of_edge(line: np.ndarray, part: np.ndarray) -> np.ndarray:
    """A way that ends just past an edge has nothing over there to meet, so its part ends as a dead end, not on the seam."""
    part = part.copy()
    for at, inside, end in ((0, 1, line[0]), (-1, -2, line[-1])):
        if 0 < np.hypot(*(part[at] - end)) < SHORTEST_PART_M:
            step = part[inside] - part[at]
            part[at] += step * min(DEAD_END_CLEAR_M / np.hypot(*step), 0.5)
    return part


def _seams(line: np.ndarray, part: np.ndarray, tile: Tile) -> list[list[float]]:
    """For each end of a clipped part on the tile's edge: its place and the whole line's direction there."""
    seams = []
    for point in (part[0], part[-1]):
        if min(abs(point[0] - tile.west), abs(point[0] - tile.east), abs(point[1] - tile.south), abs(point[1] - tile.north)) < 1e-6:
            direction = seam_direction(line, point)
            seams.append([*_rounded(point[None])[0], round(float(direction[0]), 6), round(float(direction[1]), 6)])
    return seams


def _rounded(line: np.ndarray) -> list[list[float]]:
    return [[round(float(x), 2), round(float(y), 2)] for x, y in zip(*to_local(line[:, 0], line[:, 1]))]


def build(osm_file: Path, tile: Tile) -> tuple[list[dict], list[dict], str]:
    """Roads clipped to the tile, and buildings whole, in the one tile holding their middle."""
    osm = json.loads(osm_file.read_text(encoding="utf-8"))
    roads: list[dict] = []
    buildings: list[dict] = []
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "way" and "highway" in tags and tags["highway"] not in NOT_A_ROAD:
            kind = tags["highway"]
            whole = line_to_grid(element["geometry"])
            for clipped in clip_line(whole, tile):
                part = stop_short_of_edge(whole, clipped)
                road = {"id": element["id"], "kind": kind, "motor": kind not in FOOT_OR_BIKE, "line": _rounded(part)}
                seams = _seams(whole, part, tile)
                if seams:
                    road["seams"] = seams
                road.update({key: tags[key] for key in KEPT_TAGS if key in tags})
                roads.append(road)
        if "building" in tags:
            if element["type"] == "way":
                rings = [element["geometry"]]
            else:
                rings = [m["geometry"] for m in element.get("members", []) if m.get("role") == "outer" and "geometry" in m]
            for ring in rings:
                grid_ring = line_to_grid(ring)
                middle = grid_ring.mean(axis=0)
                if tile.west <= middle[0] < tile.east and tile.south <= middle[1] < tile.north:
                    buildings.append({"id": element["id"], "kind": tags["building"], "ring": _rounded(grid_ring)})
    return roads, buildings, osm.get("osm3s", {}).get("timestamp_osm_base", "")


def paved_areas(osm_file: Path, tile: Tile) -> list[shapely.Polygon]:
    """Car parks and bus stations reaching into the tile, in the game's metric space: each is laid as one paved surface."""
    return [area for area, _ in tagged_paved_areas(osm_file, tile)]


def tagged_paved_areas(osm_file: Path, tile: Tile) -> list[tuple[shapely.Polygon, dict]]:
    """The same, each with its OSM tags."""
    osm = json.loads(osm_file.read_text(encoding="utf-8"))
    box = shapely.box(*to_local(tile.west, tile.south), *to_local(tile.east, tile.north))
    areas: list[tuple[shapely.Polygon, dict]] = []
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if tags.get("amenity") not in PAVED_AMENITIES or tags.get("parking") not in PARKING_ON_THE_GROUND:
            continue
        if element["type"] == "way":
            outers, inners = [element["geometry"]], []
        else:
            outers = [member["geometry"] for member in element["members"] if member["role"] == "outer"]
            inners = [member["geometry"] for member in element["members"] if member["role"] == "inner"]
        # A relation's rings can be drawn in several ways each, so they're joined up before they're filled.
        filled = [shapely.union_all(list(shapely.get_parts(shapely.polygonize([_local_line(line) for line in rings if len(line) >= 2])))) for rings in (outers, inners)]
        area = shapely.difference(filled[0], filled[1]).buffer(0)
        areas += [(part, tags) for part in shapely.get_parts(area) if isinstance(part, shapely.Polygon) and part.intersects(box)]
    return areas


# Service ways side by side for at least this far are lanes of one paved yard (a ferry's queue, a depot), not roads apart.
LANES_ALONGSIDE_M = 15.0
# A yard of lanes smaller than this is two drives that happen to meet.
SMALLEST_YARD_M2 = 150.0


def lane_yards(osm_file: Path, tile: Tile) -> list[shapely.Polygon]:
    """Where service ways run side by side, with no wider strip between them than GAP_PAVED_M: one paved surface, as a car park is,
    though OSM maps no area round them. Read from whole ways, so both tiles at an edge find the same yard."""
    osm = json.loads(osm_file.read_text(encoding="utf-8"))
    half = CLASSES["service"].width_m / 2
    reach = half + GAP_PAVED_M / 2
    lines = [
        _local_line(element["geometry"])
        for element in osm["elements"]
        if element["type"] == "way" and element.get("tags", {}).get("highway") == "service" and not {"bridge", "tunnel"} & element["tags"].keys() and len(element["geometry"]) >= 2
    ]
    if len(lines) < 2:
        return []
    grown = [line.buffer(reach) for line in lines]
    tree = shapely.STRtree(grown)
    alongside, lanes = [], set()
    for first, second in tree.query(grown, predicate="intersects").T:
        if first >= second:
            continue
        # Two ways that only meet or cross share a patch about as long as they're wide; lanes share it along their length.
        shared = grown[first].intersection(grown[second])
        if shared.area >= LANES_ALONGSIDE_M * 2 * half:
            alongside.append(shared)
            lanes |= {int(first), int(second)}
    if not alongside:
        return []
    between = shapely.union_all(alongside)
    carriageways = shapely.union_all([lines[index].buffer(half) for index in lanes]).intersection(between.buffer(half))
    yard = shapely.union_all([between, carriageways]).buffer(GAP_PAVED_M / 2).buffer(-GAP_PAVED_M / 2)
    box = shapely.box(*to_local(tile.west, tile.south), *to_local(tile.east, tile.north))
    return [part for part in shapely.get_parts(yard) if isinstance(part, shapely.Polygon) and part.area >= SMALLEST_YARD_M2 and part.intersects(box)]


def whole_lines(osm_file: Path) -> dict[int, list]:
    """Every way's whole line, unclipped, in the game's metric space."""
    osm = json.loads(osm_file.read_text(encoding="utf-8"))
    return {element["id"]: shapely.get_coordinates(_local_line(element["geometry"])).tolist() for element in osm["elements"] if element["type"] == "way" and "highway" in element.get("tags", {}) and len(element["geometry"]) >= 2}


def _local_line(geometry: list[dict]) -> shapely.LineString:
    east, north = to_local(*line_to_grid(geometry).T)
    return shapely.LineString(np.column_stack((east, north)))

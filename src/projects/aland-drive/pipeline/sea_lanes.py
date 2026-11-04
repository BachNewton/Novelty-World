"""Boats under way: every ferry line and small boat's route for the whole of Åland, in one small file.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/sea_lanes.py [--data DIR]

`--data` is the `.data` folder to read (built tiles, kept OSM answers, the outer islands' bakes), by default
this checkout's, so a worktree can read the main checkout's and still write its own file.

Writes `sea/lanes.json` beside the game's code, not into the tiles: it is a few tens of kilobytes for the
whole island, it changes with no tile, and the game imports it at the start. A boat's place is then a pure
function of its lane and the clock (`sea/motion.ts`), so every player sees the same boats with nothing sent.

A lane is a line over water. A ferry's follows OSM's `route=ferry` way between its real terminals, and a
small boat's runs between marinas (`art/marina/places.json`) or out to open water along OSM's mapped
fairways (`waterway=fairway`) where they help, and over open water where none does. Both are found the
same way: the cheapest path over a grid of the water, 8 m a cell, where a cell nearer land than the boat
keeps clear of may not be crossed, a cell near the guiding line costs less, and a cell nearer land costs
more, so a lane keeps to the middle of a sound. Its corners are then rounded to the boat's turn, and the
rounded line is checked against the water at 4 m, where the tiles have it, so no boat crosses land.

The water is the tiles' own mask (its red channel, the same water the game draws), and past the tiles
the outer islands' baked colour, whose alpha is land. Only water joined to the open sea counts, so no
lane reaches a lake. Derived from OpenStreetMap, so it stays under ODbL, as the tiles' roads do.
"""

import argparse
import glob
import json
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.graph import MCP_Geometric

from affine import Affine
from rasterio import features

from grid import TILE_SIZE_M, WORLD_ORIGIN, lonlat_to_grid, tile_from_name, to_local
from outlying import OUTLYING_FILE
from sources import sea_chart_path

PROJECT = Path(__file__).resolve().parent.parent
DATA = PROJECT / ".data"
OUTPUT = PROJECT / "sea" / "lanes.json"
PLACES = PROJECT / "art" / "marina" / "places.json"
LICENCE = "Derived from OpenStreetMap, (c) its contributors, under the ODbL"

CELL_M = 8
PER_TILE = TILE_SIZE_M // CELL_M
# The outer islands' baked alpha fades the photo over water; past this it's land, kept on the safe side.
OUTLYING_LAND_ALPHA = 128
# What a lane keeps off, besides land: the docks' runs, and their moored boats as a circle this wide.
RUNS = {"jetty", "pier", "pontoon"}
BOAT_HALF_M = 8.0
DOCK_CLEAR_M = 6.0
# Past this far outside every tile a line is cut: no one on the island sees a ship there (a ferry's far
# model leaves by 20 km), and it waits there, out of sight, between its calls.
CUT_PAST_TILES_M = 24000


@dataclass(frozen=True)
class Vessel:
    """What a lane is found for: the hull, how far it keeps off land at sea, how tightly it turns, and how far to
    starboard of the lane it keeps, so two meeting on one lane pass each other."""

    length_m: float
    beam_m: float
    clear_m: float
    turn_m: float
    keep_right_m: float
    draft_m: float


# `sea/timetable.ts` gives each its speeds; a test holds the names equal.
VESSELS = {
    # The ferries keep to fairways dredged for them, which the chart's depth bands are too coarse to route by
    # (a band of 3 to 6 m can hold a 4 m channel), so they are drawn to the fairways and kept off land, not
    # routed by depth: their draft here is none.
    "ship": Vessel(176, 28, 60, 450, 30, 0),
    "ship-small": Vessel(124, 20, 50, 350, 25, 0),
    "archipelago": Vessel(62, 14, 30, 160, 10, 0),
    # `art/identity`'s wire ferry: every road ferry on Åland runs on a wire.
    "cable": Vessel(18, 6.6, 6, 40, 0, 0),
    "passenger": Vessel(20, 6, 16, 50, 6, 0),
    # A small boat with a keel (a yacht, a big motorboat), and one without (a launch, a RIB).
    "keel": Vessel(12, 4, 14, 30, 5, 2.0),
    # Under a metre: water the land check allows is deep enough for it.
    "boat": Vessel(8, 3, 12, 25, 4, 0),
}
# A charted depth this much more than a vessel's draft is deep enough for it. The chart's depth areas are bands
# (0-3 m, 3-6 m, 6-10 m...), each taken at its shallow edge; an official fairway area is as deep as its design
# draught says, so a keeled boat crosses the 0-3 m band near the shore by the fairways, as real ones do. Water the
# chart has no depth for is taken as deep enough: the land check still keeps the lane off land.
UNDER_KEEL_M = 0.5
# A keeled boat may cross any charted depth this near its trip's ends, where it comes in to its harbour or anchors.
DEPTH_FREE_NEAR_ENDS_M = 400
# Of their cost, a cell on the official fairways' navigation lines saves this share, and one on OSM's mapped lines this:
# a lane follows the chart where it has a line, and falls back to OSM's only where it has none.
OFFICIAL_PULL = 0.85
OSM_PULL = 0.55
# Cutting a lane's corners keeps every straight stretch within this of the cheapest path it stands for.
STRAIGHTEN_WITHIN_M = 12
# The keeping to starboard grows from nothing over this many lengths past where a vessel comes round at an end, so
# it lies at, and turns about, the lane's own end.
KEEP_FROM_LENGTHS = 3
# Within this many lengths of a berth, or this many metres, the lane may come in to its quay, keeping only its
# half beam clear.
BERTH_REACH_LENGTHS = 1.2
BERTH_REACH_LEAST_M = 150


@dataclass
class Water:
    """Water joined to the open sea, `CELL_M` a cell, row 0 along `north`, less what a boat must keep off
    (docks, moored boats, roads over water); and the masks' finer water, where tiles have it."""

    free: np.ndarray
    west: float
    north: float
    masks: dict[tuple[int, int], np.ndarray]
    """Each tile's 4 m water, by its west and north edges."""
    depth_dm: np.ndarray | None = None
    """The chart's least depth in each cell, in decimetres to 25 m; 255 where it has none."""

    def cell(self, x: float, y: float) -> tuple[int, int]:
        return int((self.north - y) // CELL_M), int((x - self.west) // CELL_M)

    def place(self, row: float, column: float) -> tuple[float, float]:
        return self.west + (column + 0.5) * CELL_M, self.north - (row + 0.5) * CELL_M

    def inside(self, x: float, y: float) -> bool:
        row, column = self.cell(x, y)
        return 0 <= row < self.free.shape[0] and 0 <= column < self.free.shape[1]

    def fine_water(self, x: float, y: float) -> bool:
        """At the masks' 4 m where a tile has one, else the grid's cell; past the grid, open sea."""
        west, north = math.floor(x / TILE_SIZE_M) * TILE_SIZE_M, math.ceil(y / TILE_SIZE_M) * TILE_SIZE_M
        mask = self.masks.get((west, north))
        if mask is not None:
            return bool(mask[min(int((north - y) // 4), mask.shape[0] - 1), int((x - west) // 4)])
        if not self.inside(x, y):
            return True
        return bool(self.free[self.cell(x, y)])


def _dock_cells(models: dict, west: float, north: float, shape: tuple[int, int]) -> np.ndarray:
    """Every dock run and moored boat of a tile, grown by `DOCK_CLEAR_M`, as cells of the grid."""
    taken = np.zeros(shape, dtype=bool)
    for kind, places in models.items():
        for x, _, z, yaw, width, length in places:
            along = np.array([math.cos(yaw), math.sin(yaw)])  # +x turns to (cos yaw, -sin yaw) in the scene: north is -z.
            start = np.array([x, -z])
            if kind in RUNS:
                reach, half = length, width / 2
            else:
                start = start - along * BOAT_HALF_M
                reach, half = 2 * BOAT_HALF_M, BOAT_HALF_M
            for step in np.arange(0, reach + CELL_M / 2, CELL_M / 2):
                px, py = start + along * step
                row, column = int((north - py) // CELL_M), int((px - west) // CELL_M)
                grow = int(math.ceil((half + DOCK_CLEAR_M) / CELL_M))
                taken[max(row - grow, 0) : row + grow + 1, max(column - grow, 0) : column + grow + 1] = True
    return taken


def load_water(data: Path) -> Water:
    tiles = data / "tiles"
    world = json.loads((tiles / "world.json").read_text(encoding="utf-8"))
    tiled = [(entry["name"], entry["west"], entry["north"]) for entry in world["tiles"]]
    outer = [(name, *to_local(tile_from_name(name).west, tile_from_name(name).north)) for name in json.loads(OUTLYING_FILE.read_text(encoding="utf-8"))]
    places = tiled + outer
    west = min(place[1] for place in places) - TILE_SIZE_M
    north = max(place[2] for place in places) + TILE_SIZE_M
    columns = (max(place[1] for place in places) + 2 * TILE_SIZE_M - west) // TILE_SIZE_M
    rows = (north - min(place[2] for place in places) + TILE_SIZE_M) // TILE_SIZE_M
    # Ground no tile covers is open sea: the mirror has no sheet there.
    water = np.ones((rows * PER_TILE, columns * PER_TILE), dtype=bool)
    kept_off = np.zeros_like(water)
    masks: dict[tuple[int, int], np.ndarray] = {}
    for name, tile_west, tile_north in tiled:
        rgba = np.asarray(Image.open(tiles / name / "mask.png"))
        # The mask has hairlines of land across open water here and there, a sample or two wide: closed, as no
        # boat would see them. A road over water stays land, so no lane passes under a bridge.
        mask = ndimage.binary_closing(rgba[..., 0] > 127, np.ones((3, 3), dtype=bool), border_value=1) & (rgba[..., 1] <= 127) & (rgba[..., 2] <= 127)
        masks[(tile_west, tile_north)] = mask
        # A cell is water only if all of it is.
        cells = mask.reshape(PER_TILE, CELL_M // 4, PER_TILE, CELL_M // 4).all(axis=(1, 3))
        row, column = int((north - tile_north) // TILE_SIZE_M), int((tile_west - west) // TILE_SIZE_M)
        water[row * PER_TILE : (row + 1) * PER_TILE, column * PER_TILE : (column + 1) * PER_TILE] = cells
        docks = tiles / name / "docks.json"
        if docks.exists():
            kept_off |= _dock_cells(json.loads(docks.read_text(encoding="utf-8"))["models"], west, north, water.shape)
    for name, tile_west, tile_north in outer:
        alpha = np.load(data / "derived" / "outlying" / f"{name}.npz")["colour"][..., 3]
        row, column = int((north - tile_north) // TILE_SIZE_M), int((tile_west - west) // TILE_SIZE_M)
        water[row * PER_TILE : (row + 1) * PER_TILE, column * PER_TILE : (column + 1) * PER_TILE] = alpha <= OUTLYING_LAND_ALPHA
    labels, _ = ndimage.label(water)
    return Water((labels == labels[0, 0]) & ~kept_off, west, north, masks, _charted_depth(water.shape, west, north))


def _charted_depth(shape: tuple[int, int], west: float, north: float) -> np.ndarray:
    """Traficom's depth areas on the grid: each cell the least depth of the area round its middle."""
    areas = json.loads(sea_chart_path("depth-areas").read_text(encoding="utf-8"))["features"]
    shapes = ((area["geometry"], int(np.clip(float(area["properties"]["DRVAL1"]) * 10, 0, 250))) for area in areas if area["geometry"] is not None and area["properties"].get("DRVAL1") is not None)
    origin_east, origin_north = WORLD_ORIGIN
    transform = Affine(CELL_M, 0, west + origin_east, 0, -CELL_M, north + origin_north)
    depth = features.rasterize(shapes, out_shape=shape, transform=transform, fill=255, dtype="uint8")
    fairways = json.loads(sea_chart_path("fairway-areas").read_text(encoding="utf-8"))["features"]
    dredged = ((area["geometry"], int(np.clip((float(area["properties"]["mitoitussyvays"]) + UNDER_KEEL_M) * 10, 0, 250))) for area in fairways if area["geometry"] is not None and area["properties"].get("mitoitussyvays"))
    fairway_depth = features.rasterize(dredged, out_shape=shape, transform=transform, fill=0, dtype="uint8")
    charted = depth != 255
    depth[charted] = np.maximum(depth[charted], fairway_depth[charted])
    return depth


def official_lines() -> list[np.ndarray]:
    """The official fairways' navigation lines (Väylävirasto's register, Åland's own fairways among them), local metres."""
    lines = []
    for feature in json.loads(sea_chart_path("navigation-lines").read_text(encoding="utf-8"))["features"]:
        geometry = feature["geometry"]
        parts = [geometry["coordinates"]] if geometry["type"] == "LineString" else geometry["coordinates"]
        lines += [np.column_stack(to_local(np.asarray(part)[:, 0], np.asarray(part)[:, 1])) for part in parts if len(part) > 1]
    return lines


def _within(lines: list[np.ndarray], low: np.ndarray, high: np.ndarray) -> list[np.ndarray]:
    return [line for line in lines if np.any(np.all((line >= low) & (line <= high), axis=1))]


def _local_line(points: list[tuple[float, float]]) -> np.ndarray:
    east, north = lonlat_to_grid([lon for lon, _ in points], [lat for _, lat in points])
    return np.column_stack(to_local(np.asarray(east), np.asarray(north)))


@dataclass
class Osm:
    ferries: dict[int, tuple[dict, np.ndarray]]
    fairways: list[np.ndarray]
    anchorages: list[np.ndarray]


def read_osm(data: Path) -> Osm:
    """Ferry lines, fairways and anchorages from the kept OSM answers: whole ways, so a tile's box cuts nothing."""
    nodes: dict[str, tuple[float, float]] = {}
    ways: dict[int, tuple[dict, list[str]]] = {}
    marks: dict[str, tuple[float, float]] = {}
    for path in sorted(glob.glob(str(data / "raw" / "osm-api" / "*.xml"))):
        for _, element in ET.iterparse(path):
            if element.tag == "node":
                nodes[element.get("id")] = (float(element.get("lon")), float(element.get("lat")))
                if any(tag.get("k") == "seamark:type" and tag.get("v") == "anchorage" for tag in element.findall("tag")):
                    marks[element.get("id")] = nodes[element.get("id")]
            elif element.tag == "way":
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                if tags.get("route") == "ferry" or tags.get("waterway") == "fairway" or tags.get("seamark:type") == "anchorage":
                    ways[int(element.get("id"))] = (tags, [node.get("ref") for node in element.findall("nd")])
            if element.tag in ("node", "way", "relation"):
                element.clear()
    lines = {way: (tags, _local_line([nodes[ref] for ref in refs if ref in nodes])) for way, (tags, refs) in ways.items()}
    anchorages = [line.mean(axis=0) for tags, line in lines.values() if tags.get("seamark:type") == "anchorage" and len(line) > 0]
    anchorages += [_local_line([point])[0] for point in marks.values()]
    return Osm(
        ferries={way: (tags, line) for way, (tags, line) in lines.items() if tags.get("route") == "ferry" and len(line) > 1},
        fairways=[line for tags, line in lines.values() if tags.get("waterway") == "fairway" and len(line) > 1],
        anchorages=anchorages,
    )


def _along(line: np.ndarray, step_m: float) -> np.ndarray:
    """Points every `step_m` or closer along a line, its corners kept."""
    out = [line[0]]
    for a, b in zip(line[:-1], line[1:]):
        count = max(1, int(math.ceil(np.hypot(*(b - a)) / step_m)))
        out += [a + (b - a) * (k / count) for k in range(1, count + 1)]
    return np.array(out)


def lane(water: Water, start: np.ndarray, goal: np.ndarray, vessel: Vessel, guides: list[tuple[list[np.ndarray], float]], berths: tuple[bool, bool], frame: list[np.ndarray] | None = None, kept_off: list[np.ndarray] | None = None) -> np.ndarray | None:
    """The cheapest line from `start` to `goal` over the water, keeping `vessel.clear_m` off land and out of water the
    chart says is too shallow for its draft except near a berth, drawn towards each set of `guides` lines by its pull
    (the share of its cost a cell on one saves; where sets overlap, the strongest counts), with its corners
    cut to the fewest that keep every stretch on that water; or None where the water doesn't join them. It
    looks for one within the box round its ends and `frame` and a margin. An end that
    isn't a berth starts from the nearest water clear enough, and `ANCHOR_APART_M` from each of `kept_off`, the
    places other lanes' boats already lie."""
    margin = 1500 + vessel.turn_m
    points = np.vstack([start, goal, *(frame or [])])
    low, high = points.min(axis=0) - margin, points.max(axis=0) + margin
    top, left = water.cell(low[0], high[1])
    bottom, right = water.cell(high[0], low[1])
    top, left = max(top, 0), max(left, 0)
    bottom, right = min(bottom + 1, water.free.shape[0]), min(right + 1, water.free.shape[1])
    free = water.free[top:bottom, left:right]
    clear = ndimage.distance_transform_edt(free) * CELL_M
    rows, columns = np.indices(free.shape)
    xs, ys = water.west + (left + columns + 0.5) * CELL_M, water.north - (top + rows + 0.5) * CELL_M
    allowed = clear >= vessel.clear_m
    if water.depth_dm is not None and vessel.draft_m > 0:
        depth = water.depth_dm[top:bottom, left:right]
        near_ends = (np.hypot(xs - start[0], ys - start[1]) < DEPTH_FREE_NEAR_ENDS_M) | (np.hypot(xs - goal[0], ys - goal[1]) < DEPTH_FREE_NEAR_ENDS_M)
        allowed &= (depth == 255) | (depth >= (vessel.draft_m + UNDER_KEEL_M) * 10) | near_ends
    for at, is_berth in zip((start, goal), berths):
        if is_berth:
            near = np.hypot(xs - at[0], ys - at[1]) < max(vessel.length_m * BERTH_REACH_LENGTHS, BERTH_REACH_LEAST_M)
            allowed |= near & (clear >= vessel.beam_m / 2 + 2)
    # Dearer the nearer land, so a lane keeps to the middle of a sound.
    cost = 1 + np.clip((2 * vessel.clear_m - clear) / (2 * vessel.clear_m), 0, 1) * 4
    saved = np.zeros_like(cost)
    for lines, pull in guides:
        on_guide = np.zeros_like(free)
        for guide in _within(lines, np.array([xs.min(), ys.min()]), np.array([xs.max(), ys.max()])):
            for x, y in _along(guide, CELL_M / 2):
                row, column = water.cell(x, y)
                if top <= row < bottom and left <= column < right:
                    on_guide[row - top, column - left] = True
        if on_guide.any():
            off = ndimage.distance_transform_edt(~on_guide) * CELL_M
            saved = np.maximum(saved, pull * np.clip(1 - off / (vessel.clear_m + 40), 0, 1))
    cost = cost * (1 - saved)
    cells = []
    for at, is_berth in zip((start, goal), berths):
        distance = np.hypot(xs - at[0], ys - at[1])
        distance[~allowed] = np.inf
        for other in [] if is_berth else kept_off or []:
            distance[np.hypot(xs - other[0], ys - other[1]) < ANCHOR_APART_M] = np.inf
        cell = np.unravel_index(int(distance.argmin()), distance.shape)
        if distance[cell] > 300:
            return None
        cells.append(cell)
    cost[~allowed] = -1
    mcp = MCP_Geometric(cost)
    costs, _ = mcp.find_costs([cells[0]], [cells[1]])
    if not np.isfinite(costs[cells[1]]):
        return None
    path = np.array(mcp.traceback(cells[1]))
    line = np.column_stack((water.west + (left + path[:, 1] + 0.5) * CELL_M, water.north - (top + path[:, 0] + 0.5) * CELL_M))
    # A berth is where it is, not the nearest cell clear enough to sail from.
    line = np.vstack([start[None] if berths[0] else np.empty((0, 2)), line, goal[None] if berths[1] else np.empty((0, 2))])

    def in_sight(first: int, last: int) -> bool:
        """A straight stretch from one point of the path to another: on allowed water, and close to the path it
        replaces, so a lane that found a fairway keeps to it rather than cutting across open water."""
        a, b = line[first], line[last]
        run = b - a
        length = max(float(np.hypot(*run)), 1e-9)
        between = line[first + 1 : last] - a
        if len(between) and np.abs(run[0] * between[:, 1] - run[1] * between[:, 0]).max() / length > STRAIGHTEN_WITHIN_M:
            return False
        for x, y in _along(np.array([a, b]), CELL_M / 2):
            row, column = water.cell(x, y)
            if not allowed[row - top, column - left]:
                return False
        # Near a berth the allowed water is only a little wider than the hull, so its breadth is checked finely.
        return crossing(water, np.array([a, b]), vessel.beam_m / 2) is None

    kept = [0]
    while kept[-1] < len(line) - 1:
        at, reach, step = kept[-1], kept[-1] + 1, 1
        # Gallop out, then back off to the farthest point still in sight.
        while reach + step < len(line) and in_sight(at, reach + step):
            reach += step
            step *= 2
        while step > 1:
            step //= 2
            if reach + step < len(line) and in_sight(at, reach + step):
                reach += step
        kept.append(reach)
    return line[kept]


def rounded(line: np.ndarray, turn_m: float) -> np.ndarray:
    """Each corner an arc of radius `turn_m`, smaller where its legs are short, a point every 8 degrees."""
    out = [line[0]]
    for at in range(1, len(line) - 1):
        a, b, c = line[at - 1], line[at], line[at + 1]
        into, out_of = b - a, c - b
        into_m, out_m = float(np.hypot(*into)), float(np.hypot(*out_of))
        into, out_of = into / into_m, out_of / out_m
        turn = math.atan2(into[0] * out_of[1] - into[1] * out_of[0], float(into @ out_of))
        if abs(turn) < 1e-3:
            out.append(b)
            continue
        cut = min(turn_m * math.tan(abs(turn) / 2), 0.48 * into_m, 0.48 * out_m)
        radius = cut / math.tan(abs(turn) / 2)
        first = b - into * cut
        centre = first + np.array([-into[1], into[0]]) * radius * (1 if turn > 0 else -1)
        steps = max(2, int(math.ceil(abs(turn) / math.radians(8))))
        start_angle = math.atan2(first[1] - centre[1], first[0] - centre[0])
        out += [centre + radius * np.array([math.cos(start_angle + turn * k / steps), math.sin(start_angle + turn * k / steps)]) for k in range(steps + 1)]
    out.append(line[-1])
    return np.array(out)


def crossing(water: Water, line: np.ndarray, half_beam_m: float = 0) -> tuple[float, float] | None:
    """The first place, every 2 m along a lane and `half_beam_m` either side of it, that isn't open water at the
    finest the data has."""
    for x, y in _breadth(_along(line, 2), half_beam_m):
        if not water.fine_water(x, y):
            return float(x), float(y)
    return None


def _breadth(points: np.ndarray, half_beam_m: float) -> np.ndarray:
    """Each point, and the points `half_beam_m` either side of the line through them."""
    if half_beam_m <= 0 or len(points) < 2:
        return points
    across = np.gradient(points, axis=0)
    across = np.column_stack((-across[:, 1], across[:, 0])) / np.maximum(np.hypot(*across.T), 1e-9)[:, None]
    return np.vstack((points, points + across * half_beam_m, points - across * half_beam_m))


def smoothed(water: Water, line: np.ndarray, vessel: Vessel, what: str) -> np.ndarray:
    """The line with its corners rounded as widely as the water lets them be, its hull's breadth on the water all
    along; a lane that can't be fails the build."""
    turn_m = vessel.turn_m
    while turn_m >= 4:
        out = rounded(line, turn_m)
        if crossing(water, out, vessel.beam_m / 2) is None:
            return out
        turn_m /= 2
    place = crossing(water, line, vessel.beam_m / 2)
    if place is not None:
        raise ValueError(f"{what} crosses land or a dock near ({place[0]:.0f}, {place[1]:.0f})")
    return line


def _hull_on_water(water: Water, centre: np.ndarray, heading: np.ndarray, vessel: Vessel) -> bool:
    across = np.array([-heading[1], heading[0]])
    for along in np.linspace(-vessel.length_m / 2, vessel.length_m / 2, max(3, int(vessel.length_m / 4))):
        for side in np.linspace(-vessel.beam_m / 2, vessel.beam_m / 2, max(2, int(vessel.beam_m / 3))):
            if not water.fine_water(*(centre + heading * along + across * side)):
                return False
    return True


def berth_from(water: Water, line: np.ndarray, vessel: Vessel, what: str) -> np.ndarray:
    """Where a ship lies at the quay a line ends at: the nearest place back along the line, from `line[0]`, with
    its whole hull over water, lying along the line."""
    points = _along(line, 2)
    travelled = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    for at in range(len(points) - 1):
        if travelled[at] < vessel.length_m * 0.4:
            continue
        ahead = min(at + max(2, int(vessel.length_m / 4)), len(points) - 1)
        heading = (points[ahead] - points[max(at - 2, 0)]) / max(np.hypot(*(points[ahead] - points[max(at - 2, 0)])), 1e-9)
        if _hull_on_water(water, points[at], heading, vessel):
            return points[at]
        if travelled[at] > vessel.length_m * 4:
            break
    raise ValueError(f"{what}: no berth with its hull on the water near ({line[0][0]:.0f}, {line[0][1]:.0f})")


def turn_room(water: Water, line: np.ndarray, vessel: Vessel, what: str) -> float:
    """How far from a berth along its lane a single-ended ship comes round, where its whole length swings clear."""
    points = _along(line, 4)
    travelled = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    swing = vessel.length_m / 2 + 4
    for point, distance in zip(points, travelled):
        if distance < vessel.length_m * 0.6:
            continue
        angles = np.linspace(0, 2 * math.pi, 48, endpoint=False)
        if all(water.fine_water(*(point + np.array([math.cos(a), math.sin(a)]) * r)) for a in angles for r in (swing * 0.5, swing)):
            return float(distance)
    raise ValueError(f"{what}: nowhere to come round within its lane near ({line[0][0]:.0f}, {line[0][1]:.0f})")


# `sea/motion.ts`'s: a chord of this share of the vessel's length either side of a place sets its heading.
HEADING_REACH_SHARE = 0.35


def _heading_at(points: np.ndarray, travelled: np.ndarray, at: int, reach: float) -> np.ndarray:
    """The way a bow points along a line at a point, as the game reads it: the chord `reach` either side, held to the ends."""
    back = points[np.searchsorted(travelled, travelled[at] - reach, side="left")]
    ahead = points[min(np.searchsorted(travelled, travelled[at] + reach, side="left"), len(points) - 1)]
    chord = ahead - back
    return chord / max(float(np.hypot(*chord)), 1e-9)


def hull_clear_berth(water: Water, line: np.ndarray, vessel: Vessel, what: str) -> np.ndarray:
    """The line from the first place along it, from `line[0]`, where the hull lying at the line's own heading there,
    as the game lays it, is all on the water: the lane's line can leave a quay at another angle than the way the
    berth was found along."""
    points = _along(line, 2)
    travelled = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    reach = vessel.length_m * HEADING_REACH_SHARE
    for at in range(len(points)):
        if travelled[at] > vessel.length_m * 2:
            break
        rest, rest_travelled = points[at:], travelled[at:] - travelled[at]
        if _hull_on_water(water, points[at], _heading_at(rest, rest_travelled, 0, reach), vessel):
            return np.vstack((points[at], line[np.searchsorted(_line_travelled(line), travelled[at], side="right"):]))
    raise ValueError(f"{what}: no berth along its lane with the hull on the water near ({line[0][0]:.0f}, {line[0][1]:.0f})")


def _cut_at(line: np.ndarray, distance: float) -> np.ndarray:
    """The line's first `distance` metres."""
    travelled = _line_travelled(line)
    at = int(np.searchsorted(travelled, distance, side="right"))
    if at >= len(line):
        return line
    share = (distance - travelled[at - 1]) / max(travelled[at] - travelled[at - 1], 1e-9)
    return np.vstack((line[:at], line[at - 1] + (line[at] - line[at - 1]) * share))


def _line_travelled(line: np.ndarray) -> np.ndarray:
    return np.concatenate(([0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))))


def check_berth_sweep(water: Water, line: np.ndarray, vessel: Vessel, turn_m: float, alongside: np.ndarray | None, what: str) -> None:
    """Fails unless the hull is all on the water at every place between a berth, `line[0]`, and where the ship comes
    round, `turn_m` along: pointing along the line as it backs in, or at the quay's heading as it moves across."""
    points = _along(line, 2)
    travelled = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    reach = vessel.length_m * HEADING_REACH_SHARE
    for at in range(0, len(points), 2):
        if travelled[at] > turn_m:
            break
        heading = alongside if alongside is not None else _heading_at(points, travelled, at, reach)
        if not _hull_on_water(water, points[at], heading, vessel):
            raise ValueError(f"{what}: the hull meets land {travelled[at]:.0f} m out from its berth, at ({points[at][0]:.0f}, {points[at][1]:.0f})")


def _cut_where_it_leaves(water: Water, line: np.ndarray) -> tuple[np.ndarray, bool]:
    """The line up to where it first leaves the water's grid, and whether it did."""
    points = _along(line, CELL_M)
    margin = 1000
    for at, (x, y) in enumerate(points):
        if not (water.west + margin <= x <= water.west + water.free.shape[1] * CELL_M - margin and water.north - water.free.shape[0] * CELL_M + margin <= y <= water.north - margin):
            return points[:at], True
    return line, False


# Each line: its name, the vessel, the OSM ways that guide it, which end berths (the first way's start, unless
# `reverse`), and for the long-distance lines, the way whose far end, or where it leaves the grid, is where the
# ship goes out of sight between its calls. The ships' lines are guided by every ship's way, so a lane can follow
# the E18's ways from one to the next.
SHIP_WAYS = [693978437, 693978436, 694006261, 1232401770, 1232401769, 693978433, 693978435, 693978438, 140515780]
FERRY_LINES: list[dict] = [
    {"name": "mariehamn-stockholm", "vessel": "ship", "ways": [693978437], "from": "mariehamn", "out": 693978437},
    {"name": "mariehamn-turku", "vessel": "ship", "ways": [693978436], "from": "mariehamn", "out": 140515780},
    {"name": "mariehamn-tallinn", "vessel": "ship", "ways": [694006261], "from": "mariehamn", "out": 694006261},
    {"name": "langnas-turku", "vessel": "ship", "ways": [1232401769], "out": 140515780},
    {"name": "langnas-kapellskar", "vessel": "ship", "ways": [693978433], "out": 693978438, "berth_with": "langnas-turku"},
    {"name": "eckero-grisslehamn", "vessel": "ship-small", "ways": [296301127], "out": 296301127},
    {"name": "foglo", "vessel": "archipelago", "ways": [23103975]},
    {"name": "norra", "vessel": "archipelago", "ways": [172996629]},
    {"name": "sodra", "vessel": "archipelago", "ways": [140197874]},
    {"name": "tvargaende", "vessel": "archipelago", "ways": [140197869]},
    {"name": "tofto", "vessel": "cable", "ways": [25170379]},
    {"name": "embarsund", "vessel": "cable", "ways": [294666498]},
    {"name": "angosund", "vessel": "cable", "ways": [220072340]},
    {"name": "simskala", "vessel": "cable", "ways": [70582243]},
    {"name": "kobba-klintar", "vessel": "passenger", "ways": [1266184636]},
    {"name": "rodhamn", "vessel": "passenger", "ways": [1266184639]},
    {"name": "boxo", "vessel": "passenger", "ways": [1266184638]},
    {"name": "bjorkor", "vessel": "passenger", "ways": [1277782263]},
    {"name": "signilskar", "vessel": "passenger", "ways": [1277785063]},
]
# A line with `berth_with` shares that line's way in, from its berth to where a ship comes round, so a ship calling
# on one and leaving on the other neither jumps nor lies at another angle.
# The double-ended ferries look the same either way, so they cross and come back without turning.
DOUBLE_ENDED = {"archipelago", "cable"}
# Västerhamn's ferry berth, as `FERRY_BERTH` in `art/town-kit/ferry.ts` has it from the 2025 photo: ships lie there
# alongside the quay, bow to the south, having come round in the channel and moved across on to it. The mask draws the quay's edge a few metres
# further out than the photo has the hull, so the berth slides off the quay until the hull is on the water (a test
# holds it within 40 m of the art's).
MARIEHAMN_BERTH = (107096 - 110000, 6682850 - 6690000)
MARIEHAMN_BEARING_DEG = 180.5


def off_the_quay(water: Water, place: tuple[float, float], bearing_deg: float, vessel: Vessel, what: str) -> np.ndarray:
    """The nearest place to `place`, straight across the hull, where all of it lies on the water."""
    bearing = math.radians(bearing_deg)
    heading = np.array([math.sin(bearing), math.cos(bearing)])
    across = np.array([heading[1], -heading[0]])
    for step in np.arange(0, 40, 0.5):
        for side in (1, -1):
            centre = np.asarray(place, dtype=float) + across * side * step
            if _hull_on_water(water, centre, heading, vessel):
                return centre
    raise ValueError(f"{what}: no room for the hull within 40 m of its berth")


def ferry_lane(water: Water, osm: Osm, official: list[np.ndarray], spec: dict, berthed: dict[str, tuple[np.ndarray, float]]) -> dict:
    """A ferry line's lane; `berthed` holds the lines built before it, by name, each from its berth to where a
    ship comes round, and how far that is."""
    vessel = VESSELS[spec["vessel"]]
    guide = np.vstack([osm.ferries[way][1] for way in spec["ways"]])
    if "out" in spec and np.hypot(*guide[0]) > np.hypot(*guide[-1]):
        # A line out of sight berths at its end nearer the island.
        guide = guide[::-1]
    if spec["vessel"] in ("ship", "ship-small"):
        mapped = [osm.ferries[way][1] for way in SHIP_WAYS + spec["ways"] if way in osm.ferries]
    else:
        mapped = [guide]
    guides = [(official, OFFICIAL_PULL), (mapped, OSM_PULL)]
    shared, shared_turn_m = berthed.get(spec.get("berth_with", ""), (None, 0.0))
    if shared is not None:
        start = shared[-1]
    elif spec.get("from") == "mariehamn":
        start = off_the_quay(water, MARIEHAMN_BERTH, MARIEHAMN_BEARING_DEG, vessel, spec["name"])
    else:
        start = berth_from(water, guide, vessel, spec["name"])
    if "out" in spec:
        # The way's end farther from the berth, or where it leaves the grid that way, is out of sight.
        way = osm.ferries[spec["out"]][1]
        ends = []
        for oriented in (way, way[::-1]):
            cut, left = _cut_where_it_leaves(water, oriented)
            if len(cut) > 0:
                ends.append(cut[-1] if left else oriented[-1])
        goal = max(ends, key=lambda end: float(np.hypot(*(end - start))))
        berths = (True, False)
    else:
        goal = berth_from(water, guide[::-1], vessel, spec["name"])
        berths = (True, True)
    line = lane(water, start, goal, vessel, guides, berths, frame=[osm.ferries[way][1] for way in spec["ways"]])
    if line is None:
        raise ValueError(f"{spec['name']}: no water joins its ends")
    line = smoothed(water, line, vessel, spec["name"])
    if shared is not None:
        # The ship stops and comes round where the two ways part, so the corner there is never sailed.
        line = np.vstack((shared[:-1], line))
    alongside = spec.get("from") == "mariehamn"
    single = spec["vessel"] not in DOUBLE_ENDED
    if single:
        # Mariehamn's ships lie alongside the quay, where the hull was slid on to the water at the quay's heading;
        # every other berth lies along the lane, its hull on the water at the lane's heading.
        if berths[0] and not alongside and shared is None:
            line = hull_clear_berth(water, line, vessel, spec["name"])
        if berths[1]:
            line = hull_clear_berth(water, line[::-1], vessel, spec["name"])[::-1]
    ends = []
    for at, is_berth in zip((0, -1), berths):
        end: dict = {"kind": "berth" if is_berth else "open"}
        if is_berth and single:
            from_end = line if at == 0 else line[::-1]
            end["turnM"] = round(shared_turn_m if shared is not None and at == 0 else turn_room(water, from_end, vessel, spec["name"]), 1)
            heading = None
            if alongside and at == 0:
                bearing = math.radians(MARIEHAMN_BEARING_DEG)
                heading = np.array([math.sin(bearing), math.cos(bearing)])
                end["alongsideYaw"] = round(math.atan2(math.cos(bearing), math.sin(bearing)), 4)
            check_berth_sweep(water, from_end, vessel, end["turnM"], heading, spec["name"])
        ends.append(end)
    return {"name": spec["name"], "vessel": spec["vessel"], "line": _scene_line(line), "ends": ends, **keeping_right(water, line, vessel, ends, spec["name"])}


def keep_right_at(line: np.ndarray, keep_m: float, from_m: float, ends: list[dict]) -> np.ndarray:
    """How far to starboard of the lane a vessel keeps at each point of `line` sampled every 2 m: nothing where it
    comes round at an end, growing smoothly to `keep_m` over `from_m` past it. `sea/motion.ts` keeps the same."""
    points = _along(line, 2)
    travelled = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    share = np.ones(len(points))
    for distance, end in ((travelled, ends[0]), (travelled[-1] - travelled, ends[1])):
        into = np.clip((distance - end.get("turnM", 0)) / from_m, 0, 1)
        share = np.minimum(share, into * into * (3 - 2 * into))
    return keep_m * share


def keeping_right(water: Water, line: np.ndarray, vessel: Vessel, ends: list[dict], what: str) -> dict:
    """The keeping to starboard a lane allows, either way along it: the vessel's own, halved until both sides'
    lines, and the hull's edge beyond them, stay on the water."""
    points = _along(line, 2)
    across = np.gradient(points, axis=0)
    across = np.column_stack((across[:, 1], -across[:, 0])) / np.maximum(np.hypot(*across.T), 1e-9)[:, None]
    from_m = vessel.length_m * KEEP_FROM_LENGTHS
    keep = vessel.keep_right_m
    while keep >= 1:
        offsets = keep_right_at(line, keep, from_m, ends)[:, None] + vessel.beam_m / 2
        if all(water.fine_water(*point) for side in (-1, 1) for point in points + side * across * offsets):
            break
        keep /= 2
    else:
        keep = 0
    if keep < vessel.keep_right_m:
        print(f"  {what} keeps {keep:.1f} m to starboard, not {vessel.keep_right_m}")
    return {"keepRightM": round(keep, 1), "keepFromM": from_m}


def _scene_line(line: np.ndarray) -> list[float]:
    return [round(float(v), 1) for x, y in line for v in (x, -y)]


# OSM maps a harbour as many marinas a few metres apart; within this they're one place to sail from.
SAME_HARBOUR_M = 500
# A small boat's trip: to another harbour or an anchorage this far off, in a straight line.
TRIP_M = (1500, 9000)
TRIPS_PER_HARBOUR = 2
# Two boats lying at their ends are never nearer than this, whichever trips they're on.
ANCHOR_APART_M = 30


def harbours() -> list[np.ndarray]:
    """The marinas, one per harbour, in local metres (north up)."""
    found: list[np.ndarray] = []
    for x, z in json.loads(PLACES.read_text(encoding="utf-8"))["places"]["marina"]:
        point = np.array([x, -z])
        if all(np.hypot(*(point - other)) > SAME_HARBOUR_M for other in found):
            found.append(point)
    return found


def boat_lanes(water: Water, osm: Osm, official: list[np.ndarray]) -> list[dict]:
    """Small boats' trips from each harbour to its nearest harbours and anchorages, along the official fairways where
    they help and OSM's where the chart has none. Every other trip is a keeled boat's, kept out of water too shallow
    for it, or a shallow boat's where no deep enough water joins its ends. A trip's ends are where the boat waits,
    off the harbour's docks: the nearest water clear enough of them."""
    places = harbours()
    targets = places + [np.asarray(point) for point in osm.anchorages]
    lanes, taken, lying = [], set(), []
    for at, harbour in enumerate(places):
        distances = [(float(np.hypot(*(target - harbour))), index) for index, target in enumerate(targets) if index != at]
        made = 0
        for distance, index in sorted(distances):
            if made == TRIPS_PER_HARBOUR:
                break
            if not TRIP_M[0] <= distance <= TRIP_M[1] or (min(at, index), max(at, index)) in taken:
                continue
            target = targets[index]
            low, high = np.minimum(harbour, target) - 2000, np.maximum(harbour, target) + 2000
            guides = [(_within(official, low, high), OFFICIAL_PULL), (_within(osm.fairways, low, high), OSM_PULL)]
            kinds = ["keel", "boat"] if len(lanes) % 2 == 0 else ["boat"]
            for kind in kinds:
                vessel = VESSELS[kind]
                line = lane(water, harbour, target, vessel, guides, (False, False), kept_off=lying)
                if line is not None:
                    break
            if line is None:
                continue
            name = f"trip-{len(lanes)}"
            try:
                line = smoothed(water, line, vessel, name)
            except ValueError as error:
                print(f"  left out: {error}")
                continue
            taken.add((min(at, index), max(at, index)))
            lying += [line[0], line[-1]]
            ends = [{"kind": "anchor"}, {"kind": "anchor"}]
            lanes.append({"name": name, "vessel": kind, "line": _scene_line(line), "ends": ends, **keeping_right(water, line, vessel, ends, name)})
            made += 1
    return lanes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data", type=Path, default=DATA)
    data = parser.parse_args().data
    water = load_water(data)
    osm = read_osm(data)
    official = official_lines()
    print(f"water read: {len(official)} official navigation lines, {len(osm.ferries)} OSM ferry ways, {len(osm.fairways)} OSM fairways, {len(osm.anchorages)} anchorages")
    ferries, failed = [], []
    berthed: dict[str, tuple[np.ndarray, float]] = {}
    for spec in FERRY_LINES:
        try:
            ferries.append(ferry_lane(water, osm, official, spec, berthed))
            built = ferries[-1]
            if built["ends"][0]["kind"] == "berth" and "turnM" in built["ends"][0]:
                grid = np.array(built["line"]).reshape(-1, 2) * [1, -1]
                turn_m = built["ends"][0]["turnM"]
                berthed[spec["name"]] = (_cut_at(grid, turn_m), turn_m)
        except ValueError as error:
            failed.append(str(error))
            continue
        print(f"  {spec['name']}: {len(ferries[-1]['line']) // 2} points")
    if failed:
        raise SystemExit("ferry lines that failed:" + "".join(f"\n  {line}" for line in failed))
    boats = boat_lanes(water, osm, official)
    print(f"  {len(boats)} small boats' trips")
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({"licence": LICENCE, "ferries": ferries, "boats": boats}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}, {OUTPUT.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()

"""Real boathouses and sheds, drawn by the rural kit's models instead of a generated box.

A footprint gets a model when the data says what it is, whether or not the 3D
sheets have it: a solid that is one footprint's building alone is replaced too.
An outbuilding (Topographic Database 42260 or 42261) whose outline reaches the
water is a boathouse: nine in ten of OSM's tagged boathouses do, and next to no
other kind. A small outbuilding away from the water is a shed, as OSM's tagged
sheds are. OSM's own `building=boathouse` and `building=shed` count too, whatever
NLS calls them. Everything else keeps its generated shape.

A model is fitted to its outline's smallest rectangle: a boathouse's doors face the
side nearest the water, and a shed's ridge runs along its long side with its door
at the end nearer a road. The list says where and how big, not how to scale: the
game fits each model to those sizes. The outline still goes to the car as a wall.
"""

import json
import math
from pathlib import Path

import numpy as np
import shapely
from scipy import ndimage
from shapely.geometry import Point, Polygon

from grid import SAMPLE_M

# The Topographic Database's other buildings: barns, garages, saunas, sheds and boathouses.
OUTBUILDINGS = (42260, 42261)
# How close an outline comes to the water to be a boathouse, or, for one OSM tags as a boathouse, to find which way it faces.
SHORE_M = 4.0
TAGGED_SHORE_M = 20.0
BOATHOUSE_M2 = (12.0, 150.0)
SHED_M2 = (4.0, 30.0)
TAGGED_SHED_M2 = 50.0
# How much a solid and a footprint must share to be one building: a solid of several joined buildings keeps its own shape.
SAME_BUILDING = 0.7
# A longer outbuilding is a row of stalls or a barn, not a shed.
LONGEST_SHED = 2.2
# How far the kit's shed walls reach below its foot (`SHED.floor` in `art/rural/buildings.ts`): on ground that falls
# further than that a shed would float, so it keeps its generated shape, whose walls run down to the ground.
SHED_SINK_M = 0.5
# Variants by chance, as the generated walls' colours are.
# The places come from OSM's tags as much as NLS's footprints, so the list is ODbL, as the footprints and roads are.
LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}
BOATHOUSES = (("boathouse-red", 0.55), ("boathouse-tarred", 0.45))
SHEDS = (("shed-red", 0.6), ("shed-grey", 0.4))


class Shores:
    """Metres to the nearest water from any point of the tile, on its 2 m samples."""

    def __init__(self, water: np.ndarray, west: float, north: float):
        self.metres = ndimage.distance_transform_edt(~water).astype(np.float32) * SAMPLE_M
        self.west, self.north = west, north

    def at(self, points: np.ndarray) -> np.ndarray:
        last = self.metres.shape[0] - 1
        columns = np.clip(((points[:, 0] - self.west) / SAMPLE_M).astype(int), 0, last)
        rows = np.clip(((self.north - points[:, 1]) / SAMPLE_M).astype(int), 0, last)
        return self.metres[rows, columns]


class Tags:
    """What OSM calls the building most overlapping an outline, if it overlaps a good share of it."""

    def __init__(self, osm_buildings: list[dict]):
        self.kinds = [building["kind"] for building in osm_buildings]
        self.shapes = [shapely.make_valid(Polygon(building["ring"])) for building in osm_buildings]
        self.tree = shapely.STRtree(self.shapes)

    def of(self, outline: Polygon) -> str | None:
        best, kind = 0.3 * outline.area, None
        for index in self.tree.query(outline):
            overlap = self.shapes[index].intersection(outline).area
            if overlap > best:
                best, kind = overlap, self.kinds[index]
        return kind


def _pick(seed: int, choices: tuple) -> str:
    roll = (seed % 1000) / 1000
    for value, chance in choices:
        roll -= chance
        if roll < 0:
            return value
    return choices[0][0]


def _rectangle(outline: Polygon) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The smallest rectangle round an outline: its centre, and its two half-sides as vectors, the longer first."""
    corners = np.array(outline.minimum_rotated_rectangle.exterior.coords)[:4]
    centre = corners.mean(axis=0)
    first, second = (corners[1] - corners[0]) / 2, (corners[2] - corners[1]) / 2
    return (centre, first, second) if np.hypot(*first) >= np.hypot(*second) else (centre, second, first)


def kind_of(footprint_kind: int, tag: str | None, outline: Polygon, shore_m: float) -> str | None:
    """'boathouse', 'shed' or None, from what NLS and OSM say and where the water is."""
    area = outline.area
    if tag == "boathouse" and shore_m <= TAGGED_SHORE_M:
        return "boathouse"
    if tag == "shed" and area <= TAGGED_SHED_M2 and shore_m > SHORE_M:
        return "shed"
    if footprint_kind not in OUTBUILDINGS or tag not in (None, "yes", "boathouse", "shed"):
        return None
    if shore_m <= SHORE_M:
        return "boathouse" if BOATHOUSE_M2[0] <= area <= BOATHOUSE_M2[1] else None
    _, long_half, short_half = _rectangle(outline)
    if SHED_M2[0] <= area <= SHED_M2[1] and np.hypot(*long_half) <= LONGEST_SHED * np.hypot(*short_half):
        return "shed"
    return None


class Placed:
    """The tile's models, as the game reads them: per model, (x, y, z, yaw, width, length) in the scene."""

    def __init__(self, shores: Shores, tags: Tags):
        self.shores, self.tags = shores, tags
        self.models: dict[str, list[list[float]]] = {}

    def take(self, footprint_kind: int, outline: Polygon, ground: np.ndarray, toward_road: np.ndarray | None, seed: int) -> bool:
        """Places a model on the outline if it's a boathouse or shed. `ground` is the heights along the outline."""
        ring = np.array(outline.exterior.coords)
        shore = self.shores.at(ring)
        kind = kind_of(footprint_kind, self.tags.of(outline), outline, float(shore.min()))
        if kind is None:
            return False
        centre, long_half, short_half = _rectangle(outline)
        if kind == "boathouse":
            # The doors go on whichever side is nearest the water, and the model's length runs back from them.
            sides = [long_half, -long_half, short_half, -short_half]
            nearest = int(np.argmin(self.shores.at(np.array([centre + side for side in sides]))))
            front, across = sides[nearest], short_half if nearest < 2 else long_half
            # The model's foot is the water line: the lowest ground of the outline's part on land, which at the shore is
            # the water's level, never the bed under the water, which can lie well below it.
            on_land = ground[shore > 0]
            model, y = _pick(seed, BOATHOUSES), float(on_land.min() if on_land.size else ground.max())
        else:
            front = long_half if toward_road is None or toward_road @ long_half >= 0 else -long_half
            if toward_road is None and seed & 1:
                front = -front
            across = short_half
            y = float(np.median(ground))
            if y - float(ground.min()) > SHED_SINK_M:
                return False
            model = _pick(seed, SHEDS)
        length, width = 2 * float(np.hypot(*front)), 2 * float(np.hypot(*across))
        # The model's +z turns to (sin yaw, cos yaw) in the scene, whose z is south.
        yaw = math.atan2(front[0], -front[1])
        self.models.setdefault(model, []).append([round(float(centre[0]), 2), round(y, 2), round(float(-centre[1]), 2), round(yaw, 4), round(width, 2), round(length, 2)])
        return True

    def take_solid(self, footprint_kind: int, outline: Polygon, solid: Polygon, footprint: Polygon, ground: np.ndarray, toward_road: np.ndarray | None, seed: int) -> bool:
        """The same for one of the 3D sheets' solids, when it is one footprint's building alone: most shore rows are modelled."""
        if solid.intersection(footprint).area < SAME_BUILDING * max(solid.area, footprint.area):
            return False
        return self.take(footprint_kind, outline, ground, toward_road, seed)

    def write(self, folder: Path) -> dict:
        (folder / "models.json").write_text(json.dumps({**LICENCE, "models": self.models}, separators=(",", ":")), encoding="utf-8")
        return {"file": "models.json", "count": {model: len(places) for model, places in sorted(self.models.items())}, "place": ["x", "y", "z", "yaw", "width", "length"]}


def toward(point: np.ndarray, street: shapely.STRtree | None, lines: list) -> np.ndarray | None:
    """From a point to the nearest road's line, or None with no road on the tile."""
    if street is None:
        return None
    at = Point(point)
    nearest = lines[street.nearest(at)]
    return np.array(nearest.interpolate(nearest.project(at)).coords[0]) - point

"""Buildings that stand above the ground: canopies, carports, walkways and bridges, which roads and the car pass under.

The building survey has only an outline for these, the same as for a barn, so OSM is what says one is raised. A
canopy or carport is a roof on posts. A building OSM puts on a level above the ground is a box held up on pillars,
with a floor under it. OSM's `layer` is often set on buildings that stand on the ground, over a car park's ramp or
round an indoor corridor, so on its own it only counts where a motor road at ground level runs under the building,
and never against a laser model, whose walls the survey saw reach the ground.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
import shapely
from shapely.geometry import LineString, Polygon

import sources
from grid import tile_at, tile_from_name
from vectors import FOOT_OR_BIKE, NOT_A_ROAD, line_to_grid

CANOPIES = {"roof": 4.5, "carport": 2.4}
# Clearance under a raised building OSM gives no height for: a lorry's.
CLEARANCE_M = 5.0
STOREY_M = 3.0
CANOPY_DEPTH_M = 0.5
# Ground is read this often along and across a building.
READ_STEP_M = 2.0
# A building is raised when this much of the survey's outline lies under one OSM raises.
SHARE_UNDER = 0.5
# A road counts as running under a building when this much of it is inside the outline.
UNDER_M = 1.0


@dataclass
class Raised:
    """Its levels are heights above the sea, read from the elevation model for the whole building, so a building two tiles
    share stands as one, and one reaching out over the water isn't pulled down to the seabed."""

    shape: Polygon  # ETRS-TM35FIN metres.
    under: float  # Its floor, or a canopy's underside.
    top: float
    canopy: bool  # A roof on posts, rather than a box on pillars.
    by_layer: bool  # Raised only because OSM's layer puts it above a road, which a laser model outweighs.


def _number(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _layer(tags: dict) -> int:
    value = _number(tags.get("layer"))
    return int(value) if value is not None else 0


def _outlines(element: dict) -> list[Polygon]:
    rings = [element["geometry"]] if element["type"] == "way" else [member["geometry"] for member in element["members"] if member["role"] == "outer"]
    polygons = [shapely.make_valid(Polygon(line_to_grid(ring))) for ring in rings if len(ring) >= 4]
    return [part for polygon in polygons for part in shapely.get_parts(polygon) if isinstance(part, Polygon) and part.area > 1]


def read(osm_file: Path) -> list[Raised]:
    """Every building in the tile's OSM data that stands above the ground."""
    return raised_in(json.loads(osm_file.read_text(encoding="utf-8"))["elements"], _ground)


def raised_in(elements: list[dict], ground_at: Callable[[np.ndarray], np.ndarray]) -> list[Raised]:
    """`ground_at` gives the height of the ground at points, or NaN where it isn't known."""
    ways = [(LineString(line_to_grid(element["geometry"])), _layer(element["tags"])) for element in elements if element["type"] == "way" and len(element["geometry"]) >= 2 and _at_ground(element["tags"])]
    tree = shapely.STRtree([line for line, _ in ways]) if ways else None
    raised = []
    for element in elements:
        tags = element["tags"]
        kind = tags.get("building")
        if kind is None:
            continue
        given = _number(tags.get("min_height"))
        level = _number(tags.get("building:min_level") or tags.get("min_level"))
        height = _number(tags.get("height"))
        levels = _number(tags.get("building:levels"))
        for outline in _outlines(element):
            canopy = kind in CANOPIES
            under_ways = _ways_under(outline, _layer(tags), ways, tree)
            if not (canopy or given or level or kind == "bridge" or under_ways):
                continue
            # Clear of the highest ground a road under it crosses, else above the ground it stands over.
            ground = max((_ground_along(stretch, ground_at) for stretch in under_ways), default=None) or _ground_over(outline, ground_at)
            under = ground + (given or (level * STOREY_M if level else CANOPIES[kind] if canopy else CLEARANCE_M))
            if canopy:
                top = under + CANOPY_DEPTH_M
            else:
                top = max(ground + height if height else under, under + (levels or 1) * STOREY_M)
            raised.append(Raised(outline, under, top, canopy, not (canopy or given or level or kind == "bridge")))
    return raised


def _at_ground(tags: dict) -> bool:
    """A motor road on the ground, not in a tunnel, a basement or indoors."""
    highway = tags.get("highway")
    if highway is None or highway in FOOT_OR_BIKE or highway in NOT_A_ROAD:
        return False
    level = _number(tags.get("level"))
    return tags.get("tunnel", "no") == "no" and tags.get("indoor", "no") == "no" and _layer(tags) >= 0 and (level is None or level >= 0)


def _ways_under(outline: Polygon, layer: int, ways: list[tuple[LineString, int]], tree: shapely.STRtree | None) -> list[shapely.Geometry]:
    """The stretches of road on a lower layer that run under a building OSM puts on a layer above the ground."""
    if layer <= 0 or tree is None:
        return []
    under = [ways[index][0].intersection(outline) for index in tree.query(outline, predicate="intersects") if ways[index][1] < layer]
    return [stretch for stretch in under if stretch.length >= UNDER_M]


@lru_cache(maxsize=4)
def _elevation(name: str) -> tuple[np.ndarray, rasterio.Affine] | None:
    path = sources.dem_path(tile_from_name(name))
    if path is None:
        return None
    with rasterio.open(path) as dataset:
        samples = dataset.read(1).astype(np.float64)
        if dataset.nodata is not None:
            samples[samples == dataset.nodata] = np.nan
        return samples, dataset.transform


def _ground(points: np.ndarray) -> np.ndarray:
    heights = np.full(len(points), np.nan)
    for index, (east, north) in enumerate(points):
        read = _elevation(tile_at(east, north).name)
        if read is None:
            continue
        samples, transform = read
        column, row = ~transform * (east, north)
        if 0 <= row < samples.shape[0] and 0 <= column < samples.shape[1]:
            heights[index] = samples[int(row), int(column)]
    return heights


def _ground_along(stretch: shapely.Geometry, ground_at: Callable[[np.ndarray], np.ndarray]) -> float | None:
    heights = ground_at(shapely.get_coordinates(shapely.segmentize(stretch, READ_STEP_M)))
    return float(np.nanmax(heights)) if np.isfinite(heights).any() else None


def _ground_over(outline: Polygon, ground_at: Callable[[np.ndarray], np.ndarray]) -> float:
    west, south, east, north = outline.bounds
    east_grid, north_grid = (axis.ravel() for axis in np.meshgrid(np.arange(west, east, READ_STEP_M), np.arange(south, north, READ_STEP_M)))
    inside = shapely.contains_xy(outline, east_grid, north_grid)
    points = np.column_stack((east_grid[inside], north_grid[inside])) if inside.any() else np.array(outline.representative_point().coords)
    heights = ground_at(points)
    if not np.isfinite(heights).any():
        raise ValueError(f"no ground read under the building at {outline.representative_point()}")
    return float(np.nanmedian(heights))


class Lookup:
    """Which of the survey's outlines OSM raises."""

    def __init__(self, raised: list[Raised]):
        self.raised = raised
        self.tree = shapely.STRtree([entry.shape for entry in raised]) if raised else None

    def of(self, outline: Polygon, modelled: bool = False) -> Raised | None:
        """The raised building over a survey outline, or None. `modelled` outlines are laser models."""
        if self.tree is None:
            return None
        hits = [self.raised[index] for index in self.tree.query(outline, predicate="intersects")]
        hits = [hit for hit in hits if not (modelled and hit.by_layer)]
        if not hits:
            return None
        # OSM may draw one building as parts, a floor each: together they cover it.
        covered = shapely.union_all([hit.shape for hit in hits]).intersection(outline).area
        best = max(hits, key=lambda hit: hit.shape.intersection(outline).area)
        return best if covered >= SHARE_UNDER * outline.area else None

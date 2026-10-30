"""OpenStreetMap's roads and buildings, in the game's metric space."""

import json
from pathlib import Path

import numpy as np

from grid import Tile, lonlat_to_grid, to_local

# Highway tags that aren't a surface anyone can use.
NOT_A_ROAD = {"proposed", "construction", "abandoned", "razed", "raceway", "bus_stop", "platform", "rest_area", "services"}
FOOT_OR_BIKE = {"footway", "path", "cycleway", "steps", "bridleway", "pedestrian", "corridor"}
KEPT_TAGS = ("name", "ref", "surface", "lanes", "width", "oneway", "bridge", "tunnel", "maxspeed")


def line_to_grid(geometry: list[dict]) -> np.ndarray:
    east, north = lonlat_to_grid([p["lon"] for p in geometry], [p["lat"] for p in geometry])
    return np.column_stack((east, north))


def clip_line(line: np.ndarray, tile: Tile) -> list[np.ndarray]:
    """The parts of a line inside the tile, cut exactly on its edges so neighbours meet."""
    parts: list[np.ndarray] = []
    current: list[np.ndarray] = []

    def finish() -> None:
        if len(current) > 1:
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
        if enter > leave:
            finish()
            continue
        if not current:
            current.append(start + enter * step)
        current.append(start + leave * step)
        if leave < 1.0:
            finish()
    finish()
    return parts


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
            for part in clip_line(line_to_grid(element["geometry"]), tile):
                road = {"id": element["id"], "kind": kind, "motor": kind not in FOOT_OR_BIKE, "line": _rounded(part)}
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

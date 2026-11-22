"""Whether a place is built up, in town: the one test the roadside, the furniture, the parked cars and the seated share.

Not the town's ground, which is `town.py`'s.

A town is measured by how much is built round a place, not by how many buildings
stand there. Counting buildings read a farm and its barns, sheds and saunas as a
village, and Godby's centre, a few big buildings (the shops, the school, the
offices), as countryside. So the test is the floor the Topographic Database's
main buildings cover within 250 m: homes, flats, shops, offices, public buildings
and industry, but not outbuildings or holiday cottages, which a farm or a shore is
full of. Over the island's named places that splits cleanly (`town_audit`):
Mariehamn's districts cover 6,300 to 60,000 m² at their OSM point, all but three
thin ones at its edge (Kalmarnäs, Espholm, Nabben), the parish villages' centres
(Godby, Jomala, Hammarland, Geta, Eckerö, Saltvik) 6,100 to 24,000 m², and the
farm villages round them, some with 27 buildings near their middle, 4,400 m² at
most.
So a village centre is in town at its own size: its streets are lit and its cafés
as busy as Mariehamn's, while the farm villages keep their mailboxes.
"""

import sys
import xml.etree.ElementTree as ElementTree
from functools import lru_cache

import numpy as np
import shapely
from shapely.affinity import translate
from shapely.geometry import Point, box

from buildings import _sheet_footprints
from facades import COTTAGE, OUTBUILDINGS
from grid import WORLD_ORIGIN, lonlat_to_grid, neighbour, tile_at, tile_from_name, to_local
from sources import osm_xml, topographic_path_or_none

REACH_M = 250.0
BUILT_FLOOR_M2 = 6000.0
# The built floor over which a street's kerb and paving come in, whole where a place is in town.
KERBED_FLOOR_M2 = (4500.0, BUILT_FLOOR_M2)
# The lattice a tile's share is read on: a tile is a whole number of its steps, so two tiles share the nodes on their edge.
LATTICE_M = 50.0


class Town:
    """The main buildings' footprints near a place, in the scene's ground metres (east, north)."""

    def __init__(self, shapes: list):
        self.areas = np.array([shape.area for shape in shapes])
        self.tree = shapely.STRtree(shapes)

    def built_floor(self, point: np.ndarray) -> float:
        near = self.tree.query(Point(point), predicate="dwithin", distance=REACH_M)
        return float(self.areas[near].sum()) if len(near) else 0.0

    def __call__(self, point: np.ndarray) -> bool:
        return self.built_floor(point) >= BUILT_FLOOR_M2


class Share:
    """How built up each place of a tile is, 0 to 1: what widens a street's strip into its kerb and paving.

    Read between the nodes of a lattice laid from the tile's own corner, whose floors are summed in one order, so the two
    tiles at an edge work out the very same numbers along it and lay a street crossing it alike. A place off the tile reads
    its nearest edge's.
    """

    def __init__(self, town: Town, west: float, north: float, size_m: float):
        self.west, self.north = west, north
        self.nodes = int(round(size_m / LATTICE_M)) + 1
        places = np.arange(self.nodes) * LATTICE_M
        east, south = np.meshgrid(west + places, north - places)
        points = shapely.points(np.column_stack((east.ravel(), south.ravel())))
        at, which = town.tree.query(points, predicate="dwithin", distance=REACH_M)
        floor = np.zeros(len(points))
        order = np.lexsort((town.areas[which], at))
        at, areas = at[order], town.areas[which][order]
        starts = np.flatnonzero(np.diff(at, prepend=-1))
        for start, end in zip(starts, np.append(starts[1:], len(at))):
            floor[at[start]] = float(np.sum(areas[start:end]))
        self.share = np.clip((floor.reshape(self.nodes, self.nodes) - KERBED_FLOOR_M2[0]) / (KERBED_FLOOR_M2[1] - KERBED_FLOOR_M2[0]), 0, 1)

    def __call__(self, xy: np.ndarray) -> np.ndarray:
        last = self.nodes - 1
        # To a millionth of a step: a place on the tile's edge is on the edge's own nodes, whichever tile asks.
        column_at = np.clip(np.round((xy[:, 0] - self.west) / LATTICE_M, 6), 0, last)
        row_at = np.clip(np.round((self.north - xy[:, 1]) / LATTICE_M, 6), 0, last)
        column, row = np.minimum(column_at.astype(int), last - 1), np.minimum(row_at.astype(int), last - 1)
        across, down = column_at - column, row_at - row
        upper = self.share[row, column] * (1 - across) + self.share[row, column + 1] * across
        lower = self.share[row + 1, column] * (1 - across) + self.share[row + 1, column + 1] * across
        return upper * (1 - down) + lower * down


def share_of(name: str, west: float, north: float, size_m: float) -> Share:
    """How built up each place of a tile is, from the footprints round it."""
    return Share(built_up_of(name), west, north, size_m)


def counted(footprints) -> list:
    """The footprints a town is measured by: none of a farm's outbuildings or a shore's cottages."""
    return [footprint.shape for footprint in footprints if footprint.kind not in OUTBUILDINGS and footprint.kind not in COTTAGE]


@lru_cache(maxsize=4)
def built_up_of(name: str) -> Town:
    """The town test for a tile, reading the Topographic Database's sheets round it."""
    tile = tile_from_name(name)
    reach = box(tile.west - REACH_M, tile.south - REACH_M, tile.east + REACH_M, tile.north + REACH_M)
    sheets = {path for path in (topographic_path_or_none(neighbour(tile, east, north)) for east in (-1, 0, 1) for north in (-1, 0, 1)) if path is not None}
    shapes = [shape for path in sorted(sheets) for shape in counted(_sheet_footprints(path)) if shape.intersects(reach)]
    return Town([translate(shape, -WORLD_ORIGIN[0], -WORLD_ORIGIN[1]) for shape in shapes])


def town_audit(tiles: list[str]) -> None:
    """The built floor at each named place OSM maps on these tiles, and whether it's in town."""
    found = {}
    for name in tiles:
        for node in (node for path in osm_xml(tile_from_name(name)) for node in ElementTree.parse(path).getroot().iter("node")):
            tags = {tag.get("k"): tag.get("v") for tag in node.findall("tag")}
            if tags.get("place") in ("town", "village", "suburb") and "name" in tags:
                found[node.get("id")] = (tags["place"], tags["name"], float(node.get("lon")), float(node.get("lat")))
    rows = []
    for place, name, lon, lat in found.values():
        east, north = lonlat_to_grid([lon], [lat])
        home = tile_at(east[0], north[0])
        if home.name not in tiles:
            continue
        town = built_up_of(home.name)
        point = np.array(to_local(east[0], north[0]))
        rows.append((place, name, town.built_floor(point), town(point)))
    for place, name, floor, built in sorted(rows, key=lambda row: -row[2]):
        print(f"{place:8} {name:24} {floor:8.0f} m²  {'town' if built else 'country'}")


if __name__ == "__main__":
    town_audit(sys.argv[1:])

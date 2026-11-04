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

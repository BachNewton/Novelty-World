"""The stone churches and the landmarks: models of their own at real places, in place of what the data has there.

Where each stands and what it replaces come from the art (`art/landmarks/sites.json`,
written from the models themselves): NLS solids by name, or every solid inside the
site's plan, the footprint of its far version. A generated shape under a site goes
too, whatever it replaces, or it would stand through the model. What goes keeps
its outline as a wall the car hits, and so does the site's own plan, so a landmark
the data had no building for still stops the car.

A tile lists the sites standing in it: which model, and where, in the scene. A
site's solids go from whichever tile holds them, so one near an edge is whole.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from grid import Tile, to_local

SITES_FILE = Path(__file__).resolve().parent.parent / "art" / "landmarks" / "sites.json"
# How far past a tile's edge a site can still reach the tile's buildings: Bomarsund's arc is the widest, at 260 m.
REACH_M = 400.0
# Each of the plan's triangles grows by this, so they join as one shape and a wall, a line from above, is as thick as one.
GROW_M = 0.5
# A footprint or solid this much inside a plan is under the site.
UNDER = 0.5


@dataclass
class Site:
    id: str
    east: float
    north: float
    base: float | None
    solids: frozenset[str]
    inside: bool
    plan: Polygon | shapely.MultiPolygon


def read_sites(path: Path = SITES_FILE) -> list[Site]:
    sites = []
    for record in json.loads(path.read_text(encoding="utf-8")):
        corners = np.array(record["plan"]["corners"])
        plan = unary_union([LineString(corners[[*triangle, triangle[0]]]).buffer(GROW_M).union(Polygon(corners[triangle]).buffer(GROW_M)) for triangle in record["plan"]["triangles"]])
        replaces = record["replaces"]
        solids = frozenset(replaces["solids"]) if isinstance(replaces, dict) else frozenset()
        sites.append(Site(record["id"], record["east"], record["north"], record["baseM"], solids, replaces == "inside", plan))
    return sites


def _under(shape: Polygon, plan) -> bool:
    return shape.area > 0 and shape.intersection(plan).area >= UNDER * shape.area


class Landmarks:
    """The sites in and around one tile, in ETRS-TM35FIN metres."""

    def __init__(self, tile: Tile, sites: list[Site] | None = None):
        sites = read_sites() if sites is None else sites
        self.tile = tile
        self.near = [site for site in sites if tile.west - REACH_M <= site.east < tile.east + REACH_M and tile.south - REACH_M <= site.north < tile.north + REACH_M]
        self.own = [site for site in self.near if tile.west <= site.east < tile.east and tile.south <= site.north < tile.north]
        self.replaced: dict[str, list[str]] = {site.id: [] for site in self.near}

    def replaces_solid(self, name: str, footprint: Polygon) -> bool:
        for site in self.near:
            if name in site.solids or (site.inside and _under(footprint, site.plan)):
                self.replaced[site.id].append(name)
                return True
        return False

    def covers(self, name: str, footprint: Polygon) -> bool:
        """A footprint under a site: the generated shape it would get stands through the model."""
        for site in self.near:
            if _under(footprint, site.plan):
                self.replaced[site.id].append(name)
                return True
        return False

    def plans(self) -> list[Polygon]:
        """The own sites' plans, part by part: walls for the car."""
        return _parts(self.own)

    def plans_near(self) -> list[Polygon]:
        """Every plan within reach of the tile, its neighbours' too, for what a road meets."""
        return _parts(self.near)

    def places(self, ground) -> list[dict]:
        """The own sites as the game reads them: the model, and its origin in the scene. `ground.at` reads heights in scene metres."""
        places = []
        for site in self.own:
            x, north = to_local(site.east, site.north)
            y = site.base if site.base is not None else float(ground.at(np.array([x]), np.array([north]))[0])
            places.append({"model": site.id, "x": round(float(x), 2), "y": round(float(y), 2), "z": round(float(-north), 2), "yaw": 0})
        return places

    def report(self) -> str:
        return ", ".join(f"{site} {len(names)} ({' '.join(names)})" if names else f"{site} nothing" for site, names in self.replaced.items())


def _parts(sites: list[Site]) -> list[Polygon]:
    return [part for site in sites for part in shapely.get_parts(site.plan) if part.geom_type == "Polygon"]

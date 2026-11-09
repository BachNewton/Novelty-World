"""The stone churches, the landmarks, the Västerhamn terminal and the fuel stations: models of their own at real
places, in place of what the data has there.

Where each stands and what it replaces come from the art (`art/landmarks/sites.json`,
written from the models themselves): NLS solids by name, or every solid inside the
site's plan, the footprint of its far version. A generated shape under a site goes
too, whatever it replaces, or it would stand through the model. What goes keeps
its outline as a wall the car hits, and so does the site's own plan, so a landmark
the data had no building for still stops the car. A site that stands over roads,
the terminal's walkways or a station's canopy, names its own walls instead: legs,
pump islands, a kiosk, posts.

A tile lists the sites standing in it: which model, and where, in the scene. The
churches and landmarks are listed under `landmarks` and stand from the start; the
near-only sites under `nearSites`, drawn with the tile's detail. A site's solids go
from whichever tile holds them, so one near an edge is whole.
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
# The landmark lighthouses on a tile, drawn with the sea marks, whose plans take away any building under them as a mill's do.
LIGHTHOUSE_SITES_FILE = Path(__file__).resolve().parent.parent / "art" / "lighthouses" / "sites.json"
# The dealerships, drawn by a list of their own (`render/dealers.ts`), which stand on their plots as a landmark does.
DEALER_SITES_FILE = Path(__file__).resolve().parent.parent / "art" / "dealers" / "sites.json"
# How far past a tile's edge a site can still reach the tile's buildings: Bomarsund's arc is the widest, at 260 m.
REACH_M = 400.0
# Each of the plan's triangles grows by this, so they join as one shape and a wall, a line from above, is as thick as one.
GROW_M = 0.5
# A footprint or solid this much inside a plan is under the site.
UNDER = 0.5
# A fuel station's canopy is placed from the photo, and the data's outline of it may cross it at another angle (Godby's
# lies a third under it), while no other building reaches under any station's canopy.
UNDER_CANOPY = 0.25
# A raised way this much inside the terminal's plan is one of its walkways, corridors or car ramps, which the model draws.
RAISED_ROAD_UNDER = 0.6


@dataclass
class Site:
    id: str
    east: float
    north: float
    base: float | None
    solids: frozenset[str]
    inside: bool
    plan: Polygon | shapely.MultiPolygon
    # What the car hits, where that isn't the plan: a near-only site over roads names its own.
    walls: list[Polygon] | None = None
    # Drawn only with its tile's detail.
    near_only: bool = False
    # Drawn by a list of its own, not listed with the landmarks; what it replaces goes whole, leaving only its own walls.
    own_list: bool = False


def read_sites(path: Path = SITES_FILE, own_list: bool = False) -> list[Site]:
    sites = []
    for record in json.loads(path.read_text(encoding="utf-8")):
        corners = np.array(record["plan"]["corners"])
        plan = unary_union([LineString(corners[[*triangle, triangle[0]]]).buffer(GROW_M).union(Polygon(corners[triangle]).buffer(GROW_M)) for triangle in record["plan"]["triangles"]])
        replaces = record["replaces"]
        solids = frozenset(replaces["solids"]) if isinstance(replaces, dict) else frozenset()
        walls = [Polygon(outline) for outline in record["walls"]] if "walls" in record else None
        sites.append(Site(record["id"], record["east"], record["north"], record["baseM"], solids, replaces == "inside", plan, walls, record.get("nearOnly", False), own_list))
    return sites


def lighthouse_sites(tile: Tile) -> list[Site]:
    """The landmark lighthouses in or just past the tile, as sites that replace every building under them."""
    return [site for site in read_sites(LIGHTHOUSE_SITES_FILE) if tile.west - REACH_M <= site.east < tile.east + REACH_M and tile.south - REACH_M <= site.north < tile.north + REACH_M]


def dealer_sites(tile: Tile) -> list[Site]:
    """The dealerships in or just past the tile: each replaces every building under its plot and stops the car at its own walls."""
    return [site for site in read_sites(DEALER_SITES_FILE, own_list=True) if tile.west - REACH_M <= site.east < tile.east + REACH_M and tile.south - REACH_M <= site.north < tile.north + REACH_M]


def _under(shape: Polygon, site: Site) -> bool:
    share = UNDER_CANOPY if site.near_only and site.inside else UNDER
    return shape.area > 0 and shape.intersection(site.plan).area >= share * shape.area


class Landmarks:
    """The sites in and around one tile, in ETRS-TM35FIN metres."""

    def __init__(self, tile: Tile, sites: list[Site] | None = None):
        sites = read_sites() if sites is None else sites
        self.tile = tile
        self.near = [site for site in sites if tile.west - REACH_M <= site.east < tile.east + REACH_M and tile.south - REACH_M <= site.north < tile.north + REACH_M]
        self.own = [site for site in self.near if tile.west <= site.east < tile.east and tile.south <= site.north < tile.north]
        self.replaced: dict[str, list[str]] = {site.id: [] for site in self.near}

    def replace_also(self, sites: list[Site]) -> None:
        """Sites drawn by a list of their own, not as landmarks, that still replace what stands under them: the windmills."""
        self.near += sites
        self.replaced |= {site.id: [] for site in sites}

    def stand_also(self, sites: list[Site]) -> None:
        """Sites drawn by a list of their own that stand in the tile as a landmark does: the dealerships. They replace what's
        under them and stop the car at the walls they name, and the tile doesn't list them."""
        self.near += sites
        self.own += [site for site in sites if self.tile.west <= site.east < self.tile.east and self.tile.south <= site.north < self.tile.north]
        self.replaced |= {site.id: [] for site in sites}

    def leaves_no_wall(self, name: str) -> bool:
        """What a site drawn by its own list replaced goes whole: its outline is no wall, since the site's own walls are."""
        return any(name in self.replaced[site.id] for site in self.near if site.own_list)

    def replaces_solid(self, name: str, footprint: Polygon) -> bool:
        for site in self.near:
            if name in site.solids or (site.inside and _under(footprint, site)):
                self.replaced[site.id].append(name)
                return True
        return False

    def covers(self, name: str, footprint: Polygon) -> bool:
        """A footprint under a site: the generated shape it would get stands through the model."""
        for site in self.near:
            if _under(footprint, site):
                self.replaced[site.id].append(name)
                return True
        return False

    def plans(self) -> list[Polygon]:
        """The own sites' walls for the car: their plans part by part, or the walls they name."""
        return _parts(self.own)

    def plans_near(self) -> list[Polygon]:
        """Every site's walls within reach of the tile, its neighbours' too, for what a road meets."""
        return _parts(self.near)

    def off_raised(self, roads: list[dict], osm_file: Path) -> list[dict]:
        """The roads, in the tile's own metres, less the ways a near-only site carries overhead: the terminal's walkways,
        corridors and car ramps, mapped as bridges, indoors or on a layer, are the model's to draw, not a ribbon laid on
        the quay under it."""
        sites = [site for site in self.near if site.near_only and site.walls is not None]
        if not sites:
            return roads
        plans = shapely.transform(unary_union([site.plan for site in sites]), lambda points: np.column_stack(to_local(points[:, 0], points[:, 1])))
        tags = {element["id"]: element.get("tags", {}) for element in json.loads(osm_file.read_text(encoding="utf-8"))["elements"] if element["type"] == "way"}

        def raised(road: dict) -> bool:
            own = tags.get(road["id"], {})
            layer = own.get("layer", "0")
            return own.get("bridge", "no") != "no" or own.get("indoor") == "yes" or own.get("highway") == "corridor" or layer.lstrip("-").isdigit() and int(layer) > 0

        kept = []
        for road in roads:
            line = LineString(road["line"]) if len(road["line"]) >= 2 else None
            if line is not None and line.length > 0 and raised(road) and line.intersection(plans).length >= RAISED_ROAD_UNDER * line.length:
                continue
            kept.append(road)
        return kept

    def footprints(self) -> list[shapely.Geometry]:
        """The plans of the sites in reach, in the scene's metres: what a dock or a moored boat keeps out of."""
        return [shapely.transform(site.plan, lambda points: np.column_stack(to_local(points[:, 0], points[:, 1]))) for site in self.near]

    def places(self, ground, near_only: bool = False) -> list[dict]:
        """The own sites as the game reads them: the model, and its origin in the scene. `ground.at` reads heights in scene metres.
        The churches and landmarks, or with `near_only` the sites drawn only with the tile's detail."""
        places = []
        for site in self.own:
            if site.near_only != near_only or site.own_list:
                continue
            x, north = to_local(site.east, site.north)
            y = site.base if site.base is not None else float(ground.at(np.array([x]), np.array([north]))[0])
            places.append({"model": site.id, "x": round(float(x), 2), "y": round(float(y), 2), "z": round(float(-north), 2), "yaw": 0})
        return places

    def report(self) -> str:
        return ", ".join(f"{site} {len(names)} ({' '.join(names)})" if names else f"{site} nothing" for site, names in self.replaced.items())


def _parts(sites: list[Site]) -> list[Polygon]:
    return [part for site in sites for part in (site.walls if site.walls is not None else shapely.get_parts(site.plan)) if part.geom_type == "Polygon"]

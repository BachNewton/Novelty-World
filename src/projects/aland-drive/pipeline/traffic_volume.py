"""How many vehicles a day each road carries, both ways, from Åland's own traffic counts.

Ålands landskapsregering counts traffic at about 170 sites on its roads, each for
a week about twice a year (kartor.ax, CC BY 4.0). A site's volume is the mean of
its counts. A site belongs to the road it stands on, the nearest laid motor road
on any built tile. A road with a site on it carries that site's volume; one with
none carries the nearest site's on a road of the same name, which is how a count
reaches the rest of its road; and the rest carry their class's typical volume,
in town or out of it. The game turns a volume into how many cars ride a lane.
"""

import json
import statistics
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, Point

import sources
from grid import WORLD_ORIGIN

# A site this far from every laid motor road is on a road the tiles don't lay.
SITE_ON_ROAD_M = 30
# A road takes a same-named road's count this far away at most: further along, its traffic has changed.
SAME_NAME_M = 4000
# Vehicles a day both ways on a road with no count of its own, by class, out of town and in it. Out of town, the
# counts' own medians for primary to unclassified (33, 57, 36 and 11 sites); in town, theirs for primary and
# secondary (9 and 10 sites in Mariehamn). The counts barely reach residential streets, drives and tracks, or a
# town's lesser streets, so those are judged: a village lane sees a car every few minutes, a town street a few a minute.
TYPICAL_DAILY = {
    "primary": (2050, 2600),
    "secondary": (575, 6500),
    "tertiary": (295, 1500),
    "unclassified": (180, 600),
    "road": (180, 600),
    "residential": (120, 400),
    "living_street": (40, 100),
    "service": (40, 80),
    "track": (15, 15),
}
LINKS = {"primary_link": "primary", "secondary_link": "secondary", "tertiary_link": "tertiary"}


class TrafficVolume:
    """Each motor road's vehicles a day, from count sites: where each stands, its mean volume and its road's name."""

    def __init__(self, sites: list[tuple[np.ndarray, float, str]]):
        self.sites = sites

    @classmethod
    def counted(cls, tiles: Path) -> "TrafficVolume":
        """From Åland's counts, each site on the road every built tile lays nearest it."""
        data = json.loads(sources.traffic_counts_path().read_text(encoding="utf-8"))
        if data.get("exceededTransferLimit"):
            raise ValueError("the traffic counts came back cut short: ask for more records at once")
        counts: dict[tuple, list] = {}
        for feature in data["features"]:
            attributes = feature["attributes"]
            if attributes["TRAFFVOLUME"] is None:
                continue
            place = (feature["geometry"]["x"] - WORLD_ORIGIN[0], feature["geometry"]["y"] - WORLD_ORIGIN[1])
            counts.setdefault((attributes["ROADNR"], attributes["POSITIONID"]), []).append((place, attributes["TRAFFVOLUME"]))
        roads = [road for path in sorted(tiles.glob("*/roads.json")) for road in json.loads(path.read_text(encoding="utf-8"))["roads"] if road["motor"] and len(road["line"]) >= 2]
        lines = [LineString(road["line"]) for road in roads]
        tree = shapely.STRtree(lines)
        sites = []
        for site in counts.values():
            place = Point(site[0][0])
            nearest = tree.query_nearest(place, max_distance=SITE_ON_ROAD_M)
            if len(nearest) == 0:
                continue
            road = roads[int(nearest[0])]
            sites.append((np.array(site[0][0]), statistics.mean(volume for _, volume in site), road.get("name") or ""))
        return cls(sites)

    def daily(self, chain, built_up: bool) -> float:
        """Vehicles a day both ways along a laid motor road (a `roadside.Chain`), anywhere along it."""
        if chain.line is not None:
            on = [volume for place, volume, name in self.sites if name == chain.name and chain.line.distance(Point(place)) <= SITE_ON_ROAD_M]
            if on:
                return statistics.mean(on)
            if chain.name:
                middle = np.array(chain.line.interpolate(0.5, normalized=True).coords[0])
                named = [(float(np.hypot(*(place - middle))), volume) for place, volume, name in self.sites if name == chain.name]
                near = min(named, default=None)
                if near is not None and near[0] <= SAME_NAME_M:
                    return near[1]
        country, town = TYPICAL_DAILY.get(LINKS.get(chain.kind, chain.kind), TYPICAL_DAILY["service"])
        return town if built_up else country

"""What a church or landmark takes the place of, and which tile lists it: the rules a site near an edge or a wrong plan breaks."""

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from shapely.geometry import box

from grid import Tile, to_local
from landmarks import Landmarks, Site, read_sites

TILE = Tile("TEST01", 100000, 6680000)


def site(name: str, east: float, north: float, solids=(), inside=False, base=None) -> Site:
    return Site(name, east, north, base, frozenset(solids), inside, box(east - 10, north - 20, east + 10, north + 20))


class Flat:
    def at(self, east, north):
        return np.full(len(east), 7.5)


class Replacing(unittest.TestCase):
    def test_a_named_solid_goes_wherever_it_lies(self):
        sites = Landmarks(TILE, [site("church", 103000, 6683000, solids=["solid_1"])])
        self.assertTrue(sites.replaces_solid("solid_1", box(0, 0, 1, 1)))
        self.assertFalse(sites.replaces_solid("solid_2", box(103000, 6683000, 103001, 6683001)))

    def test_inside_takes_what_lies_mostly_in_the_plan_and_nothing_beside_it(self):
        sites = Landmarks(TILE, [site("castle", 103000, 6683000, inside=True)])
        self.assertTrue(sites.replaces_solid("in", box(102995, 6682990, 103005, 6683000)))
        # Across the plan's edge, mostly out.
        self.assertFalse(sites.replaces_solid("beside", box(103008, 6683000, 103020, 6683005)))

    def test_a_generated_shape_under_any_site_goes(self):
        sites = Landmarks(TILE, [site("tower", 103000, 6683000)])
        self.assertTrue(sites.covers("footprint", box(102998, 6682998, 103002, 6683002)))
        self.assertFalse(sites.covers("next door", box(103020, 6683000, 103030, 6683010)))


class OverRoads(unittest.TestCase):
    """The terminal and the fuel stations stand over roads: only their own walls stop the car, and the terminal's raised
    ways are its own to draw."""

    def near_site(self) -> Site:
        legs = [box(102990, 6682990, 102991, 6682991), box(103009, 6682990, 103010, 6682991)]
        return Site("terminal", 103000, 6683000, 0.0, frozenset(), False, box(102985, 6682985, 103015, 6683015), legs, True)

    def test_the_car_meets_its_legs_not_its_plan(self):
        sites = Landmarks(TILE, [self.near_site()])
        self.assertEqual([wall.area for wall in sites.plans()], [1.0, 1.0])

    def test_it_is_listed_apart_from_the_landmarks(self):
        sites = Landmarks(TILE, [self.near_site(), site("church", 104000, 6684000)])
        self.assertEqual([place["model"] for place in sites.places(Flat())], ["church"])
        self.assertEqual([place["model"] for place in sites.places(Flat(), near_only=True)], ["terminal"])

    def test_its_raised_ways_leave_the_road_surface_and_the_quay_under_them_stays(self):
        sites = Landmarks(TILE, [self.near_site()])
        x, y = to_local(103000, 6683000)
        along = [[x - 10, y], [x + 10, y]]
        roads = [{"id": 1, "line": along}, {"id": 2, "line": along}, {"id": 3, "line": [[x + 100, y], [x + 120, y]]}]
        tags = {"elements": [{"type": "way", "id": 1, "tags": {"highway": "footway", "bridge": "yes", "layer": "1"}}, {"type": "way", "id": 2, "tags": {"highway": "service"}}, {"type": "way", "id": 3, "tags": {"highway": "footway", "bridge": "yes"}}]}
        with tempfile.TemporaryDirectory() as folder:
            osm = Path(folder) / "osm.json"
            osm.write_text(json.dumps(tags), encoding="utf-8")
            self.assertEqual([road["id"] for road in sites.off_raised(roads, osm)], [2, 3])


class Listing(unittest.TestCase):
    def test_a_site_over_the_edge_replaces_here_but_is_listed_by_its_own_tile(self):
        sites = Landmarks(TILE, [site("over", TILE.east + 50, 6683000, inside=True)])
        self.assertEqual(sites.places(Flat()), [])
        self.assertTrue(sites.replaces_solid("edge", box(TILE.east + 45, 6682995, TILE.east + 50, 6683000)))

    def test_a_site_stands_on_its_art_base_or_on_the_ground(self):
        sites = Landmarks(TILE, [site("ship", 103000, 6683000, base=0.1), site("church", 104000, 6684000)])
        ship, church = sites.places(Flat())
        self.assertEqual(ship["y"], 0.1)
        self.assertEqual(church["y"], 7.5)
        # The scene's north is -z.
        self.assertLess(church["z"], ship["z"])


class TheArt(unittest.TestCase):
    def test_every_plan_is_ground_the_model_covers(self):
        for record in read_sites():
            self.assertGreater(record.plan.area, 20, record.id)
            self.assertLess(record.plan.distance(box(record.east - 1, record.north - 1, record.east + 1, record.north + 1)), 150, record.id)


if __name__ == "__main__":
    unittest.main()

"""What a church or landmark takes the place of, and which tile lists it: the rules a site near an edge or a wrong plan breaks."""

import unittest

import numpy as np
from shapely.geometry import box

from grid import Tile
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

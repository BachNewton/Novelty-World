import unittest

import numpy as np
from shapely.geometry import box

from buildings import Footprint
from facades import COMMERCIAL, HOUSE, OUTBUILDINGS
from built_up import Share, Town, counted


def square(east: float, north: float, area: float):
    half = area**0.5 / 2
    return box(east - half, north - half, east + half, north + half)


class TownTest(unittest.TestCase):
    def test_a_farm_and_its_outbuildings_is_country_however_many_there_are(self):
        farm = [Footprint(square(0, 0, 180), HOUSE)] + [Footprint(square(20 + 15 * shed, 30, 400), OUTBUILDINGS[0]) for shed in range(26)]
        self.assertFalse(Town(counted(farm))(np.array([0.0, 0.0])))

    def test_a_village_centre_of_a_few_big_buildings_is_town(self):
        centre = [Footprint(square(0, 40, 2500), COMMERCIAL[0]), Footprint(square(120, 0, 2400), COMMERCIAL[0])] + [Footprint(square(-60 + 25 * house, -80, 150), HOUSE) for house in range(8)]
        self.assertTrue(Town(counted(centre))(np.array([0.0, 0.0])))

    def test_two_tiles_read_the_same_share_along_the_edge_they_share(self):
        # Each tile sums the floors it finds in its own order; a street crossing the edge must be as wide on both.
        rolls = np.random.default_rng(7)
        shapes = [square(float(east), float(north), float(area)) for east, north, area in zip(rolls.uniform(5600, 6400, 300), rolls.uniform(0, 6000, 300), rolls.uniform(300, 1500, 300))]
        west, east = Share(Town(shapes), 0.0, 6000.0, 6000.0), Share(Town(shapes[::-1]), 6000.0, 6000.0, 6000.0)
        edge = np.column_stack((np.full(500, 6000.0), np.linspace(0.0, 6000.0, 500)))
        self.assertTrue(west(edge).max() > 0)
        self.assertEqual(west(edge).tolist(), east(edge).tolist())

    def test_buildings_past_the_reach_dont_count(self):
        far = [Footprint(square(400, 0, 9000), COMMERCIAL[0])]
        self.assertFalse(Town(counted(far))(np.array([0.0, 0.0])))


if __name__ == "__main__":
    unittest.main()

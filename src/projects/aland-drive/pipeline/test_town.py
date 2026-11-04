import unittest

import numpy as np
from shapely.geometry import box

from buildings import Footprint
from facades import COMMERCIAL, HOUSE, OUTBUILDINGS
from town import Town, counted


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

    def test_buildings_past_the_reach_dont_count(self):
        far = [Footprint(square(400, 0, 9000), COMMERCIAL[0])]
        self.assertFalse(Town(counted(far))(np.array([0.0, 0.0])))


if __name__ == "__main__":
    unittest.main()

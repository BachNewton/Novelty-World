"""Which footprints become a boathouse or a shed, and which way each faces: the rules that are easy to get backwards."""

import math
import unittest

import numpy as np
from shapely.geometry import Polygon, box

from outbuildings import Placed, Shores, Tags

OUTBUILDING, HOUSE = 42261, 42211
# 200 m square at 2 m, with the sea filling everything south of north = 40.
WEST, NORTH = 0.0, 200.0


def placed(osm: list[dict] | None = None) -> Placed:
    water = np.zeros((100, 100), dtype=bool)
    water[80:, :] = True
    return Placed(Shores(water, WEST, NORTH), Tags(osm or []))


def take(where: Placed, kind: int, outline: Polygon, toward_road=None) -> list | None:
    before = sum(len(places) for places in where.models.values())
    if not where.take(kind, outline, np.zeros(len(outline.exterior.coords)), toward_road, seed=0):
        return None
    assert sum(len(places) for places in where.models.values()) == before + 1
    return next(places[-1] for places in where.models.values() if places)


class Boathouses(unittest.TestCase):
    def test_an_outbuilding_on_the_shore_faces_the_water(self):
        # 4 × 8 m, its long side running north to south, its south end at the water's edge.
        x, y, z, yaw, width, length = take(placed(), OUTBUILDING, box(100, 40, 104, 48))
        # The model's +z turns to (sin yaw, cos yaw) in the scene, whose +z is south.
        self.assertAlmostEqual(math.sin(yaw), 0, places=3)
        self.assertAlmostEqual(math.cos(yaw), 1, places=3)
        self.assertAlmostEqual(width, 4, places=2)
        self.assertAlmostEqual(length, 8, places=2)
        self.assertAlmostEqual(z, -44, places=2)

    def test_one_lying_along_the_shore_still_faces_it(self):
        # 8 m along the shore and 4 m deep: the doors go in the long side, and the length runs back from them.
        _, _, _, yaw, width, length = take(placed(), OUTBUILDING, box(100, 40, 108, 44))
        self.assertAlmostEqual(math.cos(yaw), 1, places=3)
        self.assertAlmostEqual((width, length), (8, 4), places=2)

    def test_a_house_on_the_shore_is_left_alone(self):
        self.assertIsNone(take(placed(), HOUSE, box(100, 40, 110, 50)))

    def test_osm_names_a_boathouse_a_little_way_up_the_shore(self):
        osm = [{"kind": "boathouse", "ring": [[100, 50], [104, 50], [104, 58], [100, 58]]}]
        self.assertIsNotNone(take(placed(osm), HOUSE, box(100, 50, 104, 58)))


    def test_a_solid_of_several_buildings_keeps_its_own_shape(self):
        ground = np.zeros(5)
        alone, row = box(100, 40, 104, 48), box(100, 40, 120, 48)
        self.assertTrue(placed().take_solid(OUTBUILDING, alone, alone, alone, ground, None, 0))
        self.assertFalse(placed().take_solid(OUTBUILDING, row, row, alone, ground, None, 0))


class Sheds(unittest.TestCase):
    def test_a_small_outbuilding_inland_is_a_shed_with_its_door_to_the_road(self):
        _, _, _, yaw, width, length = take(placed(), OUTBUILDING, box(100, 150, 104, 153), toward_road=np.array([20.0, 0.0]))
        # Its ridge along the long side, east to west, and the door at the end nearer the road, east: +x in the scene.
        self.assertAlmostEqual(math.sin(yaw), 1, places=3)
        self.assertAlmostEqual((width, length), (3, 4), places=2)

    def test_big_or_long_outbuildings_keep_their_generated_shape(self):
        where = placed()
        self.assertIsNone(take(where, OUTBUILDING, box(100, 150, 110, 160)))
        self.assertIsNone(take(where, OUTBUILDING, box(100, 150, 112, 152)))


if __name__ == "__main__":
    unittest.main()

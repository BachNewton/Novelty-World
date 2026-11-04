"""The farm's turns, which are easy to flip, and what a windmill takes the place of."""

import math
import unittest

import numpy as np
from shapely.geometry import box

from farm import lying_along, mill_yaw
from grid import Tile
from landmarks import Landmarks, Site


def turned(yaw: float, model: tuple[float, float]) -> np.ndarray:
    """Where the kit's material turns a model's (x, z) to in the scene."""
    x, z = model
    return np.array([x * math.cos(yaw) + z * math.sin(yaw), z * math.cos(yaw) - x * math.sin(yaw)])


class Turns(unittest.TestCase):
    def test_a_mill_faces_its_long_side_into_the_south_westerly(self):
        # In ETRS metres: long north to south, so the sails face south; long east to west, so they face west.
        np.testing.assert_allclose(turned(mill_yaw(box(0, 0, 3, 5)), (0, 1)), [0, 1], atol=1e-9)
        np.testing.assert_allclose(turned(mill_yaw(box(0, 0, 5, 3)), (0, 1)), [-1, 0], atol=1e-9)

    def test_a_bale_lies_along_its_row(self):
        for direction in ([1, 0], [0, 1], [0.6, -0.8]):
            np.testing.assert_allclose(turned(lying_along(np.array(direction)), (1, 0)), direction, atol=1e-9)


class Replacing(unittest.TestCase):
    def test_a_mill_takes_what_stands_under_it_and_nothing_beside_it(self):
        mill = box(100000, 6680000, 100004, 6680005)
        site = Site("windmill 1", 100002, 6680002.5, None, frozenset(), True, mill.buffer(1))
        sites = Landmarks(Tile("TEST01", 99000, 6679000), [])
        sites.replace_also([site])
        self.assertTrue(sites.covers("under it", box(100000.5, 6680000.5, 100003.5, 6680004.5)))
        self.assertFalse(sites.replaces_solid("the barn beside it", box(100006, 6680000, 100020, 6680010)))
        self.assertEqual(sites.places(None), [], "a mill is drawn by its own list, never as a landmark")


if __name__ == "__main__":
    unittest.main()

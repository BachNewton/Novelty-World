"""The clearing round buildings: what a tree reads back must never say a building is further than it is."""

import unittest

import numpy as np

from canopy import PIXELS
from clearing import REACH_M, UNIT_M, ZERO, distances, encode, sea_mark_outlines
from grid import TILE_SIZE_M

PIXEL_M = TILE_SIZE_M / PIXELS
# How far a read may say a building is beyond where it is: half a raster cell, and the encoding's rounding.
SLACK_M = 0.5 + UNIT_M / 2


def read(clearing: np.ndarray, x: float, z: float) -> float:
    """Bilinear, clamped at the edge, as the GPU reads it, at a place in metres from the tile's north-west corner."""
    u, v = x / PIXEL_M - 0.5, z / PIXEL_M - 0.5
    column, row = int(np.floor(u)), int(np.floor(v))
    s, t = u - column, v - row
    at = lambda c, r: clearing[min(max(r, 0), PIXELS - 1), min(max(c, 0), PIXELS - 1)]
    return (at(column, row) * (1 - s) + at(column + 1, row) * s) * (1 - t) + (at(column, row + 1) * (1 - s) + at(column + 1, row + 1) * s) * t


class Clearing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # A 20 m house well inside the tile, a shed whose west half is over the tile's west edge, and a wall line.
        house = np.array([[3000, 3000], [3020, 3000], [3020, 3020], [3000, 3020]], float)
        shed = np.array([[-3, 1000], [1, 1000], [1, 1006], [-3, 1006]], float)
        wall = np.array([[4000, 4000, 4000, 4030]], float)
        signed = distances([house, shed], wall, 0.0, 0.0)
        cls.clearing = (np.asarray(encode(signed), dtype=float) - ZERO) * UNIT_M

    def test_a_straight_wall_reads_back_its_distance_between_pixels(self):
        for x in np.arange(3021.0, 3036.0, 0.7):
            self.assertAlmostEqual(read(self.clearing, x, 3010.3), x - 3020, delta=SLACK_M, msg=x)

    def test_inside_a_building_reads_below_zero(self):
        self.assertLess(read(self.clearing, 3010.0, 3010.0), -5)

    def test_a_line_clears_both_sides(self):
        self.assertAlmostEqual(read(self.clearing, 4006.0, 4015.0), 6.0, delta=SLACK_M)
        self.assertAlmostEqual(read(self.clearing, 3994.0, 4015.0), 6.0, delta=SLACK_M)

    def test_by_the_tiles_edge_a_neighbours_building_is_never_read_further_than_it_is(self):
        for x in np.arange(1.0, 4.0, 0.25):
            self.assertLessEqual(read(self.clearing, x, 1003.0), x - 1 + SLACK_M, x)

    def test_a_sea_mark_ashore_is_cleared_as_a_building_is_and_a_floating_one_is_not(self):
        marks = [["leading-front-red-yellow", 2000.0, 2000.0, 0, 0, 0], ["spar-port", 2200.0, 2000.0, 0, 1, 0]]
        outlines = sea_mark_outlines(marks)
        self.assertEqual(len(outlines), 1)
        clearing = (np.asarray(encode(distances(outlines, np.zeros((0, 4)), 0.0, 0.0)), dtype=float) - ZERO) * UNIT_M
        # A mark is small, so its distance curves within a pixel and a bilinear read can run a little past a straight
        # wall's slack; the forest keeps 1.5 m of its own for what the image reads long (`CLEARING_SLACK_M`).
        for x in np.arange(2000.0, 2012.0, 0.5):
            self.assertLessEqual(read(clearing, x, 2000.0), max(x - 2000 - 1.5, 0) + SLACK_M + 0.25, x)
        self.assertGreater(read(clearing, 2200.0, 2000.0), REACH_M - UNIT_M)

    def test_every_kind_of_mark_ashore_in_the_register_has_a_foot(self):
        self.assertGreater(len(sea_mark_outlines()), 250)

    def test_far_from_anything_reads_the_reach(self):
        self.assertAlmostEqual(read(self.clearing, 5000.0, 500.0), REACH_M, delta=UNIT_M)


if __name__ == "__main__":
    unittest.main()

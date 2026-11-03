"""Lanes keep to the water: the rules a change to the routing can quietly break."""

import math
import unittest

import numpy as np

from sea_lanes import CELL_M, VESSELS, Water, berth_from, crossing, lane, rounded, smoothed

BOAT = VESSELS["boat"]


def water_with_an_island() -> Water:
    """4 km square of sea at the grid's 8 m, with an island 1 km across in the middle and a hairline sound north of it."""
    free = np.ones((500, 500), dtype=bool)
    rows, columns = np.indices(free.shape)
    free[np.hypot(rows - 250, columns - 250) < 62] = False
    return Water(free, 0.0, 4000.0, {})


class Lanes(unittest.TestCase):
    def test_a_lane_goes_round_land_never_over_it(self):
        water = water_with_an_island()
        line = lane(water, np.array([500.0, 2000.0]), np.array([3500.0, 2000.0]), BOAT, [], (False, False), pull=0.5)
        self.assertIsNotNone(line)
        self.assertIsNone(crossing(water, line))
        # The straight way runs through the island's middle; the lane can't.
        self.assertGreater(len(line), 2)

    def test_a_lane_keeps_its_clearance_from_land(self):
        water = water_with_an_island()
        line = lane(water, np.array([500.0, 2000.0]), np.array([3500.0, 2000.0]), BOAT, [], (False, False), pull=0.5)
        for x, y in line:
            off_centre = math.hypot(x - 2000 - CELL_M / 2, y - 2000 + CELL_M / 2)
            self.assertGreater(off_centre, 62 * CELL_M + BOAT.clear_m - 2 * CELL_M)

    def test_no_lane_where_the_water_doesnt_join(self):
        free = np.ones((200, 200), dtype=bool)
        free[:, 95:105] = False
        water = Water(free, 0.0, 1600.0, {})
        self.assertIsNone(lane(water, np.array([200.0, 800.0]), np.array([1400.0, 800.0]), BOAT, [], (False, False), pull=0.5))

    def test_rounded_corners_keep_the_ends_and_turn_smoothly(self):
        line = np.array([[0.0, 0.0], [1000.0, 0.0], [1000.0, 1000.0]])
        out = rounded(line, 200)
        np.testing.assert_allclose(out[0], line[0])
        np.testing.assert_allclose(out[-1], line[-1])
        headings = np.arctan2(*np.diff(out, axis=0).T[::-1])
        self.assertLess(np.abs(np.diff(headings)).max(), math.radians(9))

    def test_a_corner_too_wide_for_the_water_is_drawn_tighter(self):
        # A sound 100 m wide turning a right angle: a 200 m turn would cut the inside corner's land.
        free = np.zeros((300, 300), dtype=bool)
        free[250:262, 25:262] = True
        free[25:262, 250:262] = True
        water = Water(free, 0.0, 2400.0, {})
        line = np.array([[250.0, 400.0], [2048.0, 400.0], [2048.0, 2000.0]])
        self.assertIsNone(crossing(water, smoothed(water, line, 200, "test")))

    def test_a_berth_lies_with_its_whole_hull_on_the_water(self):
        # A quay along x = 1000: a line runs to it from the west.
        free = np.ones((250, 250), dtype=bool)
        free[:, 125:] = False
        water = Water(free, 0.0, 2000.0, {})
        ship = VESSELS["archipelago"]
        berth = berth_from(water, np.array([[1000.0, 1000.0], [0.0, 1000.0]]), ship, "test")
        self.assertLessEqual(berth[0] + ship.length_m / 2, 1000)
        self.assertGreater(berth[0] + ship.length_m / 2, 1000 - 16)


if __name__ == "__main__":
    unittest.main()

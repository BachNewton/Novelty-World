"""The seabed and the drawn water, where a slip floods the land or leaves the shore with no line.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline
"""

import unittest

import numpy as np

import terrain

SEA_M = 0.1
SIZE = 2 * terrain.RIM_SAMPLES + 60
SHORE = SIZE // 2


def coast() -> np.ndarray:
    """Flat sea to the west, two samples of land a few centimetres above it, then a slope up to the east."""
    mosaic = np.full((SIZE, SIZE), SEA_M, dtype=np.float32)
    columns = np.arange(SIZE)
    mosaic[:, columns >= SHORE] = SEA_M + 0.03
    rising = columns >= SHORE + 2
    mosaic[:, rising] = (SEA_M + 0.3 + 0.2 * (columns[rising] - SHORE - 2))[None, :]
    return mosaic


class Seabed(unittest.TestCase):
    def setUp(self):
        self.mosaic = coast()
        self.flat = terrain.flat_water(self.mosaic)
        self.water = terrain.water_around(self.flat)
        self.corners = terrain.tile_corners(terrain.sample_corners(self.mosaic))
        self.levels = terrain.water_levels(self.mosaic, self.flat)
        self.untouched = np.ones(self.corners.shape, bool)
        # Corner k lies between samples k + CORNER_RIM and the one east of it: this one, between the sea and the strip.
        self.shore_column = SHORE - 1 - terrain.CORNER_RIM

    def bed(self) -> np.ndarray:
        return terrain.seabed(self.corners, self.untouched, self.mosaic, self.flat, self.water, self.levels)

    def test_the_seabed_falls_from_the_drawn_surface_to_its_deepest(self):
        row = self.bed()[30]
        drawn = SEA_M - terrain.WATERLINE_BELOW_FLAT_M
        out_to_sea = row[: self.shore_column][::-1]
        self.assertTrue((out_to_sea < drawn).all())
        self.assertTrue((np.diff(out_to_sea) <= 1e-6).all(), "deeper the farther out")
        self.assertAlmostEqual(float(out_to_sea[-1]), drawn - terrain.DEEPEST_M, places=4)

    def test_the_shallows_go_under_and_the_land_stays(self):
        row = self.bed()[30]
        drawn = SEA_M - terrain.WATERLINE_BELOW_FLAT_M
        self.assertTrue((row[self.shore_column : self.shore_column + 2] < drawn).all(), "the low strip the photo shows as water")
        land = slice(self.shore_column + 3, None)
        np.testing.assert_array_equal(row[land], self.corners[30, land])
        self.assertTrue((row[land] > drawn).all())

    def test_ground_a_road_shaped_keeps_its_height(self):
        self.untouched[30] = False
        np.testing.assert_array_equal(self.bed()[30], self.corners[30])

    def test_the_water_reaches_past_the_shore_and_no_farther_than_its_reach(self):
        drawn = SEA_M - terrain.WATERLINE_BELOW_FLAT_M
        row = self.levels[30]
        reach = int(terrain.LEVEL_REACH_M / terrain.SAMPLE_M)
        # The flat water itself stops a sample short of the shore: the flatness test loses the cell next to it.
        np.testing.assert_allclose(row[: self.shore_column + reach - 2], drawn, atol=1e-6)
        self.assertTrue((row[self.shore_column + reach + 1 :] == terrain.DRY_LEVEL_M).all())


if __name__ == "__main__":
    unittest.main()

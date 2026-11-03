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
        self.water = terrain.water_around(self.flat, self.mosaic)
        self.corners = terrain.tile_corners(terrain.sample_corners(self.mosaic))
        self.levels = terrain.water_levels(self.mosaic, self.flat)
        self.untouched = np.ones(self.corners.shape, bool)
        # Corner k lies between samples k + CORNER_RIM and the one east of it: this one, between the sea and the strip.
        self.shore_column = SHORE - 1 - terrain.CORNER_RIM

    def bed(self) -> np.ndarray:
        return terrain.seabed(self.corners, self.untouched, terrain.shore_distance(self.mosaic, self.flat, self.water), self.levels)

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


class SeaLevels(unittest.TestCase):
    """The model writes patches of the sea a few centimetres apart in level; none of the seams between them is land."""

    def setUp(self):
        size = 200
        rows, columns = self.rows, self.columns = np.mgrid[:size, :size]
        self.mosaic = np.where(rows > columns, SEA_M, SEA_M + 0.02).astype(np.float32)
        # Where two levels meet the model leaves a line flat to neither, here on the diagonal.
        self.mosaic[rows == columns] = SEA_M + 0.011
        # A thin strip of the sea at a level of its own, as a map sheet's edge leaves one: under a hectare.
        self.wedge = (abs(rows - 160) < 3) & (abs(columns - 120) < 40)
        self.mosaic[(abs(rows - 160) < 4) & (abs(columns - 120) < 41)] = SEA_M - 0.01
        self.mosaic[self.wedge] = SEA_M - 0.03
        # A low skerry: real ground, never flat, a little above the sea.
        self.skerry = (abs(rows - 40) < 5) & (abs(columns - 150) < 5)
        self.mosaic[self.skerry] = SEA_M + 0.25 + 0.01 * (rows[self.skerry] % 3)
        self.water = terrain.water_mask(self.mosaic)

    def test_the_line_between_two_levels_is_water_even_on_a_diagonal(self):
        inner = np.eye(200, dtype=bool)
        inner[:10], inner[-10:] = False, False
        self.assertTrue(self.water[inner].all())

    def test_a_patch_too_small_to_count_alone_is_water_beside_the_sea(self):
        self.assertTrue(self.water[self.wedge].all())

    def test_a_low_skerry_stays_land(self):
        within_its_shore = (abs(self.rows - 40) < 4) & (abs(self.columns - 150) < 4)
        self.assertFalse(self.water[within_its_shore].any())


if __name__ == "__main__":
    unittest.main()

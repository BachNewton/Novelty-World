"""The forest's stands, on made-up rasters: no network, and no real tile.

These pin what a change here could quietly break, and `stand_audit.py` measures the real thing.
"""

import unittest

import numpy as np

import stands
from sources import MSNFI_NODATA_FROM, MSNFI_OUTSIDE, MSNFI_RIM_PIXELS
from stand_audit import covered, plant
from stands import MSNFI_PIXELS, PIXELS, decode, density, encode, occupancy_for, read_stands

SIZE = MSNFI_PIXELS + 2 * MSNFI_RIM_PIXELS


def forest(pine=100, spruce=0, birch=0, other=0, cover=50, basal=20, diameter=20, height=150):
    """A tile's cut where every pixel holds the same stand."""
    themes = dict(pine=pine, spruce=spruce, birch=birch, other=other, cover=cover, basal=basal, diameter=diameter, height=height)
    return {theme: np.full((SIZE, SIZE), value, dtype=np.uint16) for theme, value in themes.items()}


def no_data(cut, where, value=MSNFI_OUTSIDE):
    for theme in cut.values():
        theme[where] = value


class Reading(unittest.TestCase):
    def test_one_wild_pixel_barely_moves_its_stand(self):
        cut = forest()
        cut["spruce"][200, 200] = 300
        read = read_stands(cut)
        self.assertLess(read.shares[1].max(), 0.1)

    def test_a_real_stand_comes_through(self):
        cut = forest()
        middle = (slice(170, 230), slice(170, 230))
        cut["pine"][middle] = 0
        cut["birch"][middle] = 100
        read = read_stands(cut)
        self.assertGreater(read.shares[2, 200 - MSNFI_RIM_PIXELS, 200 - MSNFI_RIM_PIXELS], 0.95)

    def test_shares_sum_to_one_everywhere(self):
        rng = np.random.default_rng(1)
        cut = forest()
        for theme in ("pine", "spruce", "birch", "other"):
            cut[theme] = rng.integers(0, 300, (SIZE, SIZE), dtype=np.uint16)
        no_data(cut, rng.uniform(size=(SIZE, SIZE)) < 0.4)
        self.assertLess(np.abs(read_stands(cut).shares.sum(axis=0) - 1).max(), 1e-9)

    def test_a_field_takes_the_forest_round_it(self):
        cut = forest(pine=20, birch=80)
        hole = (slice(150, 260), slice(150, 260))
        no_data(cut, hole)
        read = read_stands(cut)
        place = 205 - MSNFI_RIM_PIXELS
        self.assertFalse(read.known[place, place])
        self.assertAlmostEqual(read.shares[2, place, place], 0.8, places=2)
        self.assertAlmostEqual(read.cover[place, place], 0.5, delta=0.02)

    def test_land_with_nothing_near_takes_the_island(self):
        cut = forest()
        no_data(cut, (slice(None), slice(None)))
        read = read_stands(cut)
        self.assertAlmostEqual(read.shares[0].mean(), stands.ISLAND_MIX[0], places=6)
        self.assertAlmostEqual(read.cover.mean(), stands.ISLAND_COVER, places=6)

    def test_a_value_that_could_not_be_computed_is_no_value(self):
        cut = forest(pine=100)
        no_data(cut, (slice(150, 260), slice(150, 260)), MSNFI_NODATA_FROM)
        read = read_stands(cut)
        self.assertLess(read.shares[0].min(), 1.01)
        self.assertGreater(read.shares[0].min(), 0.99)
        self.assertLess(read.cover.max(), 0.51)

    def test_two_tiles_read_their_shared_ground_alike(self):
        rng = np.random.default_rng(2)
        step = 80
        wide = {theme: rng.integers(1, 200, (SIZE, SIZE + step), dtype=np.uint16) for theme in forest()}
        west = read_stands({theme: values[:, :SIZE] for theme, values in wide.items()})
        east = read_stands({theme: values[:, step:] for theme, values in wide.items()})
        self.assertLess(np.abs(west.shares[:, :, step] - east.shares[:, :, 0]).max(), 1e-12)

    def test_stems_follow_basal_area_and_diameter(self):
        read = read_stands(forest(basal=20, diameter=20))
        self.assertAlmostEqual(read.stems_ha[100, 100], 20 / (np.pi / 4 * 0.2**2), delta=1)


class Density(unittest.TestCase):
    def test_more_cover_needs_more_trees_and_wider_crowns_fewer(self):
        covers = np.linspace(0.05, 0.6, 12)
        self.assertTrue(np.all(np.diff(occupancy_for(covers, np.full(12, 3.5))) > 0))
        self.assertTrue(np.all(np.diff(occupancy_for(np.full(8, 0.4), np.linspace(2.5, 6, 8))) < 0))

    def test_no_cover_needs_no_trees(self):
        self.assertAlmostEqual(float(occupancy_for(np.zeros(1), np.full(1, 3.0))[0]), 0, places=3)

    def test_small_crowns_ask_for_the_whole_lattice_when_it_falls_short(self):
        self.assertEqual(float(occupancy_for(np.full(1, 0.9), np.full(1, 1.0))[0]), 1)

    def test_a_gap_the_laser_has_is_not_thinned_twice(self):
        read = read_stands(forest(cover=40))
        whole = density(read, np.full(read.cover.shape, 1.0), np.full(read.cover.shape, 22.0))
        half = density(read, np.full(read.cover.shape, 0.5), np.full(read.cover.shape, 22.0))
        self.assertGreater(half.mean(), whole.mean() * 1.5)

    def test_the_lattice_it_plants_covers_what_was_asked(self):
        canopy = 22.0
        rng = np.random.default_rng(3)
        for cover in (20, 45, 70):
            read = read_stands(forest(cover=cover))
            full = np.ones(read.cover.shape)
            occupancy = density(read, full, full * canopy)[0, 0]
            shares = np.broadcast_to(np.array([1.0, 0, 0, 0])[:, None, None], (4, PIXELS, PIXELS))
            trees = plant(np.full((1500, 1500), canopy), shares, np.full((PIXELS, PIXELS), occupancy), rng)
            east, south = rng.uniform(1000, 5000, (2, 100_000))
            self.assertAlmostEqual(float(covered(trees, east, south).mean()), cover / 100, delta=0.015)


class File(unittest.TestCase):
    def test_a_stand_comes_back_from_the_file(self):
        read = read_stands(forest(pine=50, spruce=30, birch=15, other=5))
        shares, occupancy = decode(encode(read.shares, np.full(read.cover.shape, 0.5)))
        self.assertLess(np.abs(shares.mean(axis=(1, 2)) - [0.5, 0.3, 0.15, 0.05]).max(), 1 / 255)
        self.assertAlmostEqual(float(occupancy.mean()), 0.5, delta=1 / 255)

    def test_rounding_never_leaves_a_negative_share(self):
        thirds = np.full((3, MSNFI_PIXELS, MSNFI_PIXELS), 0.33366)
        self.assertGreaterEqual(float(decode(encode(thirds, np.zeros((MSNFI_PIXELS, MSNFI_PIXELS))))[0][3].min()), -1e-9)


if __name__ == "__main__":
    unittest.main()

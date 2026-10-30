"""Coordinate handling, where a mistake moves the whole world quietly.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline

No network. The sheets' corners below are read from NLS's own laser and
orthophoto indexes on the mirror.
"""

import unittest

import numpy as np

import grid
from vectors import clip_line

SHEET_CORNERS = {
    "L2343C": (98000, 6690000),
    "K2444F": (104000, 6660000),
    "L2334D": (98000, 6684000),
    "L2343B": (92000, 6696000),
    "L2433H": (110000, 6720000),
    "L3122H": (134000, 6708000),
    "K2443B": (92000, 6648000),
}


class SheetNames(unittest.TestCase):
    def test_names_give_the_corners_nls_publishes(self):
        for name, corner in SHEET_CORNERS.items():
            tile = grid.tile_from_name(name)
            self.assertEqual((tile.west, tile.south), corner, name)

    def test_any_point_finds_its_sheet(self):
        for name, (west, south) in SHEET_CORNERS.items():
            for point in ((west, south), (west + 5999, south + 5999)):
                self.assertEqual(grid.tile_at(*point).name, name)

    def test_neighbours_of_the_first_tile(self):
        tile = grid.tile_from_name("L2343C")
        names = {(east, north): grid.neighbour(tile, east, north).name for east in (-1, 0, 1) for north in (-1, 0, 1)}
        self.assertEqual(names[(1, 0)], "L2343E")
        self.assertEqual(names[(-1, 0)], "L2343A")
        self.assertEqual(names[(0, 1)], "L2343D")
        self.assertEqual(names[(0, -1)], "L2334D")


class Reprojection(unittest.TestCase):
    def test_longitude_and_latitude_are_not_swapped(self):
        # The middle of L2343C.
        east, north = grid.lonlat_to_grid(19.798383, 60.177706)
        self.assertAlmostEqual(east, 101000, delta=1)
        self.assertAlmostEqual(north, 6693000, delta=1)

    def test_local_space_keeps_east_and_north(self):
        self.assertEqual(grid.to_local(grid.WORLD_ORIGIN[0] + 5, grid.WORLD_ORIGIN[1] + 7), (5, 7))


class Clipping(unittest.TestCase):
    tile = grid.Tile("TEST", 0, 0)

    def test_a_crossing_line_ends_exactly_on_the_edge(self):
        parts = clip_line(np.array([[-100.0, 3000.0], [100.0, 3000.0]]), self.tile)
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0].tolist(), [[0.0, 3000.0], [100.0, 3000.0]])

    def test_a_line_leaving_and_coming_back_is_two_parts(self):
        line = np.array([[100.0, 100.0], [-100.0, 100.0], [-100.0, 200.0], [100.0, 200.0]])
        parts = clip_line(line, self.tile)
        self.assertEqual([part.tolist() for part in parts], [[[100.0, 100.0], [0.0, 100.0]], [[0.0, 200.0], [100.0, 200.0]]])

    def test_a_line_passing_outside_is_gone(self):
        self.assertEqual(clip_line(np.array([[-10.0, -10.0], [-10.0, 7000.0]]), self.tile), [])


if __name__ == "__main__":
    unittest.main()

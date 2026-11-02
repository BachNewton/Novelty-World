"""A boulder stands on the ground as drawn: the mesh's own triangles, not a smooth blend of the corners."""

import unittest

import numpy as np

from rocks import Heights


class OnTheMesh(unittest.TestCase):
    def test_a_cell_splits_from_north_east_to_south_west_as_the_render_does(self):
        # One 4 m cell from (0, 4) in the north-west, all flat but its south-east corner, 1 m up.
        heights = Heights(np.array([[0.0, 0.0], [0.0, 1.0]]), 4, 0, 4)
        self.assertAlmostEqual(heights.at(2, 2), 0)
        self.assertAlmostEqual(heights.at(1, 3), 0)
        self.assertAlmostEqual(heights.at(3, 1), 0.5)


if __name__ == "__main__":
    unittest.main()

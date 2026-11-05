"""Town dressing's rules that are easy to get wrong: what may stand on a road, and which way a view looks."""

import math
import unittest

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon

from dressing import LINDEN_REACH, LINDEN_SLACK_M, Dressing
from test_furniture import furniture
from test_roadside import scene_facing

# The test road runs east along north = 0 with 3 m of carriageway either side of its centre.
CARRIAGEWAY_HALF_M = 3.0


def dressing() -> Dressing:
    dressed = Dressing.__new__(Dressing)
    dressed.furniture = furniture()
    dressed.roadside = dressed.furniture.roadside
    dressed.tables, dressed.landmarks, dressed.buildings = [], None, None
    return dressed


def norths(dressed: Dressing, model: str) -> list[float]:
    return [-place[2] for place in dressed.roadside.models.get(model, [])]


class SlopingEast:
    """Ground that falls a metre for every ten east."""

    def at(self, east: float, north: float) -> float:
        return -east / 10


class Dressing_(unittest.TestCase):
    def test_a_tree_row_across_a_street_leaves_its_carriageway_clear(self):
        dressed = dressing()
        dressed.tree_row(LineString([(100, -40), (100, 40)]), {})
        trees = [north for model in dressed.roadside.models if model.startswith("linden") for north in norths(dressed, model)]
        self.assertGreater(len(trees), 6, "the row stands either side")
        self.assertTrue(all(abs(north) > CARRIAGEWAY_HALF_M + 0.5 for north in trees), trees)
        self.assertEqual(sum(len(sizes) for model, sizes in dressed.roadside.scales.items() if model.startswith("linden")), len(trees), "every linden has its height")

    def test_a_linden_by_a_house_is_no_taller_than_its_crown_has_room_for(self):
        dressed = dressing()
        dressed.buildings = shapely.STRtree([Polygon([(100, 10), (110, 10), (110, 20), (100, 20)])])
        for north, want in ((8.0, None), (5.0, (10.0 - 5.0 - LINDEN_SLACK_M) / LINDEN_REACH), (30.0, 12.0)):
            dressed.roadside.models, dressed.roadside.scales = {}, {}
            dressed.linden(np.array([105.0, north]), 12.0)
            heights = [height for model, sizes in dressed.roadside.scales.items() if model.startswith("linden") for height in sizes]
            self.assertEqual(heights, [] if want is None else [round(want, 2)], north)

    def test_a_fence_across_a_street_is_broken_where_the_street_runs(self):
        dressed = dressing()
        runs = dressed.fence_runs(LineString([(100, -30), (100, 30)]))
        self.assertEqual(len(runs), 2)
        for run in runs:
            self.assertTrue(all(abs(north) > CARRIAGEWAY_HALF_M for _, north in run.coords), list(run.coords))

    def test_a_viewpoint_looks_down_the_slope(self):
        dressed = dressing()
        dressed.roadside.heights = SlopingEast()
        east, north = scene_facing(dressed.view_of(np.array([50.0, 60.0])))
        self.assertAlmostEqual(east, 1, places=3)
        self.assertAlmostEqual(north, 0, places=3)


if __name__ == "__main__":
    unittest.main()

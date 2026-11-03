"""Where the stone walls go along the fields: the rules that would double a wall, wall a sheet's cut, or close a road."""

import unittest

import numpy as np
from shapely.geometry import LineString, box

from grid import tile_from_name
from walls import LANE_STRETCH_M, SHORTEST_WALL_M, clear_parts, field_edges, kind_of, runs

TILE = tile_from_name("L2343C")


class Edges(unittest.TestCase):
    def test_an_edge_two_fields_share_is_one_line(self):
        west, east = box(TILE.west + 100, TILE.south + 100, TILE.west + 200, TILE.south + 200), box(TILE.west + 200, TILE.south + 100, TILE.west + 300, TILE.south + 200)
        edges = field_edges([west, east], TILE)
        shared = LineString([(TILE.west + 200, TILE.south + 120), (TILE.west + 200, TILE.south + 180)])
        self.assertAlmostEqual(sum(edge.intersection(shared.buffer(0.1, cap_style="flat")).length for edge in edges), 60, places=3)
        self.assertAlmostEqual(sum(edge.length for edge in edges), 700, places=3)

    def test_a_field_cut_by_the_database_sheets_has_no_edge_along_the_cut(self):
        # Two halves of one field meeting on the tile's west edge, where the sheets divide.
        halves = [box(TILE.west - 50, TILE.south + 100, TILE.west, TILE.south + 200), box(TILE.west, TILE.south + 100, TILE.west + 50, TILE.south + 200)]
        cut = LineString([(TILE.west, TILE.south + 110), (TILE.west, TILE.south + 190)]).buffer(0.1)
        self.assertEqual(sum(edge.intersection(cut).length for edge in field_edges(halves, TILE)), 0)

    def test_a_side_ends_at_a_corner_and_a_long_one_is_cut_in_equal_runs(self):
        sides = runs(LineString([(0, 0), (600, 0), (600, 100)]))
        self.assertEqual([round(side.length) for side in sides], [200, 200, 200, 100])


class Gaps(unittest.TestCase):
    def test_a_wall_stops_short_of_a_road_either_side_and_drops_a_stub(self):
        wall = LineString([(0, 0), (100, 0)])
        # A road across at x 40 to 46, and another near the far end that leaves a stub too short to be a wall.
        blocked = lambda points: ((points[:, 0] > 40) & (points[:, 0] < 46)) | (points[:, 0] > 95)
        parts = clear_parts(wall, blocked)
        self.assertEqual(len(parts), 2)
        self.assertLess(parts[0].bounds[2], 40.01)
        self.assertGreater(parts[1].bounds[0], 45.99)
        self.assertLess(parts[1].bounds[2], 95.01)
        self.assertTrue(all(part.length >= SHORTEST_WALL_M for part in parts))


class FakeSurroundings:
    """A straight road along y = 0 for a kilometre, open land round it, and no fields or forest."""

    def __init__(self):
        self.centres = np.array([(x, 0.0) for x in range(0, 1001, 10)])
        self.tiers = np.full(len(self.centres), 1, np.uint8)

    def forest(self, points):
        return np.zeros(len(points), bool)

    def in_field(self, points):
        return np.zeros(len(points), bool)

    def road(self, points):
        sections = np.clip(np.round(points[:, 0] / 10).astype(int), 0, len(self.centres) - 1)
        return np.abs(points[:, 1]), sections


class Lanes(unittest.TestCase):
    def test_both_sides_of_a_lane_mostly_share_their_roll(self):
        around = FakeSurroundings()
        shared = []
        for start in range(0, 800, 7):
            # Each side's run starts a little apart from the other's, as two fields' corners do.
            north = LineString([(start, 6), (start + 90, 6)])
            south = LineString([(start + 4, -7), (start + 97, -7)])
            (north_kind, north_roll), (south_kind, south_roll) = kind_of(north, around), kind_of(south, around)
            self.assertEqual((north_kind, south_kind), ("lane minor", "lane minor"))
            shared.append(north_roll == south_roll)
        # Only where the two sides' middles fall either side of the end of a stretch of road do they roll apart.
        self.assertGreater(np.mean(shared), 1 - 2 * 10 / LANE_STRETCH_M)


if __name__ == "__main__":
    unittest.main()

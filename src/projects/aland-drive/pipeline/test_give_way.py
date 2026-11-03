"""Which of a road and a building gives way, and how a roof's own metres are laid: the rules that are easy to get backwards."""

import math
import unittest

import numpy as np
from shapely.geometry import LineString, box

from buildings import Face, RoofFrame
from give_way import CAR_ROOM_M, CLEARANCE_M, give_way, open_walls
from roads import CLASSES

SHED = box(0, 0, 10, 6)


def road(kind: str, line: list[list[float]], **tags) -> dict:
    return {"id": 1, "kind": kind, "motor": True, "line": line, **tags}


class GiveWay(unittest.TestCase):
    def test_a_farm_drive_through_a_shed_stops_at_its_walls(self):
        meetings = give_way([road("service", [[-20, 3], [30, 3]])], [SHED])
        self.assertEqual(meetings.openings, [])
        self.assertEqual(len(meetings.roads), 2)
        self.assertTrue(all(LineString(part["line"]).distance(SHED) > 0 for part in meetings.roads))

    def test_a_street_through_a_building_opens_its_walls_only_as_wide_as_the_road(self):
        hall = box(0, 0, 10, 30)
        meetings = give_way([road("residential", [[-20, 15], [30, 15]])], [hall])
        self.assertEqual(meetings.roads[0]["line"], [[-20, 15], [30, 15]])
        walls = open_walls(hall, meetings.openings)
        # The long sides stand; each end opens round the road and no further.
        opened = hall.length - sum(wall.length for wall in walls)
        self.assertAlmostEqual(opened, 2 * 2 * (CLASSES["residential"].width_m / 2 + CAR_ROOM_M), delta=0.5)

    def test_a_street_that_ends_inside_a_building_stops_at_its_wall(self):
        meetings = give_way([road("residential", [[-20, 3], [5, 3]])], [SHED])
        self.assertEqual(meetings.openings, [])
        self.assertLess(max(x for x, _ in meetings.roads[0]["line"]), 0)

    def test_a_tagged_passage_opens_the_walls_whatever_the_road(self):
        meetings = give_way([road("service", [[-20, 3], [5, 3]], tunnel="building_passage")], [SHED])
        self.assertEqual(len(meetings.openings), 1)

    def test_a_drive_beside_a_building_is_pushed_clear_of_it(self):
        meetings = give_way([road("service", [[-30, -0.5], [40, -0.5]])], [SHED])
        reach = CLASSES["service"].width_m / 2 + CLEARANCE_M
        self.assertEqual(meetings.pushed, 1)
        self.assertGreater(LineString(meetings.roads[0]["line"]).distance(SHED), reach - 0.1)

    def test_where_roads_meet_and_where_one_leaves_the_tile_nothing_moves(self):
        drive = road("service", [[-30, -0.5], [5, -0.5], [40, -0.5]], seams=[[-30, -0.5, 1, 0]])
        branch = road("service", [[5, -0.5], [5, -30]])
        pushed = give_way([drive, branch], [SHED]).roads[0]["line"]
        self.assertIn([-30, -0.5], pushed)
        self.assertIn([5, -0.5], pushed)

    def test_a_road_crossing_the_tile_edge_inside_a_building_keeps_its_seam_beyond_the_cut(self):
        meetings = give_way([road("service", [[5, 3], [30, 3]], seams=[[30, 3, 1, 0]])], [SHED])
        self.assertEqual(meetings.roads[0]["seams"], [[30, 3, 1, 0]])


class Roofs(unittest.TestCase):
    def test_a_roof_is_measured_up_its_slope_not_across_the_map(self):
        # A 35° face rising north, 4 m of run from eaves to ridge.
        rise = 4 * math.tan(math.radians(35))
        face = Face("roof", np.array([[0, 0, 3], [8, 0, 3], [8, 4, 3 + rise], [0, 4, 3 + rise]]))
        metres = RoofFrame.of(face, np.array([0.0, 0.0])).at(face.ring)
        self.assertAlmostEqual(abs(metres[0, 1] - metres[3, 1]), math.hypot(4, rise), places=6)
        self.assertAlmostEqual(abs(metres[0, 0] - metres[1, 0]), 8, places=6)


if __name__ == "__main__":
    unittest.main()

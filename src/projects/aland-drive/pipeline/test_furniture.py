"""Which way furniture and its seats face, and where a terrace stands: the rules that are easy to get backwards."""

import math
import unittest

import numpy as np
import shapely
from shapely.geometry import box

from furniture import BENCH_SEATS_X, CAFE_CHAIR_Z, FOOTPRINTS, Furniture, facing, footprint
from roadside import Paved
from test_roadside import east_road, roadside, scene_facing


class FlatSurface:
    def at(self, point) -> float:
        return 0.0


# A shop north of the road, its south wall 9 m from the road's centre line: 6 m of pavement before it.
SHOP = box(40.0, 9.0, 70.0, 25.0)


def furniture(buildings=()) -> Furniture:
    side = roadside()
    chain = east_road()
    side.chains = [chain]
    side.paved = Paved([chain], [])
    side.buildings = list(buildings)
    side.building_tree = shapely.STRtree(side.buildings)
    placed = Furniture.__new__(Furniture)
    placed.roadside = side
    placed.surface = FlatSurface()
    placed.chains = {chain.index: chain}
    placed.paths = [chain]
    placed.path_tree = shapely.STRtree([chain.line])
    placed.taken, placed.taken_tree, placed.added_since = [], None, 0
    placed.benches, placed.racks = [], []
    placed.seats = {"sit-bench": [], "sit-cafe": []}
    return placed


def seat_ground(seat: list[float]) -> np.ndarray:
    return np.array([seat[0], -seat[2]])


class Seats(unittest.TestCase):
    def test_a_bench_seats_two_facing_its_front(self):
        placed = furniture()
        yaw = facing(0.0, -1.0)
        placed.bench(np.array([10.0, 20.0]), yaw)
        seats = placed.seats["sit-bench"]
        self.assertEqual(len(seats), 2)
        for seat, x in zip(seats, BENCH_SEATS_X):
            self.assertAlmostEqual(seat[3], yaw % (2 * math.pi), places=3)
            self.assertAlmostEqual(np.hypot(*(seat_ground(seat) - [10.0, 20.0])), abs(x), places=2)
        # Facing south, the seats lie along east-west.
        self.assertAlmostEqual(seats[0][2], seats[1][2], places=2)

    def test_cafe_chairs_face_each_other_across_the_table(self):
        placed = furniture()
        table = np.array([5.0, 12.0])
        placed.cafe_set(table, 0.7, parasol=False)
        seats = placed.seats["sit-cafe"]
        self.assertEqual(len(seats), 2)
        for seat in seats:
            at = seat_ground(seat)
            self.assertAlmostEqual(np.hypot(*(at - table)), CAFE_CHAIR_Z, places=2)
            # A sitter's +z points at the table's middle.
            towards = (table - at) / np.hypot(*(table - at))
            self.assertGreater(np.dot(scene_facing(seat[3]), towards), 0.999)


class Footprints(unittest.TestCase):
    def test_a_front_lies_the_way_its_yaw_faces(self):
        yaw = facing(1.0, 0.0)
        shape = footprint("bench", np.array([0.0, 0.0]), yaw)
        west, south, east, north = shape.bounds
        # Facing east, the bench is long north to south, its seat's front east and its leaning back west.
        self.assertGreater(north - south, east - west)
        self.assertAlmostEqual(east, FOOTPRINTS["bench"][3])
        self.assertAlmostEqual(west, FOOTPRINTS["bench"][1])


class Terraces(unittest.TestCase):
    def test_a_terrace_stands_on_the_pavement_against_the_street_wall(self):
        placed = furniture([SHOP])
        placed.terrace(np.array([55.0, 15.0]))
        sets = placed.roadside.models.get("cafe-set", [])
        self.assertGreaterEqual(len(sets), 1)
        carriageway = box(-10.0, -3.0, 210.0, 3.0)
        for place in sets:
            at = np.array([place[0], -place[2]])
            self.assertTrue(3.0 < at[1] < 9.0, f"a table at {at} is off the pavement")
            self.assertFalse(footprint("cafe-set", at, place[3]).intersects(carriageway))
            self.assertFalse(footprint("cafe-set", at, place[3]).intersects(SHOP))
        self.assertEqual(len(placed.seats["sit-cafe"]), 2 * len(sets))

    def test_nothing_stands_on_the_carriageway(self):
        placed = furniture()
        self.assertFalse(placed.fits(footprint("bench", np.array([50.0, 1.0]), 0.0)))
        self.assertFalse(placed.fits(footprint("cafe-set", np.array([50.0, 1.0]), 0.0), terrace=True))
        self.assertTrue(placed.fits(footprint("bench", np.array([50.0, 6.0]), 0.0)))


if __name__ == "__main__":
    unittest.main()

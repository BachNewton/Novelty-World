"""Seated people sit on the seats `furniture.py` writes, a pair on one bench or table: the rule a change to either can quietly break."""

import math
import unittest
from unittest import mock

import numpy as np

import seated
from furniture import BENCH_SEATS_X, CAFE_CHAIR_Z, facing
from seated import bake_seats
from test_furniture import furniture


def placed_seats() -> dict:
    """Benches and café tables in a row, as `furniture.py` writes their seats."""
    placed = furniture()
    for step in range(40):
        placed.bench(np.array([10.0 + 3 * step, 20.0]), facing(0.0, -1.0))
        placed.cafe_set(np.array([10.0 + 3 * step, 40.0]), 0.3 * step, parasol=False)
    return placed.seats


class Seated(unittest.TestCase):
    def test_a_sitter_takes_a_seat_as_written_and_a_pair_shares_one_piece(self):
        seats = placed_seats()
        with mock.patch.dict(seated.TAKEN, {pose: {"town": 1.0, "country": 1.0} for pose in seated.TAKEN}):
            figures = bake_seats(seats, lambda point: True)
        rows = {pose: [tuple(place) for place in places] for pose, places in seats.items()}
        for figure in figures:
            self.assertIn((figure.x, figure.y, figure.z, figure.yaw), rows[figure.pose])
        # A pair is the two seats beside each other in the list, which must be one bench's or one table's.
        apart = {"sit-bench": BENCH_SEATS_X[1] - BENCH_SEATS_X[0], "sit-cafe": 2 * CAFE_CHAIR_Z}
        for pose, places in seats.items():
            for one, other in zip(places[::2], places[1::2]):
                self.assertAlmostEqual(math.dist((one[0], one[2]), (other[0], other[2])), apart[pose], places=1)
        self.assertGreater(len(figures), len(seats["sit-bench"]) // 2 + len(seats["sit-cafe"]) // 2)
        self.assertEqual(len({figure.seed for figure in figures}), len(figures))

    def test_cafes_in_town_are_busier_than_in_the_country(self):
        seats = placed_seats()
        town = bake_seats(seats, lambda point: True)
        country = bake_seats(seats, lambda point: False)
        self.assertGreater(sum(f.pose == "sit-cafe" for f in town), sum(f.pose == "sit-cafe" for f in country))
        self.assertEqual([f.row() for f in town], [f.row() for f in bake_seats(seats, lambda point: True)])


if __name__ == "__main__":
    unittest.main()

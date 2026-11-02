"""Piers become docks rather than roads, and docks and boats stay where they can be: the rules a change can quietly break."""

import math
import unittest
from types import SimpleNamespace

import numpy as np
from shapely.geometry import LineString, Polygon

from docks import HULLS, Docks, Land, Pier, off_piers, quays
from grid import WORLD_ORIGIN

# 200 m square at 2 m: land 2 m up north of north = 40, the sea at 0 south of it.
TILE = SimpleNamespace(west=WORLD_ORIGIN[0], south=WORLD_ORIGIN[1], east=WORLD_ORIGIN[0] + 200, north=WORLD_ORIGIN[1] + 200)


def land() -> Land:
    water = np.zeros((100, 100), dtype=bool)
    water[80:, :] = True
    return Land(np.where(water, 0.0, 2.0), water, 0.0, 200.0)


def pier(line: list[tuple[float, float]], **tags: str) -> Pier:
    return Pier(1, {"man_made": "pier", **tags}, np.array(line, dtype=float), None)


def road(line: list[tuple[float, float]], kind: str, motor: bool) -> dict:
    return {"id": 2, "kind": kind, "motor": motor, "line": [list(point) for point in line]}


class Roads(unittest.TestCase):
    def test_a_footway_on_a_pier_is_laid_only_on_land(self):
        jetty = pier([(100, 60), (100, 10)])
        laid = off_piers([road([(100, 90), (100, 10)], "footway", motor=False)], [jetty])
        self.assertEqual(len(laid), 1)
        self.assertGreaterEqual(min(y for _, y in laid[0]["line"]), 59)

    def test_a_motor_road_on_a_pier_makes_it_a_quay_with_no_dock(self):
        quay = pier([(100, 60), (100, 10)], width="5")
        roads = [road([(100, 90), (100, 12)], "service", motor=True)]
        self.assertEqual(quays(roads, [quay]), [quay])
        self.assertEqual(off_piers(roads, []), roads)
        docks = Docks(TILE, land(), [])
        docks.place([quay], [], [quay])
        self.assertEqual(docks.models, {})


class Placing(unittest.TestCase):
    def test_a_jetty_starts_where_its_deck_clears_the_land_and_sits_on_the_water(self):
        docks = Docks(TILE, land(), [])
        docks.place([pier([(100, 55), (100, 20)])], [], [])
        (x, y, z, _, width, length), = docks.models["jetty"]
        self.assertEqual(y, 0)
        self.assertAlmostEqual(-z, 40, delta=2.5)
        self.assertAlmostEqual(length, 20, delta=2.5)
        self.assertEqual(len(docks.walls), 4)

    def test_berthed_boats_are_wholly_on_water_and_clear_of_docks_and_each_other(self):
        docks = Docks(TILE, land(), [])
        pontoon = pier([(100, 40), (100, 0)], floating="yes")
        docks.place([pontoon], [], [])
        boats = [(model, place) for model, places in docks.models.items() if model in HULLS for place in places]
        self.assertGreater(len(boats), 4)
        deck = LineString([(100, 40), (100, 0)]).buffer(1.2)
        hulls = []
        for model, (x, _, z, yaw, _, _) in boats:
            length, beam = HULLS[model]
            # The bow is the model's +z, which turns to (sin yaw, cos yaw) in the scene, whose z is south.
            bow = np.array([math.sin(yaw), -math.cos(yaw)])
            across = np.array([-bow[1], bow[0]])
            centre = np.array([x, -z])
            hull = Polygon([centre + bow * length / 2 * a + across * beam / 2 * b for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))])
            self.assertLess(hull.bounds[3], 40)
            self.assertFalse(hull.intersects(deck))
            # Bow to the pontoon.
            self.assertLess(abs(centre[0] + bow[0] * length / 2 - 100), abs(centre[0] - 100))
            hulls.append(hull)
        self.assertTrue(all(not a.intersects(b) for index, a in enumerate(hulls) for b in hulls[index + 1 :]))


if __name__ == "__main__":
    unittest.main()

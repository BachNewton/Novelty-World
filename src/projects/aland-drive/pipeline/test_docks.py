"""Piers become docks rather than roads, and docks and boats stay where they can be: the rules a change can quietly break."""

import math
import unittest
from types import SimpleNamespace

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon

from docks import DRAFT_M, HULLS, UNDER_KEEL_M, Docks, Land, Pier, boardwalks, off_piers, quays
from terrain import DEEPEST_M, SEABED_SLOPE, WATERLINE_BELOW_FLAT_M
from grid import WORLD_ORIGIN

# 200 m square at 2 m: land 2 m up north of north = 40, the sea at 0 south of it, its seabed shelving as the game's does.
TILE = SimpleNamespace(west=WORLD_ORIGIN[0], south=WORLD_ORIGIN[1], east=WORLD_ORIGIN[0] + 200, north=WORLD_ORIGIN[1] + 200)


def land() -> Land:
    water = np.zeros((100, 100), dtype=bool)
    water[80:, :] = True
    from_shore = (np.arange(100)[:, None] - 79.5).clip(0) * 2 * np.ones((1, 100))
    return Land(np.where(water, 0.0, 2.0), water, np.minimum(SEABED_SLOPE * from_shore, DEEPEST_M), 0.0, 200.0)


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

    def test_a_wooden_footbridge_is_a_dock_and_a_concrete_one_stays_a_bridge(self):
        wooden = {**road([(0, 90), (100, 30), (200, 90)], "footway", motor=False), "bridge": "yes", "surface": "wood"}
        concrete = {**road([(0, 10), (200, 10)], "footway", motor=False), "bridge": "yes", "id": 3}
        walks = boardwalks([wooden, concrete])
        self.assertEqual(len(walks), 1)
        laid = off_piers([wooden, concrete], walks)
        self.assertIn(concrete, laid)
        self.assertTrue(all(min(y for _, y in part["line"]) > 30 for part in laid if part["id"] == 2))

    def test_a_motor_road_on_a_pier_makes_it_a_quay_with_no_dock(self):
        quay = pier([(100, 60), (100, 10)], width="5")
        roads = [road([(100, 90), (100, 12)], "service", motor=True)]
        self.assertEqual(quays(roads, [quay]), [quay])
        self.assertEqual(off_piers(roads, []), roads)
        docks = Docks(TILE, land(), [], [])
        docks.place([quay], [], [quay])
        self.assertEqual(docks.models, {})


class Placing(unittest.TestCase):
    def test_an_outline_with_a_finger_at_an_angle_is_two_straight_runs(self):
        walkway = LineString([(60, 30), (140, 30)]).buffer(1.5, cap_style="flat")
        finger = LineString([(100, 30), (130, 0)]).buffer(1.2, cap_style="flat")
        docks = Docks(TILE, land(), [], [])
        docks.place([Pier(1, {"man_made": "pier"}, None, shapely.union(walkway, finger))], [], [])
        long_runs = [(yaw, length) for _, _, _, yaw, _, length in docks.models["pier"] if length > 10]
        self.assertEqual(len(long_runs), 2)
        self.assertTrue(any(abs(math.sin(yaw)) < 0.05 for yaw, _ in long_runs))
        self.assertTrue(any(abs(abs(math.sin(yaw)) - math.sqrt(0.5)) < 0.05 for yaw, _ in long_runs))
        self.assertLess(len(docks.models["pier"]), 6)

    def test_a_jetty_starts_where_its_deck_clears_the_land_and_sits_on_the_water(self):
        docks = Docks(TILE, land(), [], [])
        docks.place([pier([(100, 55), (100, 20)])], [], [])
        (x, y, z, _, width, length), = docks.models["jetty"]
        self.assertAlmostEqual(y, -WATERLINE_BELOW_FLAT_M)
        self.assertAlmostEqual(-z, 40, delta=2.5)
        self.assertAlmostEqual(length, 20, delta=2.5)
        self.assertEqual(len(docks.walls), 4)

    def test_a_share_of_jetties_moor_a_sloop_off_the_end(self):
        moored = 0
        for pier_id in range(200):
            docks = Docks(TILE, land(), [], [])
            docks.place([Pier(pier_id, {"man_made": "pier"}, np.array([(100.0, 55.0), (100.0, 20.0)]), None)], [], [])
            moored += "sailboat" in docks.models
        self.assertGreater(moored, 5)

    def test_docks_never_lie_over_each_other_and_a_finger_meets_its_walkway(self):
        docks = Docks(TILE, land(), [], [])
        walkway = Pier(1, {"man_made": "pier", "width": "3"}, np.array([(60.0, 30.0), (140.0, 30.0)]), None)
        alongside = Pier(2, {"man_made": "pier", "width": "3"}, np.array([(60.0, 31.5), (140.0, 31.5)]), None)
        finger = Pier(3, {"man_made": "pier", "width": "2"}, np.array([(100.0, 30.0), (100.0, 10.0)]), None)
        docks.place([walkway, alongside, finger], [], [])
        runs = [(x, -z, yaw, width, length) for x, _, z, yaw, width, length in docks.models["pier"]]
        decks = [LineString([(x, y), (x + math.cos(yaw) * length, y + math.sin(yaw) * length)]).buffer(width / 2, cap_style="flat") for x, y, yaw, width, length in runs]
        self.assertTrue(all(a.intersection(b).area < 0.5 for index, a in enumerate(decks) for b in decks[index + 1 :]))
        self.assertTrue(any(abs(x - 100) < 0.1 and abs(y - 28.5) < 0.6 for x, y, _, _, _ in runs) or any(abs(x + math.cos(yaw) * length - 100) < 0.1 and abs(y + math.sin(yaw) * length - 28.5) < 0.6 for x, y, yaw, _, length in runs))

    def test_a_dock_stops_short_of_a_motor_road(self):
        shore_road = road([(0, 30), (200, 30)], "residential", motor=True)
        docks = Docks(TILE, land(), [], [shore_road])
        docks.place([pier([(100, 55), (100, 18)])], [], [])
        (_, _, z, _, _, length), = docks.models["jetty"]
        self.assertTrue(-z <= 26 or -z - length >= 34)

    def test_berthed_boats_are_wholly_on_water_and_clear_of_docks_and_each_other(self):
        docks = Docks(TILE, land(), [], [])
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

    def test_a_keel_clears_the_seabed_so_the_deep_yachts_lie_at_the_outer_berths(self):
        docks = Docks(TILE, land(), [], [])
        docks.place([pier([(100, 40), (100, 0)], floating="yes")], [], [])
        self.assertIn("large", docks.models)
        for model, places in docks.models.items():
            if model not in HULLS:
                continue
            for x, _, z, yaw, _, _ in places:
                bow = np.array([math.sin(yaw), -math.cos(yaw)])
                for along in (-0.25, 0.25):
                    keel = np.array([x, -z]) + bow * along * HULLS[model][0]
                    self.assertGreaterEqual(min(SEABED_SLOPE * (40 - keel[1]), DEEPEST_M), DRAFT_M[model] + UNDER_KEEL_M - SEABED_SLOPE * 2)


if __name__ == "__main__":
    unittest.main()

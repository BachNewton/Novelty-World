"""Which side of the road things stand on and which way they face: the rules that are easy to get backwards."""

import math
import unittest

import numpy as np
import shapely

from roadside import CENTRE, EDGE_LEFT, EDGE_RIGHT, OUTER_LEFT, OUTER_RIGHT, RINGS, Chain, Roadside

# A road running east along north = 0, 6 m of carriageway and 2 m of shoulder each side, flat at height 0.
LENGTH_M = 200


class FlatGround:
    def at(self, east: float, north: float) -> float:
        return 0.0


class OpenPaved:
    def clear(self, point, metres, besides=None) -> bool:
        return True


def east_road(length: float = LENGTH_M) -> Chain:
    stations = np.arange(0, length + 1, 10.0)
    rings = np.zeros((len(stations), RINGS, 3))
    # Right is south as the road runs east.
    for index, across in ((OUTER_LEFT, 5), (EDGE_LEFT, 3), (CENTRE, 0), (EDGE_RIGHT, -3), (OUTER_RIGHT, -5)):
        rings[:, index, 0] = stations
        rings[:, index, 1] = across
    return Chain(0, "tertiary", 2, True, rings, [])


def roadside() -> Roadside:
    side = Roadside.__new__(Roadside)
    side.box = (-1000.0, -1000.0, 1000.0, 1000.0)
    side.heights, side.paved = FlatGround(), OpenPaved()
    side.building_tree = shapely.STRtree([])
    side.models, side.signs, side.wires, side.walls, side.posts = {}, {}, [], [], []
    side.osm = {"elements": []}
    side.town_signs()
    return side


def north_road(east: float) -> Chain:
    """A road running north along `east`, as wide as the east road, crossing it at its middle."""
    stations = np.arange(-LENGTH_M / 2, LENGTH_M / 2 + 1, 10.0)
    rings = np.zeros((len(stations), RINGS, 3))
    # Right is east as the road runs north.
    for index, across in ((OUTER_LEFT, -5), (EDGE_LEFT, -3), (CENTRE, 0), (EDGE_RIGHT, 3), (OUTER_RIGHT, 5)):
        rings[:, index, 0] = east + across
        rings[:, index, 1] = stations
    return Chain(1, "tertiary", 2, True, rings, [])


def scene_facing(yaw: float) -> tuple[float, float]:
    """Where a model's +z points, as (east, north): the scene's +z is south."""
    return math.sin(yaw), -math.cos(yaw)


class Signs(unittest.TestCase):
    def test_a_junction_sign_stands_right_of_the_traffic_it_is_for_and_faces_it(self):
        side, road = roadside(), east_road()
        # Traffic runs east to the road's last section, where it meets a greater road.
        side.junction_signs([(road, road.length, 1, Chain(1, "primary", 0, True, road.rings, []))])
        x, _, z, yaw = side.signs["give-way"][0]
        self.assertLess(-z, -3, "on the south, the right of eastbound traffic, past the carriageway's edge")
        self.assertLess(x, LENGTH_M, "before the junction")
        east, north = scene_facing(yaw)
        self.assertAlmostEqual(east, -1, places=3)
        self.assertAlmostEqual(north, 0, places=3)

    def test_a_speed_sign_shows_each_way_its_own_new_limit(self):
        side, road = roadside(), east_road()
        # OSM's limit is 50 on the road's western half and 90 on its eastern.
        side.ways = type("Ways", (), {"at": lambda self, point: {"maxspeed": "50" if point[0] < 100 else "90"}})()
        side.chains = [road]
        side.speed_signs()
        (x90, _, z90, yaw90), (x50, _, z50, yaw50) = side.signs["speed-90"][0], side.signs["speed-50"][0]
        # Eastbound, into the 90, on the south side facing west; westbound, into the 50, on the north side facing east.
        self.assertLess(-z90, 0)
        self.assertAlmostEqual(scene_facing(yaw90)[0], -1, places=3)
        self.assertGreater(-z50, 0)
        self.assertAlmostEqual(scene_facing(yaw50)[0], 1, places=3)

    def test_a_crossing_roads_limit_read_where_it_crosses_puts_up_no_signs(self):
        side, road = roadside(), east_road()
        # The road is 50 throughout, but where a 40 side road crosses it, at 100 m, OSM's nearest way is the side road's.
        side.ways = type("Ways", (), {"at": lambda self, point: {"maxspeed": "40" if point[0] == 100 else "50"}})()
        side.chains = [road]
        side.speed_signs()
        self.assertEqual(side.signs, {})


class TrafficLights(unittest.TestCase):
    def test_each_head_stands_right_of_its_incoming_traffic_behind_the_junction_and_faces_it(self):
        side = roadside()
        side.chains = [east_road(), north_road(LENGTH_M / 2)]
        centre = np.array([LENGTH_M / 2, 0.0])
        side.signal_junction(centre)
        heads = side.models["traffic-light"]
        self.assertEqual(len(heads), 4, "one head an arm")
        for x, _, z, yaw, _, _ in heads:
            spot = np.array([x, -z]) - centre
            face = np.array(scene_facing(yaw))
            traffic = -face
            self.assertGreater(spot @ face, 0, "it faces away from the junction, at the traffic coming in")
            self.assertLess(spot @ traffic, -3, "it stands before the junction, past the crossing road's edge")
            self.assertGreater(spot @ np.array([traffic[1], -traffic[0]]), 3, "on the right of the traffic, past the carriageway")
        self.assertEqual(len(side.walls), 4 * 4, "each pole stops the car")

    def test_a_roads_two_ends_share_a_start_and_the_crossing_road_takes_the_other_half(self):
        side = roadside()
        side.chains = [east_road(), north_road(LENGTH_M / 2)]
        side.signal_junction(np.array([LENGTH_M / 2, 0.0]))
        by_way: dict[bool, set[float]] = {}
        for (_, _, _, yaw, _, _), phase in zip(side.models["traffic-light"], side.signal_phases):
            by_way.setdefault(abs(scene_facing(yaw)[0]) > 0.5, set()).add(phase)
        self.assertEqual([len(phases) for phases in by_way.values()], [1, 1])
        east_west, north_south = by_way[True].pop(), by_way[False].pop()
        self.assertAlmostEqual((east_west - north_south) % 1.0, 0.5, places=3)


class Villages(unittest.TestCase):
    def test_a_road_through_a_village_has_a_sign_at_each_end_right_of_the_traffic_coming_in_and_facing_it(self):
        side = roadside()
        # The hamlet reaches 150 m round its node, so the road comes into it at 50 m and leaves at 350 m.
        side.chains = [east_road(400)]
        centre = np.array([200.0, 0.0])
        side.osm = {"elements": [{"type": "node", "tags": {"place": "hamlet", "name": "Kattby"}}]}
        side.local = lambda element: centre
        side.villages()
        signs = side.models["village-sign"]
        self.assertEqual(len(signs), 2)
        self.assertEqual(side.village_names, ["Kattby", "Kattby"])
        for x, _, z, yaw, _, _ in signs:
            spot = np.array([x, -z]) - centre
            face = np.array(scene_facing(yaw))
            traffic = -face
            self.assertGreater(spot @ face, 0, "it faces the traffic coming in")
            self.assertGreater(spot @ np.array([traffic[1], -traffic[0]]), 3, "on that traffic's right, past the carriageway")


class Rails(unittest.TestCase):
    def test_a_rail_turns_its_road_side_to_the_road_whichever_way_its_points_run(self):
        for points in (np.array([[0.0, -4], [40, -4]]), np.array([[40.0, -4], [0, -4]])):
            side = roadside()
            side.rail_run([(point, 0.0) for point in points], np.array([20.0, 0]))
            for x, _, z, yaw, _, _ in side.models["rail"]:
                self.assertAlmostEqual(scene_facing(yaw)[1], 1, places=3, msg="the road is north of the rail")


if __name__ == "__main__":
    unittest.main()

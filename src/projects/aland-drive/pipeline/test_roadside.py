"""Which side of the road things stand on and which way they face: the rules that are easy to get backwards."""

import gzip
import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import shapely

from paving import POINT_FLOATS
from paving_file import Grid, paving_bytes
from roadside import CENTRE, EDGE_LEFT, EDGE_RIGHT, OUTER_LEFT, OUTER_RIGHT, RINGS, Chain, Paved, Roadside, read_surface

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
    side.town = lambda point: False
    side.models, side.signs, side.wires, side.walls, side.posts, side.scales = {}, {}, [], [], [], {}
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


def paved_tile(folder: Path, pieces: list[tuple[list[tuple[float, float]], tuple[float, float, float], int]], roads: list[dict] = (), junctions: int = 0) -> dict:
    """A paved tile's road surface: the east road and a path north of it, then paving pieces of (corners, each corner's across, way),
    the last `junctions` of them pieces no way owns, and the OSM ways it was laid from."""
    (folder / "roads.json").write_text(json.dumps({"roads": list(roads)}), encoding="utf-8")
    path = east_road()
    path.rings = path.rings + np.array([0.0, 20.0, 0.0])
    rings = np.concatenate((east_road().rings, path.rings)).astype("<f4")
    points = np.zeros((3 * len(pieces), POINT_FLOATS))
    for index, (corners, across, way) in enumerate(pieces):
        points[3 * index : 3 * index + 3, :2] = corners
        points[3 * index : 3 * index + 3, 3] = across
        points[3 * index : 3 * index + 3, 6] = way
    triangles = np.arange(len(points)).reshape(-1, 3)
    # Flat ground, one cell over everything, for the paving's heights to be read off.
    heights = {"file": "heights.bin.gz", "nodes": 2, "stepM": 1000.0, "unitM": 0.01}
    (folder / "heights.bin.gz").write_bytes(gzip.compress(np.zeros(4, dtype="<i2").tobytes()))
    bounds = {"west": -500.0, "north": 500.0}
    grid = Grid.of(np.zeros((2, 2)), bounds["west"], bounds["north"], heights["stepM"])
    (folder / "road-surface.bin.gz").write_bytes(gzip.compress(rings.tobytes() + bytes(len(rings)) + paving_bytes(points, triangles, grid, (3 * junctions, 0))))
    chains = [{"sections": len(east_road().rings), "kind": "tertiary", "motor": True}, {"sections": len(path.rings), "kind": "footway", "motor": False}]
    return {"bounds": bounds, "heights": heights, "roadSurface": {"file": "road-surface.bin.gz", "chains": chains, "paved": True, "aprons": {"points": len(points), "triangles": len(pieces), "junctionPoints": 3 * junctions, "areaPoints": 0}}}


class PavedTiles(unittest.TestCase):
    def test_a_motor_roads_shoulder_is_clear_and_its_carriageway_paths_and_junctions_are_not(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest = paved_tile(Path(folder), [
                # The east road's shoulder, south of it, as the paving draws it: from the carriageway's edge out.
                ([(50, -3), (60, -3), (55, -5)], (1, 1, 2), 0),
                # The path's paving, running on to the road past where its rings stop: a path has no shoulder, so its corners
                # just past its edge read as a shoulder's.
                ([(100, 3), (102, 3), (101, 8)], (2, 2, 0), 1),
                # A junction's corner no way owns, drawn as the shoulder round it, past the east road's.
                ([(150, 3), (154, 3), (152, 5)], (2, 2, 2), 0),
            ], junctions=1)
            paved = Paved(*read_surface(Path(folder), manifest))
        # A sign stands a metre past the carriageway, on the shoulder.
        self.assertTrue(paved.clear(np.array([55.0, -4.2]), 0.4, besides=0))
        self.assertFalse(paved.clear(np.array([101.0, 5.0]), 0.4, besides=0))
        self.assertFalse(paved.clear(np.array([152.0, 4.0]), 0.4, besides=0))


    def test_a_carriageway_triangle_on_its_edge_is_carriageway_and_a_kerb_strip_past_it_is_shoulder(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest = paved_tile(Path(folder), [
                # Where no ring is, as in a side street's mouth: the road's carriageway out to its edge, whose points the
                # paving stores a hair past 1.
                ([(50, -10), (60, -10), (55, -14)], (0.4, 1.02, 1.02), 0),
                # A kerb's strip: two corners on the edge and the third a few centimetres out on the shoulder.
                ([(70, -10), (80, -10), (75, -10.2)], (1.0, 1.0, 1.06), 0),
            ])
            paved = Paved(*read_surface(Path(folder), manifest))
        # Another way's post may not stand on the road's carriageway, but may on its shoulder.
        self.assertFalse(paved.clear(np.array([55.0, -11.0]), 0.1, besides=1))
        self.assertTrue(paved.clear(np.array([75.0, -10.1]), 0.05, besides=1))

    def test_a_crossing_keeps_posts_off_its_line_where_the_street_owns_its_paving(self):
        crossing = {"id": 1, "kind": "footway", "motor": False, "footway": "crossing", "line": [[80.0, -8.0], [80.0, 8.0]]}
        with tempfile.TemporaryDirectory() as folder:
            manifest = paved_tile(Path(folder), [
                # The east road's shoulder, the kerb strip a crossing runs over on its way from the street to its sidewalk.
                ([(70, -3), (90, -3), (80, -5)], (1, 1, 2), 0),
            ], [crossing])
            paved = Paved(*read_surface(Path(folder), manifest))
        self.assertFalse(paved.clear(np.array([80.0, -4.2]), 0.4, besides=0))
        self.assertTrue(paved.clear(np.array([86.0, -3.4]), 0.4, besides=0))

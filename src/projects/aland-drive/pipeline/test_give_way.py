"""Which of a road and a building gives way, and how a roof's own metres are laid: the rules that are easy to get backwards."""

import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, Point, box

import vectors
from buildings import Face, RoofFrame
from give_way import CLEAR_M, drawn_half_width, give_way, open_walls
from grid import neighbour, tile_at
from roads import CLASSES
from vectors import Bounds, clip_line, seam_direction

SHED = box(0, 0, 10, 6)
# A corner of the island to draw OSM's ways on, in ETRS-TM35FIN metres.
EAST, NORTH = 128000.0, 6683000.0
TO_LONLAT = Transformer.from_crs("EPSG:3067", "EPSG:4326", always_xy=True)


def geometry(points: list[tuple[float, float]]) -> list[dict]:
    return [dict(zip(("lon", "lat"), TO_LONLAT.transform(east, north))) for east, north in points]


def road(kind: str, line: list[list[float]], **tags) -> dict:
    return {"id": 1, "kind": kind, "motor": True, "line": line, **tags}


class GiveWay(unittest.TestCase):
    def test_a_farm_drive_through_a_shed_stops_at_its_walls(self):
        meetings = give_way([road("service", [[-20, 3], [30, 3]])], [SHED])
        self.assertEqual(meetings.openings, [])
        self.assertEqual(len(meetings.roads), 2)
        self.assertTrue(all(LineString(part["line"]).distance(SHED) > 0 for part in meetings.roads))

    def test_a_street_clipping_a_building_is_pushed_clear_and_the_building_keeps_every_wall(self):
        # OSM's line runs along the shed a metre inside its side: the line is off, not the shed.
        meetings = give_way([road("unclassified", [[-20, 5], [30, 5]])], [SHED])
        self.assertEqual(meetings.openings, [])
        self.assertEqual(len(meetings.roads), 1)
        # Verges and all: on gravel a verge reads as road.
        self.assertGreater(LineString(meetings.roads[0]["line"]).distance(SHED), drawn_half_width(meetings.roads[0]))
        self.assertEqual(sum(wall.length for wall in open_walls(SHED, meetings.openings)), SHED.length)

    def test_a_road_moved_off_a_house_runs_down_the_middle_of_the_gap_to_the_barn_across_it(self):
        # Aludden: OSM's line runs 2.7 m inside the house's side, and the barn across the way leaves a gap of 9.3 m, room for
        # the whole drawn road but not for its margin either side. Shoved off the house it landed on the barn.
        house, barn = box(0, 0, 9, 12), box(-17.3, 0, -9.3, 12)
        street = road("unclassified", [[2.7, -200], [2.7, 200]])
        line = LineString(give_way([street], [house, barn]).roads[0]["line"])
        self.assertGreater(min(line.distance(house), line.distance(barn)), drawn_half_width(street))
        self.assertAlmostEqual(line.interpolate(line.project(Point(-4.65, 6))).x, -4.65, delta=0.3)

    def test_a_junction_inside_a_building_moves_out_with_every_road_meeting_there(self):
        street = road("residential", [[-30, 1], [5, 1], [40, -10]])
        drive = road("service", [[5, 1], [5, -30]], id=2)
        roads = give_way([street, drive], [SHED]).roads
        shared = [point for point in roads[0]["line"] if point in roads[1]["line"]]
        self.assertEqual(len(shared), 1)
        self.assertFalse(SHED.contains(Point(shared[0])))
        self.assertTrue(all(LineString(part["line"]).intersection(SHED).length < CLEAR_M for part in roads))

    def test_a_street_no_push_can_get_out_of_a_building_stops_at_its_walls(self):
        # Squarely through the middle of a hall OSM doesn't tag as a passage: the hall keeps its walls.
        hall = box(0, 0, 10, 30)
        meetings = give_way([road("residential", [[-20, 15], [30, 15]])], [hall])
        self.assertEqual(meetings.openings, [])
        self.assertEqual(len(meetings.roads), 2)
        self.assertTrue(all(LineString(part["line"]).distance(hall) > 0 for part in meetings.roads))

    def test_a_street_that_ends_inside_a_building_stops_at_its_wall(self):
        meetings = give_way([road("residential", [[-20, 3], [5, 3]])], [SHED])
        self.assertEqual(meetings.openings, [])
        self.assertLess(max(x for x, _ in meetings.roads[0]["line"]), 0)

    def test_a_tagged_passage_opens_the_walls_whatever_the_road(self):
        meetings = give_way([road("service", [[-20, 3], [5, 3]], tunnel="building_passage")], [SHED])
        self.assertEqual(len(meetings.openings), 1)

    def test_a_drive_beside_a_building_is_pushed_clear_of_it(self):
        meetings = give_way([road("service", [[-30, -0.5], [40, -0.5]])], [SHED])
        self.assertEqual(meetings.pushed, 1)
        self.assertGreater(LineString(meetings.roads[0]["line"]).distance(SHED), drawn_half_width(meetings.roads[0]))

    def test_where_roads_meet_nothing_moves(self):
        drive = road("service", [[-30, -0.5], [5, -0.5], [40, -0.5]])
        branch = road("service", [[5, -0.5], [5, -30]])
        self.assertIn([5, -0.5], give_way([drive, branch], [SHED]).roads[0]["line"])

    def test_both_tiles_at_an_edge_move_a_road_alike_and_its_halves_still_meet(self):
        # The tiles meet at x = 0, a house stands just east of it on the road, and each tile also sees a shed far off on its
        # own side, beside the road, that the other doesn't, so each tile moves the road somewhere the other doesn't. The
        # road is moved whole on each, then cut at the edge.
        street = road("unclassified", [[-400, 2], [400, 2]])
        house = box(8, 0, 18, 10)
        west = give_way([street], [house, box(-390, 6, -380, 16)]).roads[0]["line"]
        east = give_way([street], [house, box(380, 6, 390, 16)]).roads[0]["line"]
        halves = [clip_line(np.array(line), bounds)[0] for line, bounds in ((west, Bounds(-6000, -3000, 0, 3000)), (east, Bounds(0, -3000, 6000, 3000)))]
        self.assertEqual(halves[0][-1].tolist(), halves[1][0].tolist())
        np.testing.assert_array_equal(seam_direction(np.array(west), halves[0][-1]), seam_direction(np.array(east), halves[1][0]))
        # And the move reaches over the edge: the crossing itself moved off the house's line.
        self.assertGreater(abs(halves[0][-1][1] - 2), 1)

    def test_a_road_moved_far_from_an_edge_in_one_tile_only_still_crosses_it_where_the_other_does(self):
        # Only the east tile sees the shed, 380 m past the edge; the west tile leaves the road as OSM drew it. The move
        # mustn't reach the crossing, even by the millimetre a centimetre's rounding of the moved road would take it.
        street = road("unclassified", [[-400, 2.003], [400, 37.71]])
        west = give_way([street], []).roads[0]["line"]
        east = give_way([street], [box(380, 42, 390, 52)]).roads[0]["line"]
        self.assertNotEqual(west, east)
        crossings = [clip_line(np.array(line), Bounds(-6000, -3000, 0, 3000))[0][-1] for line in (west, east)]
        self.assertEqual(crossings[0].tolist(), crossings[1].tolist())


class Edges(unittest.TestCase):
    def test_a_way_ending_a_hair_past_a_tiles_edge_crosses_into_neither(self):
        # It ends under a millimetre over the edge, which a centimetre's rounding would put on it: one tile would then have
        # a road meeting the edge with nothing in the other to meet it.
        west = tile_at(EAST, NORTH)
        east = neighbour(west, 1, 0)
        ends = [(west.east - 60, west.south + 3000), (west.east + 0.0009, west.south + 3000)]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "osm.json"
            path.write_text(json.dumps({"elements": [{"type": "way", "id": 1, "tags": {"highway": "residential"}, "geometry": geometry(ends)}]}), encoding="utf-8")
            pieces = [vectors.build(path, tile)[0] for tile in (west, east)]
        self.assertEqual([[piece.get("seams") for piece in tile] for tile in pieces], [[None], []])


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

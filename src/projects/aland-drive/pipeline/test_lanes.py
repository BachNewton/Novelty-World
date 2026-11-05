"""The lane map's rules that are easy to get backwards: which side a lane runs, who gives way, and what the audit finds."""

import unittest

import numpy as np

from lanes import TURN_RADIUS_M, LaneMap, Rules, tightest_radius
from roadside import RINGS, Chain

BOX = (-1000.0, -1000.0, 1000.0, 1000.0)


def road(index: int, kind: str, rank: int, start: tuple[float, float], end: tuple[float, float], half: float = 3.0, motor: bool = True) -> Chain:
    """A straight flat road from one point to another, `half` metres of carriageway each side and a metre of shoulder."""
    start, end = np.array(start, float), np.array(end, float)
    length = float(np.hypot(*(end - start)))
    way = (end - start) / length
    left = np.array([-way[1], way[0]])
    stations = np.linspace(0, length, max(2, int(length // 5) + 1))
    rings = np.zeros((len(stations), RINGS, 3))
    for column, across in enumerate((half + 1, half, 0, -half, -half - 1)):
        rings[:, column, :2] = start + np.outer(stations, way) + left * across
    return Chain(index, kind, rank, motor, rings, [])


def rules(sign=None, oneway: dict | None = None, limits: dict | None = None) -> Rules:
    def way(point, direction):
        tags = (oneway or {}).get("tags", {})
        return tags, (oneway or {}).get("runs", 1)

    return Rules(sign=sign or (lambda chain, along, host: None), signals=[], way=way, limits=lambda chain: (limits or {}).get(chain.index, []), built_up=lambda point: False)


def flat(east: float, north: float) -> float:
    return 0.0


def lane_map(chains: list[Chain], given: Rules | None = None, aprons: list | None = None) -> LaneMap:
    return LaneMap(chains, aprons or [], BOX, given or rules(), flat).build()


def east_west_with_side_road(side_rank: int = 3, short_of_m: float = 0.05) -> list[Chain]:
    """A road running east along north = 0, and a side road coming up from the south to end on it at east = 0, stopping short of its edge."""
    return [road(0, "tertiary", 2, (-200, 0), (200, 0)), road(1, "residential", side_rank, (0, -200), (0, -3 - short_of_m), half=2.25)]


def connector(lanes: LaneMap, turn: str, source_chain: int, target_chain: int, going: str = "") -> int:
    """The connector making a turn from one chain to another; `going` names the way it leaves on, "east" or "west"."""
    for index, found in enumerate(lanes.connectors):
        come, go = lanes.lanes[found.source], lanes.lanes[found.target]
        heading = go.points[-1, 0] - go.points[0, 0]
        if found.turn == turn and come.chain.index == source_chain and go.chain.index == target_chain and (not going or (heading > 0) == (going == "east")):
            return index
    raise AssertionError(f"no {turn} turn from chain {source_chain} to {target_chain} {going}")


class Lanes(unittest.TestCase):
    def test_traffic_keeps_right(self):
        lanes = lane_map([road(0, "tertiary", 2, (-200, 0), (200, 0))])
        eastbound = next(lane for lane in lanes.lanes if lane.points[-1, 0] > lane.points[0, 0])
        westbound = next(lane for lane in lanes.lanes if lane.points[-1, 0] < lane.points[0, 0])
        self.assertAlmostEqual(eastbound.points[0, 1], -1.5, msg="eastbound runs on the south half, at its middle")
        self.assertAlmostEqual(westbound.points[0, 1], 1.5)

    def test_a_one_way_road_has_lanes_only_its_way_and_a_way_drawn_against_the_chain_runs_against_it(self):
        lanes = lane_map([road(0, "residential", 3, (-200, 0), (200, 0))], rules(oneway={"tags": {"oneway": "yes"}, "runs": -1}))
        kept = [lane for lane in lanes.lanes if lane is not None]
        self.assertEqual(len(kept), 1)
        self.assertLess(kept[0].points[-1, 0], kept[0].points[0, 0], "OSM's way runs west, against the chain")
        self.assertAlmostEqual(kept[0].points[0, 1], 0.0, msg="a one-lane one-way road runs down its middle")

    def test_a_road_crossing_the_tiles_edge_ends_on_the_seam_with_no_junction(self):
        lanes = lane_map([road(0, "tertiary", 2, (-500, 0), (1000, 0))])
        eastbound = next(lane for lane in lanes.lanes if lane.forward)
        self.assertTrue(eastbound.seam_end)
        self.assertIsNone(eastbound.end)

    def test_a_dead_end_turns_traffic_round_so_every_lane_is_reached(self):
        lanes = lane_map([road(0, "residential", 3, (-500, 0), (1000, 0)), road(1, "service", 4, (0, -100), (0, -3.05), half=1.75)])
        self.assertTrue(any(found.turn == "back" for found in lanes.connectors))
        self.assertFalse([issue for issue in lanes.issues if issue["kind"] == "unreachable"])

    def test_a_road_with_a_give_way_sign_gives_way_to_both_ways_of_the_road_it_meets(self):
        lanes = lane_map(east_west_with_side_road(), rules(sign=lambda chain, along, host: "give-way"))
        left = connector(lanes, "left", 1, 0)
        for through in (connector(lanes, "straight", 0, 0, "east"), connector(lanes, "straight", 0, 0, "west")):
            self.assertIn(through, lanes.connectors[left].yields)
            self.assertNotIn(left, lanes.connectors[through].yields)
        self.assertIn(connector(lanes, "straight", 0, 0, "east"), lanes.connectors[connector(lanes, "right", 1, 0)].yields, "a right turn merges with the road's traffic coming from the left")

    def test_a_left_turn_gives_way_to_oncoming_traffic(self):
        lanes = lane_map(east_west_with_side_road(), rules(sign=lambda chain, along, host: "give-way"))
        # Westbound turning left into the side road crosses eastbound's lane.
        turning = connector(lanes, "left", 0, 1)
        self.assertIn(connector(lanes, "straight", 0, 0, "east"), lanes.connectors[turning].yields)

    def test_equal_roads_with_no_sign_give_way_to_the_right_even_on_the_road_that_runs_on(self):
        lanes = lane_map(east_west_with_side_road())
        eastbound = connector(lanes, "straight", 0, 0, "east")
        left_out = connector(lanes, "left", 1, 0)
        # Coming up from the south and turning left, the side road is on the right of eastbound traffic.
        self.assertIn(left_out, lanes.connectors[eastbound].yields)
        westbound = connector(lanes, "straight", 0, 0, "west")
        self.assertIn(westbound, lanes.connectors[left_out].yields, "westbound comes from the side road's right")

    def test_a_drive_gives_way_to_the_street_it_comes_out_on(self):
        lanes = lane_map(east_west_with_side_road(side_rank=4))
        drive = next(arm for junction in lanes.junctions.values() for arm in junction.arms if arm.chain.index == 1 and len(junction.arms) == 3)
        self.assertTrue(drive.yields)
        self.assertIn(connector(lanes, "straight", 0, 0, "east"), lanes.connectors[connector(lanes, "left", 1, 0)].yields)

    def test_a_loop_drive_lying_in_one_junction_never_gives_way_to_the_traffic_behind_it_nor_leads_back_into_itself(self):
        loop = road(1, "service", 4, (-4, -3.05), (0, -6), half=1.5)
        back = road(1, "service", 4, (0, -6), (4, -3.05), half=1.5)
        loop.rings = np.concatenate([loop.rings, back.rings[1:]])
        loop.__post_init__()
        lanes = lane_map([road(0, "tertiary", 2, (-200, 0), (200, 0)), loop])
        for found in lanes.connectors:
            for other in found.yields:
                self.assertNotEqual(lanes.connectors[other].target, found.source, "a turn out of a lane gives way to the turn feeding it")
        self.assertFalse([found for found in lanes.connectors if found.source == found.target], "the drive leads back into itself, backwards")

    def test_traffic_on_a_ring_goes_round_and_an_entry_gives_way_to_it_even_where_the_ring_closes(self):
        corners = 48
        circle = [(30 * np.cos(2 * np.pi * k / corners), 30 * np.sin(2 * np.pi * k / corners)) for k in range(corners + 1)]
        ring = road(0, "primary", 0, (0, 0), (1, 0), half=3.0)
        ring.rings = np.concatenate([road(0, "primary", 0, a, b, half=3.0).rings[:1] for a, b in zip(circle, circle[1:])] + [road(0, "primary", 0, circle[-2], circle[-1], half=3.0).rings[-1:]])
        ring.__post_init__()
        # An entry from the east, landing where the ring's chain starts and ends.
        entry = road(1, "secondary", 1, (200, 0), (33.05, 0), half=3.0)
        given = rules(oneway={"tags": {"junction": "roundabout"}, "runs": 1})
        given.way = lambda point, direction: ({"junction": "roundabout"}, 1) if abs(np.hypot(*point) - 30) < 1 else ({}, 1)
        lanes = lane_map([ring, entry], given)
        into = [index for index, found in enumerate(lanes.connectors) if lanes.lanes[found.source].chain.index == 1 and lanes.lanes[found.target].chain.index == 0]
        self.assertTrue(into, "the entry joins the ring")
        for index in into:
            self.assertTrue(lanes.connectors[index].yields, "and gives way to the traffic going round")
        self.assertFalse([issue for issue in lanes.issues if issue["kind"] == "unreachable"])

    def test_each_way_enters_its_own_side_of_a_limit_change(self):
        lanes = lane_map([road(0, "tertiary", 2, (-200, 0), (200, 0))], rules(limits={0: [(0.0, 50), (200.0, 90)]}))
        eastbound = next(lane for lane in lanes.lanes if lane.forward)
        westbound = next(lane for lane in lanes.lanes if not lane.forward)
        self.assertEqual(eastbound.speeds, [(0.0, 50), (200.0, 90)])
        self.assertEqual(westbound.speeds, [(0.0, 90), (200.0, 50)])

    def test_a_turn_off_the_drawn_road_is_listed_and_one_across_an_apron_is_not(self):
        # A side road stops where it's wholly clear of the road it meets, and an apron paves the gap.
        bare = lane_map(east_west_with_side_road(short_of_m=5))
        self.assertTrue([issue for issue in bare.issues if issue["kind"] == "off-road"], "with no apron the gap is bare ground")
        corner = [np.array([[x0, y0, 0.0], [x1, y1, 0.0], [x2, y2, 0.0]]) for (x0, y0), (x1, y1), (x2, y2) in (((-12, -3), (12, -3), (12, -9)), ((-12, -3), (12, -9), (-12, -9)))]
        paved = lane_map(east_west_with_side_road(short_of_m=5), aprons=corner)
        self.assertFalse([issue for issue in paved.issues if issue["kind"] == "off-road"])

    def test_a_turn_through_a_drives_mouth_is_one_a_car_can_make_and_keeps_to_the_paving_where_there_is_room(self):
        def mouth(half: float) -> list[np.ndarray]:
            return [np.array([[x0, y0, 0.0], [x1, y1, 0.0], [x2, y2, 0.0]]) for (x0, y0), (x1, y1), (x2, y2) in (((-half, -3), (half, -3), (half, -8.2)), ((-half, -3), (half, -8.2), (-half, -8.2)))]

        def turns(half: float) -> list:
            lanes = lane_map(east_west_with_side_road(short_of_m=5), aprons=mouth(half))
            found = [(lanes.surface, turn) for turn in lanes.connectors if turn.turn in ("left", "right")]
            self.assertTrue(found)
            return found

        # Paved only as wide as the drive: no car turns into the street without running over the edge, and the turn is still one it can make.
        for _, turn in turns(2.5):
            self.assertGreaterEqual(tightest_radius(turn.points[:, :2]), TURN_RADIUS_M, f"the {turn.turn} turn is tighter than a car can turn")
        # Flared as a real mouth is, there's room, and the turn keeps to it.
        for surface, turn in turns(3.5):
            self.assertGreaterEqual(tightest_radius(turn.points[:, :2]), TURN_RADIUS_M, f"the {turn.turn} turn is tighter than a car can turn")
            self.assertLessEqual(float(surface.off_paving(turn.points).max()), 0.1, f"the {turn.turn} turn leaves the paving")

if __name__ == "__main__":
    unittest.main()

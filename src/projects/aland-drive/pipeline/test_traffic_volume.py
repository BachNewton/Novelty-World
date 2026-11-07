"""Which count a road takes: its own site's, a same-named road's nearby, or its class's in or out of town."""

import unittest

import numpy as np

from roadside import RINGS, Chain
from traffic_volume import TYPICAL_DAILY, TrafficVolume


def road(kind: str, start: tuple[float, float], end: tuple[float, float], name: str = "") -> Chain:
    rings = np.zeros((2, RINGS, 3))
    rings[:, :, :2] = np.array([start, end], float)[:, None, :]
    return Chain(0, kind, 1, True, rings, [], name)


class TrafficVolumeTest(unittest.TestCase):
    def test_a_road_takes_its_own_sites_count_over_a_crossing_roads(self):
        # A site at a junction stands within reach of both roads; it is the count of the road it belongs to.
        volume = TrafficVolume([(np.array([0.0, 10.0]), 3000.0, "Godbyvägen"), (np.array([5.0, 0.0]), 400.0, "Byvägen")])
        self.assertEqual(volume.daily(road("primary", (0, -500), (0, 500), "Godbyvägen"), False), 3000)
        self.assertEqual(volume.daily(road("tertiary", (-500, 0), (500, 0), "Byvägen"), False), 400)

    def test_a_count_reaches_the_rest_of_its_road_but_not_far(self):
        volume = TrafficVolume([(np.array([0.0, 0.0]), 3000.0, "Godbyvägen")])
        self.assertEqual(volume.daily(road("primary", (0, 1000), (0, 2000), "Godbyvägen"), False), 3000)
        self.assertEqual(volume.daily(road("primary", (0, 9000), (0, 10000), "Godbyvägen"), False), TYPICAL_DAILY["primary"][0])

    def test_a_road_with_no_count_takes_its_classs_in_town_or_out(self):
        volume = TrafficVolume([])
        self.assertEqual(volume.daily(road("secondary", (0, 0), (0, 100)), False), TYPICAL_DAILY["secondary"][0])
        self.assertEqual(volume.daily(road("secondary_link", (0, 0), (0, 100)), True), TYPICAL_DAILY["secondary"][1])


if __name__ == "__main__":
    unittest.main()

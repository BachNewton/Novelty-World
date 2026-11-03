"""Where parked cars stand and which way they face: the rules that are easy to get backwards."""

import math
import unittest
from collections import defaultdict

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon

from parking import AISLE_M, Parking, kerb_parking, room
from test_roadside import east_road, roadside


def parking(chains=(), aisles=()) -> Parking:
    side = roadside()
    side.chains = list(chains)
    side.ways = type("Ways", (), {"lines": list(aisles), "tags": [{"service": "parking_aisle"}] * len(aisles), "tree": shapely.STRtree(list(aisles))})()
    park = Parking.__new__(Parking)
    park.roadside = side
    park.aprons = type("Aprons", (), {"height": lambda self, point: None})()
    park.aisles = list(aisles)
    park.cars, park.counts, park.taken = [], {"car park": 0, "kerb": 0}, defaultdict(list)
    quads, owners = [], []
    for chain in side.chains:
        quads.append(chain.line.buffer(3.0, cap_style="flat"))
        owners.append(chain)
    park.roads, park.owners = shapely.STRtree(quads), owners
    empty = shapely.STRtree(shapely.points(np.zeros((0, 2))))
    park.standing = park.crossings = park.bus_stops = empty
    return park


def nose_of(yaw: float) -> np.ndarray:
    """Where a car's nose (its -z) points, as (east, north): the scene's z is south."""
    return np.array([-math.sin(yaw), math.cos(yaw)])


class Tags(unittest.TestCase):
    def test_a_side_of_its_own_outranks_both(self):
        self.assertTrue(kerb_parking({"parking:right": "lane", "parking:both": "no"}, "right"))
        self.assertFalse(kerb_parking({"parking:right": "lane", "parking:both": "no"}, "left"))

    def test_a_separately_mapped_car_park_is_no_kerb_parking(self):
        self.assertFalse(kerb_parking({"parking:both": "separate"}, "left"))

    def test_the_old_scheme_counts_and_silence_is_none(self):
        self.assertTrue(kerb_parking({"parking:lane:both": "parallel"}, "left"))
        self.assertIsNone(kerb_parking({}, "right"))


class Kerbs(unittest.TestCase):
    def test_a_kerb_car_stands_off_the_carriageway_on_its_traffic_s_right_and_faces_the_way_it_goes(self):
        road = east_road()
        park = parking([road])
        park.kerb_car(road, 100.0, 1)
        park.kerb_car(road, 100.0, -1)
        (east_x, _, east_z, east_yaw), (west_x, _, west_z, west_yaw) = park.cars
        # Right of eastbound traffic is south; the carriageway's edges are 3 m out.
        self.assertLess(-east_z, -3 - 0.9)
        np.testing.assert_allclose(nose_of(east_yaw), [1, 0], atol=1e-3)
        self.assertGreater(-west_z, 3 + 0.9)
        np.testing.assert_allclose(nose_of(west_yaw), [-1, 0], atol=1e-3)


class CarParks(unittest.TestCase):
    def test_bays_line_a_mapped_aisle_nose_to_it_and_none_stands_on_it(self):
        aisle = LineString([(0, 0), (60, 0)])
        area = Polygon([(-2, -12), (62, -12), (62, 12), (-2, 12)])
        park = parking(aisles=[aisle])
        park.parks = [(area, {"access": "yes", "parking": "surface"})]
        park.car_parks()
        self.assertGreater(len(park.cars), 0)
        for x, _, z, yaw in park.cars:
            centre = np.array([x, -z])
            self.assertGreaterEqual(aisle.distance(room(centre, nose_of(yaw))), AISLE_M / 2 - 0.2 - 1e-6)
            # Nose or tail to the aisle, never along it.
            self.assertAlmostEqual(abs(nose_of(yaw)[1]), 1, places=3)


if __name__ == "__main__":
    unittest.main()

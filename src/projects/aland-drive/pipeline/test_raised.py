"""Which buildings stand above the ground, and where service lanes make one paved yard: rules a wrong tag on one building
would quietly turn into a barn on the road, or a mall on stilts."""

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import box

from grid import tile_at, to_local
from raised import CANOPY_DEPTH_M, CLEARANCE_M, Lookup, raised_in
from vectors import lane_yards

# A corner of the island to draw on, in ETRS-TM35FIN metres.
EAST, NORTH = 128000.0, 6683000.0
TO_LONLAT = Transformer.from_crs("EPSG:3067", "EPSG:4326", always_xy=True)


def geometry(points: list[tuple[float, float]]) -> list[dict]:
    return [dict(zip(("lon", "lat"), TO_LONLAT.transform(EAST + east, NORTH + north))) for east, north in points]


def building(corners: tuple[float, float, float, float], **tags) -> dict:
    west, south, east, north = corners
    return {"type": "way", "id": 1, "tags": {"building": "yes", **tags}, "geometry": geometry([(west, south), (east, south), (east, north), (west, north), (west, south)])}


def way(points: list[tuple[float, float]], **tags) -> dict:
    return {"type": "way", "id": 2, "tags": tags, "geometry": geometry(points)}


def flat(points: np.ndarray) -> np.ndarray:
    return np.full(len(points), 3.0)


WALKWAY = (0, 0, 60, 8)
ACROSS = [(30, -20), (30, 30)]


class RaisedBuildings(unittest.TestCase):
    def test_a_canopy_is_a_roof_on_posts_at_its_own_height(self):
        [canopy] = raised_in([building((0, 0, 20, 10), building="roof")], flat)
        self.assertTrue(canopy.canopy)
        self.assertAlmostEqual(canopy.top - canopy.under, CANOPY_DEPTH_M)

    def test_a_building_on_a_layer_over_a_street_is_raised_clear_of_it(self):
        [walkway] = raised_in([building(WALKWAY, layer="1"), way(ACROSS, highway="service")], flat)
        self.assertAlmostEqual(walkway.under, 3.0 + CLEARANCE_M)
        self.assertTrue(walkway.by_layer)

    def test_a_layer_over_a_basement_ramp_a_corridor_or_a_tunnel_stands_on_the_ground(self):
        for under in (dict(highway="service", level="-1"), dict(highway="corridor"), dict(highway="footway"), dict(highway="service", tunnel="yes"), dict(highway="service", layer="-2")):
            with self.subTest(**under):
                self.assertEqual(raised_in([building(WALKWAY, layer="1"), way(ACROSS, **under)], flat), [])

    def test_a_layer_alone_raises_nothing(self):
        self.assertEqual(raised_in([building(WALKWAY, layer="1")], flat), [])

    def test_a_laser_model_outweighs_a_layer_but_not_a_canopy(self):
        walkway = raised_in([building(WALKWAY, layer="1"), way(ACROSS, highway="service")], flat)
        canopy = raised_in([building(WALKWAY, building="roof")], flat)
        outline = box(EAST, NORTH, EAST + 60, NORTH + 8)
        self.assertIsNone(Lookup(walkway).of(outline, modelled=True))
        self.assertIsNotNone(Lookup(walkway).of(outline))
        self.assertIsNotNone(Lookup(canopy).of(outline, modelled=True))

    def test_a_building_drawn_as_a_part_per_floor_is_raised_by_its_parts_together(self):
        parts = raised_in([building((0, 0, 35, 8), layer="1"), building((25, 0, 60, 8), layer="2"), way(ACROSS, highway="service")], flat)
        # Neither part covers half the survey's outline, but together they do.
        self.assertIsNotNone(Lookup(parts).of(box(EAST - 20, NORTH, EAST + 60, NORTH + 8)))


class LaneYards(unittest.TestCase):
    tile = tile_at(EAST, NORTH)

    def yards(self, *lines: list[tuple[float, float]]) -> list:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "osm.json"
            path.write_text(json.dumps({"elements": [way(line, highway="service") for line in lines]}), encoding="utf-8")
            return lane_yards(path, self.tile)

    def test_lanes_side_by_side_are_one_yard_with_no_land_between_them(self):
        [yard] = self.yards(*[[(0, offset), (80, offset)] for offset in (0, 4, 8, 12)])
        middle = to_local(EAST + 40, NORTH + 6)
        self.assertTrue(yard.contains(box(middle[0] - 1, middle[1] - 6, middle[0] + 1, middle[1] + 6)))

    def test_two_drives_that_only_meet_are_no_yard(self):
        self.assertEqual(self.yards([(0, 0), (80, 0)], [(40, 0), (40, 80)]), [])


if __name__ == "__main__":
    unittest.main()

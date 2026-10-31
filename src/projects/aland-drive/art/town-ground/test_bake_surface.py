"""pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/art/town-ground -p "test_*.py" """

import sys
import unittest
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box

sys.path.insert(0, str(Path(__file__).parent))
from bake_surface import COBBLE, GRAVEL, LAWN, NONE, RANGE_M, SLAB, TARMAC, Ribbon, apply_way_surfaces, bake_surface, classify_osm

SIZE_M = 200.0
WEST, NORTH = 0.0, 200.0
TAN = np.full((100, 100, 3), (0.5, 0.45, 0.35), np.float32)


def straight_road(y: float, half: float = 3.0, shoulder: float = 1.2, motor: bool = True) -> Ribbon:
    xs = np.arange(0.0, 201.0, 10.0)
    offsets = (half + shoulder, half, 0.0, -half, -half - shoulder)
    rings = np.stack([np.column_stack((xs, np.full_like(xs, y + offset))) for offset in offsets], axis=1)
    return Ribbon(rings, "residential", motor)


def at(bake, x: float, y: float) -> int:
    return int(bake.classes[int(NORTH - y), int(x - WEST)])


def channel_metres(bake, x: float, y: float, channel: int) -> float:
    return (float(bake.image[int((NORTH - y) / 2), int((x - WEST) / 2), channel]) - 127.5) / 127.5 * RANGE_M[channel]


class Classify(unittest.TestCase):
    def test_sorts_areas_by_tag(self):
        square = box(10, 10, 60, 60)
        layers = classify_osm([
            {"tags": {"leisure": "park"}, "geometry": square},
            {"tags": {"amenity": "parking", "surface": "gravel"}, "geometry": square},
            {"tags": {"amenity": "parking", "parking": "underground"}, "geometry": square},
            {"tags": {"highway": "pedestrian", "surface": "sett"}, "geometry": square},
            {"tags": {"barrier": "hedge"}, "geometry": LineString([(0, 0), (9, 9)])},
            {"tags": {"amenity": "fountain"}, "geometry": Point(1, 1)},
        ])
        self.assertEqual([area.surface for area in layers.areas], [LAWN, GRAVEL, COBBLE])
        self.assertEqual((len(layers.hedges), len(layers.fountains)), (1, 1))


class Bake(unittest.TestCase):
    def setUp(self):
        layers = classify_osm([
            {"tags": {"landuse": "residential"}, "geometry": box(0, 0, 200, 200)},
            {"tags": {"leisure": "park"}, "geometry": box(120, 120, 190, 190)},
            {"tags": {"amenity": "parking"}, "geometry": box(20, 20, 80, 60)},
        ])
        building = Polygon([(40, 110), (60, 110), (60, 130), (40, 130)])
        self.bake = bake_surface(WEST, NORTH, SIZE_M, layers, [straight_road(100.0)], [building], TAN)

    def test_a_park_and_a_car_park_land_where_osm_has_them(self):
        self.assertEqual(at(self.bake, 150, 150), LAWN)
        self.assertEqual(at(self.bake, 50, 40), TARMAC)

    def test_tan_land_in_town_is_a_yard_not_nothing(self):
        self.assertEqual(at(self.bake, 100, 170), GRAVEL)

    def test_pavement_runs_beside_the_road_up_to_a_facade(self):
        self.assertEqual(at(self.bake, 150, 95), SLAB)
        self.assertEqual(at(self.bake, 50, 108), SLAB)

    def test_a_channel_reads_as_metres_from_its_edge(self):
        # Blue is set on tarmac only here: 10 m inside the lot's south edge, inside its 16 m reach.
        self.assertAlmostEqual(channel_metres(self.bake, 50, 30, 2), 10, delta=1.2)

    def test_under_a_road_is_what_lies_beside_it(self):
        self.assertNotEqual(at(self.bake, 150, 100), NONE)


class Ribbons(unittest.TestCase):
    def test_a_sidewalk_is_flags_and_a_setted_street_keeps_its_setts(self):
        walk = straight_road(50.0, 1.0, 0.5, motor=False)
        walk.kind = "footway"
        street = straight_road(100.0)
        bake = bake_surface(WEST, NORTH, SIZE_M, classify_osm([]), [walk, street], [], TAN)
        apply_way_surfaces([walk, street], bake, [
            {"line": LineString([(0, 50), (200, 50)]), "kind": "footway", "footway": "sidewalk"},
            {"line": LineString([(0, 100), (100, 100)]), "kind": "living_street", "surface": "sett"},
            {"line": LineString([(100, 100), (200, 100)]), "kind": "living_street", "surface": "asphalt"},
        ])
        self.assertEqual(bake.ribbon_classes[0][5], SLAB)
        self.assertEqual(bake.ribbon_classes[1][2], COBBLE)
        self.assertEqual(bake.ribbon_classes[1][15], NONE)


if __name__ == "__main__":
    unittest.main()

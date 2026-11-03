"""The road surface, on small made-up lands.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline

No network, and no real tile: these pin what a change to the road code could
quietly break, and `road_audit.py` measures the real thing.
"""

import gzip
import unittest

import numpy as np
import shapely

import road_map
import roads
from build import encode_heights
from grid import Tile
from roads import Ground, lay_roads
from vectors import clip_line, seam_direction


def land(size_cells=1500, rim=100, height=None):
    """A square of 2 m corners, 3 km across, west at 0 and north at 3000."""
    count = size_cells + 2 * rim + 1
    rows, columns = np.mgrid[0:count, 0:count]
    east, north = (columns - rim) * 2.0, 3000 - (rows - rim) * 2.0
    corners = height(east, north) if height else np.full((count, count), 10.0)
    return Ground(corners.astype(np.float32), 0.0, 3000.0, rim)


def road(line, kind="primary", **tags):
    return {"id": 1, "kind": kind, "motor": True, "line": [list(map(float, point)) for point in line], **tags}


def bumpy(east, north):
    return 12 + 0.003 * east + 0.15 * np.sin(east / 3.1) + 0.1 * np.cos(north / 2.3 + east / 7)


class Profile(unittest.TestCase):
    def test_a_rough_road_comes_out_smooth_and_stays_near_the_land(self):
        ground = land(height=bumpy)
        surface = lay_roads([road([(0, 1500), (3000, 1500)])], ground)
        chain = surface.chains[0]
        rough = np.diff(ground.sample(chain.xy), 2)
        smooth = np.diff(chain.height, 2)
        self.assertLess(np.abs(smooth).max(), np.abs(rough).max() / 50)
        self.assertLess(np.abs(chain.height - ground.sample(chain.xy)).max(), 0.5)

    def test_rounding_a_corner_keeps_both_ends_and_stays_close(self):
        line = [(100, 500), (1000, 500), (1900, 700)]
        chain = lay_roads([road(line)], land()).chains[0]
        self.assertEqual(chain.xy[0].tolist(), [100, 500])
        self.assertEqual(chain.xy[-1].tolist(), [1900, 700])
        corner = np.hypot(*(chain.xy - np.array(line[1])).T).min()
        self.assertLess(corner, 3)
        headings = np.unwrap(np.arctan2(*np.gradient(chain.xy, axis=0).T[::-1]))
        self.assertLess(np.abs(np.diff(headings)).max(), np.radians(1))


class Ground_(unittest.TestCase):
    def test_the_edge_rows_never_move_even_with_a_road_crossing_them(self):
        ground = land(height=bumpy)
        surface = lay_roads([road([(0, 1500), (3000, 1500)]), road([(1500, 0), (1500, 3000)], "tertiary")], ground)
        raw = ground.tile_corners()
        for edge in ((0, ...), (-1, ...), (..., 0), (..., -1)):
            self.assertTrue(np.array_equal(surface.conformed[edge], raw[edge]))

    def test_no_mesh_triangle_comes_up_through_the_road(self):
        ground = land(height=lambda east, north: 12 + 3 * np.sin(north / 40) + 2 * np.sin(east / 25))
        surface = lay_roads([road([(0, 1200), (3000, 1800)], "track")], ground)
        nodes = surface.conformed[::2, ::2]
        chain = surface.chains[0]
        for share in (0, 0.5, 1):
            for side in (chain.left, chain.right):
                points = chain.centre + share * (side - chain.centre)
                inside = (points[:, 0] > 8) & (points[:, 0] < 2992)
                drawn = roads.surface_height(nodes, 4.0, 0.0, 3000.0, points[inside, :2])
                self.assertTrue((drawn < points[inside, 2]).all())

    def test_two_tiles_take_the_same_height_and_slope_where_a_road_crosses_their_seam(self):
        def world(east, north):
            return 12 + 0.01 * east + 0.2 * np.sin(east / 5 + north / 9)

        west_tile = land(height=world)
        east_tile = land(height=lambda east, north: world(east + 3000, north))
        east_tile.west = 0.0
        crossing = np.array([3000.0, 1500.0])
        east_way = np.array((1.0, 0.0))
        here = roads._edge_pin(west_tile, crossing, 3.75, east_way)
        there = roads._edge_pin(east_tile, crossing - [3000, 0], 3.75, east_way)
        for near, far in zip(here, there):
            self.assertAlmostEqual(near, far, places=3)


    def test_a_road_built_apart_on_two_tiles_ends_on_one_cross_section_whatever_its_chain_does(self):
        """An oblique, curving road, cut into chains running opposite ways: the ring at the seam must still be one ring."""

        def world(east, north):
            return 12 + 0.01 * east + 0.2 * np.sin(east / 5 + north / 9)

        whole = np.array([(2400 + step * 12.0, 1200 + 40 * np.sin(step / 6) + step * 5.0) for step in range(100)])
        west_of_seam = clip_line(whole, Tile("W", -3000, 0))
        east_of_seam = clip_line(whole, Tile("E", 3000, 0))
        self.assertEqual((len(west_of_seam), len(east_of_seam)), (1, 1))

        def tile_road(part, tile):
            ends = [end for end in (part[0], part[-1]) if abs(end[0] - 3000) < 1e-6]
            direction = seam_direction(whole, ends[0])
            local = part - [tile.west, 0]
            seam = [round(ends[0][0] - tile.west, 2), round(ends[0][1], 2), direction[0], direction[1]]
            return road(np.round(local[::-1] if tile.name == "E" else local, 2), seams=[seam])

        west_ground = land(height=world)
        east_ground = land(height=lambda east, north: world(east + 3000, north))

        def seam_ring(ground, line, ring_end):
            surface = lay_roads([line], ground)
            nodes = surface.conformed[::2, ::2]
            rings = roads.ribbons(surface, nodes, 4.0, 0.0, 3000.0)[0][1]
            return rings[ring_end]

        here = seam_ring(west_ground, tile_road(west_of_seam[0], Tile("W", 0, 0)), -1)
        there = seam_ring(east_ground, tile_road(east_of_seam[0], Tile("E", 3000, 0)), -1) + [3000, 0, 0]
        ends_match = min(np.abs(here - there).max(), np.abs(here - there[::-1]).max())
        self.assertLess(ends_match, 0.002)

    def test_two_tiles_share_their_edge_row_of_heights_however_their_arrays_are_typed(self):
        row = np.array([1.2349999, 7.0049996, 0.0150001], dtype=np.float32)
        single = gzip.decompress(encode_heights(row[None]))
        double = gzip.decompress(encode_heights(row[None].astype(np.float64)))
        self.assertEqual(single, double)


class Spans(unittest.TestCase):
    def strait(self):
        """Land at 3 m with a strait of water 100 m wide from east 1000."""
        def height(east, north):
            return np.where((east > 1000) & (east < 1100), 0.1, 3.0)

        ground = land(height=height)
        rows, columns = np.mgrid[0 : ground.corners.shape[0] + 1, 0 : ground.corners.shape[1] + 1]
        ground.water = ((columns - ground.rim - 1) * 2.0 > 1000) & ((columns - ground.rim - 1) * 2.0 < 1100)
        return ground

    def test_a_bridge_stands_clear_of_the_water_and_the_land_under_it_stays_where_it_was(self):
        ground = self.strait()
        surface = lay_roads([road([(800, 1500), (1300, 1500)], bridge="yes")], ground)
        chain = surface.chains[0]
        over = (chain.xy[:, 0] > 1010) & (chain.xy[:, 0] < 1090)
        self.assertTrue(chain.span[over].all())
        self.assertGreater(chain.height[over].min(), 1.5)
        middle = surface.conformed[750, 525]
        self.assertAlmostEqual(float(middle), 0.1, places=3)

    def test_the_spans_sections_are_reported_between_their_ends(self):
        ground = self.strait()
        line = road([(800, 1500), (1040, 1500)], kind="service"), road([(1040, 1500), (1300, 1500)], kind="service", bridge="yes")
        surface = lay_roads([line[0], line[1]], ground)
        nodes = surface.conformed[::2, ::2]
        _, rings, _, spans = roads.ribbons(surface, nodes, 4.0, 0.0, 3000.0)[0]
        self.assertEqual(len(spans), 1)
        first, last = spans[0]
        self.assertLess(rings[first, 2, 0], 1010)
        self.assertGreater(rings[last, 2, 0], 1090)

    def test_a_culvert_is_only_a_road(self):
        self.assertFalse(roads.find_spans(np.ones(4, dtype=bool), np.zeros(4, dtype=bool)).any())

    def test_a_footbridge_over_land_shapes_it_as_any_path_does(self):
        surface = lay_roads([{**road([(800, 1500), (1300, 1500)], kind="footway", bridge="yes"), "motor": False}], land())
        self.assertFalse(surface.chains[0].span.any())


class Junctions(unittest.TestCase):
    main = road([(0, 1500), (1500, 1500), (3000, 1500)])
    side = road([(1500, 1500), (1500, 2400)], "unclassified")

    def test_a_lesser_road_stops_clear_of_the_greater_and_an_apron_joins_them_at_their_heights(self):
        ground = land(height=lambda east, north: 12 + 0.02 * north + 0.01 * east)
        surface = lay_roads([self.main, self.side], ground)
        main, side = surface.chains
        self.assertEqual(side.start_on, main.index)
        for point in (side.left[0], side.right[0]):
            self.assertGreaterEqual(abs(point[1] - 1500), main.half[0])
            self.assertLess(abs(point[1] - 1500), main.half[0] + 3)
        self.assertTrue(surface.aprons)
        carriageway = np.concatenate([apron.points[apron.across == roads.APRON_ACROSS] for apron in surface.aprons])
        on_main = np.abs(carriageway[:, 1] - 1500) < main.half[0] + 0.1
        self.assertTrue(on_main.any())
        self.assertLess(np.abs(carriageway[on_main, 2] - main.plane(carriageway[on_main, :2])).max(), 0.02)

    def test_the_land_comes_up_to_an_apron_so_it_ends_on_no_step(self):
        def pit(east, north):
            hole = (east > 1486) & (east < 1500) & (north > 1503) & (north < 1516)
            return np.where(hole, 9.0, 10.0)

        ground = land(height=pit)
        surface = lay_roads([self.main, self.side], ground)
        xy, height, _ = roads._apron_stations(surface.aprons, ground)
        in_the_pit = pit(xy[:, 0], xy[:, 1]) == 9.0
        self.assertTrue(in_the_pit.any())
        columns = np.round((xy[in_the_pit, 0] - ground.west) / ground.spacing).astype(int)
        rows = np.round((ground.north - xy[in_the_pit, 1]) / ground.spacing).astype(int)
        self.assertLess(np.abs(surface.conformed[rows, columns] - (height[in_the_pit] - roads.CLEARANCE_M)).max(), 0.1)

    def test_a_shoulder_under_an_apron_stands_clear_of_it(self):
        surface = lay_roads([self.main, self.side], land())
        nodes = surface.conformed[::2, ::2]
        cover = roads.ApronCover(surface.aprons)
        for _, rings, _, _ in roads.ribbons(surface, nodes, 4.0, 0.0, 3000.0):
            for outer, edge in ((rings[:, 0], rings[:, 1]), (rings[:, 4], rings[:, 3])):
                inner = edge[:, :2] + 0.2 * (outer[:, :2] - edge[:, :2]) / np.maximum(np.hypot(*(outer[:, :2] - edge[:, :2]).T)[:, None], 1e-6)
                over = cover.height(inner.astype(float))
                under = ~np.isnan(over)
                self.assertTrue((outer[under, 2] <= over[under] - roads.UNDER_ANOTHER_ROAD_M + 0.05).all())

    def test_a_path_across_an_apron_passes_under_it(self):
        def bank(east, north):
            return 10 + 1.5 * (np.abs(north - 1505) < 2)

        path = {**road([(1480, 1505), (1520, 1505)], "path"), "motor": False}
        surface = lay_roads([self.main, self.side, path], land(height=bank))
        nodes = surface.conformed[::2, ::2]
        cover = roads.ApronCover(surface.aprons)
        crossing = next(rings for chain, rings, _, _ in roads.ribbons(surface, nodes, 4.0, 0.0, 3000.0) if not chain.motor)
        points = crossing[:, 1:4].reshape(-1, 3)
        over = cover.height(points[:, :2].astype(float))
        under = ~np.isnan(over)
        self.assertTrue(under.any())
        self.assertTrue((points[under, 2] < over[under]).all())

    def test_a_road_ending_on_one_that_is_easing_meets_it_as_laid(self):
        ground = land(height=lambda east, north: 10 + 0.1 * np.clip(east - 1500, 0, 30))
        high = road([(1500, 2000), (1500, 1500), (1500, 1000)])
        middle = road([(1500, 1500), (1512, 1500), (2500, 1500)], "unclassified")
        last = road([(1512, 1500), (1512, 1100)], "service")
        surface = lay_roads([high, middle, last], ground)
        lesser = next(chain for chain in surface.chains if chain.kind_name == "service")
        parent = surface.chains[lesser.start_on]
        station = int(parent.tree.query(lesser.xy[0])[1])
        self.assertGreater(abs(float(parent.eased[station])), 0.05)
        self.assertAlmostEqual(float(lesser.height[0]), float(parent.height[station] + parent.eased[station]), delta=0.03)

    def test_a_road_stands_no_lower_past_its_edge_than_at_it(self):
        chain = lay_roads([road([(0, 1500), (1500, 1500), (1700, 1700), (3000, 1700)])], land()).chains[0]
        station = int(np.abs(chain.bank).argmax())
        self.assertGreater(abs(float(chain.bank[station])), 0.02)
        at_edge = chain.xy[station] + chain.normal[station] * chain.half[station]
        beyond = chain.xy[station] + chain.normal[station] * (chain.half[station] + 3)
        self.assertAlmostEqual(float(chain.plane(beyond[None])[0]), float(chain.plane(at_edge[None])[0]), delta=0.02)

    def test_a_shallow_merge_lays_no_road_over_another(self):
        merging = road([(1500, 1500), (2200, 1560), (2900, 1800)], "secondary")
        surface = lay_roads([self.main, merging], land())
        main, lesser = surface.chains
        self.assertTrue(roads._clear_of(main, lesser.left[:, :2]).all())
        self.assertTrue(roads._clear_of(main, lesser.right[:, :2]).all())
        self.assertGreater(float(np.hypot(*(lesser.centre[0, :2] - (1500, 1500)))), 50)
        self.assertTrue(surface.aprons)

    def test_a_roundabout_stays_a_closed_ring_of_its_real_size_and_roads_end_on_it(self):
        angles = np.linspace(0, 2 * np.pi, 25)
        circle = [(1500 + 12 * np.cos(angle), 1500 + 12 * np.sin(angle)) for angle in angles]
        circle[-1] = circle[0]
        ring = road(circle, "primary", junction="roundabout")
        west = road([(0, 1500), circle[12]])
        east = road([circle[0], (3000, 1500)])
        surface = lay_roads([west, ring, east], land(height=lambda east, north: 12 + 0.05 * north + 0.3 * np.sin(east / 9)))
        laid = surface.chains[0]
        self.assertAlmostEqual(float(laid.height[0]), float(laid.height[-1]), places=3)
        self.assertTrue(laid.edges[0].is_ring)
        self.assertEqual(len(surface.chains), 3)
        self.assertLess(np.abs(np.hypot(*(laid.xy - (1500, 1500)).T) - 12).max(), 0.5)
        self.assertTrue(all(0 in (chain.start_on, chain.end_on) for chain in surface.chains[1:]))
        self.assertEqual(laid.tangent[0].tolist(), laid.tangent[-1].tolist())

    def test_a_crossroads_keeps_the_greater_road_whole(self):
        through = road([(1500, 600), (1500, 1500), (1500, 2400)], "unclassified")
        chains = roads.chains_from(roads.split_at_junctions([self.main, through]))
        self.assertEqual(len(chains), 3)
        self.assertEqual(chains[0].kind.rank, 0)
        self.assertEqual({chain.start_on for chain in chains[1:]} | {chain.end_on for chain in chains[1:]}, {0, None})

    def test_a_road_cut_into_ways_runs_on_as_one_chain(self):
        ways = [road([(0, 500), (800, 520)]), road([(800, 520), (1500, 480)]), road([(1500, 480), (2600, 500)], "secondary")]
        self.assertEqual(len(roads.chains_from(roads.split_at_junctions(ways))), 1)


def paved_between(surface, west, east, south, north):
    """The aprons' carriageway points inside a box."""
    points = np.concatenate([apron.points[apron.across == roads.APRON_ACROSS] for apron in surface.aprons]) if surface.aprons else np.zeros((0, 3))
    inside = (points[:, 0] > west) & (points[:, 0] < east) & (points[:, 1] > south) & (points[:, 1] < north)
    return points[inside]


class Surface(unittest.TestCase):
    def test_osm_says_whether_a_road_is_sealed_by_most_of_its_length_and_otherwise_says_nothing(self):
        def sealed(*parts):
            # One line, cut where its surface changes.
            pieces = [{**road([(start, 1500), (end, 1500)], "service", **({"surface": surface} if surface else {})), "id": index} for index, (start, end, surface) in enumerate(parts)]
            return lay_roads(pieces, land()).chains[0].sealed

        self.assertTrue(sealed((1000, 1200, "asphalt"), (1200, 1250, "gravel")))
        self.assertFalse(sealed((1000, 1050, "asphalt"), (1050, 1250, "compacted")))
        self.assertIsNone(sealed((1000, 1250, None)))
        self.assertIsNone(sealed((1000, 1250, "something_new")))


class PavedGround(unittest.TestCase):
    street = road([(0, 1500), (3000, 1500)], "residential")

    def test_a_car_park_is_one_surface_on_the_land_and_its_aisles_are_not_roads(self):
        lot = shapely.box(1450, 1503, 1550, 1560)
        aisles = [road([(1500, 1500), (1500, 1555)], "service"), road([(1455, 1530), (1545, 1530)], "service", service="parking_aisle")]
        # A bay that runs out of the outline to the street, and a walkway across the lot.
        bay = road([(1520, 1500), (1520, 1508)], "service")
        walkway = {**road([(1460, 1510), (1540, 1550)], "footway"), "motor": False}
        ground = land(height=lambda east, north: 10 + 0.01 * east)
        surface = lay_roads([self.street, *aisles, bay, walkway], ground, [lot])
        # Only the entrances from the street stay roads: what lies on the car park is the car park.
        self.assertEqual(sorted(chain.kind_name for chain in surface.chains), ["residential", "service", "service"])
        for chain in surface.chains[1:]:
            self.assertLess(roads._kept_strip(chain).intersection(lot).area, 1.0)
        paved = paved_between(surface, 1450, 1550, 1505, 1560)
        self.assertGreater(len(paved), 100)
        self.assertLess(np.abs(paved[:, 2] - (10 + 0.01 * paved[:, 0])).max(), 0.05)
        self.assertAlmostEqual(sum(apron_area(apron) for apron in surface.aprons), lot.area, delta=lot.area * 0.05)

    def test_a_road_through_a_car_park_stays_a_road(self):
        lot = shapely.box(1450, 1450, 1550, 1550)
        surface = lay_roads([self.street], land(), [lot])
        self.assertEqual(len(surface.chains), 1)
        self.assertEqual(len(paved_between(surface, 1490, 1510, 1499, 1501)), 0)

    def test_the_narrow_land_between_a_street_and_its_sidewalk_is_paved(self):
        sidewalk = {**road([(0, 1504.5), (3000, 1504.5)], "footway"), "motor": False}
        surface = lay_roads([self.street, sidewalk], land())
        gap = paved_between(surface, 1000, 2000, 1502.1, 1503.6)
        self.assertGreater(len(gap), 400)
        self.assertLess(np.abs(gap[:, 2] - 10).max(), 0.1)

    def test_roads_far_apart_or_at_different_heights_keep_the_land_between(self):
        far = road([(0, 1508), (3000, 1508)], "residential")
        self.assertEqual(len(paved_between(lay_roads([self.street, far], land()), 1000, 2000, 1502, 1506)), 0)

        def embankment(east, north):
            return 10 + 1.5 * (north > 1503)

        sidewalk = {**road([(0, 1505), (3000, 1505)], "footway"), "motor": False}
        self.assertEqual(len(paved_between(lay_roads([self.street, sidewalk], land(height=embankment)), 1000, 2000, 1502.3, 1504)), 0)


    def test_a_sidewalk_along_a_car_park_stays_and_the_land_between_them_and_the_street_is_paved(self):
        lot = shapely.box(1450, 1506, 1550, 1560)
        sidewalk = {**road([(1400, 1505), (1600, 1505)], "footway"), "motor": False}
        surface = lay_roads([self.street, sidewalk], land(), [lot])
        self.assertIn("footway", [chain.kind_name for chain in surface.chains])
        self.assertGreater(len(paved_between(surface, 1460, 1540, 1502.1, 1504.1)), 20)

    def test_paving_between_two_car_parks_is_theirs_and_not_a_road_s(self):
        lots = [shapely.box(1450, 1520, 1550, 1600), shapely.box(1450, 1602, 1550, 1680)]
        surface = lay_roads([self.street], land(), lots)
        carriageway = lambda apron: apron.points[apron.across == roads.APRON_ACROSS]
        between = [apron for apron in surface.aprons if carriageway(apron)[:, 1].min() > 1599.5 and carriageway(apron)[:, 1].max() < 1602.5]
        self.assertTrue(between)
        self.assertTrue(all(apron.area for apron in between))
        firsts = [apron.area for apron in surface.aprons]
        self.assertEqual(firsts, sorted(firsts))

    def test_no_shoulder_lies_on_another_surface(self):
        sidewalk = {**road([(0, 1504.5), (3000, 1504.5)], "footway"), "motor": False}
        side = road([(1500, 1500), (1500, 1600)], "service")
        lot = shapely.box(1503, 1506, 1560, 1560)
        surface = lay_roads([self.street, sidewalk, side], land(), [lot])
        cover = roads.ApronCover(surface.aprons)
        carriageways = shapely.union_all([roads._kept_strip(chain) for chain in surface.chains])
        for apron in surface.aprons:
            shoulder = apron.triangles[apron.across[apron.triangles].max(1) == roads.APRON_SHOULDER_OUTER]
            middle = apron.points[shoulder][:, :, :2].mean(axis=1)
            self.assertTrue(np.isnan(cover.height(middle)).all())
            self.assertFalse(shapely.intersects(shapely.points(middle), carriageways).any())


def apron_area(apron):
    road = apron.triangles[apron.across[apron.triangles].max(1) == roads.APRON_ACROSS]
    a, b, c = (apron.points[road[:, index], :2] for index in range(3))
    u, v = b - a, c - a
    return float(np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]).sum() / 2)


class RoadMap(unittest.TestCase):
    def test_a_closed_loop_keeps_its_shape_when_thinned(self):
        loop = np.array([(0.0, 0.0), (10, 0), (10, 10), (0, 10), (0.0, 0.0)])
        self.assertGreater(len(road_map._thin(loop)), 2)


if __name__ == "__main__":
    unittest.main()

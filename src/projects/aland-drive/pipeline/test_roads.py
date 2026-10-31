"""The road surface, on small made-up lands.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline

No network, and no real tile: these pin what a change to the road code could
quietly break, and `road_audit.py` measures the real thing.
"""

import gzip
import unittest

import numpy as np

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

    def test_a_lesser_road_ends_on_the_greater_ones_edge_at_its_height(self):
        ground = land(height=lambda east, north: 12 + 0.02 * north + 0.01 * east)
        surface = lay_roads([self.main, self.side], ground)
        main, side = surface.chains
        self.assertEqual(side.start_on, main.index)
        for point in (side.left[0], side.right[0]):
            self.assertAlmostEqual(abs(point[1] - 1500), main.half[0], delta=0.2)
            self.assertAlmostEqual(point[2], float(main.plane(point[None, :2])[0]), delta=0.01)

    def test_a_crossroads_keeps_the_greater_road_whole(self):
        through = road([(1500, 600), (1500, 1500), (1500, 2400)], "unclassified")
        chains = roads.chains_from(roads.split_at_junctions([self.main, through]))
        self.assertEqual(len(chains), 3)
        self.assertEqual(chains[0].kind.rank, 0)
        self.assertEqual({chain.start_on for chain in chains[1:]} | {chain.end_on for chain in chains[1:]}, {0, None})

    def test_a_road_cut_into_ways_runs_on_as_one_chain(self):
        ways = [road([(0, 500), (800, 520)]), road([(800, 520), (1500, 480)]), road([(1500, 480), (2600, 500)], "secondary")]
        self.assertEqual(len(roads.chains_from(roads.split_at_junctions(ways))), 1)


if __name__ == "__main__":
    unittest.main()

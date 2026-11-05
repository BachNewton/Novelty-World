"""The roads as one paved surface, on small made-up lands.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline

These pin what the paving's design rests on (`docs/ROAD-SURFACES.md`): one height per point on each level, paving and
ground that share their edge, two tiles that cut a road crossing their edge alike, and pieces that keep their own way.
"""

import unittest

import numpy as np
import shapely

import paving
from grid import TILE_SIZE_M, Tile
from roads import Ground
from vectors import clip_line, seam_direction

TILE_M = 1200.0


def land(height=None, west=0.0):
    """A square of 2 m corners, 1.2 km across, its north edge at 1200."""
    rim = 100
    count = int(TILE_M / 2) + 2 * rim + 1
    rows, columns = np.mgrid[0:count, 0:count]
    east, north = west + (columns - rim) * 2.0, TILE_M - (rows - rim) * 2.0
    corners = height(east, north) if height else np.full((count, count), 10.0)
    return Ground(corners.astype(np.float32), 0.0, TILE_M, rim)


def road(line, kind="residential", motor=True, **tags):
    return {"id": hash((kind, tuple(map(tuple, line)))) % 100000, "kind": kind, "motor": motor, "line": [list(map(float, point)) for point in line], **tags}


def hilly(east, north):
    return 12 + 0.02 * east + 3 * np.sin(north / 60) + 0.3 * np.sin(east / 7 + north / 11)


class OneSurface(unittest.TestCase):
    def test_a_sidewalk_beside_its_street_is_one_surface_and_keeps_its_own_look(self):
        street = road([(100, 600), (1100, 600)])
        sidewalk = road([(100, 603.5), (1100, 603.5)], "footway", motor=False)
        paved = paving.lay([street, sidewalk], land(height=hilly))
        polygons = shapely.polygons(np.concatenate((paved.points[paved.triangles][:, :, :2], paved.points[paved.triangles][:, :1, :2]), axis=1))
        # No two triangles lie over each other: the surface has one height wherever it is.
        self.assertAlmostEqual(float(shapely.area(polygons).sum()), shapely.union_all(polygons).area, delta=0.01)
        chains = {chain.kind_name: chain.index for chain in paved.chains}
        way = paved.points[:, 6].astype(int)
        north = paved.points[:, 1]
        self.assertTrue((way[north > 604.6] == chains["footway"]).all())
        self.assertTrue((way[north < 602] == chains["residential"]).all())
        # Where the two meet, one place is one height, whoever's piece it is.
        places = {}
        for x, y, z in np.round(paved.points[:, :3], 3):
            places.setdefault((x, y), set()).add(z)
        self.assertTrue(all(len(heights) == 1 for heights in places.values()))

    def test_the_ground_meets_the_paving_on_the_paving_s_own_points(self):
        ways = [road([(100, 600), (1100, 640)], "tertiary"), road([(600, 619), (600, 1000)]), road([(300, 200), (900, 1000)], "path", motor=False)]
        paved = paving.lay(ways, land(height=hilly))
        cover = paving.Cover(paved.points[paved.triangles][:, :, :3])
        cut = paved.cut_points
        on_node = (np.abs(cut[:, 0] / 4 - np.round(cut[:, 0] / 4)) < 1e-6) & (np.abs(cut[:, 1] / 4 - np.round(cut[:, 1] / 4)) < 1e-6)
        edge = cut[~on_node & (cut[:, 2] > -100)]
        self.assertGreater(len(edge), 100)
        self.assertLess(np.nanmax(np.abs(cover.at(edge[:, :2]) - edge[:, 2])), 0.002)
        # Every cut cell is covered once, by its cut ground and the paving in it.
        cells = paved.cut_cells
        size = int(TILE_M / 4)
        boxes = shapely.box(cells % size * 4.0, TILE_M - (cells // size + 1) * 4.0, (cells % size + 1) * 4.0, TILE_M - cells // size * 4.0)
        cut_area = shapely.area(shapely.polygons(np.concatenate((cut[paved.cut_triangles][:, :, :2], cut[paved.cut_triangles][:, :1, :2]), axis=1))).sum()
        paving_in = shapely.intersection(shapely.union_all(shapely.polygons(np.concatenate((paved.points[paved.triangles][:, :, :2], paved.points[paved.triangles][:, :1, :2]), axis=1))), shapely.union_all(boxes)).area
        self.assertAlmostEqual(cut_area + paving_in, len(cells) * 16.0, delta=len(cells) * 16.0 * 1e-4)

    def test_ways_at_different_heights_side_by_side_are_never_joined_by_a_cliff(self):
        """A street along a bank with a road below it: their outlines touch, but joined, the lower one is dragged up the bank or
        the paving between them is a cliff, which the game drops (`render/roads.ts`), leaving a hole. They stay apart, each on
        its own profile, with the bank between them."""

        def bank(east, north):
            return np.where(north > 602, 14.0, 10.0)

        ways = [road([(100, 606), (1100, 606)], "tertiary"), road([(100, 597.5), (1100, 597.5)])]
        paved = paving.lay(ways, land(height=bank))
        a, b, c = (paved.points[paved.triangles[:, corner], :3] for corner in range(3))
        normal = np.cross(b - a, c - a)
        heights = np.stack((a[:, 2], b[:, 2], c[:, 2]), axis=1)
        cliff = (np.ptp(heights, axis=1) > 1.2) & (np.abs(normal[:, 2]) / np.linalg.norm(normal, axis=1) < np.sqrt(0.5))
        self.assertEqual(int(cliff.sum()), 0)
        for chain in paved.chains:
            own = paved.points[paved.points[:, 6].astype(int) == chain.index]
            self.assertLess(np.abs(own[:, 2] - chain.plane(own[:, :2])).max(), 0.1, chain.kind_name)

    def test_a_road_joining_another_keeps_its_carriageway_through_the_greater_road_s_shoulder(self):
        """A main road's shoulder painted across the mouth of a side road shows as a pale band across that road."""
        main = road([(100, 600), (1100, 600)], "primary")
        side = road([(600, 600), (600, 900)], "residential")
        paved = paving.lay([main, side], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        primary, residential = chains["primary"], chains["residential"]
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        mouth = (np.abs(middle[:, 0] - 600) < residential.half.min()) & (middle[:, 1] > 600 + primary.half.max()) & (middle[:, 1] < 600 + paving.reach_of(primary).max())
        self.assertGreater(int(mouth.sum()), 0)
        self.assertTrue((corners[mouth][:, :, 6].astype(int) == residential.index).all())

    def test_laying_the_roads_never_moves_a_row_of_heights_a_neighbour_shares(self):
        ground = land(height=hilly)
        paved = paving.lay([road([(0, 600), (TILE_M, 600)], "primary"), road([(600, 0), (600, TILE_M)], "tertiary")], ground)
        raw = ground.tile_corners()
        for edge in ((0, ...), (-1, ...), (..., 0), (..., -1)):
            self.assertTrue(np.array_equal(paved.conformed[edge], raw[edge]))


class Seams(unittest.TestCase):
    def test_a_road_built_apart_on_two_tiles_meets_on_the_same_points_along_their_edge(self):
        def world(east, north):
            return 12 + 0.01 * east + 0.2 * np.sin(east / 5 + north / 9)

        whole = np.array([(900 + step * 12.0, 500 + 30 * np.sin(step / 6) + step * 5.0) for step in range(50)])
        # Tiles are 6 km to `clip_line`: these two meet at TILE_M, the only edge the road crosses.
        west_of_seam = clip_line(whole, Tile("W", int(TILE_M) - TILE_SIZE_M, 0))
        east_of_seam = clip_line(whole, Tile("E", int(TILE_M), 0))

        def tile_road(part, west):
            ends = [end for end in (part[0], part[-1]) if abs(end[0] - TILE_M) < 1e-6]
            direction = seam_direction(whole, ends[0])
            seam = [round(ends[0][0] - west, 2), round(ends[0][1], 2), direction[0], direction[1]]
            return road(np.round(part - [west, 0], 2), "tertiary", seams=[seam])

        def on_edge(paved, x):
            points = paved.points[np.abs(paved.points[:, 0] - x) < 1e-3][:, :3]
            return np.unique(np.round(points[:, 1:], 3), axis=0)

        here = on_edge(paving.lay([tile_road(west_of_seam[0], 0)], land(height=world)), TILE_M)
        there = on_edge(paving.lay([tile_road(east_of_seam[0], TILE_M)], land(height=world, west=TILE_M)), 0)
        self.assertGreaterEqual(len(here), 2)
        np.testing.assert_allclose(here, there, atol=0.002)


class Underpasses(unittest.TestCase):
    def test_a_path_through_a_tunnel_keeps_clear_of_the_road_over_it_and_has_walls(self):
        ways = [road([(100, 600), (1100, 600)], "primary"), road([(600, 400), (600, 800)], "cycleway", motor=False, tunnel="yes")]
        paved = paving.lay(ways, land())
        chains = {chain.kind_name: chain.index for chain in paved.chains}
        path = paved.points[paved.points[:, 6].astype(int) == chains["cycleway"]]
        # The deck reaches its carriageway and shoulder either side of its line: the path's points under it stand at its edges.
        primary = paved.chains[chains["primary"]]
        # Over the underpass the deck is the carriageway alone, with no shoulder: the path's points under it stand at its edges.
        self.assertLess(float(paved.reaches[primary.index][np.abs(primary.xy[:, 0] - 600) < 1].max()), float(primary.half.max()) + 0.01)
        under = path[np.abs(path[:, 1] - 600) < primary.half.max() + 0.05]
        deck = paved.points[(paved.points[:, 6].astype(int) == chains["primary"]) & (np.abs(paved.points[:, 0] - 600) < 5)]
        self.assertGreater(len(under), 0)
        self.assertLessEqual(under[:, 2].max(), deck[:, 2].min() - paving.UNDERPASS_CLEAR_M + 0.01)
        upright = paved.cut_points[paved.cut_triangles]
        rise = upright[:, :, 2].max(1) - upright[:, :, 2].min(1)
        across = np.hypot(*(upright[:, :, :2].max(1) - upright[:, :, :2].min(1)).T)
        self.assertTrue(((rise > 1) & (across < 4)).any())


if __name__ == "__main__":
    unittest.main()

"""What a player can see wrong on a paved tile's surface, counted.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/look_census.py <tiles folder> <out.json> L2334E [more tiles]

`paving_audit.py` counts a paved tile's faults by their cause; this counts what shows, the same way on any build, so two
builds compare. The paving is read as it is drawn: each triangle wears one look, a carriageway's asphalt or gravel, a
shoulder, or a path's own surface. Triangles of one look are merged into the shapes a player sees, and each is measured:

- sliver: a part of a carriageway's or a path's shape under half a metre wide and over a metre long, a spike or a strip;
- patch: a whole shape of one look under 3 m2, an island of one surface in another;
- spike: a corner of the carriageways' outline sharper than 55 degrees;
- notch: a corner of it cut in deeper than 120 degrees;
- blend: a triangle whose corners wear different surfaces, drawn as a smear from one to the other.

It counts shapes, not places a driver would notice, so it overstates what is left on quiet back paths and says nothing
of how a place looks. A road whose tile doesn't say what it is made of counts as asphalt. The file written lists every
place with its world east and north, as `?at=` takes them; `paving_window.py` draws one.
"""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapely

import paving_file
from grid import WORLD_ORIGIN
from paving import ACROSS, AREA, CLASS, CLASS_BITS, LOOSE_WAY, SEALED_WAY, WAY
from path_surfaces import BED, COBBLE, GRAVEL, LAWN, NONE, SLAB, STEPS, TARMAC

# Past a carriageway's edge, in half widths: a triangle reaching further out is shoulder.
EDGE_ACROSS = 1.03
THIN_M = 0.25
SLIVER_LEAST_M2 = 0.25
SLIVER_LEAST_M = 1.0
PATCH_M2 = 3.0
SPIKE_DEGREES = 55.0
NOTCH_DEGREES = 120.0
# A corner counts between two sides at least this long, so a curve's own short steps are no corners.
CORNER_LEAST_M = 0.6
OUTLINE_SIMPLIFIED_M = 0.08
ASPHALT, LOOSE, SHOULDER = 100, 101, 102
LOOKS = {ASPHALT: "asphalt carriageway", LOOSE: "gravel carriageway", SHOULDER: "shoulder", STEPS: "steps", LAWN: "lawn", BED: "bed", GRAVEL: "gravel path", TARMAC: "tarmac path", SLAB: "slabs", COBBLE: "setts"}


@dataclass
class Census:
    xy: np.ndarray
    """Each triangle's corners, in the tile's own metres."""
    look: np.ndarray
    """Each triangle's look, a key of `LOOKS`."""
    blended: np.ndarray
    """Whether a triangle's corners wear different surfaces."""
    found: list[tuple[str, str, float, float, float]]
    """Each place a player would see something wrong: its kind, its look, where, and its area or angle."""
    blend_m2: float
    carriageway_m2: float


def census(points: np.ndarray, triangles: np.ndarray, sealed: dict[int, bool], within: shapely.Geometry | None = None) -> Census:
    """A paving's looks and what shows wrong in them, of the triangles whose middle lies `within`, or all of them.
    `sealed` says which ways are asphalt where the paving's own points don't; a way it leaves out is."""
    corners = points[triangles]
    xy = corners[:, :, :2]
    if within is not None:
        middle = xy.mean(axis=1)
        inside = shapely.contains_xy(within, middle[:, 0], middle[:, 1])
        corners, xy = corners[inside], xy[inside]
    area = 0.5 * np.abs((xy[:, 1, 0] - xy[:, 0, 0]) * (xy[:, 2, 1] - xy[:, 0, 1]) - (xy[:, 2, 0] - xy[:, 0, 0]) * (xy[:, 1, 1] - xy[:, 0, 1]))
    said = corners[:, :, CLASS].astype(int) & (CLASS_BITS | SEALED_WAY | LOOSE_WAY)
    kind = (said & CLASS_BITS).max(axis=1)
    way = corners[:, 0, WAY].astype(int)
    is_sealed = np.array([sealed.get(int(index), True) for index in way], dtype=bool)
    is_sealed = np.where((said & SEALED_WAY).any(axis=1), True, np.where((said & LOOSE_WAY).any(axis=1), False, is_sealed))
    carriageway = (kind == NONE) & (np.abs(corners[:, :, ACROSS]).max(axis=1) <= EDGE_ACROSS) & (way != AREA)
    look = np.where(kind != NONE, kind, np.where(carriageway, np.where(is_sealed, ASPHALT, LOOSE), SHOULDER))
    keep = area > 1e-6
    blended = keep & (said.min(axis=1) != said.max(axis=1))
    polygons = shapely.polygons(np.concatenate((xy, xy[:, :1]), axis=1))
    shapes = {int(value): shapely.union_all(polygons[keep & (look == value)], grid_size=0.005) for value in np.unique(look[keep])}
    found = []
    for value, shape in shapes.items():
        if value == SHOULDER:
            continue
        for part in shapely.get_parts(shape):
            if part.geom_type != "Polygon" or part.is_empty:
                continue
            if part.area < PATCH_M2:
                at = part.representative_point()
                found.append(("patch", LOOKS[value], at.x, at.y, part.area))
                continue
            opened = part.buffer(-THIN_M, join_style="mitre").buffer(THIN_M * 1.02, join_style="mitre")
            for thin in shapely.get_parts(_less(part, opened)):
                if thin.geom_type == "Polygon" and thin.area >= SLIVER_LEAST_M2 and thin.length / 2 >= SLIVER_LEAST_M:
                    at = thin.representative_point()
                    found.append(("sliver", LOOKS[value], at.x, at.y, thin.area))
    roads = shapely.union_all([shape for value, shape in shapes.items() if value in (ASPHALT, LOOSE)], grid_size=0.005)
    for part in shapely.get_parts(shapely.simplify(roads, OUTLINE_SIMPLIFIED_M)):
        if part.geom_type != "Polygon" or part.area < PATCH_M2:
            continue
        for ring, inner in [(part.exterior, False)] + [(hole, True) for hole in part.interiors]:
            sign = 1 if ring.is_ccw != inner else -1
            for at, turn in _turns(ring):
                turned = turn * sign
                if turned > 180 - SPIKE_DEGREES:
                    found.append(("spike", "carriageway outline", at[0], at[1], 180 - turned))
                elif turned < -NOTCH_DEGREES:
                    found.append(("notch", "carriageway outline", at[0], at[1], -turned))
    return Census(xy, look, blended, found, float(area[blended].sum()), float(roads.area))


def _less(shape: shapely.Geometry, other: shapely.Geometry) -> shapely.Geometry:
    """One shape less another; on a grid when GEOS can't cut them as they are, and nothing, said aloud, where it still
    can't: a count is short by that shape's slivers rather than lost."""
    try:
        return shape.difference(other)
    except shapely.errors.GEOSException:
        pass
    try:
        return shapely.difference(shapely.make_valid(shapely.set_precision(shape, 0.01)).buffer(0), shapely.make_valid(shapely.set_precision(other, 0.01)).buffer(0), grid_size=0.01)
    except shapely.errors.GEOSException:
        at = shape.representative_point()
        print(f"  a shape at {at.x:.0f},{at.y:.0f} of {shape.area:.0f} m2 could not be measured for slivers", flush=True)
        return shapely.Polygon()


def _turns(ring: shapely.LinearRing) -> list[tuple[np.ndarray, float]]:
    """Each corner of a ring with the angle its outline turns by there, in degrees, positive to the left."""
    xy = np.asarray(ring.coords)[:-1]
    if len(xy) < 4:
        return []
    before, after = xy - np.roll(xy, 1, axis=0), np.roll(xy, -1, axis=0) - xy
    turn = np.degrees(np.arctan2(before[:, 0] * after[:, 1] - before[:, 1] * after[:, 0], (before * after).sum(axis=1)))
    long = (np.hypot(*before.T) >= CORNER_LEAST_M) & (np.hypot(*after.T) >= CORNER_LEAST_M)
    return [(xy[index], float(turn[index])) for index in np.flatnonzero(long)]


def main() -> None:
    folder, out, tiles = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    totals, places = {}, []
    for tile in tiles:
        manifest = json.loads((folder / tile / "tile.json").read_text(encoding="utf-8"))
        laid = paving_file.read_paving(folder / tile, manifest)
        sealed = {index: bool(chain["sealed"]) for index, chain in enumerate(manifest["roadSurface"]["chains"]) if "sealed" in chain}
        counted = census(laid.points, laid.triangles, sealed)
        counts = {"triangles": len(laid.triangles), "blend m2": round(counted.blend_m2), "carriageway m2": round(counted.carriageway_m2)}
        for kind, look, x, y, measure in counted.found:
            counts[kind] = counts.get(kind, 0) + 1
            places.append({"tile": tile, "kind": kind, "look": look, "east": round(x + WORLD_ORIGIN[0], 1), "north": round(y + WORLD_ORIGIN[1], 1), "measure": round(float(measure), 2)})
        totals[tile] = counts
        print(tile, counts, flush=True)
    out.write_text(json.dumps({"totals": totals, "places": places}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()

"""Gives a built tile the assignment without rebuilding it: for the gallery, and as the evidence for the rule.

    pipeline/.venv/Scripts/python art/facades/bake.py <out folder> L2334E [L2334F ...]

A tile's solids are written building after building, walls then roof, so one pass over the tint column finds each
building. It rewrites only their wall tints, into a copy of `solids.bin.gz`, and writes `assigned.json`, what each
building got and why, so the rule's claims can be checked against photos.
"""

import gzip
import json
import sys
import xml.etree.ElementTree as ElementTree
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
PROJECT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(PROJECT / "pipeline")]

import numpy as np  # noqa: E402
import shapely  # noqa: E402
import shapely.affinity  # noqa: E402
from pyproj import Transformer  # noqa: E402
from shapely.geometry import LineString, Point, Polygon  # noqa: E402

import assign  # noqa: E402
import buildings  # noqa: E402
from grid import WORLD_ORIGIN, tile_from_name  # noqa: E402

TILES = PROJECT / ".data" / "tiles"
RAW_OSM = PROJECT / ".data" / "raw" / "osm-api"
REPLACED = HERE / "replaced-solids.json"
INT16_COLUMNS = 7
STREET_REACH_M = 34
SHOP_REACH_M = 6
RURAL_REACH_M = 120
RURAL_BELOW = 14
to_grid = Transformer.from_crs(4326, 3067, always_xy=True)


def world(lon, lat):
    east, north = to_grid.transform(lon, lat)
    return east - WORLD_ORIGIN[0], north - WORLD_ORIGIN[1]


def read_osm(name: str):
    """The tile's named streets, tagged buildings and shops, as untrusted data."""
    streets, tagged, shops = [], [], []
    # A tile too big for one answer of the API came in quarters.
    for path in sorted(RAW_OSM.glob(f"{name}*.xml")):
        nodes = {}
        for _, element in ElementTree.iterparse(path, events=("end",)):
            if element.tag == "node":
                place = (float(element.get("lon")), float(element.get("lat")))
                nodes[element.get("id")] = place
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                if "shop" in tags:
                    shops.append((Point(world(*place)), tags))
                element.clear()
            elif element.tag == "way":
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                points = [world(*nodes[nd.get("ref")]) for nd in element.findall("nd") if nd.get("ref") in nodes]
                if "highway" in tags and "name" in tags and len(points) >= 2:
                    streets.append((LineString(points), tags["name"]))
                if "building" in tags and len(points) >= 4 and points[0] == points[-1]:
                    outline = shapely.make_valid(Polygon(points))
                    tagged.append((outline, tags))
                    if "shop" in tags:
                        shops.append((outline.representative_point(), tags))
                element.clear()
            elif element.tag == "relation":
                element.clear()
    return streets, tagged, shops


def decode(data: bytes, solids: dict) -> list[dict]:
    cells, at = [], 0
    for meta in solids["cells"]:
        vertices, count = meta["vertices"], meta["indices"]
        columns = [np.cumsum(np.frombuffer(data, "<i2", vertices, at + 2 * vertices * column).astype(np.int64)).astype(np.int16) for column in range(INT16_COLUMNS)]
        tints_at = at + 2 * vertices * INT16_COLUMNS
        cells.append({"x": meta["x"], "z": meta["z"], "columns": columns, "tints_at": tints_at, "vertices": vertices})
        at = tints_at + 4 * vertices + 2 * count
    return cells


def spans_of(cell: dict, data: bytes) -> list[tuple[int, int]]:
    """The first and past-last vertex of each building: its walls, then its roof."""
    styles = np.frombuffer(data, np.uint8, cell["vertices"], cell["tints_at"] + 3 * cell["vertices"])
    starts = [0, *(np.nonzero((styles[1:] != 0) & (styles[:-1] == 0))[0] + 1).tolist()]
    return list(zip(starts, [*starts[1:], len(styles)]))


def bake(name: str, out: Path) -> Counter:
    tile = tile_from_name(name)
    folder = TILES / name
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    streets, tagged, shops = read_osm(name)
    street_tree = shapely.STRtree([line for line, _ in streets])
    tag_tree = shapely.STRtree([outline for outline, _ in tagged])
    shop_tree = shapely.STRtree([point for point, _ in shops]) if shops else None
    footprints = buildings.read_footprints(tile)
    west, north = WORLD_ORIGIN
    moved = [shapely.affinity.translate(footprint.shape, -west, -north) for footprint in footprints]
    foot_tree = shapely.STRtree(moved)
    raw = gzip.decompress((folder / "solids.bin.gz").read_bytes())
    data = bytearray(raw)
    cells = decode(raw, manifest["solids"])
    unit = manifest["solids"]["unitM"]

    records = []
    for cell in cells:
        for first, last in spans_of(cell, raw):
            x = cell["x"] + cell["columns"][0][first:last] * unit
            y = cell["columns"][1][first:last] * unit
            z = cell["z"] + cell["columns"][2][first:last] * unit
            middle = Point(float(np.mean(x)), float(-np.mean(z)))
            eaves_all = cell["columns"][6][first:last] * unit
            eaves = float(np.median(eaves_all[eaves_all > 0]))
            roof_y = y[np.frombuffer(raw, np.uint8, cell["vertices"], cell["tints_at"] + 3 * cell["vertices"])[first:last] == assign.ROOF]
            rise = float(np.ptp(roof_y)) if len(roof_y) else 0.0
            found = foot_tree.query(middle, predicate="dwithin", distance=3)
            kind = footprints[int(found[0])].kind if len(found) else 0
            hull = shapely.MultiPoint(np.column_stack((x, -z))).convex_hull
            area = moved[int(found[0])].area if len(found) else hull.area
            tags = next((tagged[at][1] for at in tag_tree.query(middle) if tagged[at][0].contains(middle)), {})
            street_at = street_tree.query_nearest(middle, max_distance=STREET_REACH_M)
            street = streets[int(street_at[0])][1] if len(street_at) else None
            kerb = streets[int(street_at[0])][0].interpolate(streets[int(street_at[0])][0].project(middle)) if len(street_at) else None
            near_shops = shop_tree.query(hull.buffer(SHOP_REACH_M)) if shop_tree is not None else []
            shop = next((shops[at][1] for at in near_shops), None)
            records.append({"cell": cell, "first": first, "last": last, "x": middle.x, "y": middle.y, "kind": kind, "area": area, "eaves": eaves, "rise": rise, "fill": min(1.0, area / max(hull.area, 1.0)), "tags": tags, "street": street, "shop": shop, "kerb": kerb})

    places = shapely.STRtree([Point(record["x"], record["y"]) for record in records])
    summary: Counter = Counter()
    assigned = []
    for record in records:
        cell, first, last = record["cell"], record["first"], record["last"]
        tints_at, vertices = cell["tints_at"], cell["vertices"]
        neighbours = len(places.query(Point(record["x"], record["y"]), predicate="dwithin", distance=RURAL_REACH_M))
        seed = data[tints_at + 2 * vertices + first] * 257 + first * 31 + round(abs(record["x"]))
        facts = assign.Facts(record["kind"], record["area"], record["eaves"], record["rise"], seed, record["street"], record["tags"], record["shop"], neighbours < RURAL_BELOW, record["fill"])
        choice = assign.choose(facts)
        summary[(record["kind"], choice.why if choice else "kept")] += 1
        assigned.append({"east": round(record["x"] + west, 1), "north": round(record["y"] + north, 1), "kind": record["kind"], "area": round(record["area"]), "eaves": round(record["eaves"], 1), "rise": round(record["rise"], 1), "street": record["street"], "style": choice.style if choice else None, "paint": assign.IDS["paints"][choice.paint] if choice else None, "why": choice.why if choice else "kept", "word": assign.IDS["words"][choice.word] if choice and choice.front else None, "osm": record["tags"].get("building"), "kerb": [round(record["kerb"].x + west, 1), round(record["kerb"].y + north, 1)] if record["kerb"] else None})
        if choice is None:
            continue
        for vertex in range(first, last):
            if data[tints_at + 3 * vertices + vertex] == assign.ROOF:
                continue
            door = data[tints_at + vertices + vertex] > 127
            red, green, blue, alpha = choice.tint(door, data[tints_at + 2 * vertices + vertex])
            data[tints_at + vertex] = red
            data[tints_at + vertices + vertex] = green
            data[tints_at + 2 * vertices + vertex] = blue
            data[tints_at + 3 * vertices + vertex] = alpha
    target = out / name
    target.mkdir(parents=True, exist_ok=True)
    (target / "solids.bin.gz").write_bytes(gzip.compress(bytes(data), 6))
    (target / "assigned.json").write_text(json.dumps(assigned, ensure_ascii=False), encoding="utf-8")
    return summary


def drop_replaced(name: str, out: Path) -> int:
    """Takes the solids the models replace out of a tile's mesh: what `FALSE_SOLIDS` does in the pipeline, here after the fact."""
    target = out / name / "solids.bin.gz"
    source = target if target.exists() else TILES / name / "solids.bin.gz"
    manifest = json.loads((TILES / name / "tile.json").read_text(encoding="utf-8"))
    raw = gzip.decompress(source.read_bytes())
    data = bytearray(raw)
    unit = manifest["solids"]["unitM"]
    west, north = WORLD_ORIGIN
    replaced = [Point(solid["east"] - west, solid["north"] - north) for solid in json.loads(REPLACED.read_text(encoding="utf-8"))]
    dropped = 0
    for cell, meta in zip(decode(raw, manifest["solids"]), manifest["solids"]["cells"]):
        indices_at = cell["tints_at"] + 4 * cell["vertices"]
        indices = np.frombuffer(raw, "<u2", meta["indices"], indices_at).copy()
        for first, last in spans_of(cell, raw):
            x = cell["x"] + cell["columns"][0][first:last] * unit
            z = cell["z"] + cell["columns"][2][first:last] * unit
            middle = Point(float((x.min() + x.max()) / 2), float(-(z.min() + z.max()) / 2))
            if any(middle.distance(point) < 9 for point in replaced):
                indices[(indices >= first) & (indices < last)] = 0
                dropped += 1
        data[indices_at : indices_at + indices.size * 2] = indices.astype("<u2").tobytes()
    (out / name).mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress(bytes(data), 6))
    return dropped


if __name__ == "__main__":
    out_folder = Path(sys.argv[1])
    for tile_name in sys.argv[2:]:
        counted = bake(tile_name, out_folder)
        print(tile_name)
        for (kind, why), count in sorted(counted.items(), key=lambda item: (item[0][1], item[0][0])):
            print(f"  {kind}: {why}: {count}")
    for sheet in sorted({solid["sheet"] for solid in json.loads(REPLACED.read_text(encoding="utf-8"))}):
        print(sheet, "dropped", drop_replaced(sheet, out_folder))

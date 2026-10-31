"""Runs `bake_surface` on a built tile, for the gallery, until `pipeline/` calls it itself.

    pipeline/.venv/Scripts/python art/town-ground/bake_tile.py L2334E <out folder>
"""

import gzip
import json
import sys
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
from PIL import Image
from shapely.geometry import LineString, Point, Polygon, box

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
sys.path.insert(0, str(PROJECT / "pipeline"))
sys.path.insert(0, str(HERE))
from bake_surface import Ribbon, apply_way_surfaces, bake_surface, classify_osm, polygons_from_outers  # noqa: E402
from grid import lonlat_to_grid, to_local  # noqa: E402

TILE_M = 6000.0
RIM_M = 64.0
SECTION_FLOATS = 15


def read_osm(files: list[Path], window: Polygon) -> tuple[list[dict], list[dict]]:
    roots = [ElementTree.parse(path).getroot() for path in files]
    nodes = {node.get("id"): (float(node.get("lon")), float(node.get("lat"))) for root in roots for node in root.iter("node")}
    ids = list(nodes)
    east, north = lonlat_to_grid([nodes[id][0] for id in ids], [nodes[id][1] for id in ids])
    x, y = to_local(np.asarray(east), np.asarray(north))
    places = {id: (float(a), float(b)) for id, a, b in zip(ids, x, y)}
    tags_of = lambda element: {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
    ways = {way.get("id"): way for root in roots for way in root.iter("way")}
    relations = {relation.get("id"): relation for root in roots for relation in root.iter("relation")}
    line_of = lambda way: [places[nd.get("ref")] for nd in way.findall("nd") if nd.get("ref") in places]

    elements: list[dict] = []
    roads: list[dict] = []
    for way in ways.values():
        tags = tags_of(way)
        line = line_of(way)
        if len(line) < 2:
            continue
        closed = line[0] == line[-1] and len(line) > 3
        is_line = "barrier" in tags or tags.get("highway") not in (None, "pedestrian") or (not closed)
        if "highway" in tags and not (closed and tags.get("area") == "yes"):
            roads.append({"line": LineString(line), "kind": tags["highway"], "surface": tags.get("surface", ""), "footway": tags.get("footway", "")})
        if is_line and not (closed and "barrier" not in tags):
            elements.append({"tags": tags, "geometry": LineString(line)})
        elif closed:
            polygon = Polygon(line).buffer(0)
            if polygon.geom_type == "Polygon" and polygon.intersects(window):
                elements.append({"tags": tags, "geometry": polygon})
    for relation in relations.values():
        tags = tags_of(relation)
        if tags.get("type") != "multipolygon":
            continue
        member = lambda role: [line_of(ways[m.get("ref")]) for m in relation.findall("member") if m.get("type") == "way" and m.get("role") == role and m.get("ref") in ways]
        for polygon in polygons_from_outers(member("outer"), member("inner")):
            if polygon.intersects(window):
                elements.append({"tags": tags, "geometry": polygon})
    for root in roots:
        for node in root.iter("node"):
            tags = tags_of(node)
            if tags.get("amenity") == "fountain":
                elements.append({"tags": tags, "geometry": Point(places[node.get("id")])})
    return elements, roads


def read_ribbons(folder: Path, manifest: dict) -> list[Ribbon]:
    raw = gzip.decompress((folder / manifest["roadSurface"]["file"]).read_bytes())
    total = sum(chain["sections"] for chain in manifest["roadSurface"]["chains"])
    rings = np.frombuffer(raw, "<f4", total * SECTION_FLOATS).reshape(total, 5, 3).astype(np.float64)
    ribbons = []
    at = 0
    for chain in manifest["roadSurface"]["chains"]:
        ribbons.append(Ribbon(rings[at : at + chain["sections"], :, :2], chain["kind"], chain["motor"]))
        at += chain["sections"]
    return ribbons


def main(name: str, out: Path) -> None:
    folder = PROJECT / ".data" / "tiles" / name
    manifest = json.loads((folder / "tile.json").read_text("utf8"))
    bounds = manifest["bounds"]
    window = box(bounds["west"] - RIM_M, bounds["south"] - RIM_M, bounds["east"] + RIM_M, bounds["north"] + RIM_M)
    raw = PROJECT / ".data" / "raw" / "osm-api"
    files = sorted(raw.glob(f"{name}.[0-9].xml")) or [raw / f"{name}.xml"]
    elements, ways = read_osm(files, window)
    layers = classify_osm(elements)
    ribbons = read_ribbons(folder, manifest)
    photo = np.asarray(Image.open(folder / "ground.webp").convert("RGB"), np.float32) / 255
    water = np.asarray(Image.open(folder / "mask.png"))[..., 0] > 128
    footprints = [Polygon(item["ring"]).buffer(0) for item in json.loads((folder / "buildings.json").read_text("utf8"))["buildings"]]
    footprints = [shape for shape in footprints if shape.geom_type == "Polygon" and shape.area > 0]
    bake = bake_surface(bounds["west"], bounds["north"], TILE_M, layers, ribbons, footprints, photo, water)
    apply_way_surfaces(ribbons, bake, ways)

    out.mkdir(parents=True, exist_ok=True)
    bake.image.tofile(out / f"{name}-surface.rgba")
    (out / f"{name}-surface.rgba.gz").write_bytes(gzip.compress(bake.image.tobytes(), 9))
    np.concatenate(bake.ribbon_classes).astype(np.uint8).tofile(out / f"{name}-ribbons.bin")
    hedges = [[[round(x, 2), round(-y, 2)] for x, y in line.coords] for line in bake.hedges]
    fountains = [[round(point.x, 2), round(-point.y, 2)] for point in bake.fountains]
    (out / f"{name}-props.json").write_text(json.dumps({"hedges": hedges, "fountains": fountains}))
    counts = np.bincount(bake.classes.ravel(), minlength=8)
    print({int(c): round(float(n) / 1e4, 1) for c, n in enumerate(counts) if n}, "ha by class")
    print(len(hedges), "hedges", len(fountains), "fountains", (out / f"{name}-surface.rgba.gz").stat().st_size / 1e6, "MB")
    palette = np.array([[0, 0, 0], [0, 0, 0], [60, 170, 70], [120, 60, 30], [190, 150, 90], [90, 90, 110], [210, 210, 210], [230, 90, 60]], np.uint8)
    Image.fromarray(palette[bake.classes]).save(out / f"{name}-classes.png")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]))

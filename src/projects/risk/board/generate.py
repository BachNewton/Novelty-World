"""Draws Risk's board from Natural Earth's public-domain admin-1 data.

Usage (from any directory; needs Python 3.12+ with shapely 2.1+):

    python -I generate.py <ne_10m_admin_1_states_provinces.geojson> <out board-data.ts> [preview.svg]

Download the GeoJSON into a directory of its own (it is untrusted input):
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson

The board is stylised the way Risk boards are, so every territory can be read and tapped:

1. Each province is given to a territory (RULES.md MAP-1), or dropped (remote islands).
2. The world is projected (Miller), cut at the Bering Strait so Alaska sits at the left edge and
   Kamchatka at the right, and magnified smoothly round the crowded places (Europe, Central
   America, the Malay archipelago, Japan) with radial lenses. A lens only stretches the plane, so
   borders stay borders.
3. Small islands go, the coastline is simplified as a coverage (neighbours keep one shared
   border), and a few islands are scaled up round their own middle.
4. It checks the result against map.ts's adjacency: two territories that touch must be
   neighbours, and neighbours that don't touch get a sea line.
"""

import json
import math
import sys

import numpy as np
import shapely
import shapely.affinity
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import nearest_points, polylabel

# ---------------------------------------------------------------------------
# Which province belongs to which territory
# ---------------------------------------------------------------------------

COUNTRIES = {
    "north-america": {},
    "greenland": ["GRL"],
    "central-america": ["MEX", "GTM", "BLZ", "HND", "SLV", "NIC", "CRI", "PAN", "CUB", "JAM", "HTI", "DOM", "PRI", "BHS"],
    "venezuela": ["VEN", "COL", "GUY", "SUR", "TTO"],
    "peru": ["PER", "ECU", "BOL"],
    "brazil": ["BRA"],
    "argentina": ["ARG", "CHL", "URY", "PRY", "FLK"],
    "iceland": ["ISL"],
    "great-britain": ["GBR", "IRL", "IMN"],
    "scandinavia": ["NOR", "SWE", "FIN", "ALD"],
    "northern-europe": ["DNK", "DEU", "POL", "NLD", "BEL", "LUX", "CZE", "SVK", "AUT", "CHE", "LIE"],
    "western-europe": ["FRA", "ESP", "PRT", "AND", "MCO", "GIB"],
    "southern-europe": ["ITA", "SMR", "VAT", "MLT", "SVN", "HRV", "BIH", "SRB", "MNE", "KOS", "ALB", "MKD", "GRC", "BGR", "HUN", "ROU"],
    "ukraine": ["UKR", "BLR", "EST", "LVA", "LTU", "MDA", "RUS"],
    "north-africa": ["MAR", "SAH", "DZA", "TUN", "MRT", "MLI", "NER", "SEN", "GMB", "GNB", "GIN", "SLE", "LBR", "CIV", "BFA", "GHA", "TGO", "BEN", "NGA", "TCD"],
    "egypt": ["EGY", "LBY"],
    "east-africa": ["SDN", "SDS", "ETH", "ERI", "DJI", "SOM", "SOL", "KEN", "UGA", "TZA", "RWA", "BDI"],
    "congo": ["COD", "COG", "GAB", "GNQ", "CMR", "CAF", "AGO"],
    "south-africa": ["ZAF", "NAM", "BWA", "ZWE", "MOZ", "ZMB", "MWI", "LSO", "SWZ"],
    "madagascar": ["MDG"],
    "middle-east": ["TUR", "SYR", "LBN", "ISR", "PSX", "JOR", "IRQ", "IRN", "SAU", "YEM", "OMN", "ARE", "QAT", "BHR", "KWT", "GEO", "ARM", "AZE", "CYP", "CYN", "ESB", "WSB"],
    "afghanistan": ["AFG", "TKM", "UZB", "TJK", "KGZ", "KAZ", "KAB"],
    "india": ["IND", "PAK", "NPL", "BTN", "BGD", "LKA", "KAS"],
    "siam": ["MMR", "THA", "LAO", "KHM", "VNM", "SGP", "MYS"],
    "china": ["CHN", "HKG", "MAC", "TWN"],
    "mongolia": ["MNG", "PRK", "KOR"],
    "japan": ["JPN"],
    "indonesia": ["IDN", "BRN", "TLS", "PHL"],
    "new-guinea": ["PNG"],
}
del COUNTRIES["north-america"]

# Provinces of split countries, by ISO 3166-2 code; they override the country's territory.
PROVINCES = {
    "alaska": ["US-AK"],
    "western-united-states": ["US-" + s for s in "WA OR CA NV ID MT WY UT CO AZ NM ND SD NE KS OK TX".split()],
    "eastern-united-states": ["US-" + s for s in "MN IA MO AR LA WI IL MI IN OH KY TN MS AL GA FL SC NC VA WV MD DE PA NJ NY CT RI MA VT NH ME DC".split()],
    "northwest-territory": ["CA-YT", "CA-NT", "CA-NU"],
    "alberta": ["CA-BC", "CA-AB"],
    "ontario": ["CA-SK", "CA-MB", "CA-ON"],
    "quebec": ["CA-QC", "CA-NL", "CA-NB", "CA-NS", "CA-PE"],
    "venezuela": ["FR-GF"],
    "ural": ["RU-SVE", "RU-CHE", "RU-KGN", "RU-TYU", "RU-KHM", "RU-YAN", "RU-X01~", "KZ-SEV", "KZ-PAV", "KZ-VOS"],
    "siberia": ["RU-OMS", "RU-NVS", "RU-TOM", "RU-ALT", "RU-AL", "RU-KEM", "RU-KYA", "RU-TY", "RU-KK"],
    "yakutsk": ["RU-SA"],
    "irkutsk": ["RU-IRK", "RU-BU", "RU-ZAB"],
    "kamchatka": ["RU-KAM", "RU-CHU", "RU-MAG", "RU-KHA", "RU-AMU", "RU-YEV", "RU-PRI", "RU-SAK"],
    "mongolia": ["CN-NM", "CN-HL", "CN-JL", "CN-LN"],
    "indonesia": ["MY-12", "MY-13", "MY-15"],
    "new-guinea": ["ID-PA", "ID-PB"],
    "western-australia": ["AU-WA", "AU-NT", "AU-SA"],
    "eastern-australia": ["AU-QLD", "AU-NSW", "AU-VIC", "AU-TAS", "AU-ACT", "AU-X02~"],
}

# Provinces left off the board: remote islands that would only clutter it.
DROPPED = {
    "US-HI", "NO-21", "NO-X01~", "ES-CE", "ES-ML", "ES-TF", "ES-GC", "PT-30", "PT-20", "EC-W",
    "FR-MQ", "FR-GP", "FR-RE", "FR-YT", "AU-X03~", "CN-X01~",
}
DROPPED_NAMES = {"Lord Howe Island", "Bonaire", "Saba", "St. Eustatius"}

# ---------------------------------------------------------------------------
# Projection and stylisation
# ---------------------------------------------------------------------------

CUT = -169.0  # longitude of the board's left edge, in the Bering Strait


def miller_y(lat):
    phi = math.radians(max(-85.0, min(85.0, lat)))
    return -math.degrees(1.25 * math.log(math.tan(math.pi / 4 + 0.4 * phi)))


# Radial lenses (centre lon, centre lat, radius in degrees, magnification at the centre). A lens
# maps r to r * (1 + (k - 1) * exp(-(r / R)^2)), which keeps increasing for k below about 3, so
# it never folds the plane over itself.
LENSES = [
    (12.0, 50.0, 19.0, 2.5),  # Europe
    (-86.0, 15.0, 10.0, 1.9),  # Central America
    (118.0, -2.0, 15.0, 1.7),  # the Malay archipelago
    (136.0, 37.0, 8.0, 1.8),  # Japan and Korea
    (35.0, 33.0, 9.0, 1.3),  # the Levant
]

# Islands scaled up round their own middle, after simplifying.
ISLAND_SCALE = {"iceland": 1.6, "great-britain": 1.1, "madagascar": 1.25, "japan": 1.15, "new-guinea": 1.1}


def project(lon, lat):
    x, y = lon, miller_y(lat)
    for clon, clat, radius, k in LENSES:
        cx, cy = clon, miller_y(clat)
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        if r == 0:
            continue
        f = 1 + (k - 1) * math.exp(-((r / radius) ** 2))
        x, y = cx + dx * f, cy + dy * f
    return x, y


def _project_array(coords):
    out = np.empty_like(coords)
    for i, (lon, lat) in enumerate(coords):
        out[i] = project(lon, lat)
    return out


def polygons(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for part in geom.geoms for g in polygons(part)]


# ---------------------------------------------------------------------------
# The pipeline
# ---------------------------------------------------------------------------

WIDTH = 1200  # the board's width in SVG units
MIN_PART = 2.5  # smallest island kept, in square degree-units
SIMPLIFY = 0.45  # coverage simplification tolerance, in degree-units

# Territories whose islands and inlets are closed up into one chunkier shape (a morphological
# closing, in degree-units), the way a board draws an archipelago as one piece of land.
CLOSE = {
    "northwest-territory": 2.2,
    "greenland": 1.0,
    "quebec": 0.8,
    "japan": 1.2,
    "indonesia": 1.4,
    "new-guinea": 0.8,
    "scandinavia": 0.8,
    "great-britain": 0.5,
    "southern-europe": 0.5,
    "kamchatka": 0.8,
    "central-america": 0.4,
    "argentina": 0.6,
    "alaska": 0.8,
}


def territory_of(props):
    code = props.get("iso_3166_2") or ""
    if code in DROPPED or props.get("name") in DROPPED_NAMES:
        return None
    for territory, codes in PROVINCES.items():
        if code in codes:
            return territory
    a3 = props.get("adm0_a3")
    if a3 in ("USA", "CAN", "AUS"):
        raise SystemExit(f"unassigned province of a split country: {code} {props.get('name')}")
    for territory, countries in COUNTRIES.items():
        if a3 in countries:
            return territory
    return None


def main():
    source, out_ts = sys.argv[1], sys.argv[2]
    preview = sys.argv[3] if len(sys.argv) > 3 else None
    with open(source, encoding="utf-8") as f:
        features = json.load(f)["features"]

    parts = {}
    dropped = {}
    for feature in features:
        props = feature["properties"]
        territory = territory_of(props)
        if territory is None:
            dropped[props.get("admin")] = dropped.get(props.get("admin"), 0) + 1
            continue
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = shapely.make_valid(geom)
        # Land west of the cut (Chukotka's tip) moves to the board's far right, a whole polygon
        # at a time so none is torn across the edge.
        geom = shapely.union_all(
            [shapely.affinity.translate(p, 360.0) if p.centroid.x < CUT else p for p in polygons(geom)]
        )
        geom = shapely.transform(geom, _project_array)
        parts.setdefault(territory, []).append(geom)

    print("dropped countries/places:", sorted(k for k in dropped if k), file=sys.stderr)

    ids = [line.split('"')[1] for line in open(_map_ts(), encoding="utf-8") if line.strip().startswith('{ id: "') and "continent:" in line and "symbol:" in line]
    continents = {}
    for line in open(_map_ts(), encoding="utf-8"):
        s = line.strip()
        if s.startswith('{ id: "') and "symbol:" in s:
            continents[s.split('"')[1]] = s.split('continent: "')[1].split('"')[0]
    missing = set(ids) - set(parts)
    if missing:
        raise SystemExit(f"territories with no land: {sorted(missing)}")

    geoms = {}
    for territory in ids:
        merged = shapely.union_all([shapely.set_precision(g, 0.001) for g in parts[territory]])
        kept = [p for p in polygons(merged) if p.area >= MIN_PART]
        if territory == "alaska":
            kept = [p for p in kept if p.centroid.x < -129]
        if not kept:
            kept = [max(polygons(merged), key=lambda p: p.area)]
        kept = [Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= MIN_PART]) for p in kept]
        geoms[territory] = MultiPolygon(kept)

    # Close up archipelagos, never into a neighbour's land.
    taken = shapely.union_all(list(geoms.values()))
    for territory, radius in CLOSE.items():
        g = geoms[territory]
        closed = g.buffer(radius, join_style="round").buffer(-radius, join_style="round")
        others = shapely.difference(taken, g)
        grown = shapely.difference(closed, others)
        geoms[territory] = MultiPolygon([p for p in polygons(shapely.make_valid(grown)) if p.area >= MIN_PART])
        taken = shapely.union(taken, geoms[territory])

    # Simplify as one coverage so neighbours keep one shared border.
    order = list(geoms)
    before = sum(shapely.get_num_coordinates(g) for g in geoms.values())
    simplified = shapely.coverage_simplify([geoms[t] for t in order], SIMPLIFY)
    geoms = {t: shapely.make_valid(g) for t, g in zip(order, simplified)}
    print("vertices:", before, "->", sum(shapely.get_num_coordinates(g) for g in geoms.values()), file=sys.stderr)

    for territory, factor in ISLAND_SCALE.items():
        g = geoms[territory]
        c = max(polygons(g), key=lambda p: p.area).centroid
        geoms[territory] = shapely.affinity.scale(g, factor, factor, origin=c)

    # Fit to the board.
    minx, miny, maxx, maxy = shapely.union_all(list(geoms.values())).bounds
    margin = 2.0
    scale = WIDTH / (maxx - minx + 2 * margin)
    height = round((maxy - miny + 2 * margin) * scale)

    def to_board(g):
        return shapely.affinity.affine_transform(g, [scale, 0, 0, scale, (margin - minx) * scale, (margin - miny) * scale])

    geoms = {t: to_board(g) for t, g in geoms.items()}

    adjacency = _adjacency()
    touching = set()
    for i, a in enumerate(order):
        for b in order[i + 1 :]:
            inter = geoms[a].buffer(0.3).intersection(geoms[b].buffer(0.3))
            if inter.area > 1.0:
                touching.add((a, b))
    errors = []
    for a, b in sorted(touching):
        if b not in adjacency[a]:
            errors.append(f"{a} touches {b}, which is not its neighbour")
    sea = []
    for a in order:
        for b in adjacency[a]:
            if a < b and (a, b) not in touching and (b, a) not in touching:
                sea.append((a, b))

    def board_point(lon, lat):
        x, y = project(lon, lat)
        return ((x - minx + margin) * scale, (y - miny + margin) * scale)

    lines = []
    for a, b in sea:
        if {a, b} == {"alaska", "kamchatka"}:
            continue
        via = [board_point(*p) for p in SEA_WAYPOINTS.get((a, b), [])]
        if via:
            pa = nearest_points(geoms[a], shapely.Point(via[0]))[0]
            pb = nearest_points(geoms[b], shapely.Point(via[-1]))[0]
        else:
            pa, pb = nearest_points(geoms[a], geoms[b])
        points = [(pa.x, pa.y), *via, (pb.x, pb.y)]
        lines.append((a, b, points))
    # Alaska and Kamchatka meet across the board's edge.
    alaska_w = min(_coords(geoms["alaska"]), key=lambda p: p[0])
    kam_e = max(_coords(geoms["kamchatka"]), key=lambda p: p[0])
    edge = ((alaska_w[0], alaska_w[1]), (kam_e[0], kam_e[1]))

    labels = {}
    for t, g in geoms.items():
        biggest = max(polygons(g), key=lambda p: p.area)
        p = polylabel(biggest, tolerance=0.5)
        labels[t] = (round(p.x, 1), round(p.y, 1))
    for t, (dx, dy) in LABEL_NUDGE.items():
        labels[t] = (round(labels[t][0] + dx, 1), round(labels[t][1] + dy, 1))

    paths = {t: _path(g) for t, g in geoms.items()}
    continent_paths = {}
    for cont in dict.fromkeys(continents.values()):
        u = shapely.union_all([shapely.set_precision(geoms[t], 0.5) for t in order if continents[t] == cont])
        continent_paths[cont] = _path(u)

    for e in errors:
        print("ERROR", e, file=sys.stderr)
    print("sea lines:", [(a, b) for a, b, *_ in lines], file=sys.stderr)
    print("board", WIDTH, "x", height, file=sys.stderr)

    _write_ts(out_ts, height, order, paths, labels, continent_paths, lines, edge)
    if preview:
        _write_preview(preview, height, order, paths, labels, continent_paths, lines, edge, continents)
    if errors:
        raise SystemExit(1)


# Sea lines that would cross other land, bent round it through these points (lon, lat), in the
# order of the pair as map.ts lists it first.
SEA_WAYPOINTS = {
    ("greenland", "ontario"): [(-62, 60.5), (-71, 62.3), (-79, 61.5), (-84, 58.5)],
}


# Where a territory's label sits, nudged from its pole of inaccessibility (board units).
LABEL_NUDGE = {}


def _coords(g):
    return [c for p in polygons(g) for c in p.exterior.coords]


def _map_ts():
    import os

    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "map.ts")


def _adjacency():
    adjacency = {}
    inside = False
    for line in open(_map_ts(), encoding="utf-8"):
        s = line.strip()
        if s.startswith("export const ADJACENCY"):
            inside = True
            continue
        if inside and s.startswith("};"):
            break
        if inside and s.startswith('"'):
            name = s.split('"')[1]
            adjacency[name] = [x.split('"')[1] for x in s.split("[")[1].split(",") if '"' in x]
    return adjacency


def _ring(coords):
    pts = [(round(x), round(y)) for x, y in coords]
    dedup = [pts[0]]
    for p in pts[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    if dedup[-1] == dedup[0]:
        dedup.pop()
    if len(dedup) < 3:
        return ""
    out = [f"M{dedup[0][0]} {dedup[0][1]}"]
    px, py = dedup[0]
    rel = []
    for x, y in dedup[1:]:
        rel.append(f"{x - px} {y - py}".replace(" -", "-"))
        px, py = x, y
    return out[0] + "l" + " ".join(rel).replace(" -", "-") + "z"


def _path(g):
    rings = []
    for p in polygons(g):
        rings.append(_ring(p.exterior.coords))
        rings.extend(_ring(r.coords) for r in p.interiors)
    return "".join(r for r in rings if r)


def _write_ts(out, height, order, paths, labels, continent_paths, lines, edge):
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Generated by generate.py from Natural Earth's admin-1 data (public domain). Don't edit by hand:\n")
        f.write("// change the generator and run it again.\n\n")
        f.write('import type { ContinentId, TerritoryId } from "../map";\n\n')
        f.write(f"export const BOARD_WIDTH = {WIDTH};\nexport const BOARD_HEIGHT = {height};\n\n")
        f.write("/** Each territory's outline as an SVG path, and where its army count sits. */\n")
        f.write("export const TERRITORY_SHAPES: Record<TerritoryId, { path: string; label: readonly [number, number] }> = {\n")
        for t in order:
            f.write(f'  "{t}": {{ label: [{labels[t][0]}, {labels[t][1]}], path: "{paths[t]}" }},\n')
        f.write("};\n\n")
        f.write("/** Each continent's outline, drawn over its territories. */\n")
        f.write("export const CONTINENT_OUTLINES: Record<ContinentId, string> = {\n")
        for c, p in continent_paths.items():
            f.write(f'  "{c}": "{p}",\n')
        f.write("};\n\n")
        f.write("/** Neighbours that don't share a border, joined by a line across the sea. */\n")
        f.write("export const SEA_LINES: readonly { between: readonly [TerritoryId, TerritoryId]; points: string }[] = [\n")
        for a, b, points in lines:
            pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
            f.write(f'  {{ between: ["{a}", "{b}"], points: "{pts}" }},\n')
        f.write("];\n\n")
        f.write("/** Alaska and Kamchatka meet across the board's edge: a line from each runs off its side. */\n")
        f.write(f"export const EDGE_LINE = {{ alaska: [{edge[0][0]:.1f}, {edge[0][1]:.1f}], kamchatka: [{edge[1][0]:.1f}, {edge[1][1]:.1f}] }} as const;\n")


def _write_preview(out, height, order, paths, labels, continent_paths, lines, edge, continents):
    hues = {"north-america": "#d9b44a", "south-america": "#c8643c", "europe": "#5a7fc0", "africa": "#b08a4a", "asia": "#6aa860", "australia": "#a05aa8"}
    with open(out, "w", encoding="utf-8") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {height}" width="{WIDTH*2}" style="background:#1d3440">')
        for t in order:
            f.write(f'<path d="{paths[t]}" fill="{hues[continents[t]]}" stroke="#222" stroke-width="0.6"/>')
        for c, p in continent_paths.items():
            f.write(f'<path d="{p}" fill="none" stroke="#000" stroke-width="1.4"/>')
        for a, b, points in lines:
            pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
            f.write(f'<polyline points="{pts}" fill="none" stroke="#fff" stroke-dasharray="3 2" stroke-width="0.8"/>')
        f.write(f'<line x1="{edge[0][0]}" y1="{edge[0][1]}" x2="0" y2="{edge[0][1]}" stroke="#fff" stroke-dasharray="3 2"/>')
        f.write(f'<line x1="{edge[1][0]}" y1="{edge[1][1]}" x2="{WIDTH}" y2="{edge[1][1]}" stroke="#fff" stroke-dasharray="3 2"/>')
        for t in order:
            x, y = labels[t]
            f.write(f'<circle cx="{x}" cy="{y}" r="7" fill="#fff" stroke="#000"/><text x="{x}" y="{y-9}" font-size="6" text-anchor="middle" fill="#fff">{t}</text>')
        f.write("</svg>")


if __name__ == "__main__":
    main()

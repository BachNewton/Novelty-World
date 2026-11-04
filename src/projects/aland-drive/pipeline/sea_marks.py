"""The sea marks round Åland: every buoy, beacon, leading mark, cairn and light, in one small file for the whole island.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/sea_marks.py

Writes `sea/marks.json` beside the game's code, as `sea_lanes.py` writes the lanes: it changes with no tile, and the
game imports it. Each mark is a model of `art/marina`'s sea marks kit (or `art/identity`'s cairn and lighthouse) at
its place in the scene, with a yaw and whether it floats.

The marks are the official ones: Väylävirasto's aids to navigation (`sources.sea_chart_path("aids")`), Åland's own
government's among them, which say each mark's kind (a spar, a buoy, a fixed mark, a leading mark, a cairn, a light,
a radar mark), its IALA side or cardinal, and its daymark's colours. OSM's `seamark:*` places (`art/marina/places.json`)
fill in only where the chart has no mark within `GAP_M`. A leading mark faces down its line: towards the nearest
official navigation line. CC BY 4.0 (Väylävirasto) and, for the OSM marks, ODbL.
"""

import json
import math
from pathlib import Path

import numpy as np

from grid import to_local
from sea_lanes import PLACES, official_lines
from sources import sea_chart_path

OUTPUT = Path(__file__).resolve().parent.parent / "sea" / "marks.json"
LICENCE = "Contains data from the Finnish Transport Infrastructure Agency's fairway register (CC BY 4.0), and from OpenStreetMap (ODbL) where it has none"
# An OSM mark this near an official one is the same mark; OSM puts a lighthouse on its building, often well off the light.
GAP_M = 60
LIGHTHOUSE_GAP_M = 500

# The register's navigation codes (navigointilaji): the mark's IALA meaning, region A.
SIDES = {1: "port", 2: "starboard", 3: "north", 4: "south", 5: "west", 6: "east", 7: "isolated", 8: "safe", 9: "special"}
# A leading mark's board, by its colours outer to centre; the kit's patterns.
LEADING = {
    "Punainen/keltainen/punainen": "red-yellow",
    "Keltainen/punainen/keltainen": "yellow-red",
    "Punainen/valkoinen/punainen": "red-white",
    "Valkoinen/punainen/valkoinen": "white-red",
    "Punainen/keltainen": "red-yellow",
}
LEADING_OTHERWISE = "white-red"
# A radar mark's bands from the top; the kit's schemes.
RADAR = {
    "Valkoinen/punainen/valkoinen": "white-red",
    "Valkoinen/oranssi/valkoinen": "white-orange",
    "Punainen/valkoinen/punainen": "red-white",
    "Punainen": "red",
    "Valkoinen": "white",
}
RADAR_OTHERWISE = "white-red"
# OSM's kinds in places.json that are marks, and the model each is.
OSM_KINDS = {
    **{f"spar-{side}": f"spar-{side}" for side in SIDES.values()},
    **{f"pillar-{side}": f"pillar-{side}" for side in SIDES.values()},
    "fixed-north": "fixed-north",
    "fixed-south": "fixed-south",
    "cairn": "cairn",
    "lighthouse": "lighthouse",
}


def _daymark(properties: dict) -> dict:
    """The register's daymark text, 'Väri: Punainen, Väritys: ...', as a dict."""
    found = {}
    for part in (properties.get("paivatunnusten_tiedot") or "").split(", "):
        key, _, value = part.partition(": ")
        found[key] = value
    return found


def model_of(properties: dict) -> str | None:
    """The kit's model for an official aid, or None for one the game doesn't draw."""
    kind = properties["turvalaitetyyppifi"]
    side = SIDES.get(properties.get("navigointilajikoodi"))
    colours = _daymark(properties).get("Väri", "")
    if kind == "Viitta":
        return f"spar-{side}" if side else None
    if kind == "Poiju":
        return f"pillar-{side}" if side else None
    if kind == "Reunamerkki":
        return f"fixed-{side}" if side else None
    if kind == "Linjamerkki":
        role = "rear" if "ylempi" in (properties.get("nimifi") or "").lower() else "front"
        return f"leading-{role}-{LEADING.get(colours, LEADING_OTHERWISE)}"
    if kind == "Kummeli":
        return "cairn"
    if kind in ("Sektoriloisto", "Apuloisto"):
        return "skerry-light"
    if kind in ("Merimajakka", "Tunnusmajakka"):
        return "lighthouse"
    if kind == "Tutkamerkki":
        return f"radar-{RADAR.get(colours, RADAR_OTHERWISE)}"
    return None


def height_of(properties: dict) -> float:
    """The daymark's height above its ground in the register, in metres, or 0 where it gives none."""
    daymark = _daymark(properties)
    for key in ("Korkeus maasta (m)", "Korkeus (m)"):
        try:
            return round(float(daymark.get(key, "")), 1)
        except ValueError:
            continue
    return 0


def _facing(point: np.ndarray, lines: list[np.ndarray]) -> float:
    """The yaw that turns a board's +z towards the nearest point of the nearest line: (sin yaw, cos yaw) in the scene."""
    best, toward = math.inf, np.array([0.0, -1.0])
    for line in lines:
        a, b = line[:-1], line[1:]
        run = b - a
        share = np.clip(((point - a) * run).sum(axis=1) / np.maximum((run * run).sum(axis=1), 1e-9), 0, 1)
        nearest = a + run * share[:, None]
        distance = np.hypot(*(nearest - point).T)
        at = int(distance.argmin())
        if distance[at] < best:
            best, toward = float(distance[at]), nearest[at] - point
    # Local north is the scene's -z.
    return math.atan2(float(toward[0]), float(-toward[1]))


def _roll(identifier: int) -> float:
    return ((identifier * 2654435761) % 4294967296) / 4294967296


def marks() -> list[list]:
    lines = official_lines()
    found: list[list] = []
    official_places = []
    for feature in json.loads(sea_chart_path("aids").read_text(encoding="utf-8"))["features"]:
        properties = feature["properties"]
        model = model_of(properties)
        if model is None or feature["geometry"] is None or properties.get("toimintatilakoodi") not in (None, 1):
            continue
        east, north = feature["geometry"]["coordinates"][0]
        point = np.array(to_local(east, north))
        official_places.append(point)
        yaw = _facing(point, lines) if model.startswith("leading") else _roll(int(properties["id"])) * 2 * math.pi
        floats = properties.get("alityyppi") == "KELLUVA"
        found.append([model, round(float(point[0]), 1), round(float(-point[1]), 1), round(yaw, 3), int(floats), height_of(properties)])
    official = np.array(official_places)
    places = json.loads(PLACES.read_text(encoding="utf-8"))["places"]
    added = 0
    for kind, model in OSM_KINDS.items():
        for at, (x, z) in enumerate(places.get(kind, [])):
            point = np.array([x, -z])
            if np.hypot(*(official - point).T).min() < (LIGHTHOUSE_GAP_M if kind == "lighthouse" else GAP_M):
                continue
            floats = kind.startswith(("spar", "pillar"))
            found.append([model, x, z, round(_roll(at * 31 + len(kind)) * 2 * math.pi, 3), int(floats), 0])
            added += 1
    print(f"{len(official_places)} official marks, {added} from OSM where the chart has none")
    return found


def main() -> None:
    found = marks()
    counts: dict[str, int] = {}
    for model, *_ in found:
        counts[model] = counts.get(model, 0) + 1
    print(json.dumps(dict(sorted(counts.items())), indent=0))
    OUTPUT.write_text(json.dumps({"licence": LICENCE, "place": ["model", "x", "z", "yaw", "floats", "heightM"], "marks": found}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}, {OUTPUT.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()

"""Writes lights.json: every sea light OSM holds on the map, with its real characteristic, in the game's grid metres.

    pipeline/.venv/Scripts/python src/projects/aland-drive/art/night/lights.py

Reads the kept OSM answers in .data/raw/osm-api/ and nothing else. The output is derived from OpenStreetMap, so it
stays under ODbL, as the tiles' road and building files do; a credit is due when it first ships.

OSM gives a sector as true bearings seen from seaward, towards the light. The game has only grid north, so each is
turned here by the meridian's own lean at that light, and nothing downstream needs to know.
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(PROJECT, "pipeline"))
from grid import lonlat_to_grid, to_local  # noqa: E402

RAW = os.path.join(PROJECT, ".data", "raw", "osm-api")
NEIGHBOUR_DEG = 0.01
PERIOD_FALLBACK_S = {"Q": 1.0, "VQ": 0.5, "Fl": 4.0, "LFl": 8.0, "Iso": 4.0, "Oc": 4.0}


def number(value):
    match = re.match(r"-?\d+(\.\d+)?", value or "")
    return float(match.group()) if match else None


def grid_lean_deg(lon, lat):
    """The grid bearing of true north here."""
    import math

    east, north = lonlat_to_grid(lon, lat)
    east_up, north_up = lonlat_to_grid(lon, lat + NEIGHBOUR_DEG)
    return math.degrees(math.atan2(float(east_up - east), float(north_up - north)))


def part(tags, prefix):
    character = tags.get(f"{prefix}character")
    if character is None:
        return None
    return {
        "character": character,
        "colour": (tags.get(f"{prefix}colour") or "white").split(";")[0],
        "periodS": number(tags.get(f"{prefix}period")),
        "group": tags.get(f"{prefix}group"),
        "sequence": tags.get(f"{prefix}sequence"),
        "rangeNm": number(tags.get(f"{prefix}range")),
        "heightM": number(tags.get(f"{prefix}height")),
        "sectorStart": number(tags.get(f"{prefix}sector_start")),
        "sectorEnd": number(tags.get(f"{prefix}sector_end")),
        "category": tags.get(f"{prefix}category"),
    }


def parts_of(tags):
    numbered = sorted({int(found.group(1)) for found in (re.match(r"seamark:light:(\d+):", key) for key in tags) if found})
    parts = [part(tags, f"seamark:light:{index}:") for index in numbered]
    parts.append(part(tags, "seamark:light:"))
    return [found for found in parts if found]


def kind_of(tags):
    seamark = tags.get("seamark:type", "")
    if "buoy" in seamark:
        return "buoy"
    if tags.get("man_made") == "lighthouse" or seamark == "light_major":
        return "lighthouse"
    if tags.get("seamark:beacon_special_purpose:category") == "leading":
        return "leading"
    return "beacon"


def light_of(lat, lon, tags):
    parts = parts_of(tags)
    if not parts:
        return None
    east, north = lonlat_to_grid(lon, lat)
    x, z = to_local(float(east), float(north))
    lean = grid_lean_deg(lon, lat)
    sectors = []
    for found in parts:
        turned = {}
        if found["sectorStart"] is not None and found["sectorEnd"] is not None:
            turned = {"fromDeg": round((found["sectorStart"] + lean) % 360, 2), "toDeg": round((found["sectorEnd"] + lean) % 360, 2)}
        sectors.append({
            "character": found["character"],
            "colour": found["colour"],
            "periodS": found["periodS"] or PERIOD_FALLBACK_S.get(found["character"].split("+")[0], 4.0),
            **({"group": found["group"]} if found["group"] else {}),
            **({"sequence": found["sequence"]} if found["sequence"] else {}),
            **turned,
        })
    heights = [found["heightM"] for found in parts if found["heightM"]]
    ranges = [found["rangeNm"] for found in parts if found["rangeNm"]]
    category = next((found["category"] for found in parts if found["category"]), None)
    return {
        "x": round(x, 1),
        "z": round(-z, 1),
        "kind": "leading" if category in ("upper", "lower") else kind_of(tags),
        **({"name": tags["name"]} if "name" in tags else {}),
        "heightM": heights[0] if heights else None,
        "rangeNm": max(ranges) if ranges else None,
        "sectors": sectors,
    }


found = {}
for path in sorted(glob.glob(os.path.join(RAW, "*.xml"))):
    for _, element in ET.iterparse(path):
        if element.tag == "node":
            tags = {child.get("k"): child.get("v") for child in element.findall("tag")}
            if any(key.startswith("seamark:light") for key in tags):
                light = light_of(float(element.get("lat")), float(element.get("lon")), tags)
                if light:
                    found[element.get("id")] = light
            element.clear()

lights = sorted(found.values(), key=lambda light: (light["kind"], light["x"], light["z"]))
with open(os.path.join(HERE, "lights.json"), "w", encoding="utf-8") as out:
    json.dump({"licence": "Derived from OpenStreetMap, (c) its contributors, under the ODbL", "lights": lights}, out, ensure_ascii=False, separators=(",", ":"))
print(len(lights), "lights")

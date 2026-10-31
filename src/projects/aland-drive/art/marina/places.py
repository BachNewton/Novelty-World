"""Writes places.json: where OSM says the kit's objects really are, in the game's grid metres.

    pipeline/.venv/Scripts/python src/projects/aland-drive/art/marina/places.py

Reads the kept OSM answers in .data/raw/osm-api/ and nothing else. The output is derived from OpenStreetMap, so it
stays under ODbL, as the tiles' road and building files do; a credit is due when it first ships.
"""
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(PROJECT, "pipeline"))
from grid import lonlat_to_grid, to_local  # noqa: E402

RAW = os.path.join(PROJECT, ".data", "raw", "osm-api")


def kind_of(tags):
    seamark = tags.get("seamark:type")
    if seamark == "buoy_cardinal":
        return f"{tags.get('seamark:buoy_cardinal:shape') or 'spar'}-{tags.get('seamark:buoy_cardinal:category')}"
    if seamark == "buoy_lateral" and "seamark:buoy_lateral:category" in tags:
        return f"{tags.get('seamark:buoy_lateral:shape') or 'spar'}-{tags['seamark:buoy_lateral:category']}"
    if seamark == "beacon_cardinal":
        return f"fixed-{tags.get('seamark:beacon_cardinal:category')}"
    if seamark == "beacon_special_purpose":
        if tags.get("seamark:beacon_special_purpose:category") == "leading":
            return "leading-mark"
        if tags.get("seamark:beacon_special_purpose:shape") == "cairn":
            return "cairn"
    if tags.get("man_made") == "cairn" or tags.get("seamark:landmark:category") == "cairn":
        return "cairn"
    if tags.get("man_made") == "lighthouse":
        return "lighthouse"
    if tags.get("seamark:type") == "pilot_boarding":
        return "pilot-boarding"
    if tags.get("historic") == "cannon":
        return "cannon"
    if tags.get("historic") == "anchor":
        return "anchor"
    if tags.get("leisure") == "slipway":
        return "slipway"
    if tags.get("leisure") == "marina":
        return "marina"
    if tags.get("waterway") == "boatyard":
        return "boatyard"
    if tags.get("waterway") == "fuel" or tags.get("seamark:small_craft_facility:category") == "fuel_station":
        return "fuel-berth"
    if tags.get("amenity") == "boat_storage":
        return "boat-storage"
    return None


found = {}
for path in sorted(glob.glob(os.path.join(RAW, "*.xml"))):
    nodes = {}
    for _, el in ET.iterparse(path, events=("end",)):
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lon")), float(el.get("lat")))
        if el.tag in ("node", "way"):
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            kind = kind_of(tags) if tags else None
            if kind is not None:
                key = f"{el.tag}/{el.get('id')}"
                if el.tag == "node":
                    at = nodes[el.get("id")]
                else:
                    points = [nodes[n.get("ref")] for n in el.findall("nd") if n.get("ref") in nodes]
                    at = (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)) if points else None
                if at is not None:
                    found.setdefault(key, (kind, at))
            if el.tag == "way":
                el.clear()

places = {}
for kind, (lon, lat) in found.values():
    east, north = lonlat_to_grid(lon, lat)
    x, y = to_local(east, north)
    places.setdefault(kind, []).append([round(float(x), 1), round(-float(y), 1)])
for kind in places:
    places[kind].sort()
with open(os.path.join(HERE, "places.json"), "w", encoding="utf8") as out:
    json.dump({"licence": "Derived from OpenStreetMap, (c) its contributors, under the ODbL", "places": dict(sorted(places.items()))}, out, separators=(",", ":"))
for kind, rows in sorted(places.items()):
    print(len(rows), kind)

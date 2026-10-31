"""Raw downloads, kept per source under .data/raw and read as untrusted data.

A file already there is reused, so a rerun touches the network only for what is
missing.
"""

import json
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer

from grid import Tile

RAW = Path(__file__).resolve().parent.parent / ".data" / "raw"
MIRROR = "https://mirrors.nic.funet.fi/index/geodata/mml/"
DEM_MIRROR = f"{MIRROR}dem2m/2008_latest/"
# OSM's own API rather than Overpass, whose public servers are often down. It answers a
# small box at once, and one tile at a time is the use its policy allows.
OSM_API = "https://api.openstreetmap.org/api/0.6/map"
OSM_RETRIES = 4
OSM_FIRST_WAIT_S = 30
USER_AGENT = "NoveltyWorld-AlandDrive-pipeline/1.0 (https://github.com/BachNewton/Novelty-World)"
REQUEST_TIMEOUT_S = 90
# Roads are clipped at the tile's edge, so a little past it catches every way that crosses.
OSM_MARGIN_M = 200
ORTHO_YEARS = (2025, 2024, 2023, 2022)


def _download(request: urllib.request.Request, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
        partial.write_bytes(response.read())
    partial.replace(path)


def dem_path(tile: Tile) -> Path | None:
    """The tile's GeoTIFF, or None when the mirror has no such tile (open sea)."""
    path = RAW / "dem2m" / f"{tile.name}.tif"
    absent = path.with_suffix(".absent")
    if path.exists():
        return path
    if absent.exists():
        return None
    try:
        _download(urllib.request.Request(DEM_MIRROR + tile.mirror_path, headers={"User-Agent": USER_AGENT}), path)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        absent.parent.mkdir(parents=True, exist_ok=True)
        absent.touch()
        return None
    return path


def _mirrored(folder: str, url: str, name: str) -> Path:
    path = RAW / folder / name
    if not path.exists():
        _download(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), path)
    return path


def _mirrored_or_none(folder: str, url: str, name: str) -> Path | None:
    """Like _mirrored for a sheet the mirror may not have: only a 404 means that, and it's remembered."""
    absent = RAW / folder / f"{name}.absent"
    if absent.exists():
        return None
    try:
        return _mirrored(folder, url, name)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    absent.parent.mkdir(parents=True, exist_ok=True)
    absent.touch()
    return None


def ortho_path(tile: Tile) -> Path:
    """The newest photo of a tile. Far out in the archipelago that isn't always the latest flight."""
    for year in ORTHO_YEARS:
        path = _mirrored_or_none("ortho", f"{MIRROR}orto/normal_color_3067/mara_v_25000_50/{year}/{tile.name[:3]}/02m/1/{tile.name}.jp2", f"{tile.name}.jp2")
        if path is not None:
            return path
        (RAW / "ortho" / f"{tile.name}.jp2.absent").unlink()
    raise FileNotFoundError(f"{tile.name}: the mirror has no photo from any of {ORTHO_YEARS}")


def laser_paths(tile: Tile) -> list[Path]:
    """A tile's 3×3 km sheets, of the four. Over open sea the scan has none."""
    sheets = [_mirrored_or_none("laser", f"{MIRROR}laserkeilaus/2008_latest/2013/{tile.name[:4]}/1/{tile.name}{part}.laz", f"{tile.name}{part}.laz") for part in (1, 2, 3, 4)]
    return [sheet for sheet in sheets if sheet is not None]


def topographic_path(tile: Tile) -> Path:
    """The half sheet holding a tile: its first four tiles are the left half."""
    half = f"{tile.name[:5]}{'L' if tile.name[5] in 'ABCD' else 'R'}"
    return _mirrored("mtk", f"{MIRROR}maastotietokanta/2025/shp/L2/{tile.name[:3]}/{half}.shp.zip", f"{half}.shp.zip")


def buildings3d_path(tile: Tile) -> Path | None:
    """NLS's CityGML sheet, which only comes as a MapSite order and is put here by hand. None until it has been."""
    path = RAW / "buildings3d" / f"{tile.name}.gml"
    return path if path.exists() else None


def _fetch_box(name: str, box: tuple[float, float, float, float]) -> list[Path]:
    """The API's answers for a box, kept as they came. A box over its limit of 50,000 nodes is asked for in quarters."""
    path = RAW / "osm-api" / f"{name}.xml"
    if path.exists():
        return [path]
    west, south, east, north = box
    if (RAW / "osm-api" / f"{name}.split").exists():
        return _fetch_quarters(name, box)
    url = f"{OSM_API}?bbox={west:.6f},{south:.6f},{east:.6f},{north:.6f}"
    for attempt in range(OSM_RETRIES):
        try:
            _download(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), path)
            return [path]
        except urllib.error.HTTPError as error:
            if error.code == 400:
                (RAW / "osm-api" / f"{name}.split").touch()
                return _fetch_quarters(name, box)
            # 429 and 5xx are the server asking for room. Anything else is a real failure.
            if error.code != 429 and error.code < 500 or attempt == OSM_RETRIES - 1:
                raise
        except OSError:
            if attempt == OSM_RETRIES - 1:
                raise
        time.sleep(OSM_FIRST_WAIT_S * 2**attempt)
    raise AssertionError("unreachable: the last attempt raises")


def _fetch_quarters(name: str, box: tuple[float, float, float, float]) -> list[Path]:
    west, south, east, north = box
    middle_lon, middle_lat = (west + east) / 2, (south + north) / 2
    quarters = ((west, south, middle_lon, middle_lat), (middle_lon, south, east, middle_lat), (west, middle_lat, middle_lon, north), (middle_lon, middle_lat, east, north))
    return [path for index, quarter in enumerate(quarters) for path in _fetch_box(f"{name}.{index}", quarter)]


def _osm_xml(tile: Tile) -> list[Path]:
    to_lonlat = Transformer.from_crs("EPSG:3067", "EPSG:4326", always_xy=True)
    corners = [
        to_lonlat.transform(east, north)
        for east in (tile.west - OSM_MARGIN_M, tile.east + OSM_MARGIN_M)
        for north in (tile.south - OSM_MARGIN_M, tile.north + OSM_MARGIN_M)
    ]
    lons, lats = zip(*corners)
    return _fetch_box(tile.name, (min(lons), min(lats), max(lons), max(lats)))


def _roads_and_buildings(xml_files: list[Path]) -> dict:
    """The API's nodes joined into each road and building, in the shape vectors.py reads."""
    roots = [ElementTree.parse(path).getroot() for path in xml_files]
    nodes = {node.get("id"): {"lat": float(node.get("lat")), "lon": float(node.get("lon"))} for root in roots for node in root.iter("node")}
    tags_of = lambda element: {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
    ways = {way.get("id"): way for root in roots for way in root.iter("way")}
    relations = {relation.get("id"): relation for root in roots for relation in root.iter("relation")}
    lines = {id: [nodes[nd.get("ref")] for nd in way.findall("nd") if nd.get("ref") in nodes] for id, way in ways.items()}
    elements: list[dict] = []
    for id, way in ways.items():
        tags = tags_of(way)
        if "highway" in tags or "building" in tags:
            elements.append({"type": "way", "id": int(id), "tags": tags, "geometry": lines[id]})
    for id, relation in relations.items():
        tags = tags_of(relation)
        if "building" in tags:
            members = [
                {"role": member.get("role"), "geometry": lines[member.get("ref")]}
                for member in relation.findall("member")
                if member.get("type") == "way" and member.get("ref") in lines
            ]
            elements.append({"type": "relation", "id": int(id), "tags": tags, "members": members})
    fetched = datetime.fromtimestamp(xml_files[0].stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"osm3s": {"timestamp_osm_base": fetched}, "elements": elements}


def osm_path(tile: Tile, refresh: bool = False) -> Path:
    path = RAW / "osm" / f"{tile.name}.json"
    if path.exists() and not refresh:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_roads_and_buildings(_osm_xml(tile)), ensure_ascii=False), encoding="utf-8")
    return path

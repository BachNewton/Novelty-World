"""Raw downloads, kept per source under .data/raw and read as untrusted data.

A file already there is reused, so a rerun touches the network only for what is
missing.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from pyproj import Transformer

from grid import Tile

RAW = Path(__file__).resolve().parent.parent / ".data" / "raw"
DEM_MIRROR = "https://mirrors.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/"
# Public servers that are often at capacity, so each is tried in turn.
OVERPASS = ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter")
USER_AGENT = "NoveltyWorld-AlandDrive-pipeline/1.0 (https://github.com/BachNewton/Novelty-World)"
REQUEST_TIMEOUT_S = 90
# Roads are clipped at the tile's edge, so a little past it catches every way that crosses.
OSM_MARGIN_M = 200


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


def osm_path(tile: Tile, refresh: bool = False) -> Path:
    path = RAW / "osm" / f"{tile.name}.json"
    if path.exists() and not refresh:
        return path
    to_lonlat = Transformer.from_crs("EPSG:3067", "EPSG:4326", always_xy=True)
    corners = [
        to_lonlat.transform(east, north)
        for east in (tile.west - OSM_MARGIN_M, tile.east + OSM_MARGIN_M)
        for north in (tile.south - OSM_MARGIN_M, tile.north + OSM_MARGIN_M)
    ]
    lons, lats = zip(*corners)
    box = f"{min(lats):.6f},{min(lons):.6f},{max(lats):.6f},{max(lons):.6f}"
    query = (
        f"[out:json][timeout:{REQUEST_TIMEOUT_S - 10}];"
        f'(way["highway"]({box});way["building"]({box});relation["building"]({box}););'
        "out tags geom;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    failures = []
    for server in OVERPASS:
        try:
            _download(urllib.request.Request(server, data=body, headers={"User-Agent": USER_AGENT}), path)
            # A busy Overpass can answer with an HTML page: fail here, not later.
            json.loads(path.read_text(encoding="utf-8"))
            return path
        except (OSError, json.JSONDecodeError) as error:
            path.unlink(missing_ok=True)
            failures.append(f"{server}: {error}")
    raise SystemExit("no Overpass server answered:\n" + "\n".join(failures))

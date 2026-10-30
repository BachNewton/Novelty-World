"""Publishes the built tiles to Supabase Storage. Safe to run again: what's already there is left alone.

    pipeline/.venv/Scripts/python pipeline/upload.py [--dry-run]

Reads the project's URL and service-role key from the repo's .env.local, and
never prints the key. Tiles go in a public-read bucket, under a folder named by
the build's version, so a rebuild is a new folder beside the old one and a page
only ever sees the files it was deployed with. They are immutable, so they carry
a year's cache. Then set TILES_VERSION in render/tile-address.ts to the version
printed. It won't publish tiles that don't meet (`check_seams.py`).
"""

import argparse
import json
import mimetypes
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import check_seams
from build import OUTPUT
from sources import USER_AGENT

BUCKET = "aland-drive-tiles"
ENV_FILE = Path(__file__).resolve().parents[4] / ".env.local"
YEAR_S = 31_536_000
BUCKET_FILE_LIMIT_BYTES = 20_000_000
# Only what's game data: routes.json beside the tiles is the local tools' own.
NOT_PUBLISHED = {"routes.json"}
TYPES = {".gz": "application/gzip", ".webp": "image/webp", ".png": "image/png", ".json": "application/json"}


def environment() -> tuple[str, str]:
    values = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            name, value = line.split("=", 1)
            values[name.strip()] = value.strip().strip('"')
    return values["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), values["SUPABASE_SERVICE_ROLE_KEY"]


class Storage:
    def __init__(self, url: str, key: str):
        self.url = f"{url}/storage/v1"
        self.key = key

    def _call(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None) -> tuple[int, bytes]:
        request = urllib.request.Request(
            f"{self.url}/{path}",
            data=body,
            method=method,
            headers={"Authorization": f"Bearer {self.key}", "apikey": self.key, "User-Agent": USER_AGENT, **(headers or {})},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def ensure_bucket(self) -> None:
        status, body = self._call("GET", f"bucket/{BUCKET}")
        if status == 200:
            return
        settings = {"id": BUCKET, "name": BUCKET, "public": True, "file_size_limit": BUCKET_FILE_LIMIT_BYTES}
        status, body = self._call("POST", "bucket", json.dumps(settings).encode(), {"Content-Type": "application/json"})
        if status != 200:
            raise SystemExit(f"couldn't create the bucket: {status} {body[:200]!r}")
        print(f"created bucket {BUCKET}")

    def existing(self, folder: str) -> dict[str, int]:
        """Every file under a folder, with its size, walking down through subfolders."""
        found: dict[str, int] = {}
        offset = 0
        while True:
            request = {"prefix": folder, "limit": 1000, "offset": offset}
            status, body = self._call("POST", f"object/list/{BUCKET}", json.dumps(request).encode(), {"Content-Type": "application/json"})
            if status != 200:
                raise SystemExit(f"couldn't list {folder}: {status} {body[:200]!r}")
            entries = json.loads(body)
            for entry in entries:
                path = f"{folder}/{entry['name']}"
                if entry.get("id") is None:
                    found.update(self.existing(path))
                else:
                    found[path] = entry["metadata"]["size"]
            if len(entries) < 1000:
                return found
            offset += len(entries)

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        headers = {"Content-Type": content_type, "Cache-Control": f"max-age={YEAR_S}, immutable", "x-upsert": "false"}
        status, body = self._call("POST", f"object/{BUCKET}/{urllib.parse.quote(path)}", data, headers)
        if status != 200:
            raise SystemExit(f"couldn't upload {path}: {status} {body[:200]!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="say what would go up, and touch nothing")
    arguments = parser.parse_args()

    problems = check_seams.check_all()
    if problems:
        raise SystemExit("not publishing tiles that don't meet:\n" + "\n".join(problems))

    world = json.loads((OUTPUT / "world.json").read_text(encoding="utf-8"))
    version = world["version"]
    files = sorted(path for path in OUTPUT.rglob("*") if path.is_file() and path.name not in NOT_PUBLISHED)
    total = sum(path.stat().st_size for path in files)
    print(f"version {version}: {len(files)} files, {total / 1e6:.1f} MB")
    if arguments.dry_run:
        return

    storage = Storage(*environment())
    storage.ensure_bucket()
    there = storage.existing(version)
    sent = 0
    for path in files:
        name = f"{version}/{path.relative_to(OUTPUT).as_posix()}"
        if there.get(name) == path.stat().st_size:
            continue
        kind = TYPES.get(path.suffix) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        storage.upload(name, path.read_bytes(), kind)
        sent += 1
    published = storage.existing(version)
    missing = [path for path in files if published.get(f"{version}/{path.relative_to(OUTPUT).as_posix()}") != path.stat().st_size]
    if missing:
        raise SystemExit(f"{len(missing)} files didn't arrive, starting with {missing[0]}")
    print(f"sent {sent}, already there {len(files) - sent}; {sum(published.values()) / 1e6:.1f} MB under {version}")
    print(f"set TILES_VERSION in render/tile-address.ts to {version}")


if __name__ == "__main__":
    main()

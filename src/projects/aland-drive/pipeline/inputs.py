"""The pinned inputs: the raw data only this laptop has, packed for a build on another machine (GitHub's).

    python pipeline/inputs.py pack [--data <a .data folder>]
    python pipeline/inputs.py fetch

What a build downloads from the public mirror (elevation, photos, laser, map sheets, forest inventory) any machine can
download again, so it isn't packed. What's packed can't be: OSM's answers (the API's policy forbids read-only use, and a
fresh answer is different data), NLS's 3D buildings (a MapSite order, put here by hand), the outer islands' bake (made
from a hundred more sheets' photos), and the traffic counts, pinned so a build is the same each time.

`pack` writes the archive to `.data/` and `inputs.json` naming it, and says how to publish it as an asset of the
repository's release `INPUTS_RELEASE`. Commit `inputs.json` with it, so a build at that commit reads those inputs.
`fetch` downloads the archive `inputs.json` names, checks it, and unpacks it into `.data/`. Stdlib only, as `run.py` is,
so a fresh machine can fetch before the pipeline's environment exists.
"""

import argparse
import hashlib
import json
import tarfile
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / ".data"
PIN = Path(__file__).with_name("inputs.json")
INPUTS_RELEASE = "aland-drive-inputs"
RELEASES = "https://github.com/BachNewton/Novelty-World/releases/download"
# Folders under .data, each whole.
PACKED = [
    "raw/osm-api",
    "raw/osm",
    "raw/osm-roadside",
    "raw/osm-furniture",
    "raw/osm-dressing",
    "raw/kartor-traffic",
    "raw/buildings3d",
    "derived/outlying",
]
CHUNK = 1 << 20


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def pack(data: Path) -> None:
    missing = [folder for folder in PACKED if not (data / folder).is_dir()]
    if missing:
        raise SystemExit(f"{data} has no {', '.join(missing)}")
    partial = DATA / "inputs.tar.xz.part"
    partial.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(partial, "w:xz") as archive:
        for folder in PACKED:
            print(f"packing {folder}", flush=True)
            archive.add(data / folder, arcname=folder)
    digest = sha256(partial)
    asset = f"aland-drive-inputs-{digest[:12]}.tar.xz"
    path = DATA / asset
    partial.replace(path)
    PIN.write_text(json.dumps({"release": INPUTS_RELEASE, "asset": asset, "sha256": digest, "folders": PACKED}, indent=2) + "\n", encoding="utf-8")
    print(f"{path}: {path.stat().st_size / 1e6:.1f} MB")
    print("publish it (as BachNewton), then commit pipeline/inputs.json:")
    print(f"  gh release create {INPUTS_RELEASE} --repo BachNewton/Novelty-World --title \"Åland Drive pinned inputs\" --notes-file <licences>   (once)")
    print(f"  gh release upload {INPUTS_RELEASE} \"{path}\" --repo BachNewton/Novelty-World")


def fetch() -> None:
    pin = json.loads(PIN.read_text(encoding="utf-8"))
    stamp = DATA / f".inputs-{pin['sha256'][:12]}"
    if stamp.exists():
        print(f"{pin['asset']} is already unpacked")
        return
    path = DATA / pin["asset"]
    if not path.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".part")
        with urllib.request.urlopen(f"{RELEASES}/{pin['release']}/{pin['asset']}", timeout=300) as response, partial.open("wb") as file:
            while chunk := response.read(CHUNK):
                file.write(chunk)
        partial.replace(path)
    if (found := sha256(path)) != pin["sha256"]:
        raise SystemExit(f"{path} isn't the archive inputs.json pins: its sha256 is {found}")
    with tarfile.open(path, "r:xz") as archive:
        archive.extractall(DATA, filter="data")
    path.unlink()
    stamp.touch()
    print(f"unpacked {pin['asset']} into {DATA}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["pack", "fetch"])
    parser.add_argument("--data", type=Path, default=DATA, help="the .data folder to pack from, such as the main checkout's from a worktree")
    arguments = parser.parse_args()
    if arguments.action == "pack":
        pack(arguments.data)
    else:
        fetch()


if __name__ == "__main__":
    main()

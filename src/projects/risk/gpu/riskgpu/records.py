"""Game records (`ideas/gpu-engine.md`, "Game records"): one JSON object per game, one per line,
gzipped when the file name ends in `.gz`, as `eval/gpu-record.ts` reads and writes them."""

import gzip
import json


def read_records(path: str) -> list[dict]:
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_records(path: str, records: list[dict]) -> None:
    text = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in records)
    if path.endswith(".gz"):
        with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
            f.write(text)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)

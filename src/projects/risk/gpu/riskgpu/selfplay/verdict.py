"""A run's verdict on one panel reading, by the daily contract (the machine-learning skill's
`references/ruler.md`): **climbing**, **flat** (the last three readings within one interval of each
other) or **falling** (the latest below the best by more than one interval, twice). Fewer than three
readings is **early**. A reading is the panel's `{"win", "interval": [low, high], ...}`; "one
interval" is a reading's half-width, the ± of its 95% interval.

The trainer stops on it (`--stop-when`), so a session on a GPU quota isn't spent on a plateau, and
the Kaggle launcher's report prints it.
"""

import json
import os


def half_width(reading: dict) -> float:
    low, high = reading["interval"]
    return (high - low) / 2


def verdict(readings: list[dict]) -> str:
    if len(readings) < 3:
        return "early"
    best = max(r["win"] for r in readings)
    if all(best - r["win"] > half_width(r) for r in readings[-2:]):
        return "falling"
    last = readings[-3:]
    spread = max(r["win"] for r in last) - min(r["win"] for r in last)
    if spread <= sum(half_width(r) for r in last) / 3:
        return "flat"
    return "climbing"


def panel_readings(log_path: str, key: str) -> list[dict]:
    """Every reading of `key` in a run's `log.jsonl`, in order, with the iteration and samples it
    was read at."""
    out = []
    if not os.path.exists(log_path):
        return out
    with open(log_path) as f:
        for line in f:
            record = json.loads(line)
            if key in record.get("panel", {}):
                out.append({**record["panel"][key], "iter": record["iter"], "steps": record["steps"]})
    return out

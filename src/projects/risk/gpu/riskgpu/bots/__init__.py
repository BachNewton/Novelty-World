"""The GPU bots by label (`ideas/gpu-engine.md`, "The bots on the GPU"), as `bots/index.ts`
registers the TypeScript ones: the runner seats them by these names, so a label means the same
player on both engines wherever the port is exact."""

from ..runner import Bot
from .greedy import greedy_bot
from .random import random_bot

GPU_BOTS: dict[str, Bot] = {
    "random": random_bot,
    "greedy": greedy_bot,
    # GD-lite's personas (`gd.py`) register here: "gd-defensive", "gd-continental", ...
}

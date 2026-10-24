"""The GPU bots by label (`ideas/gpu-engine.md`, "The bots on the GPU"), as `bots/index.ts`
registers the TypeScript ones: the runner seats them by these names, so a label means the same
player on both engines wherever the port is exact."""

from ..runner import Bot
from .gd import GD_BOTS
from .greedy import greedy_bot
from .random import random_bot

GPU_BOTS: dict[str, Bot] = {
    "random": random_bot,
    "greedy": greedy_bot,
    **GD_BOTS,  # GD-lite: "gd-defensive", "gd-continental", "gd-aggressive", "gd-stacker"
}

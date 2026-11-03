"""A long step's progress, a line per item as it finishes, for whoever watches the build's log (`watch.ps1`).

Each line is written out at once: Python holds back what it prints to a file until its buffer fills, so a step that
prints without flushing looks stalled in the log for as long as it runs.
"""

import time


def clock(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


class Progress:
    """Counts a step's items done. The time left is the pace so far, so it is only as good as the items are alike."""

    def __init__(self, step: str, total: int):
        self.step = step
        self.total = total
        self.done = 0
        self.started = time.monotonic()

    def finished(self, name: str) -> None:
        self.done += 1
        spent = time.monotonic() - self.started
        left = spent / self.done * (self.total - self.done)
        print(f"[{self.step} {self.done}/{self.total}] {name} done, {clock(spent)} in, about {clock(left)} left for the {self.step}", flush=True)


def stage(text: str) -> None:
    """A step with nothing to count, said as it starts."""
    print(text, flush=True)

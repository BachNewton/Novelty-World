"""A long step's progress, a line per item as it finishes, for whoever watches the build's log (`watch.ps1`).

Each line is written out at once: Python holds back what it prints to a file until its buffer fills, so a step that
prints without flushing looks stalled in the log for as long as it runs.

During a build each line also says how long the whole build has left. The steps still to come are timed by the last
island build (`build-times.json`, which every island build rewrites as it ends), each scaled by how many things it works
through now, then all scaled by this run's pace against that one so far: a machine that is busier, or fewer jobs, slows
them all alike. Only an island build is kept, since a few tiles spend their time very differently.
"""

import json
import time
from collections.abc import Callable
from pathlib import Path

HISTORY = Path(__file__).with_name("build-times.json")


def clock(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


class Build:
    """The whole build's steps, in order, each with the number of things it works through: tiles, or the world's tiles."""

    def __init__(self, steps: dict[str, int], past: dict | None, now: Callable[[], float] = time.monotonic):
        self.sizes = dict(steps)
        self.past = past
        self.now = now
        self.started = now()
        self.starts: dict[str, float] = {}
        self.current: str | None = None

    def start(self, step: str, size: int | None = None) -> None:
        if size is not None:
            self.sizes[step] = size
        self.starts[step] = self.now()
        self.current = step

    def _expected(self, step: str) -> float | None:
        if self.past is None or step not in self.past["steps"]:
            return None
        then = self.past["steps"][step]
        return then["seconds"] / max(then["size"], 1) * self.sizes[step]

    def left(self, step_left: float | None = None) -> str:
        """The whole build's time left, given the current step's own estimate if it has one."""
        if self.past is None:
            return "no island build timed yet to estimate the whole build by"
        order = list(self.sizes)
        here = order.index(self.current or order[0])
        through = order[: here + 1] if step_left is not None else order[:here]
        rest = order[here + 1 :] if step_left is not None else order[here:]
        untimed = [step for step in rest if self._expected(step) is None]
        spent = self.now() - self.started + (step_left or 0)
        then = sum(self._expected(step) or 0 for step in through)
        pace = spent / then if then > 0 else 1
        left = (step_left or 0) + pace * sum(self._expected(step) or 0 for step in rest)
        missing = f", not counting the {', '.join(untimed)}, never timed" if untimed else ""
        return f"about {clock(left)} left for the whole build{missing}"

    def finish(self, jobs: int) -> None:
        """Keeps this run's step times for the next build to go by."""
        ends = [*list(self.starts.values())[1:], self.now()]
        steps = {step: {"seconds": round(end - start, 1), "size": self.sizes[step]} for (step, start), end in zip(self.starts.items(), ends)}
        HISTORY.write_text(json.dumps({"jobs": jobs, "steps": steps}, indent=2) + "\n", encoding="utf-8")


_build: Build | None = None


def begin(steps: dict[str, int]) -> Build:
    """Starts timing a whole build, against the last island build's times if there are any."""
    global _build
    _build = Build(steps, json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else None)
    return _build


class Progress:
    """Counts a step's items done. The time left is the pace so far, so it is only as good as the items are alike."""

    def __init__(self, step: str, total: int):
        self.step = step
        self.total = total
        self.done = 0
        self.started = time.monotonic()
        if _build is not None:
            _build.start(step, total)

    def finished(self, name: str) -> None:
        self.done += 1
        spent = time.monotonic() - self.started
        left = spent / self.done * (self.total - self.done)
        whole = f", {_build.left(left)}" if _build is not None else ""
        print(f"[{self.step} {self.done}/{self.total}] {name} done, {clock(spent)} in, about {clock(left)} left for the {self.step}{whole}", flush=True)


def stage(step: str, text: str) -> None:
    """A step with nothing to count, said as it starts."""
    if _build is not None:
        _build.start(step)
        text += f", {_build.left()}"
    print(text, flush=True)

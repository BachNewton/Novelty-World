"""GD's AI's battle odds (`bots/gd/odds.ts`), batched: `winChance` read from the blitz tables where
the fight fits them (the tables' capture chance is `balancedFight(a, d).defenderLost[d]`, which
`winChance` returns), from the exact scalar port (`blitz_port.win_chance`) past them;
`idealAttackUnits` as a per-threshold array grown on the host as larger stacks appear, each entry
found by GD's own doubling-then-halving search over the same odds.

Both caches live as long as the process, per table: the odds are pure functions of their
arguments.
"""

import numpy as np
import torch

from .. import blitz_port
from ..tables import BlitzTables

fround = blitz_port.fround
FROUND_09 = fround(0.9)


def fround_t(x: torch.Tensor) -> torch.Tensor:
    """`Math.fround` of a float64 tensor: a float32 round trip, rounding to nearest even."""
    return x.to(torch.float32).to(torch.float64)


def round_half_even(x: torch.Tensor) -> torch.Tensor:
    """`roundHalfEven` on float64, branch for branch: NaN takes the last branch and stays NaN."""
    floor = torch.floor(x)
    fraction = x - floor
    even = torch.remainder(floor, 2) == 0
    return torch.where(fraction > 0.5, floor + 1, torch.where(fraction < 0.5, floor, torch.where(even, floor, floor + 1)))


class Odds:
    def __init__(self, tables: BlitzTables):
        self.tables = tables
        self.bound = tables.bound
        self._capture = tables.capture.cpu().numpy()
        self._slow: dict[tuple[int, int], float] = {}
        self._ideal: dict[float, np.ndarray] = {}
        self._ideal_t: dict[float, torch.Tensor] = {}

    def win_scalar(self, attack: int, defend: int) -> float:
        if attack <= 0:
            return 0.0
        if attack <= self.bound and defend <= self.bound:
            return float(self._capture[attack * (self.bound + 1) + defend])
        key = (attack, defend)
        if key not in self._slow:
            self._slow[key] = float(blitz_port.win_chance(attack, defend))
        return self._slow[key]

    def win_chance(self, attack: torch.Tensor, defend: torch.Tensor) -> torch.Tensor:
        """`winChance(attack, defend)` elementwise (int64 tensors of one shape), float64. No
        attackers is no chance; every fight asked about has a defender."""
        attack, defend = torch.broadcast_tensors(attack, defend)
        fights = attack > 0
        if bool((fights & (defend < 1)).any()):
            raise ValueError("winChance asked about a fight with no defender")
        bound = self.bound
        inside = (attack <= bound) & (defend <= bound)
        cell = attack.clamp(0, bound) * (bound + 1) + defend.clamp(0, bound)
        chance = self.tables.capture[cell]
        past = fights & ~inside
        if bool(past.any()):
            pairs = torch.stack([attack[past], defend[past]], 1).cpu().tolist()
            values = torch.tensor([self.win_scalar(a, d) for a, d in pairs], dtype=torch.float64, device=chance.device)
            chance = chance.clone()
            chance[past] = values
        return torch.where(fights, chance, 0.0)

    def _search_ideal(self, defend: int, threshold: float) -> int:
        """`searchIdeal`."""
        d = max(defend, 1)
        required = min(1, max(0, threshold))
        start = blitz_port.round_half_even(fround(fround(d) * fround(0.2)))
        lo = 1
        hi = max(start, 1)
        while required > self.win_scalar(hi, d):
            lo = hi
            hi *= 2
            if hi > blitz_port.INT_MAX:
                hi = blitz_port.INT_MAX
                break
        probes = 0
        while True:
            if lo + 1 >= hi:
                return hi
            mid = max(1, lo + (hi - lo) // 2)
            if self.win_scalar(mid, d) >= required:
                hi = mid
            else:
                lo = mid
            if probes >= 100:
                return blitz_port.INT_MAX
            probes += 1

    def ideal_attack_units(self, defend: torch.Tensor, threshold: float = FROUND_09) -> torch.Tensor:
        """`idealAttackUnits(defend, threshold)` elementwise, int64."""
        known = self._ideal.get(threshold, np.zeros(0, dtype=np.int64))
        most = int(defend.max()) if defend.numel() else 0
        if most >= len(known):
            grown = np.array([self._search_ideal(d, threshold) for d in range(len(known), max(most + 1, len(known) + 64))],
                             dtype=np.int64)
            known = np.concatenate([known, grown])
            self._ideal[threshold] = known
            self._ideal_t[threshold] = torch.tensor(known, device=defend.device)
        return self._ideal_t[threshold].to(defend.device)[defend.clamp(min=0)]


_ODDS: dict[int, Odds] = {}


def odds_for(tables: BlitzTables) -> Odds:
    odds = _ODDS.get(id(tables))
    if odds is None or odds.tables is not tables:
        odds = _ODDS[id(tables)] = Odds(tables)
    return odds

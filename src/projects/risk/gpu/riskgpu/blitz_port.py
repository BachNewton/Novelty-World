"""Balanced Blitz (`blitz.ts`) and GD's odds reader (`bots/gd/odds.ts`), ported operation for
operation: the GPU engine's exact slow path for fights past its tables (`ideas/gpu-engine.md`,
"Balanced Blitz as exported running totals"), and the odds the GD-lite bots read.

Every float is a float64 combined in the TypeScript's order, so the results are the TypeScript's
bit for bit. Sums run as plain sequential loops (`add`): Python's built-in `sum` compensates its
rounding since 3.12 and numpy's reductions sum pairwise, and neither rounds as `+=` does.
`Math.fround` is a float32 round trip. `**`, `Math.log` and `Math.exp` are V8's own (the last
section), not Python's: the C library's round differently in the last bit.
"""

from dataclasses import dataclass
from functools import lru_cache
import math
import struct

import numpy as np

ESTIMATED_ABOVE = 2000
ROLLED_ABOVE = 100_000


def fround(x: float) -> float:
    """`Math.fround`."""
    return float(np.float32(x))


def add(values) -> float:
    """`let sum = 0; for (...) sum += v`."""
    total = 0.0
    for v in values:
        total += float(v)
    return total


def _build_rounds() -> dict[tuple[int, int], list[tuple[int, int, float]]]:
    """`ROUNDS[attackDice][defendDice]`: (attacker losses, defender losses, chance), in the order
    the TypeScript's Map first meets each outcome."""
    rounds = {}
    for attack_dice in range(1, 4):
        for defend_dice in range(1, 3):
            counts: dict[tuple[int, int], int] = {}
            total = 6 ** (attack_dice + defend_dice)
            for roll in range(total):
                faces = [(roll // 6**i) % 6 for i in range(attack_dice + defend_dice)]
                attack = sorted(faces[:attack_dice], reverse=True)
                defend = sorted(faces[attack_dice:], reverse=True)
                attacker_losses = 0
                defender_losses = 0
                for i in range(min(attack_dice, defend_dice)):
                    if attack[i] > defend[i]:
                        defender_losses += 1
                    else:
                        attacker_losses += 1
                key = (attacker_losses, defender_losses)
                counts[key] = counts.get(key, 0) + 1
            rounds[(attack_dice, defend_dice)] = [(al, dl, count / total) for (al, dl), count in counts.items()]
    return rounds


ROUNDS = _build_rounds()

# The battle shifts a state can take, attacker losses descending within each total loss; and per
# shift, its chance for each (attack dice, defend dice), 0 where that battle can't end so.
SHIFTS = [(2, 0), (1, 1), (0, 2), (1, 0), (0, 1)]
SHIFT_CHANCE = np.zeros((4, 3, len(SHIFTS)))
for (_attack_dice, _defend_dice), _outcomes in ROUNDS.items():
    for _al, _dl, _p in _outcomes:
        SHIFT_CHANCE[_attack_dice, _defend_dice, SHIFTS.index((_al, _dl))] = _p


def fair_fight(a: int, d: int) -> tuple[np.ndarray, np.ndarray]:
    """`fairFight`: (attackerLost, defenderLost)."""
    return fair_fights([(a, d)])[0]


def fair_fights(fights: list[tuple[int, int]]) -> list[tuple[np.ndarray, np.ndarray]]:
    """`fairFight` of each (a, d), worked side by side.

    The TypeScript walks each total from the largest down, each state of it by attacker armies
    descending, and adds each outcome's share into the state it leads to. This walks the same
    totals and does one total's states at once, shift by shift, for every fight together. Every
    state is still added into in the TypeScript's order: two states of one total that lead to the
    same state do so by different shifts, and the one with more attackers (which the TypeScript
    adds first) is the one whose shift costs the attacker more, so taking the shifts by attacker
    losses descending keeps the order. A state with no chance (one the TypeScript skips, or one
    outside a smaller fight) adds +0, which changes nothing.

    A total's states are reached only from the two totals above it, so three rows are kept,
    `rows[t % 3, f, x]` holding fight f's chance of x attackers against t − x defenders, and each
    total's ended states (x or t − x of 0) are read off as the walk passes it."""
    order = sorted(range(len(fights)), key=lambda f: -sum(fights[f]))
    sizes = [fights[f] for f in order]  # largest first, so the fights a total reaches lead
    count = len(sizes)
    most_a = max(a for a, _ in sizes)
    most_d = max(d for _, d in sizes)
    rows = np.zeros((3, count, most_a + 1))
    attacker_won = np.zeros((count, most_a + 1))  # [f, x]: x attackers against none
    defender_won = np.zeros((count, most_d + 1))  # [f, y]: none against y defenders

    def read_ended(total: int) -> None:
        row = rows[total % 3]
        if total <= most_a:
            attacker_won[:, total] = row[:, total]
        if total <= most_d:
            defender_won[:, total] = row[:, 0]

    reached = 0
    for total in range(sum(sizes[0]), 1, -1):
        while reached < count and sum(sizes[reached]) == total:
            rows[total % 3, reached, sizes[reached][0]] = 1.0
            reached += 1
        read_ended(total)
        rows[(total - 2) % 3] = 0
        hi = min(max(a for a, _ in sizes[:reached]), total - 1)
        lo = max(1, total - max(d for _, d in sizes[:reached]))
        x = np.arange(lo, hi + 1)
        p = rows[total % 3, :reached, lo : hi + 1]
        chances = SHIFT_CHANCE[np.minimum(3, x), np.minimum(2, total - x)]
        for s, (al, dl) in enumerate(SHIFTS):
            start = max(lo, al)
            if start > hi:
                continue
            target = rows[(total - al - dl) % 3, :reached, start - al : hi - al + 1]
            target += chances[start - lo :, s] * p[:, start - lo :]
    read_ended(1)
    read_ended(0)

    worked = {}
    for f, (a, d) in enumerate(sizes):
        attacker_lost = np.zeros(a + 1)
        defender_lost = np.zeros(d + 1)
        attacker_lost[a] = add(defender_won[f, : d + 1])
        defender_lost[d] = add(attacker_won[f, : a + 1])
        attacker_lost[:a] = attacker_won[f, a:0:-1]
        defender_lost[:d] = defender_won[f, d:0:-1]
        worked[order[f]] = (attacker_lost, defender_lost)
    return [worked[f] for f in range(count)]


# GD keeps its balance settings as doubles and casts each to a 32-bit float before using it.
WIN_CHANCE_CUTOFF = fround(0.05)
WIN_CHANCE_POWER = fround(1.3)
OUTCOME_CUTOFF = fround(0.1)
OUTCOME_POWER = fround(1.8)


def scale_to(values: np.ndarray, total: float, start: int, length: int) -> None:
    """`scaleTo`."""
    if total <= 0:
        values[start : start + length] = 0
        return
    s = add(values[start : start + length])
    if s <= 0:
        values[start : start + length] = total / length
        return
    values[start : start + length] *= total / s


def trim_front(values: np.ndarray) -> None:
    """`trimFront`."""
    s = 0.0
    for i in range(len(values)):
        s += float(values[i])
        if s <= OUTCOME_CUTOFF:
            values[i] = 0
        else:
            values[i] = s - OUTCOME_CUTOFF
            return


def balance(attacker_lost: np.ndarray, defender_lost: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """`balance`: steps 2 to 5 of `COMBAT-8`, on copies."""
    al = attacker_lost.copy()
    dl = defender_lost.copy()
    a = len(al) - 1
    d = len(dl) - 1

    if WIN_CHANCE_CUTOFF >= dl[d]:
        al[:] = 0
        al[a] = 1
        dl[d] = 0
        scale_to(dl, 1, 0, d)
    if WIN_CHANCE_CUTOFF >= al[a]:
        dl[:] = 0
        dl[d] = 1
        al[a] = 0
        scale_to(al, 1, 0, a)

    push_win = v8_pow(float(dl[d]), WIN_CHANCE_POWER)
    push_hold = v8_pow(float(al[a]), WIN_CHANCE_POWER)
    win = push_win / (push_win + push_hold)
    hold = push_hold / (push_win + push_hold)
    scale_to(al, win, 0, a)
    scale_to(dl, hold, 0, d)
    dl[d] = win
    al[a] = hold

    combined = np.concatenate([al[:a], dl[:d][::-1]])
    trim_front(combined)
    combined = combined[::-1].copy()
    trim_front(combined)
    combined = combined[::-1].copy()
    al[:a] = combined[:a]
    dl[:d] = combined[a:][::-1]
    captures = add(al[:a])
    holds = add(dl[:d])
    k = 1 / (holds + captures)
    scale_to(al, captures * k, 0, a)
    scale_to(dl, holds * k, 0, d)
    al[a] = holds * k
    dl[d] = captures * k

    for i in range(a):
        al[i] = v8_pow(float(al[i]), OUTCOME_POWER)
    for j in range(d):
        dl[j] = v8_pow(float(dl[j]), OUTCOME_POWER)
    scale_to(al, float(dl[d]), 0, a)
    scale_to(dl, float(al[a]), 0, d)
    return al, dl


@lru_cache(maxsize=4096)
def _balanced(a: int, d: int) -> tuple[np.ndarray, np.ndarray]:
    al, dl = balance(*(estimate_fight(a, d) if a + d > ESTIMATED_ABOVE else fair_fight(a, d)))
    al.flags.writeable = False
    dl.flags.writeable = False
    return al, dl


def balanced_fight(a: int, d: int) -> tuple[np.ndarray, np.ndarray] | None:
    """`balancedFight`: (attackerLost, defenderLost), or None where GD rolls the fight instead."""
    if a + d > ROLLED_ABOVE:
        return None
    return _balanced(a, d)


@dataclass
class Cell:
    """What `gpu-tables.ts` writes for one fight: the capture chance, each side's running totals
    as `pickOutcome` accumulates them (−1 where an outcome's chance is ≤ 0), and each side's
    likeliest outcome."""

    capture: float
    values_a: np.ndarray
    values_d: np.ndarray
    likeliest_a: int
    likeliest_d: int


def running_totals(chances: np.ndarray, end: int) -> tuple[np.ndarray, int]:
    """`runningTotals`."""
    out = np.empty(end)
    s = 0.0
    likeliest = 0
    for i in range(end):
        c = float(chances[i])
        if not math.isfinite(c):
            raise ValueError(f"a chance of {c}")
        if c > chances[likeliest]:
            likeliest = i
        if c <= 0:
            out[i] = -1
            continue
        s += c
        out[i] = s
    return out, likeliest


def cell(a: int, d: int) -> Cell:
    """The table cell of a blitz of `a` against `d`."""
    fight = balanced_fight(a, d)
    if fight is None:
        raise ValueError(f"GD rolls {a} against {d} battle by battle: no table holds it")
    al, dl = fight
    values_a, likeliest_a = running_totals(al, a)
    values_d, likeliest_d = running_totals(dl, d)
    return Cell(float(dl[d]), values_a, values_d, likeliest_a, likeliest_d)


# ---------------------------------------------------------------------------
# GD's estimate of the fair odds of a fight too large to work out
# ---------------------------------------------------------------------------


def round_half_even(x: float) -> int:
    """`roundHalfEven`: .NET's `Math.Round`."""
    floor = math.floor(x)
    fraction = x - floor
    if fraction > 0.5:
        return floor + 1
    if fraction < 0.5:
        return floor
    return floor if floor % 2 == 0 else floor + 1


def combined_order(attacker_lost: np.ndarray, defender_lost: np.ndarray) -> np.ndarray:
    a = len(attacker_lost) - 1
    d = len(defender_lost) - 1
    return np.concatenate([attacker_lost[:a], defender_lost[:d][::-1]])


def outcome_index(combined: np.ndarray, target: float) -> int:
    s = 0.0
    for k in range(len(combined)):
        s += float(combined[k])
        if s >= target:
            return k
    return len(combined) - 1


def fit_line(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """`fitLine`: (slope, intercept)."""
    n = len(xs)
    sx = 0.0
    sy = 0.0
    sxy = 0.0
    sxx = 0.0
    for i in range(n):
        sx += xs[i]
        sy += ys[i]
        sxy += xs[i] * ys[i]
        sxx += xs[i] * xs[i]
    slope = (n * sxy - sy * sx) / (n * sxx - sx * sx)
    return slope, sy / n - (sx / n) * slope


def win_chance_model(xs: list[float], ws: list[float]):
    """`winChanceModel`."""
    first = ws[0]
    last = ws[-1]
    if abs(last - first) <= 0.0001:
        slope, intercept = fit_line(xs, ws)
        return lambda x: slope * x + intercept
    rising = last > first
    kept = [(x, 1 - w if rising else w) for x, w in zip(xs, ws)]
    kept = [(x, y) for x, y in kept if y > 0]
    scale = 0.0
    rate = 0.0
    if len(kept) >= 2:
        slope, intercept = fit_line([x for x, _ in kept], [v8_log(y) for _, y in kept])
        scale = v8_exp(intercept)
        rate = -slope
    if rising:
        return lambda x: 1 - scale * v8_exp(-rate * x)
    return lambda x: scale * v8_exp(-rate * x)


def stretch(source: np.ndarray, s0: int, s1: int, dest: np.ndarray, t0: int, t1: int) -> None:
    """`stretch`."""
    if s1 <= s0 or t1 <= t0:
        return
    scale = (t1 - t0) / (s1 - s0)
    for k in range(s0, s1):
        start = t0 + (k - s0) * scale
        end = start + scale
        for c in range(math.floor(start), min(t1, math.ceil(end))):
            overlap = min(end, c + 1) - max(start, c)
            if overlap > 0:
                dest[c] += (float(source[k]) * overlap) / scale


@dataclass
class EstimateSteps:
    xs: list[float]
    ws: list[float]
    best: list[int]
    mid: list[int]
    worst: list[int]
    largest: np.ndarray


def estimate_steps(a: int, d: int) -> EstimateSteps:
    """`estimateSteps`. They depend on the fight only through its float32 ratio."""
    return _estimate_steps_for(fround(fround(a) / fround(d)))


@lru_cache(maxsize=1024)
def _estimate_steps_for(ratio: float) -> EstimateSteps:
    sizes = []
    for i in range(10):
        total = i * (1900 / 9) + 100
        step_a = max(1, round_half_even((ratio * total) / (ratio + 1)))
        step_d = max(1, round_half_even(total - round_half_even((ratio * total) / (ratio + 1))))
        sizes.append((step_a, step_d))
    fights = fair_fights(sizes)
    steps = EstimateSteps([], [], [], [], [], np.zeros(0))
    for i, (step_a, step_d) in enumerate(sizes):
        al, dl = fights[i]
        combined = combined_order(al, dl)
        steps.xs.append(step_a + step_d)
        steps.ws.append(min(1.0, max(0.0, float(dl[step_d]))))
        steps.best.append(outcome_index(combined, 0.01))
        steps.mid.append(outcome_index(combined, 0.5))
        steps.worst.append(outcome_index(combined, 0.99))
        steps.largest = combined
    return steps


def estimated_win_chance(a: int, d: int) -> float:
    """`estimatedWinChance`: GD's fitted fair capture chance, unclamped."""
    steps = estimate_steps(a, d)
    return win_chance_model(steps.xs, steps.ws)(a + d)


def estimate_fight(a: int, d: int) -> tuple[np.ndarray, np.ndarray]:
    """`estimateFight`, with GD's defender side copied one place off, as the TypeScript keeps it."""
    n = a + d
    steps = estimate_steps(a, d)
    win_chance = min(1.0, max(0.0, win_chance_model(steps.xs, steps.ws)(n)))

    def at(ys: list[int]) -> int:
        slope, intercept = fit_line(steps.xs, ys)
        return min(n - 1, max(0, round_half_even(fround(n * slope + intercept))))

    dest = np.zeros(n)
    stretch(steps.largest, steps.best[9], steps.mid[9], dest, at(steps.best), at(steps.mid))
    stretch(steps.largest, steps.mid[9], steps.worst[9], dest, at(steps.mid), at(steps.worst))

    attacker_lost = np.zeros(a + 1)
    defender_lost = np.zeros(d + 1)
    attacker_lost[:a] = dest[:a]
    for j in range(d):
        defender_lost[j] = dest[n - 2 - j]
    attacker_lost[a] = 1 - win_chance
    defender_lost[d] = win_chance
    scale_to(attacker_lost, win_chance, 0, a)
    scale_to(defender_lost, 1 - win_chance, 0, d)
    return attacker_lost, defender_lost


# ---------------------------------------------------------------------------
# GD's AI's odds (`bots/gd/odds.ts`)
# ---------------------------------------------------------------------------


def balance_win_chance(chance: float) -> float:
    """`balanceWinChance`: `BlitzC.AppleWinChanceBalance` with GD's default balance."""
    p = chance
    if 0.05 > p:
        p = 0
    elif p > 1 - 0.05:
        p = 1
    push = v8_pow(float(p), 1.3)
    w = push / (push + v8_pow(float(1 - p), 1.3))
    win = w - 0.1
    hold = 1 - w - 0.1
    if 0 > win:
        hold += -win
        win = 0
    if 0 > hold:
        win += -hold
        hold = 0
    return win / (win + hold)


def win_chance(attack: int, defend: int) -> float:
    """`winChance`."""
    if attack <= 0:
        return 0
    if attack + defend > ESTIMATED_ABOVE:
        return balance_win_chance(estimated_win_chance(attack, defend))
    fight = balanced_fight(attack, defend)
    if fight is None:
        raise ValueError(f"no odds for {attack} against {defend}")
    return float(fight[1][defend])


INT_MAX = 2147483647


@lru_cache(maxsize=None)
def ideal_attack_units(defend: int, threshold: float = fround(0.9)) -> int:
    """`idealAttackUnits`: the fewest attackers whose chance of taking `defend` reaches
    `threshold`, by GD's doubling then halving search."""
    d = max(defend, 1)
    required = min(1, max(0, threshold))
    start = round_half_even(fround(fround(d) * fround(0.2)))
    lo = 1
    hi = max(start, 1)
    while required > win_chance(hi, d):
        lo = hi
        hi *= 2
        if hi > INT_MAX:
            hi = INT_MAX
            break
    probes = 0
    while True:
        if lo + 1 >= hi:
            return hi
        mid = max(1, lo + (hi - lo) // 2)
        if win_chance(mid, d) >= required:
            hi = mid
        else:
            lo = mid
        if probes >= 100:
            return INT_MAX
        probes += 1


# ---------------------------------------------------------------------------
# V8's Math.pow, Math.log and Math.exp (`src/base/ieee754.cc`, from fdlibm)
# ---------------------------------------------------------------------------
# Python's `**`, `math.log` and `math.exp` call the C library, which on Windows rounds differently
# in the last bit for about 10% of pow's arguments and 5% of log's and exp's. The V8 of the repo's
# pinned Node (22, V8 12.4) computes all three itself in fdlibm's sequence of float64 steps, which
# this repeats step for step. Newer V8 (Node 24) computes pow differently (here nearly always as the
# C library does), so moving the pinned Node changes the odds in the last bit, and the tables.


def _words(x):
    b = struct.unpack("<Q", struct.pack("<d", x))[0]
    hi = b >> 32
    if hi >= 0x80000000:
        hi -= 0x100000000
    return hi, b & 0xFFFFFFFF


def _from_words(hi, lo):
    return struct.unpack("<d", struct.pack("<Q", ((hi & 0xFFFFFFFF) << 32) | (lo & 0xFFFFFFFF)))[0]


def _high(x):
    return _words(x)[0]


def _set_high(x, hi):
    return _from_words(hi, _words(x)[1])


def _set_low(x, lo):
    return _from_words(_words(x)[0], lo)


def _c(hi, lo):
    return _from_words(hi, lo)


BP = (1.0, 1.5)
DP_H = (0.0, _c(0x3FE2B803, 0x40000000))
DP_L = (0.0, _c(0x3E4CFDEB, 0x43CFD006))
TWO53 = _c(0x43400000, 0)
HUGE = 1.0e300
TINY = 1.0e-300
L1 = _c(0x3FE33333, 0x33333303)
L2 = _c(0x3FDB6DB6, 0xDB6FABFF)
L3 = _c(0x3FD55555, 0x518F264D)
L4 = _c(0x3FD17460, 0xA91D4101)
L5 = _c(0x3FCD864A, 0x93C9DB65)
L6 = _c(0x3FCA7E28, 0x4A454EEF)
P1 = _c(0x3FC55555, 0x5555553E)
P2 = _c(0xBF66C16C, 0x16BEBD93)
P3 = _c(0x3F11566A, 0xAF25DE2C)
P4 = _c(0xBEBBBD41, 0xC5D26BF1)
P5 = _c(0x3E663769, 0x72BEA4D0)
LG2 = _c(0x3FE62E42, 0xFEFA39EF)
LG2_H = _c(0x3FE62E43, 0x00000000)
LG2_L = _c(0xBE205C61, 0x0CA86C39)
OVT = 8.0085662595372944372e-17
CP = _c(0x3FEEC709, 0xDC3A03FD)
CP_H = _c(0x3FEEC709, 0xE0000000)
CP_L = _c(0xBE3E2FE0, 0x145B01F5)


def v8_pow(x: float, y: float) -> float:
    """V8's `Math.pow` and `**` for the arguments the odds pass (x ≥ 0, finite)."""
    hx, lx = _words(x)
    hy, ly = _words(y)
    ix = hx & 0x7FFFFFFF
    iy = hy & 0x7FFFFFFF
    if (iy | ly) == 0:
        return 1.0
    if x == 1.0:
        return 1.0
    if not (math.isfinite(x) and math.isfinite(y)) or x < 0 or iy > 0x41E00000:
        raise NotImplementedError(f"pow({x!r}, {y!r}) is outside the port")
    if ly == 0:
        if iy == 0x3FF00000:
            return x if hy >= 0 else 1.0 / x
        if hy == 0x40000000:
            return x * x
        if hy == 0x3FE00000:
            return math.sqrt(x)
    ax = abs(x)
    if lx == 0 and (ix == 0 or ix == 0x3FF00000):
        z = ax
        if hy < 0:
            z = 1.0 / z
        return z
    s = 1.0
    n = 0
    if ix < 0x00100000:
        ax *= TWO53
        n -= 53
        ix = _high(ax)
    n += (ix >> 20) - 0x3FF
    j = ix & 0x000FFFFF
    ix = j | 0x3FF00000
    if j <= 0x3988E:
        k = 0
    elif j < 0xBB67A:
        k = 1
    else:
        k = 0
        n += 1
        ix -= 0x00100000
    ax = _set_high(ax, ix)

    u = ax - BP[k]
    v = 1.0 / (ax + BP[k])
    ss = u * v
    s_h = _set_low(ss, 0)
    t_h = _from_words(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0)
    t_l = ax - (t_h - BP[k])
    s_l = v * ((u - s_h * t_h) - s_h * t_l)
    s2 = ss * ss
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))))
    r += s_l * (s_h + ss)
    s2 = s_h * s_h
    t_h = _set_low(3.0 + s2 + r, 0)
    t_l = r - ((t_h - 3.0) - s2)
    u = s_h * t_h
    v = s_l * t_h + t_l * ss
    p_h = _set_low(u + v, 0)
    p_l = v - (p_h - u)
    z_h = CP_H * p_h
    z_l = CP_L * p_h + p_l * CP + DP_L[k]
    t = float(n)
    t1 = _set_low(((z_h + z_l) + DP_H[k]) + t, 0)
    t2 = z_l - (((t1 - t) - DP_H[k]) - z_h)

    y1 = _set_low(y, 0)
    p_l = (y - y1) * t1 + y * t2
    p_h = y1 * t1
    z = p_l + p_h
    j, i = _words(z)
    if j >= 0x40900000:
        if ((j - 0x40900000) | i) != 0 or p_l + OVT > z - p_h:
            return s * HUGE * HUGE
    elif (j & 0x7FFFFFFF) >= 0x4090CC00:
        if ((j - (0xC090CC00 - 0x100000000)) | i) != 0 or p_l <= z - p_h:
            return s * TINY * TINY

    i = j & 0x7FFFFFFF
    k = (i >> 20) - 0x3FF
    n = 0
    if i > 0x3FE00000:
        n = j + (0x00100000 >> (k + 1))
        k = ((n & 0x7FFFFFFF) >> 20) - 0x3FF
        t = _from_words(n & ~(0x000FFFFF >> k), 0)
        n = ((n & 0x000FFFFF) | 0x00100000) >> (20 - k)
        if j < 0:
            n = -n
        p_h -= t
    t = _set_low(p_l + p_h, 0)
    u = t * LG2_H
    v = (p_l - (t - p_h)) * LG2 + t * LG2_L
    z = u + v
    w = v - (z - u)
    t = z * z
    t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
    # V8's parenthesisation, not fdlibm's `(z*t1)/(t1-two) - (w+z*w)`: V8 has carried it since its port.
    r = (z * t1) / ((t1 - 2.0) - (w + z * w))
    z = 1.0 - (r - z)
    j = _high(z)
    j += n << 20
    if (j >> 20) <= 0:
        z = math.ldexp(z, n)
    else:
        z = _set_high(z, j)
    return s * z


LN2_HI = _c(0x3FE62E42, 0xFEE00000)
LN2_LO = _c(0x3DEA39EF, 0x35793C76)
TWO54 = _c(0x43500000, 0)
LG1 = _c(0x3FE55555, 0x55555593)
LG2_ = _c(0x3FD99999, 0x9997FA04)
LG3 = _c(0x3FD24924, 0x94229359)
LG4 = _c(0x3FCC71C5, 0x1D8E78AF)
LG5 = _c(0x3FC74664, 0x96CB03DE)
LG6 = _c(0x3FC39A09, 0xD078C69F)
LG7 = _c(0x3FC2F112, 0xDF3E5244)


def v8_log(x: float) -> float:
    """V8's `Math.log`."""
    hx, lx = _words(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7FFFFFFF) | lx) == 0:
            return -math.inf
        if hx < 0:
            return math.nan
        k -= 54
        x *= TWO54
        hx = _high(x)
    if hx >= 0x7FF00000:
        return x + x
    k += (hx >> 20) - 1023
    hx &= 0x000FFFFF
    i = (hx + 0x95F64) & 0x100000
    x = _set_high(x, hx | (i ^ 0x3FF00000))
    k += i >> 20
    f = x - 1.0
    if (0x000FFFFF & (2 + hx)) < 3:
        if f == 0.0:
            if k == 0:
                return 0.0
            dk = float(k)
            return dk * LN2_HI + dk * LN2_LO
        R = f * f * (0.5 - 0.33333333333333333 * f)
        if k == 0:
            return f - R
        dk = float(k)
        return dk * LN2_HI - ((R - dk * LN2_LO) - f)
    s = f / (2.0 + f)
    dk = float(k)
    z = s * s
    i = hx - 0x6147A
    w = z * z
    j = 0x6B851 - hx
    t1 = w * (LG2_ + w * (LG4 + w * LG6))
    t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
    i |= j
    R = t2 + t1
    if i > 0:
        hfsq = 0.5 * f * f
        if k == 0:
            return f - (hfsq - s * (hfsq + R))
        return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f)
    if k == 0:
        return f - s * (f - R)
    return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f)


O_THRESHOLD = _c(0x40862E42, 0xFEFA39EF)
U_THRESHOLD = _c(0xC0874910, 0xD52D3051)
TWOM1000 = _c(0x01700000, 0)
INVLN2 = _c(0x3FF71547, 0x652B82FE)


def v8_exp(x: float) -> float:
    """V8's `Math.exp`."""
    hx = _high(x)
    xsb = (hx >> 31) & 1
    hx &= 0x7FFFFFFF
    if hx >= 0x40862E42:
        if hx >= 0x7FF00000:
            if math.isnan(x):
                return x
            return 0.0 if xsb else x
        if x > O_THRESHOLD:
            return math.inf
        if x < U_THRESHOLD:
            return 0.0
    if hx > 0x3FD62E42:
        if hx < 0x3FF0A2B2:
            hi = x - (LN2_HI if xsb == 0 else -LN2_HI)
            lo = LN2_LO if xsb == 0 else -LN2_LO
            k = 1 - xsb - xsb
        else:
            k = int(INVLN2 * x + (0.5 if xsb == 0 else -0.5))
            t = float(k)
            hi = x - t * LN2_HI
            lo = t * LN2_LO
        x = hi - lo
    elif hx < 0x3E300000:
        return 1.0 + x
    else:
        k = 0
    t = x * x
    if k >= -1021:
        twopk = _from_words(0x3FF00000 + (k << 20), 0)
    else:
        twopk = _from_words(0x3FF00000 + ((k + 1000) << 20), 0)
    c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
    if k == 0:
        return 1.0 - ((x * c) / (c - 2.0) - x)
    y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi)
    if k >= -1021:
        if k == 1024:
            return y * 2.0 * _c(0x7FE00000, 0)
        return y * twopk
    return y * twopk * TWOM1000

"""Exact x placement for the family tree's sugiyama layout, when lines need
keeping apart.

coord.ts runs this script only when d3-dag's placement (coordSimplex) puts
two families' vertical lines too close together. It writes the placement
problem to stdin as JSON:

    {"x0": [x, ...], "sep": [[left, right, distance], ...],
     "links": [[u, v, weight], ...],
     "apart": [{"a": [[node, offset], ...], "b": [[node, offset], ...],
                "min": distance}, ...]}

`x0` is d3-dag's placement of every node (chains and the dummy nodes long
lines pass through). `sep` keeps neighbours in a layer at least `distance`
apart, left to right. `links` are the segments between adjacent layers, and
`weight` is how much each one's horizontal length costs, as coordSimplex
weighs it. Each `apart` entry is a pair of vertical lines that must end up
at least `min` apart: a line's x is the mean of its terms, each a node's x
plus an offset. The answer goes to stdout as JSON:

    {"status": "OPTIMAL", "x": [x, ...]}

The model, in four solves, each holding the previous ones at their optimum:

1. Minimize the weighted horizontal length of the links, as coordSimplex does,
   subject to the separations and the `apart` pairs. Each pair is a
   disjunction (one line left of the other, or right of it), so it gets a
   boolean for which side, which is why this is CP-SAT and not an LP.
2. Minimize how far the nodes move from `x0`, so the placement changes only
   where the lines need room.
3. Pick the sides: minimize the side booleans read as a binary number, which
   has exactly one minimum.
4. With the sides fixed, minimize the sum of all x. What remains is a set of
   difference constraints and convex costs, whose minimizers are closed under
   taking the lower of two coordinates, so this has exactly one minimum too.

Solves 3 and 4 make the answer unique, so it doesn't depend on which of
CP-SAT's parallel workers finds it first (a line's x from two nodes, parents
in two chains, is the one case outside that argument). Coordinates are
integers: every width, gap and offset in the layout is.

Pass --progress to report each solve's time on stderr.
"""

import json
import sys
import time

from ortools.sat.python import cp_model

# Far above any real solve (the live tree's four solves take seconds).
TIME_LIMIT_S = 600
WORKERS = 16
# Solve 3 weighs each side boolean by a power of two, which int64 bounds.
MAX_PAIRS = 60


def log(message):
    print(f"coord: {message}", file=sys.stderr, flush=True)


def build(problem):
    x0 = [round(x) for x in problem["x0"]]
    span = sum(abs(d) for _, _, d in problem["sep"]) + sum(p["min"] for p in problem["apart"])
    lo, hi = min(x0) - span - 1, max(x0) + span + 1

    m = cp_model.CpModel()
    x = [m.new_int_var(lo, hi, "") for _ in x0]
    for left, right, distance in problem["sep"]:
        m.add(x[right] - x[left] >= distance)

    length_terms = []
    for u, v, weight in problem["links"]:
        d = m.new_int_var(0, hi - lo, "")
        m.add(d >= x[u] - x[v])
        m.add(d >= x[v] - x[u])
        length_terms.append(weight * d)
    length = cp_model.LinearExpr.sum(length_terms)

    sides = []
    for pair in problem["apart"]:
        # Scale both lines' x to a common denominator: |nb*A - na*B| >= min*na*nb.
        a, b = pair["a"], pair["b"]
        na, nb = len(a), len(b)
        diff = nb * sum(x[n] + o for n, o in a) - na * sum(x[n] + o for n, o in b)
        bound = pair["min"] * na * nb
        a_right = m.new_bool_var("")
        m.add(diff >= bound).only_enforce_if(a_right)
        m.add(diff <= -bound).only_enforce_if(~a_right)
        sides.append(a_right)

    return m, x, x0, length, sides, lo, hi


class NotProved(Exception):
    pass


def minimize(m, objective, name, show_progress, start):
    """Minimize, then hold the objective at its optimum for the next solve."""
    m.minimize(objective)
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = WORKERS
    solver.parameters.max_time_in_seconds = TIME_LIMIT_S
    status = solver.solve(m)
    if status != cp_model.OPTIMAL:
        raise NotProved(solver.status_name(status))
    best = round(solver.objective_value)
    m.add(objective <= best)
    if show_progress:
        log(f"{time.perf_counter() - start:.1f}s: {name} proved optimal ({best})")
    return solver


def main():
    show_progress = "--progress" in sys.argv[1:]
    problem = json.load(sys.stdin)
    if len(problem["apart"]) > MAX_PAIRS:
        json.dump({"status": f"TOO_MANY_PAIRS ({len(problem['apart'])} > {MAX_PAIRS})"}, sys.stdout)
        return
    start = time.perf_counter()

    m, x, x0, length, sides, lo, hi = build(problem)
    moves = []
    for xi, target in zip(x, x0):
        d = m.new_int_var(0, hi - lo, "")
        m.add(d >= xi - target)
        m.add(d >= target - xi)
        moves.append(d)
    try:
        minimize(m, length, "1, line length", show_progress, start)
        minimize(m, cp_model.LinearExpr.sum(moves), "2, movement", show_progress, start)
        minimize(
            m,
            cp_model.LinearExpr.weighted_sum(sides, [2**k for k in range(len(sides))]),
            "3, sides",
            show_progress,
            start,
        )
        solver = minimize(m, cp_model.LinearExpr.sum(x), "4, leftmost", show_progress, start)
    except NotProved as status:
        json.dump({"status": str(status)}, sys.stdout)
        return

    if show_progress:
        log(f"kept {len(sides)} pairs of lines apart in {time.perf_counter() - start:.1f}s")
    json.dump({"status": "OPTIMAL", "x": [solver.value(xi) for xi in x]}, sys.stdout)


if __name__ == "__main__":
    main()

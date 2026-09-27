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

The model, in two solves:

1. Minimize the weighted horizontal length of the links, as coordSimplex does,
   subject to the separations and the `apart` pairs. Each pair is a
   disjunction (one line left of the other, or right of it), so it gets a
   boolean for which side, which is why this is CP-SAT and not an LP.
2. Holding that length at its optimum, minimize how far the nodes move from
   `x0`, so the placement changes only where the lines need room.

Coordinates are integers: every width, gap and offset in the layout is. One
worker keeps the answer deterministic when several placements tie.
"""

import json
import sys
import time

from ortools.sat.python import cp_model

TIME_LIMIT_S = 600


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

    for pair in problem["apart"]:
        # Scale both lines' x to a common denominator: |nb*A - na*B| >= min*na*nb.
        a, b = pair["a"], pair["b"]
        na, nb = len(a), len(b)
        diff = nb * sum(x[n] + o for n, o in a) - na * sum(x[n] + o for n, o in b)
        bound = pair["min"] * na * nb
        a_right = m.new_bool_var("")
        m.add(diff >= bound).only_enforce_if(a_right)
        m.add(diff <= -bound).only_enforce_if(~a_right)

    return m, x, x0, length, lo, hi


def solve(m):
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.max_time_in_seconds = TIME_LIMIT_S
    status = solver.solve(m)
    return solver, status


def main():
    show_progress = "--progress" in sys.argv[1:]
    problem = json.load(sys.stdin)
    start = time.perf_counter()

    m, x, x0, length, lo, hi = build(problem)
    m.minimize(length)
    solver, status = solve(m)
    if status != cp_model.OPTIMAL:
        json.dump({"status": solver.status_name(status)}, sys.stdout)
        return
    best = round(solver.objective_value)

    m.add(length <= best)
    moves = []
    for xi, target in zip(x, x0):
        d = m.new_int_var(0, hi - lo, "")
        m.add(d >= xi - target)
        m.add(d >= target - xi)
        moves.append(d)
    m.minimize(cp_model.LinearExpr.sum(moves))
    solver, status = solve(m)
    if status != cp_model.OPTIMAL:
        json.dump({"status": solver.status_name(status)}, sys.stdout)
        return

    if show_progress:
        log(
            f"kept {len(problem['apart'])} pairs of lines apart in {time.perf_counter() - start:.1f}s, "
            f"moving nodes {round(solver.objective_value)}px in all"
        )
    json.dump({"status": "OPTIMAL", "x": [solver.value(xi) for xi in x]}, sys.stdout)


if __name__ == "__main__":
    main()

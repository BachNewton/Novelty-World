"""Exact crossing minimization for the family tree's sugiyama layout.

decross.ts runs this script and writes the layered graph to its stdin as JSON:

    {"layers": [size, ...], "edges": [[[a, c], ...], ...]}

`layers` gives each layer's node count. `edges[L]` lists the edges from layer
L to layer L+1 as (index in layer L, index in layer L+1) pairs, with indices
in d3-dag's incoming order. The answer goes to stdout as JSON:

    {"status": "OPTIMAL", "crossings": n, "orders": [[index, ...], ...]}

where `orders[L]` is layer L's new left-to-right order as incoming indices.
decross.ts accepts only OPTIMAL; any other status is reported, not used.

The model is Juenger and Mutzel's, as d3-dag's own decrossOpt builds it:

- Order variable x[L][i][j] for each i < j in a layer: 0 keeps i before j,
  1 puts j before i. Transitivity per triple i < j < k keeps each layer a
  total order: 0 <= x_ij + x_jk - x_ik <= 1.
- Crossing variable per pair of edges (a->c, b->d) between adjacent layers
  that share no endpoint, forced to 1 when the pair crosses. With a < b, they
  cross iff x_ab != x_cd when c < d, and iff x_ab == x_dc when c > d.
- Objective: fewest crossings, ties broken toward fewest reversed pairs,
  i.e. the incoming order. Crossings weigh as much as every order variable
  together, so the tiebreak never outweighs a crossing.

The crossing variables are continuous >= 0 in the LP form. They are only ever
bounded below by 0 or 1 and are minimized, so every optimum puts them at 0 or
1, and booleans give the same optimum. The integer objective (crossings scaled
by the order-variable count) makes CP-SAT's optimality proof exact.

Pass --progress to report the search on stderr while it runs.
"""

import json
import sys
import threading
import time

from ortools.sat.python import cp_model

# Far above any real solve (the live tree takes seconds). Hitting it means
# something changed drastically, and the status says so rather than a
# half-proved layout being used.
TIME_LIMIT_S = 1800
WORKERS = 16
HEARTBEAT_S = 10


def log(message):
    print(f"decross: {message}", file=sys.stderr, flush=True)


def build(layers, edges):
    m = cp_model.CpModel()
    order = []
    order_vars = []
    for size in layers:
        x = {}
        for i in range(size):
            for j in range(i + 1, size):
                x[i, j] = m.new_bool_var("")
                order_vars.append(x[i, j])
        for i in range(size):
            for j in range(i + 1, size):
                for k in range(j + 1, size):
                    m.add_linear_constraint(x[i, j] + x[j, k] - x[i, k], 0, 1)
        order.append(x)

    crossing_vars = []
    for L, gap in enumerate(edges):
        upper, lower = order[L], order[L + 1]
        for p in range(len(gap)):
            for q in range(p + 1, len(gap)):
                (a, c), (b, d) = gap[p], gap[q]
                if a == b or c == d:
                    continue
                if a > b:
                    a, b, c, d = b, a, d, c
                s = m.new_bool_var("")
                crossing_vars.append(s)
                xab = upper[a, b]
                if c < d:
                    xcd = lower[c, d]
                    m.add(s - xab + xcd >= 0)
                    m.add(s + xab - xcd >= 0)
                else:
                    xdc = lower[d, c]
                    m.add(s + xab + xdc >= 1)
                    m.add(s - xab - xdc >= -1)

    weight = len(order_vars)
    m.minimize(
        weight * cp_model.LinearExpr.sum(crossing_vars) + cp_model.LinearExpr.sum(order_vars)
    )
    return m, order, order_vars, crossing_vars


class Progress(cp_model.CpSolverSolutionCallback):
    def __init__(self, crossing_vars, start):
        super().__init__()
        self._crossing_vars = crossing_vars
        self._start = start
        self.best = None

    def on_solution_callback(self):
        crossings = sum(self.value(s) for s in self._crossing_vars)
        if crossings != self.best:
            self.best = crossings
            log(f"{time.perf_counter() - self._start:.1f}s: found a layout with {crossings} crossings")


def heartbeat(progress, start, done):
    while not done.wait(HEARTBEAT_S):
        best = "none found yet" if progress.best is None else f"best so far {progress.best} crossings"
        log(f"{time.perf_counter() - start:.0f}s: still proving optimality ({best})")


def layer_order(solver, x, size):
    # A node's position is how many nodes the solution puts before it.
    def position(i):
        before = sum(1 for j in range(i) if not solver.boolean_value(x[j, i]))
        return before + sum(1 for j in range(i + 1, size) if solver.boolean_value(x[i, j]))

    return sorted(range(size), key=position)


def main():
    show_progress = "--progress" in sys.argv[1:]
    graph = json.load(sys.stdin)
    layers, edges = graph["layers"], graph["edges"]

    start = time.perf_counter()
    m, order, order_vars, crossing_vars = build(layers, edges)
    if show_progress:
        log(
            f"{len(order_vars)} order variables, {len(crossing_vars)} crossing candidates; "
            f"solving with {WORKERS} workers"
        )

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = WORKERS
    solver.parameters.max_time_in_seconds = TIME_LIMIT_S
    progress = Progress(crossing_vars, start)
    done = threading.Event()
    if show_progress:
        threading.Thread(target=heartbeat, args=(progress, start, done), daemon=True).start()
    status = solver.solve(m, progress if show_progress else None)
    done.set()

    elapsed = time.perf_counter() - start
    name = solver.status_name(status)
    if status != cp_model.OPTIMAL:
        if show_progress:
            log(f"stopped after {elapsed:.1f}s with status {name}")
        json.dump({"status": name}, sys.stdout)
        return

    crossings = sum(solver.value(s) for s in crossing_vars)
    if show_progress:
        log(f"proved optimal in {elapsed:.1f}s: {crossings} crossings")
    orders = [layer_order(solver, x, size) for x, size in zip(order, layers)]
    json.dump({"status": name, "crossings": crossings, "orders": orders}, sys.stdout)


if __name__ == "__main__":
    main()

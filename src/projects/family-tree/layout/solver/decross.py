"""Exact crossing minimization for the family tree's sugiyama layout.

decross.ts runs this script and writes the layered graph to its stdin as JSON:

    {"layers": [size, ...], "chains": [[layer, index], ...],
     "edges": [[[a, pa, c, pc], ...], ...]}

`layers` gives each layer's node count. `chains` lists the nodes that are a
partner chain of two or more people, which the solver may reverse.
`edges[L]` lists the lines from layer L to layer L+1 as (node index in layer
L, port, node index in layer L+1, port), with indices in d3-dag's incoming
order. A port is where on its node the line attaches, as a position along the
chain in its incoming order: two lines at the same node and port share an
endpoint. A node that is not a chain has a single port. The answer goes to
stdout as JSON:

    {"status": "OPTIMAL", "crossings": n, "orders": [[index, ...], ...],
     "reversed": [[layer, index], ...]}

where `orders[L]` is layer L's new left-to-right order as incoming indices and
`reversed` lists the chains drawn in reverse. decross.ts accepts only OPTIMAL;
any other status is reported, not used.

The model is Juenger and Mutzel's, as d3-dag's own decrossOpt builds it,
extended with chain orientation:

- Order variable x[L][i][j] for each i < j in a layer: 0 keeps i before j,
  1 puts j before i. Transitivity per triple i < j < k keeps each layer a
  total order: 0 <= x_ij + x_jk - x_ik <= 1.
- Orientation variable r per chain: 1 draws the chain in reverse, so its
  ports' left-to-right order flips.
- Crossing variable per pair of lines between adjacent layers that share no
  endpoint, forced to 1 when the pair crosses. Each end of the pair is a
  boolean "the second line is left of the first": an order variable when the
  two ends are on different nodes, the chain's orientation variable (or its
  negation) when they are on different ports of one chain. The lines cross
  iff the two ends' booleans differ.
- Objective: fewest crossings, ties broken toward fewest reversed pairs and
  chains, i.e. the incoming order. Crossings outweigh every tiebreak
  variable together, so the tiebreak never outweighs a crossing.

The crossing variables are continuous >= 0 in the LP form. They are only ever
bounded below by 0 or 1 and are minimized, so every optimum puts them at 0 or
1, and booleans give the same optimum. The integer objective (crossings scaled
above the tiebreak's range) makes CP-SAT's optimality proof exact.

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


def build(layers, chains, edges):
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

    reverse = {(L, i): m.new_bool_var("") for L, i in chains}

    def second_left(L, a, pa, b, pb):
        """Whether end (b, pb) is left of end (a, pa) in layer L, or None when
        they are the same endpoint."""
        if a != b:
            return order[L][a, b] if a < b else 1 - order[L][b, a]
        if pa == pb:
            return None
        r = reverse.get((L, a))
        if r is None:
            raise ValueError(f"node {a} of layer {L} has several ports but is not a chain")
        return 1 - r if pb < pa else r

    crossing_vars = []
    for L, gap in enumerate(edges):
        for p in range(len(gap)):
            for q in range(p + 1, len(gap)):
                (a, pa, c, pc), (b, pb, d, pd) = gap[p], gap[q]
                top = second_left(L, a, pa, b, pb)
                bottom = second_left(L + 1, c, pc, d, pd)
                if top is None or bottom is None:
                    continue
                s = m.new_bool_var("")
                crossing_vars.append(s)
                m.add(s >= top - bottom)
                m.add(s >= bottom - top)

    tiebreak = order_vars + list(reverse.values())
    m.minimize(
        (len(tiebreak) + 1) * cp_model.LinearExpr.sum(crossing_vars)
        + cp_model.LinearExpr.sum(tiebreak)
    )
    return m, order, reverse, tiebreak, crossing_vars


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
    layers, chains, edges = graph["layers"], graph["chains"], graph["edges"]

    start = time.perf_counter()
    m, order, reverse, tiebreak, crossing_vars = build(layers, chains, edges)
    if show_progress:
        log(
            f"{len(tiebreak)} order and orientation variables, "
            f"{len(crossing_vars)} crossing candidates; "
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
    reversed_chains = [list(key) for key, r in reverse.items() if solver.boolean_value(r)]
    json.dump(
        {"status": name, "crossings": crossings, "orders": orders, "reversed": reversed_chains},
        sys.stdout,
    )


if __name__ == "__main__":
    main()

# Exact crossing minimization — design notes

The layout's crossing minimization is exact: a proven-optimal solve, run on
the desktop by the CLI before it writes the tree. These notes record why it
is exact rather than heuristic, and why the solver is OR-Tools CP-SAT.

The original idea was a hybrid: run a fast heuristic right away so a decent
layout shows up instantly, then run the exact solve afterwards and swap in
the optimal layout when it finishes. Before deciding whether that was worth
building, we measured how far apart the two actually are.

## Heuristic vs. exact (September 2026)

We ran both on the same sugiyama layers (d3-dag 1.2.2, Node) by wrapping the
decross step and counting crossings between adjacent layers. The counts
include the dummy nodes that long edges pass through, so they are real edge
crossings as drawn. The exact time is the solver of the day, single-threaded
HiGHS compiled to WebAssembly.

| tree | people | layers | nodes incl. dummies | widest layer | before decross | heuristic | exact | exact time |
|---|---|---|---|---|---|---|---|---|
| fixture (`production-tree.json`) | 132 | 5 | 95 | 34 | 149 | 24 | **5** | 11s |
| live DB tree | 161 | 6 | 115 | 43 | 173 | 42 | **6** | 26s |

"Heuristic" is d3-dag's `decrossTwoLayer`, which reorders one layer at a time
based on the layer next to it. We tried three setups: the default; DFS starting
orders with greedy mean aggregation and 8 passes; and the same with median. All
three gave exactly the same count, in 12–50ms.

What this shows:

- **The heuristic is far from optimal on our trees:** 4–7× the crossings, and the
  gap is growing. Going from 132 to 161 people nearly doubled the heuristic's
  count, while the optimum only moved from 5 to 6.
- **Tuning the layer-by-layer heuristic doesn't help.** Three different setups
  landing on the same number suggests it's stuck in a local minimum typical of
  layer-by-layer sweeps, not that it's poorly configured.
- **The two layouts would look very different.** Going from 42 crossings to 6
  means rearranging whole branches, not nudging a few nodes.

## Why no hybrid

The app is a read-only viewer: it renders the exact layout stored beside the
tree and never solves or shows an interim layout. That removes the case the
hybrid was for. A heuristic result is never allowed to reach a viewer, so the
most a heuristic could do is give the desktop solve a head start, and the
solver comparison below found that a head start doesn't help.

## Solver choice (September 2026)

As the tree grew, HiGHS-WASM took minutes, so we compared solvers on the
exact same model (the Jünger–Mutzel formulation d3-dag's `decrossOpt` uses),
exported from the pipeline for the fixture (132 people) and the live tree
(222 people). Every solver proved the same optimum: 5 crossings on the
fixture, 8 on the live tree. Times are wall clock on a 16-core desktop.

| solver | fixture | live tree |
|---|---|---|
| HiGHS-WASM (`highs` npm package, in process) | 12.8s | 345s |
| native HiGHS (`highspy`) | 7.1–7.4s (1 or 16 threads) | 517s (1 thread) |
| SCIP (`pyscipopt`) | 11.6–11.7s | not run |
| CP-SAT, 16 workers | 1.7–1.9s | 7.0–8.3s (3 runs) |
| CP-SAT, 8 workers | 1.6–1.7s | not run |

- **CP-SAT wins by a wide margin,** about 45× on the live tree against the
  in-process solver it replaced. HiGHS gains nothing from more threads on
  this model.
- **Warm starts don't help.** Handing CP-SAT the optimum or the incoming order
  as a hint changed nothing (1.7–1.8s on the fixture, 6.4–6.6s on the live
  tree), and native HiGHS started at the optimum still took 8.0s and 480s:
  proving optimality is the cost, not finding a good layout.
- **Model format doesn't matter.** Importing the model through OR-Tools'
  model builder and building it directly in CP-SAT ran within about 0.2s of
  each other on the fixture.

CP-SAT is also why the solve left the browser for good: it runs in a Python
child process (`layout/decross.ts` and `layout/solver/`). With CP-SAT, the
live tree's full `computeLayout` takes 6–8s, about 2s of it starting Python
and building the model.

**Ties.** The objective breaks ties between equally few crossings toward the
fewest reordered pairs, but that doesn't make every optimum unique. On the
production fixture and the live tree every solver returned the same ordering,
and CP-SAT's layout of the live tree matched the stored HiGHS one exactly. On
the small `kitchenSink` test fixture CP-SAT picks a different ordering from
HiGHS with the same objective, and picks it consistently across runs.

## Reproducing the measurements

For the solver's own timings, run the CLI's `relayout` without `--write`: it
solves the live tree and streams the solver's progress, including the time to
proof. `npm run bench` times the fixture the same way. For heuristic counts,
wrap the decross step so that, on the same layers, it runs each heuristic on a
copy of the layer arrays and then the exact solve on the originals, and count
crossings as inverted pairs among edges between each pair of adjacent layers.
Don't commit the live tree: the repo is public and the tree names living people.

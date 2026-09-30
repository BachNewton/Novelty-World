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
fewest reordered pairs and reversed chains, but that doesn't make every
optimum unique. On the
production fixture and the live tree every solver returned the same ordering,
and CP-SAT's layout of the live tree matched the stored HiGHS one exactly. On
the small `kitchenSink` test fixture CP-SAT picks a different ordering from
HiGHS with the same objective, and picks it consistently across runs.

## What the solve counts: drawn lines, and chain orientation

A layout node is a whole partner chain (a single person, a couple, or a
longer chain like [ex, person, current]), but the lines are drawn to and from
the people in it: a child's line leaves the middle of its parents' union
line, or a lone parent, and ends at the child's own card. Counting crossings between
chains, as d3-dag's model does, misses every crossing between two lines that
end on the same chain. The clearest case is a widower's chain [late wife,
widower, current wife] with both his parents and hers in the tree: when her
parents sit right of his, her line crosses his, and only reversing the chain
removes it. The partner rules fix who sits next to whom in a chain, but a
chain reads the same either way round, so its orientation is free.

So the model counts crossings between the lines as drawn:

- **Ports.** Each line attaches to a chain at a port, a position along the
  chain: a person's own place for the child's end, and for the parents' end
  the point their drop leaves from: the midpoint of the parents' places, or,
  for a couple joined by a bracket (`edge-routing-notes.md`), the middle of
  its run. Lines on the same chain and port share an endpoint and never
  cross each other.
- **Orientation.** One boolean per chain of two or more members reverses it,
  flipping the left-to-right order of its ports.
- **Crossings.** Two lines between adjacent layers cross when their ends are
  in opposite order at the top and the bottom. Each end's order is an order
  variable when the ends are on different chains, and the chain's orientation
  variable (or its negation) when they are on different ports of one chain.
  So the crossing constraint keeps the same shape as before, and the solve is
  still a proven optimum, now over the true crossing count.

Where flipping a chain costs no crossing, the orientation is settled after
placement: whichever way puts the chain's members nearer their own parents.
`layout/decross.ts` checks the solver's reported count against the drawn
ordering, and uses the same rule to keep that last step from adding a
crossing.

On the production fixture, counting crossings between the drawn lines: the
chain-level model proved 4 crossings between chains, but its layout drew 8;
this model proves 4 and draws 4, with two chains reversed. The solve still
proves its optimum in about 0.8s: the orientation variables and the added
line pairs are few next to the order variables.

## Brackets: crossings no ordering can change

A union between partners who aren't neighbours in their chain is drawn as a
bracket under the row (`edge-routing-notes.md`). It is a line like any other
and can be crossed, so the solve must either count its crossings or be shown
unable to change them. It is the second:

1. **Where a bracket lies.** Horizontally, between its two legs, which meet
   the cards of its own two partners, so inside its own chain's span.
   Vertically, from the bottom of its row's cards down to its run, and the
   gap below the row keeps every elbow row a clearance under the deepest
   run. Call that rectangle, down to the clearance, the bracket's band.
2. **What else can enter the band.** Descents from the gap above end at the
   tops of cards, above the band. Crossbars and descents to the next row
   start at elbow rows, below it. Another chain's drops leave its own cards,
   and chains in a row never overlap, so they fall outside the span. What is
   left are the drops leaving this chain's own cards and gaps between the
   legs, and the chain's other brackets.
3. **Those are fixed by the chain.** Which drops leave from between a
   bracket's legs, and which brackets interleave, depend only on the
   chain's order of members and who has children with whom. Reversing a
   chain draws the mirror image (the bracket's shape depends on the people,
   never on the direction), which keeps every such crossing.

So the number of bracket crossings is a constant of the tree: no layer order,
chain orientation or placement changes it, and the solve's proven optimum
over the lines it does count is the optimum of the whole picture. A
bracketed couple's own children are counted like anyone's: their drop is a
port along the chain at the middle of the run.

The layout reports both numbers, the proven crossings between lines to
children and the brackets' constant, and the layout invariant tests count
the drawn picture and require both to match on every fixture, including
the production tree with partners added past a card's two sides (in the
slow suite). They also check step 2 directly: no line but those drops
enters a bracket's band.



For the solver's own timings, run the CLI's `relayout` without `--write`: it
solves the live tree and streams the solver's progress, including the time to
proof. `npm run bench` times the fixture the same way. For heuristic counts,
wrap the decross step so that, on the same layers, it runs each heuristic on a
copy of the layer arrays and then the exact solve on the originals, and count
crossings as inverted pairs among edges between each pair of adjacent layers.
Don't commit the live tree: the repo is public and the tree names living people.

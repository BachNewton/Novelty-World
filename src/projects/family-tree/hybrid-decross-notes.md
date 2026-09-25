# Hybrid crossing minimization — design notes

The idea: run a fast heuristic crossing minimizer right away so a decent layout
shows up instantly, then run the exact HiGHS solve afterwards and swap in the
optimal layout when it finishes. Before deciding whether that's worth building,
we measured how far apart the two actually are.

## Measurement (September 2026)

We ran both on the same sugiyama layers (d3-dag 1.2.2, HiGHS 1.15.1, Node, one
thread) by wrapping the decross step and counting crossings between adjacent
layers. The counts include the dummy nodes that long edges pass through, so
they are real edge crossings as drawn.

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

## What a hybrid would change

Today the canvas shows the cached optimal layout whenever the tree's topology
matches the cache. After an edit it shows a quick patch that slides new people
into their row, and the exact solve runs only when someone presses Optimize. So
a hybrid wouldn't speed up the common case, where the cache already has the
answer. It would improve the other two cases:

- **First view with no usable cache**, such as a fresh tree or a cache
  invalidated by a topology change. The heuristic layout is a real layout, not a
  patch.
- **While Optimize runs:** the user gets a complete (if messy) layout
  immediately rather than the stale-plus-patch view.

The costs:

- **A big visible reflow when the exact result lands**, because the layouts
  differ so much. It would need an animated transition, or the swap will read as
  the tree jumping around.
- **Two layout paths to keep consistent.** Coordinate assignment and edge
  routing run after decross in both paths, so the downstream code stays shared.
  Only the ordering source differs.

## Warm-starting the exact solve

In the solver's log (see `solver-progress-notes.md`), HiGHS sat on a junk
"best found" (174 crossings) for almost the whole solve and found the optimum
near the end. Handing it the heuristic's ordering as a starting solution would
give it a 42-crossing layout from the first second. That could shorten the
search, and it would make "best so far" meaningful in a progress display.
**Unknown:** whether `highs-js` exposes HiGHS's set-solution call; its JS API is
narrower than the C++ one. Check this before designing around it.

## Open questions

- **Would a better heuristic close most of the gap?** Layer sweeps are the
  weakest class of method. Global approaches, such as sifting (move one node at
  a time to its best position across the whole layer) or a few random restarts
  keeping the best result, might land near the optimum in well under a second.
  If one gets within one or two crossings, the exact solve becomes an
  occasional polish step rather than a required one.
- **Is the gap worth anything visually?** Crossing count is a proxy. A side-by-
  side render of the two layouts is the real test of whether 42 vs 6 matters to
  someone reading the tree. Given the size of the gap, it probably does.

## Reproducing the measurement

Wrap the decross step so that, on the same layers, it runs each heuristic on a
copy of the layer arrays and then the exact solve on the originals. Count
crossings as inverted pairs among edges between each pair of adjacent layers.
The live tree comes from the `family_tree` table (psql recipe in
`__fixtures__/trees.ts`). Don't commit it: the repo is public and the tree
names living people.

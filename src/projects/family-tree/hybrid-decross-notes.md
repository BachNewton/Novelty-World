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

The app is now a read-only viewer: it renders the exact layout stored beside
the tree and never solves or shows an interim layout. That removes the case
this idea was for. A heuristic result is never allowed to reach a viewer, so a
hybrid could only give the desktop solve a head start (see warm-starting
below).

## Warm-starting the exact solve

In the solver's log, HiGHS sat on a junk "best found" (174 crossings) for
almost the whole solve and found the optimum near the end. Handing it the heuristic's ordering as a starting solution would
give it a 42-crossing layout from the first second. That could shorten the
search, and it would make "best so far" meaningful in progress output.
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

# Edge routing — design notes

How the connectors between cards are drawn, and how the layout keeps them
from reading as something they aren't. The geometry lives in
`edge-geometry.ts`, shared by the renderer (`components/edges.tsx`) and the
layout tests, so both reason about the same lines.

## The connectors

- **Union line:** a horizontal line between the two cards at mid-height,
  whether the cards are neighbours in a chain or far apart (a union the chain
  couldn't hold).
- **Parent-child line:** three straight pieces.
  1. The **drop**, down from the parents to the family's elbow row. Two
     parents joined by a union line drop from the middle of that line, at its
     height, so the children hang from the marriage the way genealogy charts
     draw it. A lone parent, or two parents with no union between them, drop
     from the bottom center of the cards.
  2. The **crossbar**, along the elbow row to the child's column.
  3. The **descent**, down from the elbow row to the top center of the
     child's card.

Siblings share their family's drop and elbow row. The layout stores only
card positions and each line's elbow row; everything else follows from them.

## Elbow rows

Each family's crossbar spans from its drop to its outermost child. Two
families in the same row gap only need different elbow rows when their
crossbars' x-ranges overlap or touch (touching bars would merge into one
line). The conflicting bars are packed into the fewest rows by interval
colouring (`packElbowRows`), leftmost bar on the top row, and the stack is
centred on the gap's midpoint. A bar that conflicts with nothing sits exactly
on the midpoint. The row gap grows only when a stack needs more room than the
standard gap gives.

## Two families in one column

The placement (d3-dag's `coordSimplex`) pulls every link as close to vertical
as it can, but it knows nothing about the drawn lines. So a child's descent
can land on exactly the column of another family's drop. The most common
shape: a married-in spouse whose own parents sit far off, placed right under
the other spouse's parents' marriage midpoint. The in-laws' drop and the
spouse's descent then run down one column and read as one line, as if the
in-laws had one more child, married to their own child. The LP's objective
is often flat over a range of positions, so which of them it picks is
arbitrary, and such coincidences keep turning up as the tree grows.

**The rule:** no vertical piece of one family's line (a drop or a descent)
may run within `LINE_CLEARANCE` of a vertical piece of a different family's
line where their spans could meet. The placement applies it over the whole
row gap a piece may occupy rather than the exact span its elbow row gives it,
because a short vertical break in one column still reads as one line, and
because the elbow rows are only settled after the placement. The layout
invariant tests check the drawn lines themselves.

**How it holds:** `layout/coord.ts` runs `coordSimplex` first. When its
placement already keeps every pair apart, it stands. Otherwise the placement
is solved again exactly in CP-SAT (`layout/solver/coord.py`): the same
weighted line length `coordSimplex` minimizes, subject to the clearance
between each pair found too close (a disjunction: one piece left of the other
or right of it, hence CP-SAT rather than an LP), then, holding that length at
its optimum, as little movement from `coordSimplex`'s placement as possible,
then the tiebreaks below.
A new placement can crowd a different pair, so pairs are added and the solve
repeated until none is too close; the result is then optimal for the whole
rule, since it is optimal for part of it and meets the rest. Usually the
clearance costs a little line length or none (the objective is flat over
wide ranges) and the fix is a small sideways shift of the pieces involved.

**Deterministic and fast at scale.** The solves use CP-SAT's parallel
workers: with one worker, the live tree's first solve (about 230 nodes and a
handful of pairs) ran its whole time limit without proving the optimum,
while 16 workers prove it in under a second. Parallel workers can return any
of several tied optima, so two more solves make the answer unique: pick the
sides of the pairs by reading them as a binary number (one minimum), then,
with the sides fixed, place every node as far left as the earlier optima
allow. With the sides fixed, what is left is difference constraints and
convex costs, whose minimizers are closed under taking the lower of two
coordinates, so that last minimum is unique too. The exception is a line
whose x comes from two chains (two parents who aren't in one chain), which
falls outside that argument. The slow suite's `familyNetwork` fixture, near
the live tree's size and shape, runs the whole placement and checks it
repeats exactly.

Considered and rejected:

- **Phantom junction nodes in the LP**, one per family at its drop, so the
  LP's gap constraint keeps other nodes away. It reserves a full subtree gap
  around every drop in every row, widening the tree everywhere to fix a
  coincidence that happens in a handful of places.
- **Nudging the descent in the renderer** with a small jog around the drop.
  It bends lines that are otherwise straight, it leaves the stored layout
  wrong for anything else that reads it, and it treats the symptom: the
  placement has room to keep the columns apart for free.

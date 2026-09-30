# Edge routing — design notes

How the connectors between cards are drawn, and how the layout keeps them
from reading as something they aren't. The geometry lives in
`edge-geometry.ts`, shared by the renderer (`components/edges.tsx`), the
layout and its tests, so all of them reason about the same lines.

## The connectors

- **Union line:** a horizontal line between two neighbouring cards at
  mid-height. A union between partners who aren't neighbours is a
  **bracket** under the row instead (see below). Both take the union's own
  style: colour by marriage or partnership, dashed when it ended.
- **Parent-child line:** three straight pieces.
  1. The **drop**, down from the parents to the family's elbow row. Two
     parents joined by a union drop from the middle of its line, wherever it
     runs, so the children hang from the marriage the way genealogy charts
     draw it: at the cards' mid-height between neighbours, or from the
     middle of a bracket's run. A lone parent, or two parents with no union
     between them, drop from the bottom center of the cards.
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

## Brackets: more partners than sides

A partner chain holds everyone joined through unions, and a card has two
sides. With nobody past two partners, every union joins neighbours. When
someone has more, the chain follows the common genealogy-chart convention:
the partners who don't fit go at the end of the same chain, as in
[ex] [person] [ex] [third ex], and each such union is drawn as a bracket.

**Chain order.** Partners who share children take the places beside each
other first: they form runs that stay whole, grown like a chain from the
person with the most partners, so that person's co-parents sit beside them.
The chain starts from that run and grows at its ends by any run with a
partner of the end person at its own end, current partners first. When
nothing more fits beside an end, the next partner overflows to the chain end
nearest the member they partner (the right on a tie), innermost, and their
own partners grow on beyond them. So a bracket joins a couple with children
only when someone has children by three or more partners. A chain where
nobody has more than two partners is laid out exactly as before: it grows
the old way, current partner right and ex left.

**Shape.** A bracket leaves the bottom of one card, runs under the cards
between, and rises into the bottom of the other, in the union's own style.
It runs under the row, not over it: a line over the cards that drops into
them reads as a sibling bar. Every length is set in one place in
`edge-geometry.ts`:

- The run is deep enough to pass under two rows of heritage chips and the
  bottom corner flags of every card it passes.
- A leg meets its card well in from the corner (clear of a corner flag) and
  away from the card's bottom center (where a lone parent's drop leaves).
- Brackets whose spans overlap get different levels: the shorter runs
  shallower, and a deeper bracket meets a shared card further in, so its leg
  stands outside the shallower one's run and no two runs lie along each
  other. A row with more levels than a card has room for fails loudly.

**Children of a bracketed couple** drop from the middle of the run, the same
rule as every couple. With both legs near the facing edges that middle
would fall on a card's center or a gap between cards, which are exactly the
columns other drops leave from (a lone parent's, a couple's between
neighbours), and a drop under a card's center reads as that card's. So the
leg into the partner with fewer partners meets their card past its center:
the middle then falls about halfway between those columns, never within
`LINE_CLEARANCE` of one. Which leg moves depends on the people, never on
which way round the chain is drawn, so a reversed chain draws the mirror
image.

**Space under the row.** The gap below a row with brackets grows as far as
it must to hold the brackets and then the elbow rows, a clear gap under the
deepest run; the elbow rows stay centered in the gap as everywhere else. So
a bracketed couple's drop runs from the run down to its elbow row, and every
other drop from the row passes the bracket's level on its way down. The last
row's brackets count toward the layout's height.

**Crossings.** A bracket crosses only the drops that leave its row between
its legs (a couple's between neighbours, a lone parent's, another bracket's
children), and another bracket only when their spans interleave. Both are
fixed by the chain's order, and a reversed chain mirrors the whole shape, so
no ordering or orientation the solve can choose changes how many there are.
The exact solve therefore needs no term for them and still proves the
fewest crossings among everything it can change. It does count a
bracketed couple's children: their drop is a port along the chain at the
run's middle, like any couple's. Nothing else can meet a bracket: descents
end at the tops of cards, and the elbow rows lie below the run
(`hybrid-decross-notes.md` has the argument, and the check that the drawn
picture's crossings match the solve's). (A line
that skips a row already runs through that row's cards; the layout draws
none on the trees it has.) The layout invariant tests check all of this on
the drawn lines.

**Columns.** A bracket's legs are not a family's line, but they keep out of
every family's column all the same. Between the bottom of a row and a
bracket's run, the only other vertical lines are the drops leaving that
row, and a leg meets its own card well away from where they leave: its
center, and the gaps beside it. The invariant tests check it.

Considered and rejected:

- **A straight line across the gap** to a partner laid out as a chain of
  their own, as the layout once did: the partner could land anywhere in the
  row, tens of thousands of pixels away.
- **An arc, or a bracket over the row:** a curve would be the only one in a
  tree of straight lines and square elbows, and a line over the cards that
  drops into them reads as a sibling bar.
- **Refusing to lay out children by a third partner:** the tree must hold
  any real family, and the middle of the run gives their line a place of its
  own.

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

The live tree does hit that exception: two solves of the same 411-person tree
drew the same lines but placed 34 cards differently, both at the proven
optimum. Every tied optimum is equally good by the solve's measures (fewest
crossings, then line length and movement), but one can still look better
than another by a measure the solve doesn't have: symmetry, compactness,
families kept visually together. Choosing among tied optima by such a
visual measure is a later improvement; until then, which optimum a solve
returns is arbitrary.

Considered and rejected:

- **Phantom junction nodes in the LP**, one per family at its drop, so the
  LP's gap constraint keeps other nodes away. It reserves a full subtree gap
  around every drop in every row, widening the tree everywhere to fix a
  coincidence that happens in a handful of places.
- **Nudging the descent in the renderer** with a small jog around the drop.
  It bends lines that are otherwise straight, it leaves the stored layout
  wrong for anything else that reads it, and it treats the symptom: the
  placement has room to keep the columns apart for free.

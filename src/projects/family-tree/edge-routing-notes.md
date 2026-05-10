# Edge routing — design notes

Notes on a class of layout-rendering issue we hit and the proposed fix.
Captured before doing the work; pick this up cold by reading top-to-bottom.

## The bug we found

In the live tree (Kyle's family) the parent-child connector for
**Holly Hutchinson → Lily Hutchinson** renders directly on top of the
parent-child connector for **Eric+Sheila Hutchinson → Megan Hutchinson** for
a ~32px segment.

Concrete coordinates from `computeLayout` on the live data:

```
Holly→Lily      child-V (x=1754, y=564 → y=784)
Eric+Sheila→
   Megan        parent-V (x=1754, y=472 → y=596)
```

Both vertical segments sit at `x = 1754`, with overlapping y range
`[564, 596]`. The lines aren't semantically wrong (they go to the right
places, no edge crossings) — they just paint over each other.

## Why this happens

Two compounding causes.

**1. The LP doesn't know about drop lanes.** Every parent couple casts an
invisible vertical "drop lane" descending from its bottom edge to its
elbow Y at `x = couple.midpointX`. That lane is the parent-side V of every
child's connector. From the LP's perspective the lane has zero width and
isn't a node, so a child of a *different* parent couple can land its own
column on that x with no penalty.

In our case:
- Eric+Sheila's couple midpoint is `x = 1754`.
- The simplex placed Lily (Holly's rightmost child) with her node center
  also at `x = 1754`. Pure coincidence as far as the LP is concerned.

**2. `coordSimplex` is L1, and this case has free slack.** Sliding Holly's
whole sibling block (Amanda + Mallory+Chris + Lily) left by Δ within the
`[Sophia.right + SUBTREE_GAP, current]` slack changes individual edge
costs but the *sum* is constant for any Δ ∈ [0, ~326]:

| edge | cost as a function of Δ |
|---|---|
| Holly→Amanda | `326 + Δ`   (worse as we slide left) |
| Holly→Mallory | `94 + Δ`    (worse) |
| Holly→Lily | `326 − Δ`   (better) |
| Eric+Sheila→Megan | `232 − Δ`   (better, since Megan slides with Lily) |
| **sum** | **978** — flat |

The LP is indifferent and the simplex picks an arbitrary vertex of the
optimal polytope. It happened to pick the worst one. L2 (`coordQuad`)
would give a unique solution but only Δ ≈ 35, which still wouldn't clear
the 1754 column — so L2 isn't a fix on its own.

The bug isn't unique to this tree. As the data grows, any time a child
column happens to coincide with an unrelated parent couple's midpoint
*and* their y-ranges overlap, we get the same artifact.

## Why we chose the renderer fix over an LP fix

We considered two approaches and went with the renderer one.

**Approach A — phantom junction nodes in the LP** *(rejected)*. For each
parent couple, insert a virtual node at its midpoint in the children's row
and connect every child through it. The LP's existing min-gap constraint
would then keep other couples' children away from the junction. This is
the "principled graph-drawing" answer.

Why we rejected it:
- It costs horizontal space *everywhere*, even when no real conflict
  exists. Every drop lane reserves a `SUBTREE_GAP`-wide forbidden zone in
  every row below. The tree gets wider for free.
- It tightens the LP's feasible polytope, which can degrade other node
  positions to satisfy a rendering concern.
- It bakes the orthogonal-elbow connector style into the *layout*
  abstraction. If we ever change rendering (straight lines, beziers,
  etc.), the constraints become wrong.
- It puts a geometric concern inside the topological solver, which
  conflates two layers that should be separable.

**Approach B — phase 3 edge router** *(chosen)*. Standard graph-drawing
pipelines have three phases: layer/order, coordinate, and **edge route**.
We have phases 1 and 2 (d3-dag's `decrossOpt` + `coordSimplex`); phase 3
is collapsed into a one-liner inside `components/edges.tsx`. Adding a real
phase-3 module gives geometric concerns a proper home without taxing the
LP.

The LP keeps doing what it's good at (optimal node placement under its
objective). The renderer keeps doing what it's good at (drawing). The
seam between them becomes explicit.

## Proposed module

New file `src/projects/family-tree/route-edges.ts`. Pure function, no
React. Same shape as `logic.ts` relative to `components/`.

```ts
export interface RoutedPath {
  points: Array<{ x: number; y: number }>;
  kind: "spouse" | "parent-child";
}

export function routeEdges(layout: Layout): RoutedPath[];
```

`components/edges.tsx` becomes a dumb `<polyline>` mapper: all the
inline `parentMidX` / `elbowY` / etc. math (currently lines 19–66) moves
into `route-edges.ts`. That cleanup is worthwhile on its own — it makes
edge geometry testable without rendering.

## Algorithm

Three phases inside `routeEdges`.

**Phase A — naïve paths.** Same math as today:
- Spouse edges: one horizontal segment between the two spouse nodes.
- Parent-child edges: 4-point polyline
  `parent-bottom → V → elbow → H → child-column → V → child-top`.

**Phase B — index drop lanes.** For each parent couple `P` that has
children, record one rectangle `{ x: P.midpointX, y1: P.bottomY,
y2: P.elbowY }`. One per couple, not per child (children of the same
couple share the parent-V).

**Phase C — detect & resolve child-V collisions.** For each parent-child
edge `e`, look at its child-side V: `{ x: e.childMidX, y1: e.elbowY,
y2: e.childTopY }`. For every drop lane `L` belonging to a *different*
parent couple than `e`, check both:

- `L.x === e.childMidX` (collinear), and
- `[L.y1, L.y2]` overlaps `[e.y1, e.y2]`.

If both, nudge `e`'s child-V by Δ away from `L.x`, in the direction of
`e.parentMidX` (so the path still flows "back toward home"). Add a small
horizontal jog at the bottom to land on the child's actual center.

## Resolved path geometry

Today's path (4 points):

```
parentMidX, parentBottomY
  → parentMidX, elbowY
  → childMidX,  elbowY
  → childMidX,  childTopY
```

Nudged path (6 points):

```
parentMidX, parentBottomY
  → parentMidX,         elbowY
  → childMidX + Δsign,  elbowY              (H stops short of original column)
  → childMidX + Δsign,  childTopY − jogY    (V at the offset column)
  → childMidX,          childTopY − jogY    (small H jog)
  → childMidX,          childTopY           (final drop into child)
```

Concrete defaults to start with: `Δ = 8`, `jogY = 12`, `Δsign =
sign(parentMidX − childMidX) * Δ`. Tune by eye on the live tree.

For the live case, Holly→Lily becomes a small bump just above Lily's
node — barely visible, and no overlap.

## Edge cases / open decisions

1. **Δ vs jogY tuning.** Bigger Δ is more visible / less ambiguous, smaller
   Δ is subtler. Start with 8/12.
2. **Symmetric resolution.** If two edges hit the *same* lane, nudge both,
   in opposite directions when they're on opposite sides of the lane.
3. **Re-collision check.** After nudging by Δ, `childMidX + Δsign` could
   in principle hit *another* lane. One extra pass to verify; if it does,
   increase Δ or flip direction. Cheap; probably never triggers but
   defensive.
4. **Spouse edges** have no drop lanes and one horizontal segment — they
   can't participate in this collision class. Phase B/C skips them.
5. **Don't preemptively add rules.** The module exists so future fixes
   have a home, not so we predict them. Add new collision detectors only
   when a real second case appears.

## Integration

- `Edges` component imports `routeEdges`, calls it in `useMemo` on the
  layout. Output is a `RoutedPath[]` rendered as `<polyline>` elements
  with stroke driven by `kind`.
- New `route-edges.test.ts` covers naïve routing + the drop-column
  collision case (synthesize a tree where a child column lands on an
  unrelated couple's midpoint and assert the resolved path doesn't share
  segments with the conflicting edge's parent-V).
- No store / worker / layout changes — routing is fast and main-thread.
- Existing `logic.test.ts` keeps testing layout. The split mirrors the
  pipeline: `logic.ts` does layer + coord, `route-edges.ts` does route.

## Where this leaves the existing code

Nothing in `logic.ts` is wrong. `coordSimplex` is doing its job under its
objective. `ELBOW_FIRST_OFFSET` / `ELBOW_SPACING` / `ELBOW_LAST_MARGIN`
(lines 824–826) already correctly stagger horizontal elbow runs across
parent couples in the same generation — the orthogonal-axis problem they
solve isn't this one. The new module slots in *after* `computeLayout` and
*before* the renderer, leaving both untouched.

## Suggested order of work

1. Move geometry out of `components/edges.tsx` into `route-edges.ts` with
   a naïve implementation that produces identical visuals. Land that as a
   pure refactor, no behavior change.
2. Add `route-edges.test.ts` covering the naïve cases.
3. Add the drop-lane index + collision detector + nudge resolution.
4. Add a regression test using a synthesized tree that reproduces the
   Holly→Lily / Eric+Sheila→Megan case structurally.
5. Eyeball the live tree and tune Δ / jogY.

Steps 1–2 are reversible refactor. Step 3 is the actual fix. Step 4 pins
the bug so it doesn't regress.

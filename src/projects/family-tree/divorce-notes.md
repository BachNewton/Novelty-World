# Divorce support — design notes

Notes on what it would take to make the family tree project handle divorce
(and, by extension, multiple marriages). Convention summary first, then the
concrete changes needed in this codebase.

## Genealogical convention

- **Divorce is a styling concern on the marriage edge**, not a structural one.
  Each marriage is its own horizontal segment between two parents; children
  drop from the midpoint of *their* segment, so "which couple had which
  children" is already answered by which two parents flank the drop.
- **Visual marker**: a double slash `//` (or `=/=`) drawn across the marriage
  line. Common alternatives: dashed line via `strokeDasharray`, or a small
  `÷` glyph. Some charts annotate `m. 2010 — div. 2018` on the line.
- **Multi-marriage layout**: the shared person sits central; ex-spouse on one
  side, current spouse on the other, both connected on the same row.
  ```
     Bob ══//══ Alice ══════ Charlie
              │              │
         ┌────┴────┐         │
        kid1     kid2       kid3
  ```

## Required model changes

`types.ts`:
- `Person.spouseIds: string[]` is fine, but the **status** of each marriage
  needs tracking. Two viable shapes:
  - **A. Side array on Person**: add `divorcedSpouseIds: string[]`. Cheap,
    backward compatible, but bifurcates the spouse list everywhere.
  - **B. First-class Marriage record**: add
    `Marriage { aId: string; bId: string; status: "married" | "divorced" | "widowed" }`
    and store `marriages: Marriage[]` on `Tree`. Cleaner long-term, opens the
    door to `marriedAt` / `divorcedAt` dates, but every read site that walks
    `spouseIds` needs updating.
- Recommend **B** if we want dates eventually, **A** if we only ever care
  about married-vs-divorced.

`logic.ts`:
- `addSpouse` (line ~93) — drop the comment "Without divorce in the model"
  and remove the auto-co-parenting block that forces a new spouse to become
  the second parent of all existing single-parent children. With divorce,
  remarrying X **must not** retroactively claim X's kids from a prior
  marriage. The user explicitly assigns parents instead.
- `normalizeTree` (line ~152) — same fix: stop auto-filling the second
  parent when a child has only one. That heuristic is only correct if there
  are no past marriages.
- New action: `divorceSpouses(tree, aId, bId)` that flips the marriage's
  status (or moves the id from `spouseIds` to `divorcedSpouseIds` under
  shape A). Children's `parentIds` are untouched — divorce doesn't change
  who the parents are.
- `describeRelation` — current spouse vs. ex-spouse should produce
  different labels ("husband" / "ex-husband"). The `spouseTerm` helper
  needs an "ex" branch, and the chain fallback ("brother-in-law's wife")
  should probably keep using current marriages only, since "ex's brother"
  isn't normally called a brother-in-law.

## Required layout changes

`logic.ts` — couple grouping is the hard part:

- `buildCoupleUnits` (line ~594) currently picks **one** partner per person.
  A person with two spouses (one ex, one current) needs to appear in two
  couple-units on the same row. Two options:
  - **Duplicate the person visually** — render their card twice. Easiest
    structurally; ugly in dense trees and breaks node identity for keyboard
    nav.
  - **Render once, between two partners** — single card flanked by
    ex-spouse on one side and current spouse on the other, with two marriage
    lines emanating from it. Matches genealogy convention. Requires the
    couple unit to become "marriage unit" (a 2-tuple of person ids), and
    the layout to know that adjacent marriage units sharing a member should
    be packed without a `SUBTREE_GAP` between them.
- Recommend the **render-once** approach. The d3-dag pipeline still works
  if we feed it marriage units instead of couple units, but the x-position
  for the *shared person* has to be derived after the fact (average of the
  two marriages' inner positions, or pin it and let the LP solve around).
- `parentCouplesOf` / `childCouplesOf` — needs to switch from "couple id"
  to "marriage id". A child belongs to exactly one marriage (the one whose
  two members match `parentIds`), so the mapping stays 1:1 per child.
- Per-marriage elbow rows (line ~874) already give each parent couple its
  own elbow Y, so children from different marriages of the same person
  won't visually merge. That part is already correct for the multi-marriage
  case.

## Required render changes

`components/edges.tsx`:
- The `kind: "spouse"` branch (line ~20) draws one solid line. Extend it
  with a `status` field so it can render:
  - `married` — solid line (current behavior).
  - `divorced` — dashed (`strokeDasharray="6 4"`) or two short perpendicular
    tick marks at the midpoint. Tick marks are more recognizable, dashing
    is one line of code.
  - `widowed` (if we add it) — single tick.
- `LaidOutEdge` in `types.ts` needs the status on the spouse variant:
  `{ kind: "spouse"; aId: string; bId: string; status: MarriageStatus }`.

`components/node.tsx` / `action-panel.tsx`:
- Action panel needs a "Divorce" button when the selected person has at
  least one current spouse. If they have multiple current spouses, a
  picker. (Polygamy isn't a goal but the UI shouldn't crash on it.)
- A "Remarry" / "Add second spouse" affordance — currently `addSpouse`
  appends to `spouseIds` without checking for existing spouses, but the
  layout will silently pick only one of them. Once layout supports
  multi-marriage, the action is already there; just needs a label that
  makes the second-marriage case obvious.

## Migration

`normalizeTree` is the persisted-data healer. When the schema changes:
- Shape A: add `divorcedSpouseIds: []` if missing. Set `changed = true` to
  trigger a re-save.
- Shape B: synthesize `marriages` from existing `spouseIds` pairs with
  `status: "married"`. Drop `spouseIds` afterward, or keep it as a derived
  view.

Either way the existing user data (everyone currently married) round-trips
cleanly — no one becomes accidentally divorced.

## Suggested order of work

1. **Model** — pick shape A or B, update types, write the new actions.
2. **Tests** — extend `logic.test.ts` with divorce scenarios (one
   marriage, two marriages with kids in each, divorce-then-remarry).
3. **Edge rendering** — add the dashed/tick style for divorced marriages.
   Cheap win, lets us see status visually before layout is multi-marriage.
4. **Layout** — refactor `buildCoupleUnits` → marriage units, render the
   shared-person-in-the-middle case. This is the bulk of the work.
5. **UI actions** — divorce button, second-marriage flow, ex-spouse
   relation labels.

Steps 1–3 are independent and reversible. Step 4 is the irreversible-feeling
one; worth prototyping behind a flag or on a branch before committing.

# Family Tree

## Purpose

A deliberately simple, practical tree that answers one question: "how does this person, whom I know by this name, relate to me or to another family member?" It is not a genealogy app. A feature earns its place by serving that question, or by fixing data the tree otherwise can't represent correctly.

The split between the UI and the data layer matters:

- **The UI** is a read-only viewer of a simple relationship tree. Push back on genealogy-software sprawl there: citations, confidence levels, event records and the like never appear on the cards. The person panel shows one person's details, including the research record the tree already keeps, but it stays a short readout.
- **The data layer** is also Claude's research record. It may carry what future research sessions need to judge how reliable a claim is and what is left to research, such as the completeness check and its source. Each such field still has to be something a research session actually reads or acts on; push back on data nobody uses.

## One user

The owner is effectively the only person using this project. A change doesn't need to protect production while it's in progress: no cache-compatibility shims, no guarding against tabs running an old build, no staged rollouts. The owner can reload by hand. The only requirement is that the tree isn't left broken once a change is finished.

## A living tree

Everyone is family whether or not they've passed. The tree never shows who is dead or alive, and it never needs updating when someone dies. There is deliberately no deceased flag on a person. Don't add one, and don't add UI that implies one.

## Data model invariants

Types live in `types.ts`; pure operations and relationship terms live in `logic.ts`. The layout pipeline lives apart, in `layout/` (see Layout).

- **Unions.** Relationships between adults are one list of unions on each person, kept symmetric on both people. Each union has a status: married, divorced, ended-by-death, partner, or ex-partner. Status belongs to the union, never to the person.
- **Ended by death** is only needed when the survivor later remarried or repartnered. It renders like a marriage, not a divorce. The union can optionally record which of the two died. Only that person is ever called "late" in the relationship readout (by the survivor, and in composites like "husband's late wife"). When it isn't recorded, nobody is "late". It is wording only: it never affects layout or the topology hash, and nothing appears on the cards.
- **Names:** first name, last name (current), common name (nickname), and optional birth surname and middle name. The birth surname is research data: it never appears on the cards; the person panel shows it as "née …" when it differs from the last name. The middle name (a full name or just an initial) is a research aid: records tell same-named relatives apart by it. It never appears on the cards, which show the name people know someone by; only the person panel shows it.
- **Notes:** optional free text per person, for research facts that have nowhere else to live (death dates, record numbers, alternate names). Notes never appear on the tree cards.
- **Birth date:** an optional research aid in a fixed, machine-readable shape, so tools and AI can read and edit it reliably instead of parsing notes. It is a partial ISO date: a year, a year and month, or a full date (shaped like `1931`, `1931-06`, `1931-06-16`), as precise as the sources allow. An approximate year (`~1931`) records a year the sources narrow to two adjacent years, such as an age on a census or marriage record; it holds the likelier of the two, and has no month or day. `treeProblems` rejects anything else, including impossible dates. Only the year appears on the cards, as a small green chip under the name; an approximate year keeps its "~", and a card without a birth date shows no chip at all. The full date shows only in the person panel. There is deliberately no death date field: that would be a deceased flag by another name, so death dates stay in notes.
- **Completeness check:** an optional per-person research record that the person's partners (every union, any status) and children (with any co-parent, or none) were researched and are all in the tree. It holds the full date it was true as of and a source naming the evidence; `treeProblems` rejects an impossible date or an empty source. It covers only the person's own partners and children, never their parents. Unset means not yet researched; a check on someone with no partners or children in the tree means "researched, has none". Adding a partner or child later doesn't invalidate it, since the date says when it held. The source lives in the public row, so it must be safe to publish (see Privacy). It shows only in the person panel, never on the cards, and it never affects layout or the topology hash.
- **Heritage:** where a person's lines came from. Its main purpose is to give the tree color and life once the UI shows it; it also points research at the right country's records. It is called heritage, not nationality (which means citizenship) or ethnicity, and it records origin, not identity.
  - **The list.** Values come from a curated list in `heritages.ts`, so every value is one the UI can give a designed look; adding one of either kind is one entry there. A **country** is the present-day country containing the place a record gives, not the state at the time: a town recorded as in Prussia maps to wherever it lies today. England, Scotland and Wales are separate, and Ireland is the whole island. A **people** is a people without a country of its own, such as a Native American nation, the Sámi or the Roma. The two kinds use differently shaped codes, so they can't collide. Finer detail (a region, a ship) goes in notes.
  - **Entries fill gaps.** An entry is a list split equally, and may include unknown. Each person's mix is derived and never stored: each parent passes on half of theirs, and a missing parent passes on an unknown half rather than letting the known half stand for the whole. The person's own entry then fills only whatever is still unknown; an unknown in the entry keeps its part unknown. So for someone without parents the entry is the whole mix, adding a parent with nothing known above changes nothing, and research that finds real heritage above an entry takes over that part automatically while the entry shrinks to what is still unknown. Only parent links pass heritage on, never a step relationship. An adoptive parent is a parent like any other, so an adopted child inherits the family's heritage: this is the heritage of the family's lines, not genetic ancestry. A mix lists the largest share first, ties going to the surname line: the father's line before the mother's, recursively, then the codes the person's own entry filled in, in the entry's order.
  - **Superseded entries.** Each entry reports how much of it is still in use. Below all of it, research has replaced part of it, and it needs review, because it may have been a guess covering both sides; at none it is dead data to clear. This is advisory, not a `treeProblems` error, and the CLI lists every superseded entry.
  - **Entered from evidence.** Entries go on the top person of each known line, the earliest ancestor found; descendants derive theirs. Unknown when the records don't say, never a guess, and never a country chosen only because someone was born there when the question is where the line came from. The evidence goes in the person's notes: the place as the record words it, the source, and an arrival or emigration year when found. `treeProblems` rejects unlisted codes, repeats, and an entry of only unknown, which fills nothing.
  - It is a research field for now: no UI shows it yet, and it never affects layout or the topology hash. Open questions: whether living married-in adults get heritage entered at all, and how the UI shows it. For the UI, the owner has decided that color blindness is not a design constraint, and the inside of a card stays reserved for the person's details.
- **Optional string fields** use an empty string to mean "not set". They are always present, never undefined.
- **Schema evolution.** `normalizeTree` migrates saved trees on load, in the viewer and the CLI alike: it backfills new fields and converts old shapes. The viewer can't write, so the migrated shape reaches the row with the CLI's next write. Every new Person field must be handled there.

## Privacy

The public anon key can read the tree row (`supabase/family-tree.sql` gives it a select policy and nothing else), so everything in it, notes included, is effectively public. Never store private details about living people. A full birth date plus a name is identity-theft material, so a living person's birth date holds the year only; full dates are for people who have died. Heritage needs no extra measures: it sits mostly on long-dead origin people, and a derived mix says little the tree doesn't already imply. `research/` is gitignored because it names living people. Never commit it and never quote it in docs.

## The viewer and the only writer

The browser app is a read-only viewer: there is no edit UI. All edits are AI-driven through the CLI, which is the tree's only writer.

- **The row always holds the tree and an exact layout for it.** The tree is one row, holding the tree and its fully optimized layout, tagged with the `topologyHash` of the tree it was solved for. A viewer must never see an unsolved or patched layout, so the browser never solves and never patches: `store.ts` loads the row and renders the stored layout as-is. A missing layout, or one whose hash doesn't match the tree, is a bug in whatever wrote the row, and the page shows an error rather than a fallback.
- **Reads and writes.** `persistence.ts` owns the row's shape and its read, shared by the viewer (anon key) and the CLI. Writes live in `tools/tree-db.ts`, whose client uses the service-role key (`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) and never leaves that module. RLS gives the anon key read access only, and an update RLS refuses matches no rows rather than failing, which would read as a version conflict; that is why no write accepts a client from its caller. Nothing the page imports may reach `tools/`.
- **No lost edits.** The row carries a version that counts tree writes. A tree write lands only if the row is still at the version the writer loaded, and it bumps the version; otherwise the writer must reload rather than overwrite. A database trigger (`supabase/family-tree.sql`) enforces the rule for every writer, the service role included. A layout-only write doesn't move the version, but it too lands only if the row is still at the version the writer loaded, so the layout always belongs to the tree it was solved for.
- **The CLI** (`tools/tree-cli.ts`, pure part in `tools/tree-edit.ts`) is how research gets into the tree: find and show people, list who still lacks a completeness check and which heritage entries research has superseded, and apply a JSON change file through the `logic.ts` edit functions, validated by `treeProblems`. It dry-runs by default, backs up the row into `research/` before writing, and uses the versioned write. The `family-tree-research` skill describes the workflow and privacy rules around it.
- **Apply solves, then writes both.** When a change alters the tree's topology (its `topologyHash` no longer matches the stored layout's), `apply` solves the new tree's exact layout before writing anything, then writes the tree and its layout in one versioned update. When the topology is unchanged (a name, a note, a birth date), it writes the tree alone and the stored layout stays. A solve that fails or can't prove the optimum stops the write, so the row never holds a tree without its layout. A dry run solves too, so it shows what the write would do.
- **Relayout** re-solves the current tree's layout and, with `--write`, stores it as a layout-only write. It is for changes to the layout code, which change layouts without changing any tree; the dry run says whether the new layout differs from the stored one.
- **New name fields** flow through the CLI (rename, new people, search) once they are added to its empty-name defaults, which typecheck forces.

## Research edits

The owner wants as few approval requests as possible. When research finds evidence for a change and confidence is high, make the change with the CLI and report it afterwards. High confidence includes a near-certain inference from records: a divorce implied because both spouses remarried while alive, a birth surname from a marriage record that names the parents. Record the evidence in `research/` either way.

Ask first only when:

- the evidence conflicts, or confidence isn't high. A single mention or a name match without matching relatives isn't enough. A finding like that stays in `research/`, or goes into notes marked "Possible:";
- the change deletes an existing person;
- the change would put a private detail about a living person into the public row (see Privacy).

## Responsive: phone and desktop

The tree must work from 360px phones through ultrawide desktop. Check both whenever you touch components.

- `pan-zoom.tsx` handles pointer events: one-finger or mouse drag pans, a two-finger pinch zooms, and the wheel zooms. The canvas disables browser touch gestures, and a drag suppresses the click that would otherwise select a card. It also glides to a content point on demand (`PanZoomHandle.panTo`); any pan or zoom by the user cancels a glide in progress.
- `person-panel.tsx` is a floating, read-only card: the selected person's full name (middle name, nickname, birth surname), their relation to the view root, birth date, notes and completeness check. On narrow screens it sits at the bottom right with its width capped to the viewport minus a gutter. From `md` up it moves to the top right. It must stay fully usable at 360px.
- The toolbar in `family-tree.tsx` shortens its labels below `sm`. The name search (`name-search.tsx`) sits inline from `sm` up; below that it is a magnifying-glass button that opens the field over the whole toolbar. Jumping to a result selects the person, so below `md` the card lands near the top of the canvas rather than the center, where the person panel would cover it. Arrow-key navigation between cards is desktop-only, so everything it reaches also needs a tap path.
- Size tap targets for fingers, not just for a mouse pointer.

## Layout

Card size is fixed and layout never measures text. Any change to card content (`components/node.tsx`) must keep the text inside the card height.

The layout pipeline (`computeLayout` in `layout/compute-layout.ts`) is a sugiyama layout with an exact crossing minimization (`layout/decross.ts`), solved by OR-Tools CP-SAT in a Python child process (`layout/solver/decross.py`, which also holds the model). It runs only on the desktop, in the CLI; its result is stored in the row beside the tree, identified by `topologyHash`. Nothing the page imports may reach `layout/`: the page's bundle holds neither the sugiyama pipeline nor the solver. Anything short of a proven optimum, including a missing venv, fails loudly; there is no fallback layout.

The solver needs a project-local Python venv (`layout/solver/.venv`, gitignored) with the pinned `layout/solver/requirements.txt`. `npm run setup:family-tree-solver` creates or updates it, and needs Python 3 on the PATH. The layout tests and the CLI's layout solves need it.

Read these before changing the pipeline:

- `hybrid-decross-notes.md`: exact vs. heuristic decross, why the solve is exact, and why the solver is CP-SAT.
- `edge-routing-notes.md`: drop lanes, elbow rows, and overlapping connectors.

To prove a change didn't alter layout, use `layout-invariants.test.ts` and the pinned snapshots in `__snapshots__/`. The production-sized fixture runs only in the slow suite (`*.slow.test.ts`, via `npm run test:slow`). Run it after any change to the layout code, then `relayout` (dry run first) so the stored layout follows the new code.

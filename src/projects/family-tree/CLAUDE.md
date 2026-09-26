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

Types live in `types.ts`; pure operations and relationship terms live in `logic.ts`.

- **Unions.** Relationships between adults are one list of unions on each person, kept symmetric on both people. Each union has a status: married, divorced, ended-by-death, partner, or ex-partner. Status belongs to the union, never to the person.
- **Ended by death** is only needed when the survivor later remarried or repartnered. It renders like a marriage, not a divorce. The union can optionally record which of the two died. Only that person is ever called "late" in the relationship readout (by the survivor, and in composites like "husband's late wife"). When it isn't recorded, nobody is "late". It is wording only: it never affects layout or the topology hash, and nothing appears on the cards.
- **Names:** first name, last name (current), common name (nickname), and optional birth surname and middle name. The birth surname shows as a small "née …" line on the card only when it differs from the last name. The middle name (a full name or just an initial) is a research aid: records tell same-named relatives apart by it. It never appears on the cards, which show the name people know someone by; only the person panel shows it.
- **Notes:** optional free text per person, for research facts that have nowhere else to live (death dates, record numbers, alternate names). Notes never appear on the tree cards.
- **Birth date:** an optional research aid in a fixed, machine-readable shape, so tools and AI can read and edit it reliably instead of parsing notes. It is a partial ISO date: a year, a year and month, or a full date (shaped like `1931`, `1931-06`, `1931-06-16`), as precise as the sources allow. An approximate year (`~1931`) records a year the sources narrow to two adjacent years, such as an age on a census or marriage record; it holds the likelier of the two, and has no month or day. Cards show it as "b. ~1931". `treeProblems` rejects anything else, including impossible dates. Only the year appears on the cards, as "b. 1931" on the same small line as "née …", so the card keeps its height; the full date shows only in the person panel. There is deliberately no death date field: that would be a deceased flag by another name, so death dates stay in notes.
- **Completeness check:** an optional per-person research record that the person's partners (every union, any status) and children (with any co-parent, or none) were researched and are all in the tree. It holds the full date it was true as of and a source naming the evidence; `treeProblems` rejects an impossible date or an empty source. It covers only the person's own partners and children, never their parents. Unset means not yet researched; a check on someone with no partners or children in the tree means "researched, has none". Adding a partner or child later doesn't invalidate it, since the date says when it held. The source lives in the public row, so it must be safe to publish (see Privacy). It shows only in the person panel, never on the cards, and it never affects layout or the topology hash.
- **Optional string fields** use an empty string to mean "not set". They are always present, never undefined.
- **Schema evolution.** `normalizeTree` migrates saved trees on load, in the viewer and the CLI alike: it backfills new fields and converts old shapes. The viewer can't write, so the migrated shape reaches the row with the CLI's next write. Every new Person field must be handled there.

## Privacy

The public anon key can read the tree row (`supabase/family-tree.sql` gives it a select policy and nothing else), so everything in it, notes included, is effectively public. Never store private details about living people. A full birth date plus a name is identity-theft material, so a living person's birth date holds the year only; full dates are for people who have died. `research/` is gitignored because it names living people. Never commit it and never quote it in docs.

## The viewer and the only writer

The browser app is a read-only viewer: there is no edit UI. All edits are AI-driven through the CLI, which is the tree's only writer.

- **The row always holds the tree and an exact layout for it.** The tree is one row, holding the tree and its fully optimized layout, tagged with the `topologyHash` of the tree it was solved for. A viewer must never see an unsolved or patched layout, so the browser never solves and never patches: `store.ts` loads the row and renders the stored layout as-is. A missing layout, or one whose hash doesn't match the tree, is a bug in whatever wrote the row, and the page shows an error rather than a fallback.
- **Reads and writes.** `persistence.ts` owns the row's shape and its read, shared by the viewer (anon key) and the CLI. Writes live in `tools/tree-db.ts`, whose client uses the service-role key (`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) and never leaves that module. RLS gives the anon key read access only, and an update RLS refuses matches no rows rather than failing, which would read as a version conflict; that is why no write accepts a client from its caller. Nothing the page imports may reach `tools/`.
- **No lost edits.** The row carries a version that counts tree writes. A tree write lands only if the row is still at the version the writer loaded, and it bumps the version; otherwise the writer must reload rather than overwrite. A database trigger (`supabase/family-tree.sql`) enforces the rule for every writer, the service role included.
- **The CLI** (`tools/tree-cli.ts`, pure part in `tools/tree-edit.ts`) is how research gets into the tree: find and show people, list who still lacks a completeness check, and apply a JSON change file through the `logic.ts` edit functions, validated by `treeProblems`. It dry-runs by default, backs up the row into `research/` before writing, and uses the versioned write. The `family-tree-research` skill describes the workflow and privacy rules around it.
- **Being built next:** `apply --write` solving the new tree's layout on the desktop and writing tree and layout together, so the invariant above holds across every write. Until then, `apply --write` writes the tree alone; when that changes the topology, the CLI says so and the viewer shows its error until a matching layout is written.
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

The layout pipeline (`computeLayout` in `logic.ts`) is a sugiyama layout with an exact HiGHS crossing minimization (`decross-highs.ts`). It runs only on the desktop, never in the browser; its result is stored in the row beside the tree, identified by `topologyHash`. The page imports `logic.ts` for its tree helpers, so `computeLayout` dynamic-imports the solver, and the solver must stay out of the page's bundle. Read these before changing it:

- `hybrid-decross-notes.md`: exact vs. heuristic decross, and why the solve is exact.
- `edge-routing-notes.md`: drop lanes, elbow rows, and overlapping connectors.

To prove a change didn't alter layout, use `layout-invariants.test.ts` and the pinned snapshots in `__snapshots__/`. The production-sized fixture runs only in the slow suite (`*.slow.test.ts`, via `npm run test:slow`). Run it after any change to `logic.ts` layout code.

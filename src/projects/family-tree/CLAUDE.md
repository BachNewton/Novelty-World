# Family Tree

## Purpose

A deliberately simple, practical tree that answers one question: "how does this person, whom I know by this name, relate to me or to another family member?" It is not a genealogy app. A feature earns its place by serving that question, or by fixing data the tree otherwise can't represent correctly. Push back on genealogy-software sprawl: citations, confidence levels, event records and the like.

## A living tree

Everyone is family whether or not they've passed. The tree never shows who is dead or alive, and it never needs updating when someone dies. There is deliberately no deceased flag on a person. Don't add one, and don't add UI that implies one.

## Data model invariants

Types live in `types.ts`; pure operations and relationship terms live in `logic.ts`.

- **Unions.** Relationships between adults are one list of unions on each person, kept symmetric on both people. Each union has a status: married, divorced, ended-by-death, partner, or ex-partner. Status belongs to the union, never to the person.
- **Ended by death** is only needed when the survivor later remarried or repartnered. It renders like a marriage, not a divorce. The union can optionally record which of the two died. Only that person is ever called "late" in the relationship readout (by the survivor, and in composites like "husband's late wife"). When it isn't recorded, nobody is "late". It is wording only: it never affects layout or the topology hash, and nothing appears on the cards.
- **Names:** first name, last name (current), common name (nickname), and optional birth surname and middle name. The birth surname shows as a small "née …" line on the card only when it differs from the last name. The middle name (a full name or just an initial) is a research aid: records tell same-named relatives apart by it. It never appears on the cards, which show the name people know someone by; only the edit panel shows it.
- **Notes:** optional free text per person, for research facts that have nowhere else to live (death dates, record numbers, alternate names). Notes never appear on the tree cards.
- **Birth date:** an optional research aid in a fixed, machine-readable shape, so tools and AI can read and edit it reliably instead of parsing notes. It is a partial ISO date: a year, a year and month, or a full date (shaped like `1931`, `1931-06`, `1931-06-16`), as precise as the sources allow. `treeProblems` rejects anything else, including impossible dates. It never appears on the cards. There is deliberately no death date field: that would be a deceased flag by another name, so death dates stay in notes.
- **Optional string fields** use an empty string to mean "not set". They are always present, never undefined.
- **Schema evolution.** `normalizeTree` migrates saved trees on load: it backfills new fields and converts old shapes, and the store writes the migrated shape back on the next save. Every new Person field must be handled there.

## Privacy

The public anon key can read and write the tree row (`supabase/family-tree.sql` has open RLS policies), so everything in it, notes included, is effectively public. Never store private details about living people. A full birth date plus a name is identity-theft material, so a living person's birth date holds the year only; full dates are for people who have died. `research/` is gitignored because it names living people. Never commit it and never quote it in docs.

## Saving and editing outside the app

The tree is one row, saved whole. `persistence.ts` owns every read and write of it, for the app and the CLI alike.

- **No lost edits.** The row carries a version that counts tree writes. A tree save lands only if the row is still at the version the writer loaded, and it bumps the version; otherwise the writer must reload rather than overwrite. A database trigger (`supabase/family-tree.sql`) enforces the rule for every writer, including tabs running an older build. In the app, `tree-saver.ts` runs saves one at a time and stops at the first conflict or failure: the tab shows a "changed elsewhere, reload" strip and editing pauses, since anything further would be built on a stale tree.
- **Layout writes aren't tree writes.** The cached layout lives in the same row but never moves the version, so an Optimize never trips another writer's check. It is written only if the version is still the one whose tree it was solved against.
- **The CLI** (`tools/tree-cli.ts`, pure part in `tools/tree-edit.ts`) is how research gets into the tree: find and show people, and apply a JSON change file through the same `logic.ts` functions the UI uses, validated by `treeProblems`. It dry-runs by default, backs up the row into `research/` before writing, and uses the same versioned save. The `family-tree-research` skill describes the workflow and privacy rules around it.
- **New name fields** flow through the CLI (rename, new people, search) once they are added to its empty-name defaults, which typecheck forces.

## Responsive: phone and desktop

The tree must work from 360px phones through ultrawide desktop. Check both whenever you touch components.

- `pan-zoom.tsx` handles pointer events: one-finger or mouse drag pans, a two-finger pinch zooms, and the wheel zooms. The canvas disables browser touch gestures, and a drag suppresses the click that would otherwise select a card.
- `action-panel.tsx` is a floating card. On narrow screens it sits at the bottom right with its width capped to the viewport minus a gutter. From `md` up it moves to the top right. It must stay fully usable at 360px.
- The toolbar in `family-tree.tsx` shortens its labels below `sm`. Arrow-key navigation between cards is desktop-only, so every action also needs a tap path.
- Size tap targets for fingers, not just for a mouse pointer.

## Layout

Card size is fixed and layout never measures text. Any change to card content (`components/node.tsx`) must keep the text inside the card height.

The layout pipeline is a sugiyama layout with an exact HiGHS crossing minimization. It runs in `layout.worker.ts`, and the result is cached in Supabase keyed by `topologyHash`. Until an optimize run finishes, edits show an optimistic local patch. Read these before changing it:

- `hybrid-decross-notes.md`: exact vs. heuristic decross, and why the solve is exact.
- `edge-routing-notes.md`: drop lanes, elbow rows, and overlapping connectors.
- `solver-progress.ts` with its test: how solver log lines become live progress.

To prove a change didn't alter layout, use `layout-invariants.test.ts` and the pinned snapshots in `__snapshots__/`. The production-sized fixture runs only in the slow suite (`*.slow.test.ts`, via `npm run test:slow`). Run it after any change to `logic.ts` layout code.

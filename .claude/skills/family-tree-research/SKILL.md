---
name: family-tree-research
description: Update the Family Tree project (src/projects/family-tree) from genealogy research — look people up, record findings with sources, and apply confirmed facts to the live tree through the tree-editing CLI. Use whenever the owner asks to research relatives, "add what you found to the family tree", fix names or relationships in the tree, or apply research findings.
---

# Family tree research → live tree

The tree is one JSON document in Supabase. The app only displays it; the CLI
in `src/projects/family-tree/tools/` (`tree-cli.ts`) is its only writer. It
applies a change file through the tree's own logic functions, validates the
result, and refuses to overwrite a tree someone saved since it loaded. Never edit the row or its JSON
by hand, and never write SQL against it.

Read `src/projects/family-tree/CLAUDE.md` first: it defines what the tree is
for, the data model, and the living-tree rule.

## Ground rules

- **The tree is public.** Anyone can read the row, notes included. Never put
  contact details (addresses, phone numbers, emails), and never put private
  details about living people (health, finances, legal matters, anything they
  wouldn't want public). Names and relationships are fine.
- **Birth dates go in the birth date field, not notes.** Use `setBirthDate`
  (or `birthDate` on a new person) with a year, year-month, or full date,
  as precise as the source. For anyone who may be living, the year only; a
  full date is for people who have died. Put the source for the date in notes.
  An age on a record (census, marriage) fits two adjacent years: born between
  the event date minus age+1 years and the event date minus age years. Narrow
  it with a second record if you can; otherwise record `~YYYY` for the year
  holding most of that window. Never write a plain year from one age.
- **A living tree.** Everyone is family whether or not they've passed. Never
  add a deceased flag or anything that implies one. Death facts that matter to
  the research (a date, a record number) may go in notes; a union ended by
  death uses that union status, and only when the survivor later remarried or
  repartnered.
- **The research folder is private.** `src/projects/family-tree/research/` is
  gitignored because it names living people. Never commit anything from it,
  never quote it in docs, commits, or skills.
- **Not a genealogy app.** Add what answers "how is this person related to
  me?" — people, names people actually use, and relationships. Supporting facts
  go in notes, briefly.

## Confidence

Every finding sits on one scale in the research file:

- **Confirmed**: a primary source (obituary, grave record, official record)
  names the person together with several relatives who match the tree, and no
  source conflicts with it.
- **Possible**: anything less — a single mention, a name match without
  matching relatives, a secondary compilation, or sources that disagree.

Also record **rejected look-alikes**: people with the same name who turned out
to be someone else, and why, so nobody chases them again.

## Workflow

1. **Look first.** `find <text>` searches every name field and the notes;
   `show <id>` prints one person with parents, unions, children, and notes. Ids
   can be shortened to any unique prefix.
2. **Research with sources.** Keep every source's URL or citation.
3. **Record findings** in `research/family-research.md`: each fact, its
   sources, and its place on the scale, plus rejected look-alikes.
4. **Draft a change file** in `research/` (a JSON list of operations). Only
   Confirmed facts become tree changes. A Possible fact stays in the research
   file, or, when it helps someone reading the tree, goes in notes starting with
   "Possible:".
5. **Dry run** `apply <file>` and read the change list it prints, line by line,
   against what you meant.
6. **Decide who approves** (see "Research edits" in the project CLAUDE.md), then run `apply <file> --write`. It backs
   up the current row into `research/backups/` before writing, and prints the
   new version.
7. **Tell the owner** what changed. An open tab keeps showing the tree it
   loaded until reloaded. When the write changes who is related to whom, the
   CLI reports that the stored layout no longer matches the tree; until a
   matching layout is written the app shows an error instead of the tree, so
   pass that on too.

If `--write` reports the tree changed since it loaded, someone saved in the
meantime: re-run the dry run against the latest tree and re-check it. Never
work around the check.

## Completeness

The goal is a tree the owner can call complete: every person's partners and
children are all in it. A per-person **completeness check** records that this
was researched, as of a date, per a source. Without one, "nobody looked for
this person's spouse" and "looked, there is none" look identical.

- **What it covers.** All of the person's partners (every union, any status,
  including earlier marriages and ex-partners) and all their children (with
  any co-parent, or none). Direction is down only: parents are not part of it.
  A check on someone with no partners or children in the tree means
  "researched, has none".
- **Only mark it when the evidence covers both.** An obituary usually lists
  children but often omits an earlier marriage or a partner who died; a
  marriage record says nothing about children. Combine sources until both
  halves are covered, or ask the owner. A check that only covers half is
  worse than none, because it tells the next session to stop looking.
- **The source is public.** It lives in the public row, so name something
  safe to publish: a public record, an obituary ("<name>'s obituary (2019)"),
  a record id such as a FamilySearch id, or "per Kyle" when the owner vouched
  for it. Never a people-search site or its URL; their household lists are
  too weak to support a check anyway.
- **Find the gaps** with `completeness`, which lists everyone without a check,
  blood relatives of the root first, then people who married in.
- **Re-check living people** whose check is old: they may have married or had
  children since. A check never expires on its own; its date says when it
  held.

## Heritage

Heritage records **where a line came from**, not identity. The data model
is under "Heritage" in the project CLAUDE.md; the list of codes is
`src/projects/family-tree/heritages.ts`.

- **Enter it on the top person of each known line**, the earliest ancestor
  found. Descendants derive theirs; an entry only fills the part of a mix
  the person's parents leave unknown.
- **Code = the present-day country containing the recorded place**, not the
  state at the time: a birthplace recorded as Prussia or Austria-Hungary maps
  by where the town actually lies. Use a **people** entry when the ancestry
  is a people without a country. If the one you need is missing, add it to
  `heritages.ts`: one entry with its kind and name.
- **Unknown when the records don't say. Never guess.** A US-born top-of-line
  ancestor whose origin isn't traced stays unknown: the question is still
  open, which is not a claim they aren't American. Don't use a present-day
  country just because that's where the person was born when the question is
  where the line came from. Use `"unknown"` inside an entry for the part of a
  line the records leave open.
- **Record the evidence in the person's notes:** the place as the record
  words it, the source, and an arrival or emigration year when found.
- **After adding ancestors above anyone with an entry,** run `superseded`.
  Clear fully superseded entries, and review partly superseded ones: the
  entry may have been a guess covering both sides. The confidence rules in
  "Research edits" in the project CLAUDE.md decide when to apply directly and
  when to ask.
- **Living married-in adults:** whether they get heritage at all is an open
  question for the owner, so ask before entering it.

## Sources and tools

- **WebSearch and WebFetch** for obituaries, grave records (Find a Grave,
  BillionGraves), and public indexes.
- **The Chrome DevTools MCP** (`mcp__chrome-devtools__*`) for JavaScript-heavy
  or login-gated sites such as FamilySearch, where a plain fetch gets an
  empty shell or a login page.

This skill is meant to be refined as research reveals what works. When a
source or technique proves useful, or turns out to be a dead end, update this
section so the next session starts from what was learned.

## Who approves

The owner's rule lives in the project CLAUDE.md ("Research edits"): apply
high-confidence findings yourself and report them; ask only in the cases it
lists.

## The CLI

Run from the repo root, which holds `.env.local` with the Supabase keys. The
CLI reads and writes with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`);
the public anon key can only read.

    npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
    npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
    npx tsx src/projects/family-tree/tools/tree-cli.ts completeness
    npx tsx src/projects/family-tree/tools/tree-cli.ts superseded
    npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--write]

The operation vocabulary, and what each field means, is the `Op` type in
`tools/tree-edit.ts`; the parser rejects unknown ops and fields. In a change
file a person is an id, a unique id prefix, or `@name` for someone an earlier
operation in the same file added with `"ref": "@name"`. Choices are always
explicit: a new child names its co-parent or `null` for none, and a new spouse
lists which existing children they are also a parent of (often none).

A generic example, adding a spouse and their child:

    [
      { "op": "addSpouse", "ref": "@wife", "person": "<id>",
        "name": { "firstName": "Given", "lastName": "Surname", "birthSurname": "Maiden" },
        "gender": "F", "status": "married", "bioChildren": [], "birthDate": "1928-04-02",
        "heritage": ["IT"] },
      { "op": "addChild", "parent": "<id>", "coParent": "@wife",
        "name": { "firstName": "Child", "lastName": "Surname" }, "gender": "M", "birthDate": "1952" },
      { "op": "appendNote", "person": "@wife", "note": "Married 1950 (county marriage record)" },
      { "op": "setBirthDate", "person": "<id>", "birthDate": "1925-11" },
      { "op": "setHeritage", "person": "<id>", "heritage": ["FI", "unknown"] }
    ]

`show` prints each person's completeness check, or "not checked". Two ops
manage it:

    { "op": "markChecked", "person": "<id>", "asOf": "2026-01-31", "source": "Given Surname's obituary (2019)" }
    { "op": "clearChecked", "person": "<id>" }

`markChecked` takes a full `YYYY-MM-DD` date and a non-empty source, and
replaces any existing check (the change list shows old → new). `clearChecked`
fails if the person has no check. `completeness` prints, for blood relatives
of the root and then for people who married in, how many are checked out of
the total, and each unchecked person's name and short id.

`setHeritage` (or `heritage` on a new person) sets a person's heritage entry:
codes from `heritages.ts` plus `"unknown"`, split equally; `[]` removes it.
`show` prints each person's derived mix and, for someone with an entry, how
much of it is still in use. `superseded` lists every entry research above
has taken over: fully superseded ones to clear, partly superseded ones to
review.

The apply step fails loudly on anything doubtful: unknown or ambiguous ids, a
third parent, adding someone a relative already has under the same name (as a
re-run file would), a rename that changes nothing, or a result that breaks a
data-model invariant. Fix the change file; don't force it.

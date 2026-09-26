---
name: family-tree-research
description: Update the Family Tree project (src/projects/family-tree) from genealogy research — look people up, record findings with sources, and apply confirmed facts to the live tree through the tree-editing CLI. Use whenever the owner asks to research relatives, "add what you found to the family tree", fix names or relationships in the tree, or apply research findings.
---

# Family tree research → live tree

The tree is one JSON document in Supabase. It is edited through the CLI in
`src/projects/family-tree/tools/` (`tree-cli.ts`), which applies a change file
through the app's own logic functions, validates the result, and refuses to
overwrite a tree someone saved since it loaded. Never edit the row or its JSON
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
7. **Tell the owner** what changed, and to reload any open tabs. An open tab
   loaded before the write can no longer save; it shows a "changed elsewhere"
   notice until reloaded.

If `--write` reports the tree changed since it loaded, someone saved in the
meantime: re-run the dry run against the latest tree and re-check it. Never
work around the check.

## Who approves

The owner's rule lives in the project CLAUDE.md ("Research edits"): apply
high-confidence findings yourself and report them; ask only in the cases it
lists.

## The CLI

Run from the repo root, which holds `.env.local` with the Supabase keys:

    npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
    npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
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
        "gender": "F", "status": "married", "bioChildren": [], "birthDate": "1928-04-02" },
      { "op": "addChild", "parent": "<id>", "coParent": "@wife",
        "name": { "firstName": "Child", "lastName": "Surname" }, "gender": "M", "birthDate": "1952" },
      { "op": "appendNote", "person": "@wife", "note": "Married 1950 (county marriage record)" },
      { "op": "setBirthDate", "person": "<id>", "birthDate": "1925-11" }
    ]

The apply step fails loudly on anything doubtful: unknown or ambiguous ids, a
third parent, adding someone a relative already has under the same name (as a
re-run file would), a rename that changes nothing, or a result that breaks a
data-model invariant. Fix the change file; don't force it.

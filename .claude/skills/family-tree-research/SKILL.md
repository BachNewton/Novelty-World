---
name: family-tree-research
description: Update the Family Tree project (src/projects/family-tree) from genealogy research — look people up, record findings with sources, and apply confirmed facts to the live tree through the tree-editing CLI. Use whenever the owner asks to research relatives, "add what you found to the family tree", fix names or relationships in the tree, or apply research findings.
---

# Family tree research → live tree

The tree is one JSON document in Supabase. The app only displays it; the CLI
in `src/projects/family-tree/tools/` (`tree-cli.ts`) is its only writer. It
applies a change file through the tree's own logic functions, validates the
result, and refuses to overwrite a tree someone saved since it loaded. Never
edit the row or its JSON by hand, and never write SQL against it.

Read `src/projects/family-tree/CLAUDE.md` first: it defines what the tree is
for, the data model, and the living-tree rule.

This file is the workflow and the rules; it rarely changes. Three files beside
it hold what research has learned, and change every round:

- `standards.md`: for each research question, what evidence makes it
  Confirmed and which methods must be tried before it may be Exhausted.
- `sources.md`: each source, what it is good for, how to search and cite it,
  and whether it still works.
- `methods.md`: playbooks for each question: finding all children, earlier
  marriages, birth years, a line's origin.

## Where things live

- **The repo** holds method only: this skill, the project CLAUDE.md. No
  person's name or finding, ever; examples are generic.
- **The tree row** holds only data that is already public, because anyone can
  read it (see Privacy in the project CLAUDE.md).
- **`src/projects/family-tree/research/`** is gitignored and holds the private
  findings: the research log, change files, backups. Never commit anything
  from it, and never quote it in docs, commits or skills.

## Ground rules

- **The tree is public.** Never put contact details (addresses, phone numbers,
  emails), and never put private details about living people (health,
  finances, legal matters, anything they wouldn't want public). Names and
  relationships are fine.
- **Birth dates go in the birth date field, not notes.** Use `setBirthDate`
  (or `birthDate` on a new person), as precise as the source. Anyone who may
  be living gets the year only, children included; a full date is for people
  who have died. Put the source for the date in notes, and never a living
  person's full date. How to turn an age on a record into a year, and when to
  write `~YYYY`, is in `methods.md`.
- **Minors.** Living children get a birth year like everyone else, but their
  notes never carry places, schools, teams or anything else that locates a
  child. A child's own online footprint may be searched; what gets saved
  still has to meet these rules (see `standards.md`).
- **A living tree.** Everyone is family whether or not they've passed. Never
  add a deceased flag or anything that implies one. Death facts that matter to
  the research (a date, a record number) may go in notes; a union ended by
  death uses that union status, and only when the survivor later remarried or
  repartnered.
- **Not a genealogy app.** Add what answers "how is this person related to
  me?": people, the names people actually use, and relationships. Supporting
  facts go in notes, briefly.

## Goal and scope

The tree is **complete** when every in-scope person has each of their
research questions Confirmed or Exhausted.

- **In scope:** everyone in the tree, both partners' families included.
- **Direction: out and down only.** Research doesn't go looking for new
  ancestors: a lead above the tree goes in the research log. Ancestors the
  owner supplies are always welcome; add them, and they join the scope like
  anyone else.

## The research record

Each person carries a `research` record with three questions:

- **`family`**: all their partners (every union, any status, including earlier
  marriages and ex-partners) and all their children (with any co-parent, or
  none) are in the tree. Down only: parents are not part of it.
- **`birthYear`**: their birth year is known, or can't be found.
- **`heritage`**: where their line came from. Asked only of in-scope people
  with no parents in the tree.

Each question is either unset (nobody has looked) or a record:

- **`status`**: `confirmed` (the evidence meets the standard), `exhausted`
  (every must-try method for the question was tried, with no answer; counts
  as done), or `open` (looked, not settled).
- **`asOf`**: the `YYYY-MM-DD` date it held.
- **`sources`**: a non-empty list of source or method names. They live in the
  public row, so name something safe to publish: a record id
  ("FamilySearch 1:1:ABCD-123"), a public record ("1950 US census"), an
  obituary ("Given Surname's obituary (2019)"), a method
  ("county marriage index search"), or "per Kyle" when the owner vouched for
  it. Never a URL or the contents of a people-search listing.
- **`note`**: free text for `open` and `exhausted`: what is unresolved and
  what would settle it. Public, so no private details.

A record is judged against `standards.md` as it stood on its `asOf` date.
The apply step refuses a `confirmed` birth year unless the person's birth
date is set (an approximate `~YYYY` counts): set the date in the same change
file.

## The loop: one family at a time

A **family** is a person or couple plus their children. Research it as a unit
and settle all its questions together: the records that answer one question
usually answer the others.

1. **Pick a family** from `gaps`. Prefer families whose questions are unset
   over re-trying open ones, and dead generations before living ones (their
   records are richer and they anchor the rest).
2. **Look first.** `show <id>` for each member; `find <text>` for anyone
   already entered under another name. Read the family's section of the
   research log, including its rejected look-alikes.
3. **Research the family**, question by question against `standards.md`,
   using the playbooks in `methods.md` and the sources in `sources.md`.
   Digital sources first; asking family is always the last step. Keep every
   source's URL or citation.
4. **Record findings in the research log** (`research/family-research.md`):
   each fact, its sources and its confidence (below), rejected look-alikes and
   why, and **every search that found nothing** (source, what was searched,
   date). Null results are what make a question Exhausted; without them the
   next session repeats the work.
5. **Draft a change file** in `research/`: the facts, plus a `setResearch` for
   every question the round settled or opened. A question waiting on family
   stays `open`, its note saying it is out to family and what was asked.
6. **Dry run** `apply <file>` and read the change list it prints, line by
   line, against what you meant. When the change alters who is related to
   whom, the dry run also solves the new tree's layout (seconds; the solver
   prints its progress), which proves the write will be able to.
7. **Apply** with `apply <file> --write`, following "Research edits" in the
   project CLAUDE.md for what you may apply yourself and what needs the owner
   first. When the topology changed it solves the layout first, then backs up
   the row into `research/backups/` and writes the tree and its layout
   together; otherwise it keeps the stored layout. It prints the new version.
8. **Report** what changed. An open tab keeps showing the tree it loaded
   until reloaded.
9. **Hand over the family batch**: every question for family collected this
   round, as one list (see When to ask).
10. **Write the round's lessons** (see Self-improvement).

Never wait on a family answer: move on to the next family. When answers come
back, apply them as their own round and update the `open` records.

If the layout solve fails, nothing was written: the message says why. A
missing solver venv needs `npm run setup:family-tree-solver` (once per
machine); anything else is a bug to report, not to work around.

If `--write` reports the tree changed since it loaded, someone saved in the
meantime: re-run the dry run against the latest tree and re-check it. Never
work around the check.

## Confidence of a finding

Every fact in the research log sits on one scale:

- **Confirmed**: a primary source (obituary, grave record, official record)
  names the person together with relatives who match the tree, and no source
  conflicts with it.
- **Possible**: anything less: a single mention, a name match without matching
  relatives, a secondary compilation, a people-search listing, or sources that
  disagree.

Only Confirmed facts become tree changes. A Possible fact stays in the log,
or, when it helps someone reading the tree, goes in notes starting with
"Possible:". This scale is about a single fact; the research record's status
is about a whole question.

## When to ask

The owner's rule lives in "Research edits" in the project CLAUDE.md: apply
high-confidence findings yourself and report them; ask first only when the
evidence conflicts or is weak, when a change deletes a person, or when it
would put a private detail about a living person in the public row. Also ask:

- **family questions, in one batch per round.** Asking family is the last
  must-try step, after every digital one, because people are slow to reply.
  Collect every such question across the round and hand them over together
  at the end, each phrased so a relative can answer it without context.
  Never ask one at a time, and never block on one. `standards.md` says which
  questions need a family answer before they can be Exhausted.
  The owner only asks people they know, never cold contacts, so group the
  batch by the family it concerns and say who would likely know (someone in
  that household, a sibling, a parent). The owner picks whom to send each
  group to;
- before changing `standards.md` (see Self-improvement).

## Heritage

Heritage records **where a line came from**, not identity. The data model is
under "Heritage" in the project CLAUDE.md; the list of codes is
`src/projects/family-tree/heritages.ts`.

- **Only from records about people already in the tree**, such as
  a census giving a person's parents' birthplaces, entered on the earliest
  in-tree person of each line. Don't add ancestors to find it. How to read
  the records is in `methods.md`.
- **Descendants derive theirs**, adopted children included; an entry only
  fills the part of a mix the person's parents leave unknown.
- **Code = the present-day country containing the recorded place**, not the
  state at the time: a birthplace recorded as Prussia or Austria-Hungary maps
  by where the town actually lies. Use a **people** entry when the ancestry is
  a people without a country. If the one you need is missing, add it to
  `heritages.ts`: one entry with its kind and name.
- **Unknown when the records don't say. Never guess.** A US-born top-of-line
  person whose origin isn't traced stays unknown: the question is still open
  or exhausted, which is not a claim they aren't American. Don't use a
  present-day country just because that's where the person was born when the
  question is where the line came from. Use `"unknown"` inside an entry for
  the part of a line the records leave open.
- **Record the evidence in the person's notes:** the place as the record
  words it, the source, and an arrival or emigration year when found.
- **After adding anyone above a person with an entry,** run `superseded`.
  Clear fully superseded entries, and review partly superseded ones: the
  entry may have been a guess covering both sides.
- **Living married-in adults** get heritage from records like anyone else:
  it records a line's origin, and it passes to their children.

## The CLI

Run from the repo root, which holds `.env.local` with the Supabase keys. The
CLI reads and writes with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`);
the public anon key can only read. Writes that change the topology solve the
layout with a Python solver, which needs a one-time
`npm run setup:family-tree-solver` (Python 3 on the PATH).

    npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
    npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
    npx tsx src/projects/family-tree/tools/tree-cli.ts gaps
    npx tsx src/projects/family-tree/tools/tree-cli.ts superseded
    npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--write]

`gaps` lists everyone in the tree one family at a time, closest to the root
first, and for each person which research questions are missing (unset) or
open, `family` first. A family block is a person and their partners, then
those of their children who have no partner or child of their own; a child
who does heads a family of their own, so everyone appears once. It ends with
each question's totals and how many people are complete. `superseded` lists every heritage entry research above has
taken over: fully superseded ones to clear, partly superseded ones to review.

The operation vocabulary, and what each field means, is the `Op` type in
`tools/tree-edit.ts`; the parser rejects unknown ops and fields. In a change
file a person is an id, a unique id prefix, or `@name` for someone an earlier
operation in the same file added with `"ref": "@name"`. Choices are always
explicit: a new child names its co-parent or `null` for none, and a new spouse
lists which existing children they are also a parent of (often none).

A generic example, adding a spouse and their child, and recording the
family's research:

    [
      { "op": "addSpouse", "ref": "@wife", "person": "<id>",
        "name": { "firstName": "Given", "lastName": "Surname", "birthSurname": "Maiden" },
        "gender": "F", "status": "married", "bioChildren": [], "birthDate": "1928-04-02",
        "heritage": ["IT"] },
      { "op": "addChild", "parent": "<id>", "coParent": "@wife",
        "name": { "firstName": "Child", "lastName": "Surname" }, "gender": "M", "birthDate": "1952" },
      { "op": "appendNote", "person": "@wife", "note": "Married 1950 (county marriage record)" },
      { "op": "setBirthDate", "person": "<id>", "birthDate": "1925-11" },
      { "op": "setHeritage", "person": "<id>", "heritage": ["FI", "unknown"] },
      { "op": "setResearch", "person": "<id>", "question": "family", "status": "confirmed",
        "asOf": "2026-01-31", "sources": ["Given Surname's obituary (2019)", "county marriage index search"],
        "note": "" },
      { "op": "setResearch", "person": "@wife", "question": "heritage", "status": "open",
        "asOf": "2026-01-31", "sources": ["1930 US census"],
        "note": "Parents' birthplaces illegible; the 1920 census would settle it." }
    ]

`setResearch` replaces any existing record for that question (the change list
shows old → new); `clearResearch` (`{ "op": "clearResearch", "person",
"question" }`) removes one and fails if there is none. `show` prints each
person's research record. `setHeritage` (or `heritage` on a new person) takes
codes from `heritages.ts` plus `"unknown"`, split equally; `[]` removes it.

`linkParent` (`{ "op": "linkParent", "child", "parent" }`) makes someone
already in the tree a parent of someone else already in it: a wife found to be
the mother of her husband's children, or a person found to be a child of an
existing couple. As with a new parent, a second parent is married to the first
automatically unless the two already have a union, which stays as it is. It
refuses a child who already has two parents, a link that already exists, and
anyone becoming their own parent or ancestor.

The apply step fails loudly on anything doubtful: unknown or ambiguous ids, a
third parent, adding someone a relative already has under the same name (as a
re-run file would), a rename that changes nothing, or a result that breaks a
data-model invariant. Fix the change file; don't force it.

## Self-improvement

The playbooks get better only if every round feeds back into them.

- **Each round ends with a lessons step.** A research agent's report includes
  its lessons: a source that worked or failed (and how it failed: blocked,
  seized, empty, wrong), a search technique that found something, a
  standard that was hard to apply or that let a weak answer through. Method
  only: no names, no findings.
- **One editor merges them.** The orchestrating session, not each research
  agent, edits `sources.md` and `methods.md`: add what worked, prune what
  failed or went stale, and keep each file
  tight (merge duplicates, cut anything nobody would act on). Parallel agents
  editing the same files collide and bloat them.
- **Changes to `standards.md` are proposed to the owner, never applied
  silently**: they change what "complete" means. Git history keeps the
  earlier versions, so a record can still be judged against the standard as
  of its `asOf`.
- **This file** changes only when the workflow or the rules do.

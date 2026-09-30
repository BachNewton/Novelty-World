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
- **The database's private tables** hold the research document the tree row
  is projected from, a snapshot of every version, and every applied change
  file with the change list it printed. Only the CLI reads them. Every write
  lands there, so there are no local backups.
- **`src/projects/family-tree/research/`** is gitignored and holds the private
  findings still outside the database: the research log, the questions for
  family, change file drafts, round folders. Never commit anything from it,
  and never quote it in docs, commits or skills.

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
- **The spelling they lived by.** A name is spelled the way the person and
  their own household spelled it in life. An emigrant raised abroad keeps
  their native spelling: take it from their home country's records (a parish
  register, an emigration record), even where US records anglicized it. A
  child who lived in the new country under the anglicized form keeps that
  form, even one born abroad who grew up there. The other spelling goes in
  notes, so searches of records that use it still work. `find` matches either
  spelling, since it ignores accents and case.
- **Not a genealogy app.** Add what answers "how is this person related to
  me?": people, the names people actually use, and relationships. Supporting
  facts go in notes, briefly.

## Goal and scope

The tree is **complete** when every in-scope person has each of their
research questions Confirmed or Exhausted.

- **In scope:** everyone in the tree, both partners' families included.
- **Direction: out, down and up.** Ancestors may be added when a record
  ties them to their child already in the tree (see the identity rule in
  `standards.md`), most usefully to climb a line to its origin (see
  Heritage). A new ancestor gets `birthYear` and `heritage` records; their
  `family` question (their other children, and so the tree's collateral
  lines) waits for a later round, so the tree doesn't balloon sideways.
  Siblings the records name go in the research log for that round.

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

A round starts with `verify`. If it fails, stop and report it: something
private may be reachable with the public key, or the public row has drifted
from the research document, and research must not write on top of either.

1. **Pick a family** from `gaps`. Prefer families whose questions are unset
   over re-trying open ones, and dead generations before living ones (their
   records are richer and they anchor the rest).
2. **Look first.** `show <id>` for each member; `find <text>` for anyone
   already entered under another name. Read the family's section of the
   research log, including its rejected look-alikes.
3. **Research the family**, question by question against `standards.md`,
   using the playbooks in `methods.md` and the sources in `sources.md`.
   Nobody is asked: every step is digital. Keep every source's URL or
   citation.
4. **Record findings in the research log** (`research/family-research.md`):
   each fact, its sources and its confidence (below), rejected look-alikes and
   why, and **every search that found nothing** (source, what was searched,
   date). Null results are what make a question Exhausted; without them the
   next session repeats the work.
5. **Draft a change file** in `research/`: the facts, plus a `setResearch` for
   every question the round settled, exhausted or left open.
6. **Dry run** `apply <file>` and read the change list it prints, line by
   line, against what you meant. When the change alters who is related to
   whom, the dry run also solves the new tree's layout (seconds; the solver
   prints its progress), which proves the write will be able to.
7. **Apply** with `apply <file> --round <label> --write`, following
   "Research edits" in the project CLAUDE.md for what you may apply yourself
   and what needs the owner first. The label names the round in the history
   (it defaults to the file's name). When the topology changed it solves the
   layout first; otherwise it keeps the stored layout. Then it commits the
   tree, its layout, a snapshot of the version and a record of the change
   file together, prints the new version, and runs `verify`. A failed
   `verify` after a write means the write landed but something is wrong:
   stop and report it.
8. **Report** what changed. An open tab keeps showing the tree it loaded
   until reloaded.
9. **Write the round's lessons** (see Self-improvement).

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

## A round with parallel agents

Research agents split the tree by line (one per family line, so no two touch
the same people) and **never write to the tree**: each drafts its own change
file and research log in a round folder under
`research/`, and validates its change file with a dry run. The orchestrating
session reviews each file (evidence, privacy, sources without URLs), applies
them one at a time, runs `superseded` after each, then merges the logs into
`family-research.md` and the lessons into this skill's files.

- Run the dry run as a command of its own. Chained with a file edit in one
  shell call, the permission classifier has refused it as destructive.
- Every agent's browser tab shares one FamilySearch account (see
  `sources.md`).
- An agent whose browser is refused or unreachable stops the whole task
  and reports "BLOCKED: browser" with the error. Without the browser most
  of the research can't run, and a partial round that looks complete
  leaves searches logged that never ran. Each agent's briefing must say
  so.
- Each briefing also forbids calling a site's internal endpoints (FamilySearch
  image tiles, film data or any API) with the owner's session: agents reach
  for them to read images faster, which the owner's rules forbid. Images are
  read only through the normal viewer (see `sources.md`).
- A research agent that needs an unlisted people or region says so in its report
  and uses "unknown" meanwhile; the orchestrating session adds it (parallel
  agents editing the list would collide) before applying that agent's file,
  then swaps the "unknown" for the new code.

## When to ask

The owner's rule lives in "Research edits" in the project CLAUDE.md: apply
high-confidence findings yourself and report them; ask first only when the
evidence conflicts or is weak, when a change deletes a person, or when it
would put a private detail about a living person in the public row.

Research never asks the owner or family to find something out: waiting on
people blocks the work. What the records and public pages can't settle is
Exhausted, with the note saying what would settle it.

Research method and record keeping (the standards, the research record, how
findings are logged) serve Claude's research, not how the owner explores the
tree. Decide those yourself and report what changed; ask only about what
the owner sees or what touches privacy.

## Heritage

Heritage records **the people a line came from**, not identity. The data
model is under "Heritage" in the project CLAUDE.md; the list of peoples and
regions is `src/projects/family-tree/heritages.ts`, and their symbol
timelines are `symbol-timelines.ts` beside it.

- **Climb to the origin.** Where a line's top person and their parents
  were born in the US, add the parents once a record ties them, and keep
  climbing until someone was born abroad or the records run out. The entry
  goes on the immigrant, whose descendants then derive theirs. How to read
  the records is in `methods.md`.
- **Descendants derive theirs**, adopted children included; an entry only
  fills the part of a mix the person's parents leave unknown.
- **Evidence first, then the people.** Record the origin evidence with
  `setOrigin`, then choose the **people** from it: the culture the line
  carried (Hungarian, Finnish, Lebanese), not the state that held the
  place, and never a surname. A Hungarian born in a town now in Romania is
  Hungarian. Where the evidence gives only a state that was home to several
  peoples, the people stays unknown and the evidence still shows. How to
  weigh the evidence is in `standards.md` ("Choosing the people").
- **A region only where a record gives it.** A region (`italian/sicily`)
  is the finer homeland before the nation-states; enter one only when a
  record names that region or a place in it, never from a surname or a
  guess.
- **The list grows with the research:** when the evidence needs a people or
  region that isn't listed, add it in the same round (a people: its entry
  in `heritages.ts`, its flag in `flags.ts` and its timeline in
  `symbol-timelines.ts`, which typecheck forces; a region: its entry and
  its timeline for its people's regional era, which the people's timeline
  gains first if the sources show the region was the homeland then), commit
  and push it to main,
  then apply the round's changes. Never park a finding because its people
  isn't listed yet. Whenever you add a people or region, or add, split or
  change an era, invoke the `heritage-symbol-art` skill in the same round:
  it proposes the new symbols and finds their art. The people lands with
  "no verified art", and the art catches up; never wait for it.
- **Verify the symbol timelines** as the research reaches each people: each
  era's years and symbol need sources (see `standards.md`, "Symbol
  timelines"). `peoples` lists every era still unverified.
- **Unknown when the records don't say. Never guess.** A US-born top-of-line
  person whose origin isn't traced stays unknown: the question is still open
  or exhausted, which is not a claim they aren't American. Don't choose a
  people just because of where the person was born when the question is
  where the line came from. Use `"unknown"` inside an entry for
  the part of a line the records leave open.
- **Record the evidence with `setOrigin`:** the birthplace as the record
  words it and as it is today; for immigrants the emigration date, mother
  tongue and the people a record states; the religion any record states;
  and what the family says about where the line came from, with who said it
  (see "Recording the evidence" in `standards.md`). The sources go in
  notes.
- **Heritage is each generation's own answer** to "where is your family
  from?" (decision 6 in `ideas/heritage-through-time.md`). Climbing above an
  established entry: an ancestor whose people is the same gets the same
  code; one whose origin differs (a family in Pest whose father came from
  Árva) gets the origin evidence and notes only, no entry, so the older
  migration doesn't overwrite the descendants' identity. Keep climbing
  either way: the journey is part of the story.
- **After adding anyone above a person with an entry,** run `superseded`.
  Clear fully superseded entries, and review partly superseded ones: the
  entry may have been a guess covering both sides.
- **Living married-in adults** get heritage from records like anyone else:
  it records a line's origin, and it passes to their children.

## The CLI

Run from the repo root, which holds `.env.local` with the Supabase keys. The
CLI reads and writes with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`);
the public anon key can only read the public tree row. Writes that change the
topology solve the layout with a Python solver, which needs a one-time
`npm run setup:family-tree-solver` (Python 3 on the PATH).

    npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
    npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
    npx tsx src/projects/family-tree/tools/tree-cli.ts gaps
    npx tsx src/projects/family-tree/tools/tree-cli.ts superseded
    npx tsx src/projects/family-tree/tools/tree-cli.ts undecided
    npx tsx src/projects/family-tree/tools/tree-cli.ts peoples
    npx tsx src/projects/family-tree/tools/tree-cli.ts history [count]
    npx tsx src/projects/family-tree/tools/tree-cli.ts verify
    npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--round <label>] [--write]
    npx tsx src/projects/family-tree/tools/tree-cli.ts restore <version> [--write]

The CLI reads and edits the private research document; the public tree row
is its projection, written in the same commit. `history` lists the latest
versions (20 unless a count is given), newest first: when each was saved,
its round label and the change list its apply printed. `restore` writes an
earlier version's document back as a new version (dry run first, as with
`apply`); versions beyond the latest 200 keep only the last of each week, and
`history` marks those that can't be restored. `verify` checks that the
public key reaches nothing private and that the public row is the projection
of the document; every write runs it too.

`gaps` lists everyone in the tree one family at a time, closest to the root
first, and for each person which research questions are missing (unset) or
open, `family` first. A family block is a person and their partners, then
those of their children who have no partner or child of their own; a child
who does heads a family of their own, so everyone appears once. It ends with
each question's totals and how many people are complete. `superseded` lists every heritage entry research above has
taken over: fully superseded ones to clear, partly superseded ones to review.
`undecided` lists everyone with origin evidence recorded but no heritage
decision on their line: no entry of their own, nothing known from above,
and no entry below them. Many are lines still mid-climb, but anyone on it
born abroad needs a people chosen. `peoples` lists every people with its
regions and symbol timelines, each era verified (with its sources) or not.

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
        "heritage": ["italian"] },
      { "op": "addChild", "parent": "<id>", "coParent": "@wife",
        "name": { "firstName": "Child", "lastName": "Surname" }, "gender": "M", "birthDate": "1952",
        "origin": { "birthPlace": "Region, Country" } },
      { "op": "appendNote", "person": "@wife", "note": "Married 1950 (county marriage record)" },
      { "op": "setBirthDate", "person": "<id>", "birthDate": "1925-11" },
      { "op": "setHeritage", "person": "<id>", "heritage": ["finnish", "unknown"] },
      { "op": "setOrigin", "person": "<id>", "birthPlace": "Town, Province, Country",
        "birthPlaceToday": "Town, Region, Country", "emigrationDate": "1905-04",
        "motherTongue": "Language", "recordedPeople": "People", "religion": "Faith as written",
        "originLore": "Country, per Given Surname (2026)" },
      { "op": "appendNote", "person": "<id>", "note": "Birthplace, emigration and people from the 1905 passenger list; mother tongue from the 1920 US census; religion from the 1898 civil marriage record" },
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
codes from `heritages.ts` (a people, `"finnish"`, or a people and region,
`"italian/sicily"`) plus `"unknown"`, split equally; `[]` removes it. An old
country code (`"FI"`) is refused with the people to use instead.

`setOrigin` (`{ "op": "setOrigin", "person", "birthPlace"?, "birthPlaceToday"?,
"emigrationDate"?, "motherTongue"?, "recordedPeople"?, "religion"?,
"originLore"? }`) sets only the origin
fields it gives, at least one, and `""` clears one; the change list shows each
field old → new, and it fails on a change that changes nothing. A new person
takes the same fields as an optional `origin` object on `addParent`,
`addChild` and `addSpouse`. `emigrationDate` is shaped like a birth date. The
sources go in notes. For anyone who may be living the birthplace fields
hold region and country only, never a town, and religion stays empty. `show` prints the fields that are
set, and `find` searches them.

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
  agent, edits `sources.md`, `methods.md` and `standards.md`: add what worked, prune what
  failed or went stale, and keep each file
  tight (merge duplicates, cut anything nobody would act on). Parallel agents
  editing the same files collide and bloat them.
- **`standards.md` changes are reported to the owner** in the round's
  summary, since they change what "complete" means. Git history keeps the
  earlier versions, so a record can still be judged against the standard as
  of its `asOf`.
- **This file** changes only when the workflow or the rules do.

# Claims and private data

The design for the family tree's data layer once it holds evidence, not just
answers, and private data as well as public. It is decided: an
implementation agent builds it from this doc, stage by stage (see Stages).
The decisions and their reasons are listed at the end; the few points that
would change what the viewer shows are the owner's, and sit in their own
section.

## Why

- **Evidence research can't store is lost.** Each fact on a person is one
  string. When records disagree, the losing value and its source end up in
  notes as prose, where no tool can read them, and a later session repeats
  the search to recover them.
- **Private data lives on one machine.** Everything research may not
  publish sits in the gitignored `research/` folder: a research log of
  several thousand lines (per-family sections, each with findings, dated
  null searches and rejected look-alikes), the questions for family, one
  change file per applied round, a full backup of the tree per version,
  round folders of agent drafts and working notes. None of it is
  version-controlled or backed up.
- **Private facts have nowhere to sit next to the person.** A living
  person's full birth date, an exact town, a health detail or a record URL
  can't go in the row anyone can read, so today it goes in the log, away
  from the person it is about.
- **Heritage through time needs the evidence itself.** Decision 6 of
  `heritage-through-time.md` makes a person's heritage each generation's own
  answer to "where is your family from?". Telling how that answer changed
  needs every record's version (a passenger list's people, a census's mother
  tongue, a church, the family's own lore) with its date, not one winning
  string per field.

## The shape of it

Four stores, each with one job:

1. **The research document** (private). One JSON document, the source of
   truth for the tree: the people and their relationships, plus the claims
   (every recorded fact, with its sources, confidence and visibility) and
   the sources they cite. It is written as a whole, under the tree's
   version check, exactly as the tree is today.
2. **The public row** (the viewer's payload). The existing `family_tree`
   row, holding a projection of the research document in today's `Tree`
   shape, and its solved layout. The viewer is unchanged.
3. **Research tables** (private). The research log and the questions for
   family, as rows tied to people. They grow by appending, so they live
   beside the document rather than inside it, and adding to them never
   conflicts with a tree write.
4. **An off-site backup** (private). A private GitHub repo that a nightly
   job fills with a full export, so git holds the long history and a copy
   exists outside Supabase.

Every write goes through the CLI and lands in one database transaction: the
research document, its projection, the layout when the topology changed, a
history snapshot, the change record and any log and question rows.

## The research document

### What becomes a claim

A **claim** is one statement a source makes about a person or a couple: a
value, the sources that give it, how sure research is, whether it may be
published, and whether it is the value research prefers. Every fact that
records can disagree about and that research reads or acts on is a claim.

| Type | Value | About | Projects to |
|---|---|---|---|
| `birthDate` | a partial date (`1931`, `1931-06`, `1931-06-16`, `~1931`) | a person | `birthDate` |
| `birthPlace` | the place as the record words it, and the same place today | a person | `birthPlace`, `birthPlaceToday` |
| `emigrationDate` | a partial date | a person | `emigrationDate` |
| `motherTongue` | text, as the record gives it | a person | `motherTongue` |
| `recordedPeople` | text, verbatim | a person | `recordedPeople` |
| `religion` | text, verbatim | a person | `religion` |
| `originLore` | what the family says about where the line came from | a person | `originLore` |
| `death` | a partial date and a place, either or both may be empty | a person | nothing |
| `marriage` | a partial date and a place, either may be empty | a couple | nothing |
| `otherName` | a spelling or name a record uses for them | a person | nothing |
| `culture` | a cultural marker: a congregation, the language of a gravestone or newspaper, a community | a person | nothing |

- **The birthplace is one claim with two parts.** The present-day form is
  research's reading of the same record, not a second statement, so a
  record's wording and its modern place travel together. The present-day
  part may be empty until research works it out.
- **`death` exists because research and privacy act on it.** Whether a
  record of death exists decides which standard applies (living or dead)
  and whether a full birth date may be published. It is never projected:
  the viewer's data has no deceased flag, and the tree still never shows who
  is alive. An empty value means "a record shows they died" with no date or
  place given.
- **`marriage` is about a couple:** a claim may name one person or two.
  Research reads marriage dates to judge the partners half of `family`
  (a marriage that began before 18 leaves no room for an earlier one).
- **`otherName` replaces "the other spelling goes in notes".** `find` and
  the duplicate guard match it, so a search under an index's spelling finds
  the person.
- **`culture` holds the cultural markers** `standards.md` already asks
  research to record, which heritage through time interprets.

### What stays a plain field

- **Names** (first, middle, last, common, birth surname) stay fields. The
  tree's name is a decision ("the spelling they lived by"), not a record's
  statement; what records wrote goes in `otherName` claims.
- **Relationships and unions** stay the tree's structure. A parent link or
  a union is in the tree or it isn't: the identity rule settles it before it
  goes in, a rejected tie is a `rejected` log entry, and the evidence for a
  tie is a log entry and the `family` research record's sources. Making
  structure a claim would put competing structures in the document, and
  the layout needs exactly one.
- **Gender, heritage entries and the research record** stay fields. A
  heritage entry is research's interpretation of the claims, and the
  research record is research's own status per question.
- **Notes** stay one public free-text field, shown in the person panel as
  today. Private free text about a person is a `note` log entry.

### A claim

| Field | Meaning |
|---|---|
| `id` | a UUID; tools accept a unique prefix, as for people |
| `persons` | one person id, or two for a couple |
| `type` | one of the types above |
| `value` | shaped by the type; validated like today's fields |
| `sources` | at least one citation: a source id, and optionally a private `detail` (the page, the line, "entry for the wife") |
| `confidence` | `confirmed` or `possible`: the scale in `SKILL.md`, now on each fact |
| `preferred` | whether this is the value research goes with |
| `visibility` | `public` or `private` |
| `publicValue` | optional, private claims only: a coarser, publishable form of the value (the year of a date, the region and country of a place) |
| `recorded` | the `YYYY-MM-DD` date research recorded it |
| `note` | why it is or isn't preferred, what conflicts with it; may be empty |

**Preferred.** For each person (or couple) and type, at most one claim is
preferred, and only a confirmed one can be. Research chooses it by the rules
it already has in `standards.md` ("when records disagree"): a record made to
state the fact beats one that states it in passing, the person's own words
beat an informant's after their death, and both beat a census. The preferred
claim's note says why when another claim disagrees. When no claim is clearly
stronger, none is preferred, the field projects empty, and the research
question stays open: exactly today's "conflicts block Confirmed", now
visible to tools. A losing claim is never deleted; it is the
evidence that the conflict was seen.

**Possible facts are claims too,** marked `possible` and never preferred.
They replace "Possible:" lines in notes and in the log, so the next round
finds them on the person.

**Visibility defaults to nothing:** every `addClaim` must state it, like
every other choice in a change file. `public` publishes the value; `private`
publishes the `publicValue` if there is one, and otherwise nothing.

### Sources

A **source** is one record: an obituary, a census household, a passenger
list entry, a grave memorial, a family member's answer. It is a shared
entity in the research document, because one record usually supports many
claims about many people (an obituary names ten children; a census household
gives six birthplaces and mother tongues).

| Field | Meaning |
|---|---|
| `id` | a UUID, prefix-addressable |
| `kind` | `record` (made to state the facts: birth, marriage, death, naturalization, passenger list), `census`, `obituary`, `grave`, `index` (an index entry without the record), `compiled` (a secondary compilation, another researcher's tree, a county history), `peopleSearch`, `family` (a relative's account), `owner` (the owner's word) |
| `citation` | a publishable name for it, in the style `sources.md` already sets ("FamilySearch 1:1:XXXX-XXX", "1920 US census", "Given Surname's obituary (2019)", "family account (2026)") |
| `repository` | the site or archive it came from |
| `date` | the record's own date, partial ISO, so evidence can be read in time order |
| `url` | private; unique across sources |
| `excerpt` | private: the words that matter, verbatim (an obituary's survivors paragraph, a relative's answer and who gave it) |
| `added` | the `YYYY-MM-DD` date research added it |

The citation is always publishable; everything private about a source is in
`url`, `detail` and `excerpt`. The public row carries no sources at all, so
this matters only for the research record's source names (which stay
strings, as today) and any future view of claims.

### Rules the tools enforce

Checked on every apply, alongside `treeProblems` on the projection:

- claims name existing people and sources; values have their type's shape;
  no padded or empty strings; a claim has at least one source;
- at most one preferred claim per subject and type, and only a confirmed one;
- `publicValue` only on a private claim, and for a date it must be that
  date's year (`~YYYY` stays `~YYYY`);
- a confirmed claim needs at least one source that is neither
  `peopleSearch` nor `compiled` (the standards' "leads, never evidence");
- a source's citation contains no URL, and its URL is unique;
- **the living rule, mechanically:** a person counts as possibly living
  unless they have a confirmed `death` claim or their preferred birth year
  is more than 110 years ago. For them, the projected birth date must be a
  year. The apply refuses a change that breaks this, rather than trimming
  the date quietly.

The birthplace rule for the living ("region and country, never a town")
can't be checked from free text, so the dry run lists every public or
`publicValue` place of a possibly living person, and the orchestrator's
privacy review reads that list.

A person's deletion removes the claims about them alone and any `marriage`
claim they are part of. Sources no claim cites stay, since the log may name
them.

## The public row

The public row holds `project(researchDocument)`: today's `Tree`, built by
one pure function in `logic.ts`, and nothing else reaches it.

- Structure, names, gender, heritage entries, the research record and
  public notes are copied as they are.
- Each projected field is the public form of the preferred claim of its
  type: the value if public, the `publicValue` if private and set, and
  otherwise empty. `birthPlace` and `birthPlaceToday` come from the two
  parts of one claim. `originLore` projects as its value followed by the
  source's citation in brackets, which is the "who said it" today's field
  carries in its text.
- Claims of types that project nothing, sources, private anything, the log
  and the questions never reach it.

So the viewer, its types and its `normalizeTree` are untouched by this
design. Claims never change the topology, and the layout is solved from the
projection, so "the viewer never solves the layout and never sees an
unsolved one" holds as it does today: each write stores the projection and,
when its topology changed, its exact layout, in the same transaction.

## Storage

Six tables, all in `supabase/family-tree.sql`, idempotent as before.

| Table | Rows | Holds | Anon key |
|---|---|---|---|
| `family_tree` | one (`global`) | the projection, layout, layout hash, version | reads |
| `family_tree_private` | one (`global`) | the research document, version, updated time | nothing |
| `family_tree_history` | one per tree version | version, saved time, change id, the research document as saved (pruned, below) | nothing |
| `family_tree_change` | one per change file | round label, status (`draft`, `applied`, `withdrawn`, `imported`), the ops as submitted, the version it was checked against, the change list printed at apply, applied version and time, a note | nothing |
| `family_research_log` | one per entry | see The research log | nothing |
| `family_question` | one per question | see Questions for family | nothing |

**Private means three locks.** Row-level security is enabled with no
policies; all privileges on the table are revoked from `anon` and
`authenticated` (Supabase grants them by default); and a CLI command,
`verify`, proves it by querying every private table with the anon key and
failing unless each is refused or empty. `verify` also re-projects the
private document and checks the public row equals it, and that the stored
layout hash matches. It runs at the end of every stage and at the start of
every research round.

**One commit function writes everything.** A Postgres function,
`family_tree_commit`, takes the expected version, the new research document
and its projection (both absent for a change that only adds log entries or
questions), the layout and its hash when the topology changed, and the
change record with its log and question writes. In one transaction it:

1. updates the private row and the public row, each only where the version
   is still the expected one, both to the expected version plus one; if
   either matches no row it raises a serialization failure, so nothing
   lands and the CLI reports a stale write as it does now;
2. inserts the history row with the saved research document;
3. inserts or updates the change record, with the applied version;
4. inserts and updates the log and question rows;
5. clears the research document from history rows more than 200 versions
   old (their metadata stays).

The existing version trigger guards both rows, so any writer that bypasses
the function still can't overwrite a newer tree. Execute on the function is
revoked from `public`, `anon` and `authenticated`: only the service role
calls it. A layout-only write (`relayout`) stays as it is: the public row
alone, under the version check, version unchanged.

`tools/tree-db.ts` stays the only module holding the service-role client;
it gains the commit call and the reads of the private tables.

## The research log

The log is what research did and saw that isn't a fact about a person:
searches that found nothing, look-alikes it rejected, leads it hasn't
followed, what family said, and its reasoning. Each entry is a row:

| Column | Meaning |
|---|---|
| `id` | UUID, prefix-addressable |
| `created_at`, `round` | when, and the round label it came in with |
| `change_id` | the change record that added it |
| `kind` | `note`, `search`, `rejected`, `lead`, `account` or `legacy` |
| `person_ids` | the people it is about (indexed); a sweep lists everyone it covered |
| `question` | optional: `family`, `birthYear` or `heritage`, when it bears on one |
| `searched_on` | for `search`: the date the search ran |
| `outcome` | for `search`: `none` (a null that counts) or `notCovered` (the index can't cover that place and time, logged so nobody runs it again) |
| `open` | for `lead`: true until followed or dropped |
| `body` | markdown, free: what was searched and how, why a look-alike was rejected, the reasoning for a tie, URLs |

- **`search`** entries are what make a question Exhausted: every must-try
  step needs one. The body names the source, the exact query and filters,
  so "could this search have found it" (`methods.md`) can be judged later.
- **`rejected`** is a look-alike and why it isn't ours, so the next round
  doesn't adopt it.
- **`lead`** is a possible connection or an unfollowed thread (a sibling a
  record names, a match to chase); it stays open until a later entry closes
  it.
- **`account`** is what a relative or the owner said, verbatim, and who.
  The facts it gives also become claims citing a `family` or `owner`
  source; the account keeps the words.
- **`note`** is everything else worth keeping: a census household read in
  full, the argument for a tie, a private detail about a person.
- **`legacy`** is a section of the old markdown log, imported verbatim (see
  Migration). It exists only until the judgement pass has restructured
  every one.

Entries are appended by change files and edited only by closing a lead or
removing an entry; there is no in-place rewrite. The findings themselves
are claims, not entries: an entry says what happened, a claim says what is
known.

## Questions for family

Each question is a row: its people, the research question it serves, the
family it concerns (the heading it is grouped under when handed over), who
would likely know (private, free text), the question as a relative would
read it, and its state: `unsent`, `sent` (with the date), `answered` (with
the answer verbatim and its date) or `withdrawn` (with why). `questions`
prints the unsent batch grouped by family, ready to hand over; `markSent`
records that it went out. An answer's facts become claims citing a `family`
source, as above; the question keeps the answer.

## The CLI

`tools/tree-cli.ts` stays the one entry point and the only writer. Reading
the log and the questions goes through it too, so the service-role client
stays in `tools/tree-db.ts`.

### Reading

| Command | Shows |
|---|---|
| `find <text>` | people by name, `otherName` claims and projected fields |
| `show <person>` | the person as today, plus every claim grouped by type (preferred first, with confidence, visibility and each source's citation), the count of log entries by kind, and their open questions |
| `log <person> [--family] [--kind k]` | that person's log entries, newest first, as markdown; `--family` adds their partners and children, the unit research works in |
| `grep <regex>` | every match across log bodies, claim values and notes, sources (citation, URL, excerpt), questions and public notes, each labelled with its people |
| `sources <text>` | sources by citation or URL, so a round reuses a record instead of adding it twice |
| `conflicts` | every person and type with claims that disagree, and whether one is preferred |
| `gaps` | as today, plus per family the unfollowed leads and, until migration ends, the legacy entries and legacy-sourced claims left |
| `superseded` | as today |
| `questions [--all]` | the unsent batch for family, grouped; `--all` adds sent and answered |
| `history [n]` | the last versions: time, round, change list |
| `drafts` | submitted change files not yet applied |
| `export <dir>` | the whole private dataset as markdown (one file per family, with its people's claims, sources and log) and JSON, for reading in bulk with grep; a read-only snapshot, never edited or imported back |
| `verify` | the three privacy locks and the projection check (above) |

### Writing

| Command | Does |
|---|---|
| `apply <file> [--round r] [--write]` | as today: dry run by default, then one commit. The dry run also prints the public values of possibly living people for the privacy review |
| `submit <file> --round r` | a research agent's hand-over: dry-runs the file against the current tree and stores it as a draft change; nothing else is written |
| `apply --draft <id> [--write]` | applies a stored draft against the latest tree, re-running its checks |
| `withdraw <id> <reason>` | marks a draft withdrawn |
| `relayout [--write]` | as today |
| `restore <version> [--write]` | writes that version's saved research document back as a new version, re-projected, with a fresh layout solve |
| `import-backup <dir> [--write]` | rebuilds every table from an export in the backup repo, for disaster recovery; refuses to run against a database that already holds a tree unless it is empty |

### The change file

Still a JSON list of ops, still validated by `parseOps`, and ops still name
people by id, prefix or an `@ref` from the same file. Claims and sources
take `@ref`s too, so one file can add a source and cite it.

- **New:** `addSource`, `updateSource`; `addClaim`, `updateClaim`,
  `preferClaim` (makes a claim preferred, demoting the old one; the change
  list shows old → new), `removeClaim`; `log`, `closeLead`,
  `removeLogEntry`; `ask`, `markSent`, `answer`, `withdrawQuestion`.
- **Removed:** `setBirthDate` and `setOrigin`, and the `birthDate` and
  `origin` fields of the add-person ops. Facts about a new person are
  `addClaim` ops after the op that adds them.
- **Kept as they are:** the name, gender, notes, structure, union, heritage
  and research-record ops.
- `addSource` with a URL an existing source has resolves to that source when
  every other field agrees, and fails otherwise. Parallel agents who cite
  the same obituary then share one source instead of creating two.

A generic example: a birth date from a death record, a census that
disagrees, and the null that settled nothing else.

    [
      { "op": "addSource", "ref": "@death", "kind": "record",
        "citation": "County death record (1961)", "repository": "FamilySearch",
        "date": "1961-03", "url": "https://...", "excerpt": "born 12 June 1890 ..." },
      { "op": "addSource", "ref": "@1900", "kind": "census", "citation": "1900 US census",
        "repository": "FamilySearch", "date": "1900", "url": "https://...", "excerpt": "" },
      { "op": "addClaim", "persons": ["<id>"], "type": "birthDate", "value": "1890-06-12",
        "sources": [{ "source": "@death" }], "confidence": "confirmed", "preferred": true,
        "visibility": "public", "note": "Death record outweighs the census age." },
      { "op": "addClaim", "persons": ["<id>"], "type": "birthDate", "value": "1889-06",
        "sources": [{ "source": "@1900", "detail": "line 14" }], "confidence": "possible",
        "preferred": false, "visibility": "public", "note": "" },
      { "op": "log", "kind": "search", "persons": ["<id>"], "question": "birthYear",
        "searchedOn": "2026-01-31", "outcome": "none",
        "body": "State birth index, exact name, 1885-1895: no entry." }
    ]

## Parallel rounds

Research agents still never write the tree, and they still split the tree by
line so no two touch the same people. What changes is the hand-over: each
agent drafts one change file in its own session scratchpad holding
everything from its round (sources, claims, log entries, questions, the
research records), and `submit`s it. The draft is then in the database, so
nothing of the round lives only on one machine once the agent is done.

The orchestrating session lists `drafts`, reviews each (evidence, privacy,
the dry run's list of public values for the living), and applies them one at
a time with `apply --draft`, re-checked against the latest tree. Each apply
commits the agent's claims, log entries and questions together, which
replaces merging per-agent logs into one markdown file. Collisions can't
arise: drafts are separate rows, log entries and questions are new rows, and
tree writes are serialized by the version check.

Log entries about a person the same draft adds use that person's `@ref`,
resolved when the draft is applied, so no entry ever points at a person who
was never added.

## Version history

`family_tree_history` replaces `research/backups/`: every tree version's
research document, written by the commit function in the same transaction
as the version itself, so no write can skip it. The public row is not
stored, because the projection and the exact layout solve are deterministic
from the document. Snapshots older than 200 versions are cleared to keep the
free tier's database small; the backup repo keeps every nightly state
forever. `history` lists versions with their change lists, and `restore`
brings one back as a new version (never by rewinding the version counter).

## Off-site backup

The free tier has no downloadable backups, so the data leaves Supabase every
night:

- **A private repo** under the owner's GitHub account holds an `export/`
  folder (one pretty-printed JSON file per table, with stable key order so
  diffs read as changes) and an `archive/` folder (see Migration).
- **A scheduled GitHub Action** in that repo runs nightly at 02:00 UTC
  (early morning in Finland) and on manual dispatch. It calls one SQL
  function, `family_tree_export`, which returns every family-tree table
  except the history snapshots, and commits the files if anything changed.
  The export function lives in `supabase/family-tree.sql`, so a new table is
  added to the export in the same change that creates it.
- **It connects as a read-only database role** made for it
  (`family_tree_backup`: select on the family-tree tables and execute on the
  export function, nothing else), through the session pooler, with that
  role's password as the repo's only secret. The service-role key, which can
  write every game's tables, never leaves the owner's machine.
- **The same job probes the locks:** with the anon key (a second secret,
  public anyway) it tries to read each private table and fails the run if
  anything comes back, so a privacy regression emails the owner within a
  day.
- **The orchestrator dispatches it at the end of each round** so a busy day
  is off-site before the night. It also keeps the free-tier project from
  pausing for inactivity.
- **Restore is tested, not assumed:** the stage that builds it runs
  `import-backup` as a dry run against the first export and checks it
  reproduces the live tables.

Git's own history of `export/` is the long-term version history; the
database's history table is the short-term undo.

## Heritage through time

The claims are the evidence Part 2 of `heritage-through-time.md` needs, in
the form decision 6 asks for:

- **Each generation's answer is read from that generation's claims,** not
  inherited from the line's top: their `recordedPeople`, `motherTongue`,
  `religion`, `culture` and `originLore` claims, and their `birthPlace`.
  A family that moved within its homeland shows it as different birthplaces
  on each generation, and the older origin stays on the older people.
- **Every record's version is kept, with its date.** A passenger list that
  calls someone one people and a later census that calls them another are
  two claims with two source dates: the answer changing over a life is
  itself part of the story, and the preferred value alone would hide it.
- **Lore carries its teller and its date,** through its `family` source,
  which is what "their own answer" means for a generation that is still
  alive to give it.
- **The origins map reads the present-day part of birthplace claims,**
  kept in the mappable form `standards.md` asks for. Coordinates are
  derived when the map is built; they are not research data.

Heritage entries stay research's interpretation, set by ops as today. When
Part 2 derives them from the claims, the entries become a projection like
the other fields.

## Migration

### Where everything goes

| Today | Goes to | How |
|---|---|---|
| The tree row | the research document; the public row becomes its projection | mechanical (Stage 1) |
| Plain fact fields, including `religion` and `originLore` | one claim each: confirmed, preferred, public (they are public now), citing one shared legacy source whose citation says the source is in the notes | mechanical (Stage 4) |
| A full birth date on someone | a `death` claim with an empty value on the legacy source, since the rule already required a death record for a full date | mechanical (Stage 4) |
| Sources and conflict losers written in notes | sources and claims; the legacy citation replaced | judgement (Stage 6) |
| Other spellings, cultural markers and death facts in notes | `otherName`, `culture` and `death` claims | judgement (Stage 6) |
| The research log | one `legacy` entry per family section, verbatim, tied to the people its heading names by id | mechanical (Stage 3) |
| Legacy entries | restructured into sources, claims and `search`, `rejected`, `lead`, `account` and `note` entries, then removed | judgement (Stage 6) |
| The questions for family | one question per numbered item, grouped by its heading, with its "would know" line; state `sent`, answered ones marked by judgement | mechanical, then judgement (Stage 3) |
| Change files | `family_tree_change` rows with status `imported`, the file name as the round label | mechanical (Stage 2) |
| Tree backups | `archive/backups/` in the backup repo, as they are | mechanical (Stage 2) |
| Round folders (briefings, agent logs and change drafts) | agent logs checked against the merged log (anything not merged becomes a `legacy` entry); drafts not applied become `withdrawn` change rows; the rest to `archive/` | judgement (Stage 5) |
| Working notes on work in flight | owner rulings about people become `account` entries and claims; queued work becomes `lead` entries; method goes into the skill files; the rest to `archive/` | judgement (Stage 5) |
| The spreadsheets sent to family and their generators | the outputs to `archive/`; a generator worth keeping becomes a repo tool reading `family_question`, with no personal data in its code | judgement (Stage 5) |
| The local copy of the live tree | dropped: it duplicates the row | mechanical |

The mechanical imports are one-off scripts in `tools/`, deleted once they
have run. Each proves itself lossless before the local file goes: the log
import re-renders its legacy entries in order and diffs them against the
original file, and the questions import prints the count per group against
the file's.

The document conversion follows the schema-evolution rule: a
`normalizeResearchDocument` converts a document with plain fields into
claims on load, and the next write stores it. **A golden test pins the
projection:** the projection of the converted live tree must deep-equal the
public tree before conversion, so Stage 4 changes nothing the viewer sees.

### Order

Storage and backup first, so that private data only moves into the database
once it is backed up off-site; then the log, the biggest private store and
the most exposed on one machine; then the model change; then the workflow;
then the slow judgement work, which runs as part of ordinary research.

## Stages

Each stage leaves the tree working, the viewer unchanged, `verify` passing
and the skill and project `CLAUDE.md` describing what exists. No
compatibility shims: the old path is removed in the stage that replaces it.

1. **Private document and one commit.** Tables `family_tree_private`,
   `family_tree_history`, `family_tree_change`; the commit function and its
   grants; the private row seeded from the public row (the projection is
   the identity until claims exist). The CLI writes through the commit
   function, records every applied change file, and stops writing local
   backups. `history`, `restore`, `verify`.
2. **Off-site backup.** The private repo, the export function, the
   read-only role, the nightly Action with its anon probe, the archived tree
   backups, the imported change files, and the restore dry run.
3. **Research log and questions.** Their tables; the `log`, `closeLead`,
   `removeLogEntry`, `ask`, `markSent`, `answer` and `withdrawQuestion` ops;
   `log`, `grep`, `questions`, `export`; the legacy import of the log and
   the questions, verified, after which both markdown files are archived and
   deleted. The skill's loop records findings through ops from here on.
4. **Claims and sources.** Types, ops, validation, the projection, the
   living rule, `sources`, `conflicts`, claims in `show` and `find`; the
   document conversion with the golden test; `setBirthDate` and `setOrigin`
   removed. `standards.md` "Recording the evidence" rewritten around claims.
5. **Drafts and the rest of `research/`.** `submit`, `drafts`,
   `apply --draft`, `withdraw`; the parallel-round section of the skill
   rewritten; the round folders, working notes and spreadsheets triaged and
   archived; `research/` deleted. The gitignore entry stays, so nothing
   written there by mistake is ever committed.
6. **Judgement pass.** Family by family, as part of ordinary rounds: turn
   legacy entries into structured entries and claims, replace legacy
   citations with real sources, move other spellings and cultural markers
   out of notes. `gaps` counts what is left. When both counts reach zero,
   the `legacy` kind and the legacy source are removed from the types.

## The research skill

**What changes:**

- **Where things live:** the database holds all private data;
  `research/` is gone. A session's working notes stay in its own
  scratchpad and are never the record.
- **Looking first** is `show`, `log --family` and `grep`, instead of reading
  the family's section of a markdown file.
- **Recording findings** is ops in the change file: a source for each
  record, a claim for each fact (the losers of a conflict included, with
  their note), a `search` entry for each null, `rejected` for look-alikes,
  `lead` for threads, `ask` for questions to family. "Sources go in notes"
  and "put the conflict in notes" go away.
- **Privacy** is a visibility on each claim, stated every time, with the
  living rule checked by the tool. URLs live only in sources.
- **Parallel rounds** end in `submit`, and the orchestrator applies drafts
  instead of merging files.
- **The family batch** is `questions`, then `markSent`.

**What stays:** the loop, one family at a time; the standards, the research
record and its statuses; the confidence scale (now on each claim); the
identity rule; dry run before write; the orchestrator as the only one who
applies; the rules on when to ask the owner; the lessons step and one
editor for the skill files; the heritage rules.

## What this design leaves out

- **Events.** No residences, occupations, census appearances, burials or
  military service as records of their own. Research doesn't act on them
  per person; when one matters it is a log note, and when it proves a fact
  that fact is a claim. Event records are the heart of genealogy software,
  and the tree is not that.
- **Relationships as claims.** Explained above: the structure is one
  answer, and its evidence is the log and the research record.
- **Places as entities.** No gazetteer or place hierarchy: a place is text
  in two forms. Nothing reads a place across people yet; coordinates can be
  derived when the map needs them.
- **Numeric confidence, source-quality scores, evidence/analysis splits.**
  Two confidence levels and a preferred flag carry every judgement research
  makes today, and the reasoning belongs in the claim's note.
- **Media.** No images or documents stored; a source's URL points at them,
  and its excerpt keeps the words that matter.
- **Per-claim edit history.** Whole-document snapshots and the change
  records already say who changed what, when and why.
- **People outside the tree.** A sibling a record names but the tree
  doesn't hold is text in a `lead` entry, not a half-person.
- **Private notes as a field.** A private detail is a `note` entry tied to
  the person: one place for private prose, read with `log`.

## For the owner

Points where a data decision touches what the viewer shows or a rule the
owner set. The design keeps the viewer exactly as it is until the owner
decides otherwise.

1. **Trimming the notes.** Once claims carry the sources, the notes still
   hold the prose that used to carry them ("birthplace from the 1905
   passenger list"). Trimming it would shorten what the person panel shows.
   Until the owner says so, the judgement pass leaves public notes as they
   are, apart from moving out anything private.
2. **Showing more than the preferred value.** Other spellings, conflicting
   values and cultural markers exist only in the private document. Showing
   any of them in the panel is a UI change, and the projection would grow
   to carry them.
3. **Death as private data.** The data layer now records death evidence
   privately, because research and the privacy rule act on it. The viewer
   still gets no deceased flag and shows nothing new. The project
   `CLAUDE.md` "A living tree" section will be reworded to say the flag is
   absent from the viewer's data rather than from all data.
4. **Values that turn out to be private.** If the judgement pass finds a
   value in the public row that the privacy rules forbid (a town for a
   living person), it makes that claim private, so the panel shows less for
   that person.

## Decisions

Made against the project's two aims and "data model first"; Claude owns
them (see "Who owns what" in the project `CLAUDE.md`).

1. **Facts that records can disagree about, and that research acts on, are
   claims;** names, structure, heritage entries and the research record stay
   fields. That covers the conflict cases research has actually hit, and
   keeps exactly one tree for the layout.
2. **The fields the viewer reads become a projection of the preferred
   claims,** computed by one function and never stored in the research
   document. One source of truth, and the viewer needs no change.
3. **One preferred claim at most per subject and type, confirmed only;
   none when no record clearly wins.** It is the standards' existing
   conflict rule, made visible to tools, and an unsettled conflict stays an
   open question instead of a silent pick.
4. **Sources are shared entities with a public citation and a private URL
   and excerpt.** One record supports many claims about many people, and the
   split keeps publishable text and private text apart by field, not by
   prose convention.
5. **Visibility is per claim, stored with the claim in the private
   document, with an optional coarser public value.** Private facts sit with
   the person, and a living person's year can be public while the date is
   not, without two claims for one record.
6. **The living rule is enforced by the tool, from `death` claims and a
   110-year cutoff.** Privacy that depends on each agent remembering fails
   eventually; a mechanical check fails loudly instead.
7. **The research document stays one JSON document under the version
   check.** The pure edit logic, validation and projection keep working on
   one in-memory object, and the whole tree is well within a single row.
8. **The log and questions are rows, outside the document.** They grow by
   appending, research reads them per person, and adding to them never
   needs to conflict with a tree write.
9. **Private tables are locked three ways (no policy, revoked grants, a
   probe that fails loudly),** so a Supabase default or a later policy can't
   leak them unnoticed.
10. **Every write is one database function call,** so the two rows, the
    history, the change record and the log can never disagree.
11. **Research agents submit drafts to the database; only the orchestrator
    applies.** Today's safe split is kept, without the local files.
12. **The database keeps the last 200 versions' snapshots; git keeps
    everything.** Undo is fast, the free tier stays small, and the long
    history lives off-site.
13. **A nightly GitHub Action exports to a private repo as a read-only
    role,** also dispatched after each round. It runs without the owner's
    machine, never holds the service-role key, and checks the privacy locks
    daily.
14. **Migration is lossless first, structured later:** verbatim legacy
    entries and legacy-sourced claims land mechanically, and the judgement
    work happens family by family in ordinary rounds, with `gaps` counting
    what is left.
15. **Storage and backup before the model change.** Private data moves into
    the database only once it is backed up off-site.

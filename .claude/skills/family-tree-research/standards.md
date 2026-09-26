# Research standards

What each research question needs before it is **Confirmed**, and what must be
tried before it may be marked **Exhausted**. Anything short of both is
**Open**. A record is judged against this file as it stood on the record's
`asOf` date; git history has the earlier versions.

This file defines what "complete" means, so changes are proposed to the owner
before they are made (see Self-improvement in `SKILL.md`). Sources are
described in `sources.md`, techniques in `methods.md`.

## Priority: connections first

The owner cares most about finding connections: who belongs in the tree and
how they relate. Accuracy is there to make connections easier to find, not
an end in itself. So:

- The `family` question matters most, and gets the research effort first.
- A possible connection is worth keeping. Record it in the research log and,
  where it helps, in notes marked "Possible:", so the next round can chase it.
- The identity rule below stays strict, because a wrong match creates a false
  connection. Elsewhere, "good enough to use" beats "perfect": birth years and
  heritage don't hold up completeness once the records run out.

## Rules for every question

- **Identity first.** A record counts only once it is tied to the tree's
  person: it names them together with at least two relatives who match the
  tree (parents, spouse, children, siblings), or it is the person's own
  obituary or official record naming one matching relative plus a matching
  place and era. A name match alone is a lead, never evidence.
- **Conflicts block Confirmed.** If two acceptable sources disagree, the
  question stays Open until a third settles it or the owner decides.
- **People-search listings are leads, never evidence.** They can point at a
  record; they can't confirm or exhaust anything on their own.
- **"Per Kyle"** is a valid source: the owner vouching, from their own
  knowledge or from asking family. Record what they said in the research log.
- **Exhausted needs every must-try step done and logged**, each with its null
  result in the research log. A step that couldn't run (site blocked, search
  budget spent) is not done; the question stays Open, and the note says which
  step is missing.
- **Living vs. dead.** Treat someone as living unless a record of their death
  exists. Public records about living people are thin and often locked, so
  for them asking family is a must-try step.
- **Digital first, people last.** "Ask Kyle / family" is always the last
  must-try step, taken only once every digital step is done, because people
  are slow to answer. The question goes on the round's batch for family (see
  "When to ask" in `SKILL.md`), and the record stays `open` with a note saying
  the question is out to family. Research moves on to other families; it
  never waits on an answer.
- **Exhausted without a family answer** is allowed only where a question's
  section below says so. Elsewhere, a question whose digital steps all came
  up empty stays `open` until family answers, even if the answer is "don't
  know" (which then makes it Exhausted).
- **Minors.** A child's own online footprint (school, sports, social media)
  may be searched like anyone's. The privacy rules apply to what is saved,
  not to where you look: from a child, keep only the birth year and
  relationships, never a school, team, place or anything else that locates
  them, in the tree or in the research log.

## family: all partners and all children are in the tree

Two halves: **partners** (every marriage and partnership, any status) and
**children** (with any co-parent, or none). Confirmed needs both; a source
that covers one half says nothing about the other.

### Dead

**Confirmed** when both halves are covered:

- **Children:** an obituary of the person or their spouse listing the
  children (living and predeceased), or a parent's or sibling's obituary that
  lists them, or census households covering the whole childbearing span with
  no child unaccounted for; and the tree matches it.
- **Partners:** the obituary names the spouse (and any earlier spouse), and a
  marriage-index search of the states they lived in finds no marriage missing
  from the tree; or "per Kyle".

**Must-try before Exhausted:**

1. The person's own obituary: funeral home, newspaper archives, obituary
   indexes, the local library's necrology index where one exists.
2. Their spouse's and each child's obituary, and their parents' obituary.
3. Census households for every census in their adult life (1950 and earlier).
4. Marriage indexes for each state they lived in, under their name and, for
   women, their birth surname and any married surnames found.
5. Death indexes with parent names (NUMIDENT) searched by the couple's names,
   for children who died.
6. Grave records and their family links.
7. Ask Kyle / family (last).

**May be Exhausted without a family answer** once steps 1–6 are done: the
records for the dead are the main evidence, and family often doesn't know an
earlier generation's marriages. Still put the question on the batch when the
person died recently enough that family would remember.

### Living

**Confirmed** when both halves are covered by one of:

- "per Kyle";
- a recent obituary of a parent, grandparent or spouse's parent that names
  the person with their partner and attributes their children to them, with
  nothing since suggesting a new partner or child (a later obituary is the
  usual signal);
- a marriage record plus a source listing the children (a grandparent's
  obituary grouping grandchildren by parent, a birth announcement).

**Must-try before Exhausted:**

1. Every obituary of a parent, grandparent, sibling or in-law that names them,
   newest first.
2. Marriage indexes for the states they lived in.
3. Wedding and registry sites for a recent marriage.
4. People-search relative lists, as leads to follow into records.
5. Ask Kyle / family (last).

**Needs a family answer** to be Exhausted: records can't show that a living
person has no other partner or child.

A living person's family changes. When a later record (a new obituary, a
wedding) shows a partner or child the record didn't cover, reset it to Open.

## birthYear: the birth year is known, or can't be found

Confirmed means the year is known to within the two-year window of `~YYYY`
(see `methods.md`): that is precise enough for a timeline, so a `~YYYY` from
records meeting the rules below is Confirmed, with the note giving the window.
Narrow it later if a record turns up, but don't spend a round on it.

### Dead

**Confirmed** by any one record tied to the person (identity rule above) that
gives the birth date or year: NUMIDENT or SSDI, a death index or certificate,
a birth or baptism record, an obituary giving the date, a grave record with
dates, or a marriage record giving the date of birth. Or by two records whose
age windows overlap in one year. Full dates are allowed.

**Must-try before Exhausted:**

1. NUMIDENT and SSDI (FamilySearch).
2. State death indexes and grave records.
3. Their obituary.
4. Census ages, every census they appear in.
5. Marriage records (ages, sometimes the date of birth).
6. Birth, baptism and delayed-birth records.

**May be Exhausted without a family answer** once steps 1–6 are done. Family
rarely knows an exact year the records don't give; ask only when the person
died recently.

### Living

Year only, never the full date, even when a record gives it.

**Confirmed** by:

- a public record tied to the person that gives the birth date or year: a
  birth or baptism index, a marriage record with the date of birth, an
  official roster or bio that names their parents; or
- two records whose age windows overlap in one year; or
- "per Kyle".

A people-search age never confirms. At most, with two matching relatives on
the listing and no disagreeing listing, it supports a `~YYYY` in an Open
question; two listings that disagree by more than a year kill it.

**Must-try before Exhausted:**

1. Marriage records (ages and dates of birth).
2. The 1950 census, if born by then.
3. Birth and baptism indexes for the states they may have been born in.
4. Obituaries of relatives that give ages (rare, but some do).
5. People-search listings, as leads.
6. Ask Kyle / family (last).

**May be Exhausted without a family answer** once steps 1–5 are done. A
birth year adds no connection, so it never holds up completeness; put it on
the family batch anyway, since family nearly always knows a rough age.

**Minors:** Confirmed by "per Kyle" or a birth record or announcement found
through the parents, or two age or class-year clues narrowing it as for
anyone. Must-try: records about the parents, the child's own online
footprint (saving only the year), then ask Kyle /
family (last). May be Exhausted without a family answer, as above.

## heritage: where the line came from

Asked only of in-scope people with no parents in the tree. This pass uses only
records about people already in the tree: no new ancestors.

**Confirmed** when a record tied to the person or to an in-tree descendant
gives the origin:

- the person was born abroad (their own birthplace is the origin);
- a census gives their parents' birthplaces abroad (the origin is those
  countries, split as the parents split);
- a naturalization, immigration or death record, or an obituary, gives the
  foreign birthplace of the person or their parents.

The place maps to the present-day country containing it. If the person and
both parents were born in the US, the origin lies above the tree: that is not
a Confirmed "US", it is Exhausted for this pass, with the note saying so.

### Dead

**Must-try before Exhausted:**

1. Every census they appear in, 1880–1950: birthplace, parents' birthplaces,
   immigration and naturalization years, mother tongue.
2. Their death record, NUMIDENT and obituary.
3. Naturalization and immigration indexes.
4. Their marriage record (some give parents' birthplaces).
5. Their children's records, which give the parent's birthplace (a child's
   census entry lists "father's birthplace").
6. Ask Kyle / family (last), when family lore might know where the line came
   from.

**May be Exhausted without a family answer** once steps 1–5 are done; family
lore alone is recorded as Possible, not Confirmed, unless the owner vouches.

### Living

Heritage for a living adult, married-in or not, comes from records like
anyone else's: it records a line's origin, and it passes to their children.

**Confirmed** by the same records as above where they exist (the 1950 census,
a marriage record), or "per Kyle".

**Must-try before Exhausted:** the 1950 census if born by then, their marriage
record, then ask Kyle / family (last). **May be Exhausted without a family
answer**, like birth years: heritage adds no connection.

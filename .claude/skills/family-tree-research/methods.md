# Methods

Playbooks for each research question. What counts as done is in
`standards.md`; where to find each record is in `sources.md`.

## Tying a record to the person

Do this before using any record.

- **Match relatives, not names.** A record is the tree's person when it names
  them with relatives who match the tree. A shared name, town and era is only
  a lead; common names produce many look-alikes nearby.
- **Middle names and initials separate namesakes.** Record them (the middle
  name field) when a record gives them.
- **Log rejected look-alikes** with the reason (wrong spouse, wrong
  generation, wrong state), so nobody chases them again. A later record can
  overturn a rejection; move it back when one does.
- **Birth surnames:** a marriage record naming the bride's parents gives it.
  A marriage record also ties both spouses at once.

## Finding all children of a couple

1. **Both parents' obituaries**, and the obituary of whichever died later
   especially: it lists every child, their spouses, and who died first.
2. **The grandparents' obituaries**: they list grandchildren, sometimes only
   as a count. A count that matches the tree is good evidence the generation
   is complete; a count that doesn't is a gap to find.
3. **Each child's obituary**: it names siblings, including half-siblings the
   tree doesn't have.
4. **Census households** for the years the children were at home.
5. **Death records with parents' names** (NUMIDENT) searched by the couple's
   names: this finds children who died, including infants no obituary
   mentions. The tree needs a first name; an unnamed infant goes in a
   parent's notes.
6. **Assigning grandchildren to a parent:** obituaries rarely say whose they
   are. Use the grandchild's own records or a surname plus another clue; if
   those fail, it goes on the round's family batch. A surname alone is not
   enough.

## Finding earlier marriages and partners

- **Surname mismatches.** A woman listed under a surname that is neither her
  birth surname nor her current husband's had another marriage in between;
  children with a different surname from the current spouse point the same
  way.
- **Obituaries across time.** Compare how a person is named in obituaries
  years apart: the partner in brackets changes when a marriage does.
- **Marriage indexes** under every surname the person used; a second record
  with the same parents is the same person remarrying.
- **Stepchildren** listed in an obituary mean an earlier partner of the
  spouse.
- **Divorce by inference:** both spouses remarried while the other was alive.
  That is near-certain and may be applied (see "Research edits" in the
  project CLAUDE.md).
- **Ended by death** only when the survivor later remarried or repartnered.

## Pinning a birth year

Prefer, in order: a record giving the date of birth; a death record or
NUMIDENT; an obituary giving the date or an age with the death date; ages on
dated records.

**An age converts to a two-year window.** Age *A* on a record dated *D* means
born after *D* minus *A*+1 years and on or before *D* minus *A* years. Example:
age 24 on 20 March 1976 means born 21 March 1951 to 20 March 1952, so mostly
1951.

- **Narrow it with a second record.** Intersect the windows from two ages
  (two censuses, a census and a marriage, an age at death). If they overlap
  in one year, that year is exact.
- **One window only:** write `~YYYY`, the year holding most of the window.
  Never a plain year from one age.
- **Don't copy an index's "estimated birth year"**: it is the record year
  minus the age, which is one year too high for most of the window.
- **US censuses** record age on the census day (1 April for 1930, 1940 and
  1950; earlier censuses used other dates, so check the record).
- **Ages can be false**: elopement and underage marriage records overstate
  them. When two sources disagree, the one without a motive to shade the age
  wins.
- **Career timing** (a graduation or first-job year) is not evidence for a
  year.

## Finding a line's origin

From records about people already in the tree; research adds no ancestors.

1. Find the earliest in-tree person of the line (no parents in the tree).
2. **Their census entries, 1880–1950.** Every census from 1880 to 1930 gives
   each person's birthplace and both parents' birthplaces; 1900–1930 add the
   immigration year, and some years add naturalization and mother tongue.
   1940 asked parents' birthplaces only of the people on sample lines;
   check what a given 1950 record carries.
3. **Their own records**: death record, NUMIDENT, obituary ("born in …"),
   naturalization.
4. **Their children's census entries**: a child's line gives "father's
   birthplace" and "mother's birthplace", which is this person's birthplace.
5. **Map the place** to the present-day country that contains it; a county
   or town goes in notes as the record words it. Records that disagree on the
   county but agree on the country still settle the question.
6. **Both parents US-born:** the origin lies above the tree. Record the
   question as Exhausted, and note where the parents were born, which is
   where research above the tree would look.
7. **Enter it on that person**; descendants derive theirs. Then run
   `superseded`.

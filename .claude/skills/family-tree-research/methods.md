# Methods

Playbooks for each research question. What counts as done is in
`standards.md`; where to find each record, and each index's coverage, is in
`sources.md`.

## Tying a record to the person

Do this before using any record.

- **Match relatives, not names.** A record is the tree's person when it names
  them with relatives who match the tree. A shared name, town and era is only
  a lead; common names produce many look-alikes nearby.
- **Middle names and initials separate namesakes.** Record them (the middle
  name field) when a record gives them.
- **Log rejected look-alikes** with the reason (wrong spouse, wrong
  generation, wrong state), so nobody chases them again, and check the list
  before reading a new hit. A later record can overturn a rejection; move it
  back when one does. Never reject on an index summary's place alone: open
  the record, since index places are often wrong.
- **Birth surnames:** a marriage record naming the bride's parents gives it.
  A marriage record also ties both spouses at once.
- **Re-read what is already in the log.** A record or obituary first read for
  one question usually answers others (a spouse's parents on a marriage card,
  a companion or stepchild an earlier summary dropped). Read the full text
  again before searching anew.

## Search techniques

Ways to find a record a plain name search misses. Field names and flags are
in `sources.md`.

- **A null counts only when the search could have found it**: exact names or
  a collection filter (fuzzy search returns thousands of look-alikes), and a
  collection that covers the place and years (see the coverage limits in
  `sources.md`). Log a search outside coverage as not done, not as a null.
- **Search by the couple as parents** (father's surname plus mother's birth
  surname, exact). It returns every indexed record of their children at
  once: marriages (with both sets of parents), stillbirths, NUMIDENTs, death
  entries. An empty result is a logged null for the whole sibling set.
- **Search by the spouse's birth surname**, not only ours. Our surname is
  often garbled in an index (a dropped vowel, a swapped letter) while the
  spouse's is spelled right. A surname sweep coming back empty isn't a null
  until the spouse-surname search is done too.
- **Find a married woman by her given name plus her father's surname**, own
  surname left blank. It finds her NUMIDENT and death records under whatever
  married name she died with, which beats guessing married surnames.
- **Read NUMIDENT aliases.** The alias field can show a married name, and so
  an earlier or later marriage, that nothing else records.
- **Reach an unindexed childhood census through a sibling**: search a
  sibling's given name with a birth-year range, residence county and the
  mother's given name, no surname. It finds the household however the
  surname was transcribed. Sibling names come from birth records and
  NUMIDENTs naming the same parents.
- **A rare surname:** an exact-surname search with the state as the place
  shows every indexed record of it there, across collections (censuses,
  NUMIDENTs, obituary indexes, draft cards). With a birth-year range and no
  given name, it returns the whole cohort, including obituary entries where
  a sister appears only under her married name.
- **A surname misindexed in a census** (one letter changed) empties every
  exact-surname search. Search a sibling's given name plus the father's given
  name plus the county, with no surname.
- **A child missing under the birth surname** may sit in a stepfather's
  household under his. Search the mother under a later married surname; a
  FamilySearch Family Tree profile's source list can show it (a lead only).
- **A married woman's parents:** a later remarriage record often names them
  when her first marriage record doesn't.
- **Search the target's married name with a death-year range** to surface
  sibling obituaries that list them; the record page's "Other people on this
  record" names the parents even when the indexed relationships are garbled.
- **A search with only parent-name fields and a collection filter can come
  back falsely empty** (NUMIDENT did). Search by the child's name instead.
- **Foreign civil registration** finds an immigrant's family by the native
  forms of their names (Andrew as András, Margaret as Margit), surnames in
  their native spelling too.
- **Finnish names follow the croft, not a surname.** Parish books name
  people by father's name and the croft or farm they live on; a US surname
  is often the croft's name (Leppälä, a croft of a larger farm), so look for
  it as a place heading in the communion book. The parish itself usually
  comes from a US record: a NUMIDENT's birthplace field can name it where a
  census says only "Finland". A sibling's exact birth date (from their US
  draft cards) ties a Finnish birth entry to the US family.
- **County histories** (the 1880s–1910s county and township histories,
  full text on archive.org: download the djvu text and grep for the surname)
  can name the immigrant generation of a colonial-era line. They are
  secondary: a lead to a record, or a Possible, not a tie.
- **A spouse's thesis or dissertation** can name a living married-in person
  in its dedication or acknowledgments (university repositories publish the
  PDF).
- **Let the obituary's birthplace drive the search.** Nulls from searching an
  assumed birth state aren't nulls.

## Finding all children of a couple

1. **Both parents' obituaries**, and the obituary of whichever died later
   especially: it lists every child, their spouses, and who died first.
2. **The grandparents' obituaries**: they list grandchildren, sometimes only
   as a count. A count that matches the tree is good evidence the generation
   is complete; a count that doesn't is a gap to find. Great-grandchild
   counts help less, since it's rarely known who was born by that date. An
   old count still narrows a living person's children at that date ("a
   grandson" of someone with one child is that child's son).
3. **Each child's obituary**: it names siblings, including half-siblings the
   tree doesn't have.
4. **Grave records' family links** (see `sources.md`): quickest for a dead
   family, never proof that an unlinked child doesn't exist. Tie an unlinked
   person by another clue (a twin's identical birth date and county).
5. **Census households** for the years the children were at home.
6. **Death records with parents' names** (NUMIDENT, stillbirth indexes)
   searched by the couple's names: this finds children who died, including
   infants no obituary mentions. The tree needs a first name; an unnamed
   infant goes in a parent's notes.
7. **Assigning grandchildren to a parent:** obituaries rarely say whose they
   are. A surname works when each child's children carry a distinct one (a
   son's the family name, a married daughter's her husband's), with a second
   clue ("the only son"). Otherwise use the grandchild's own records; if
   those fail, it goes on the round's family batch. A surname alone is not
   enough.
8. **A child whose other parent is unknown** goes in under the known parent
   with no co-parent; `linkParent` adds the other parent once a record names
   them.

## Finding earlier marriages and partners

- **Surname mismatches.** A woman listed under a surname that is neither her
  birth surname nor her current husband's had another marriage in between;
  children with a different surname from the current spouse point the same
  way. People-search aliases and NUMIDENT aliases are leads for the same.
- **Obituaries across time.** Compare how a person is named in obituaries
  years apart (a couple's two obituaries, a parent's and a grandparent's):
  the partner in brackets changes when a marriage does.
- **Marriage indexes** under every surname the person used; a second record
  with the same parents is the same person remarrying.
- **Stepchildren** listed in an obituary mean an earlier partner of the
  spouse; a "stepmother" or "stepfather" is a parent's spouse.
- **Companions:** "companion" or "dear friend" in two obituaries that name
  each other confirms the pairing.
- **An in-law's parent's obituary** names the in-law's current spouse, though
  its grandchildren are rarely attributed.
- **Never married:** a death index giving marital status "Single" settles the
  partners half.
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
- **Windows that don't overlap** mean one age is wrong: census ages are often
  a year off (check them against any known date). Leave the question open
  until a record giving the date settles it.
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

Climb from the line's top person until someone was born abroad. Each
generation needs its own tie (see "Adding an ancestor" in `standards.md`).

1. Find the earliest in-tree person of the line (no parents in the tree).
2. **Their census entries, 1880–1950.** Every census from 1880 to 1930 gives
   each person's birthplace and both parents' birthplaces; 1900–1930 add the
   immigration year, and some years add naturalization and mother tongue.
   1940 asked parents' birthplaces only of the people on sample lines;
   check what a given 1950 record carries. An elderly parent living in a
   married child's household is on the same page, with their own birthplace.
3. **Their own records**: death record, NUMIDENT, obituary ("born in …"),
   naturalization (the town of birth, which no census gives: worth a note
   even when the country is already settled), county birth records of their
   children (some give the parents' birthplaces).
4. **Their children's census entries**: a child's line gives "father's
   birthplace" and "mother's birthplace", which is this person's birthplace.
5. **When records disagree on the country**, the one made to state the
   birthplace (naturalization, birth record) outweighs a census, which can
   be plainly wrong. Records that disagree on the county but agree on the
   country still settle the question.
6. **Map the place** to the present-day country that contains it; a county
   or town goes in notes as the record words it.
7. **Both parents US-born:** the origin lies above the tree. Add the
   parents (their tie per `standards.md`) and repeat from step 2 for each.
   Stop at someone born abroad, or when the records run out (then Exhausted,
   the note saying where each line stopped).
8. **Enter it on that person**; descendants derive theirs. Then run
   `superseded`.
9. **Record the evidence** on everyone you read about along the way (see
   "Recording the evidence" in `standards.md`), not only the person the
   entry goes on. The records that carry a people rather than a place are
   worth seeking out for immigrants: the 1910 and 1920 censuses' mother
   tongue and passenger lists from 1903 on (their "Race or People" column),
   both usually only on the page image, not in FamilySearch's index; and
   naturalization papers' nationality.

# Heritage through time

A design for reshaping heritage from "the present-day country a line came
from" into the story of the owner's peoples: who they were, where and when
they lived, and how the world changed around them. It comes in two parts:

1. **The evidence, now.** Structured facts research records about each
   person: where they were born as the record words it, when they emigrated,
   their mother tongue, the people or nationality a record states for them,
   the religion a record states, and what the family says about where they
   came from. These are what research would have to redo if it didn't capture
   them, and they are useful for research on their own.
2. **Interpretation and visualization, later.** Which people a line
   carries, its symbols through the eras, and the story panel. All of it
   can be built, and changed, from the evidence without new research, so it
   waits until the evidence is in.

Part 1 is built, and so is Part 2's data model: heritage names peoples
with optional regions, and each people's symbol timeline is data (see the
data model in the project `CLAUDE.md`, and "Where Part 2 stands" below).
The rest of this doc is the design for Part 2. The decisions it asks for
are listed at the end.

## Why

The owner wants to learn the story of their people, all of them, however
they connect: to think about the world, time, change and legacy, and about
culture and identity. The current model works against that:

- **A present-day border can mislabel a people.** A Hungarian born in
  Transylvania, part of Romania since 1920, would get Romania's flag, a
  symbol that doesn't represent their culture.
- **Flags frozen at today's design flatten history.** An ancestor born in
  the Grand Duchy of Finland in the 1870s never lived under the blue-cross
  flag, which Finland adopted in 1918.
- **A percentage is a label, not a story.** "Italy 25%" says nothing about
  who left, from where, when, or what they left behind.

## The model: three layers

1. **Origin: the evidence** (Part 1). The birthplace as the record words it
   ("Capo d'Orlando, Italy"; "Transylvania"; "Syria") and as it is today,
   the emigration date, the mother tongue a census gives, the people or
   nationality a record states (a passenger list's "Race or People", a
   naturalization's nationality), the religion a record states ("g. kath."),
   and the family's own lore about where they came from, with who said it. Structured fields on each person, so the
   interpretation can be drawn from them and the UI can tell them.
2. **People: the heritage.** The culture a line carries: Hungarian, Finnish,
   Irish, Lebanese, Welsh. Independent of borders, so a Transylvanian
   Hungarian is Hungarian. Optionally finer, a **region** within the people
   (Bavarian German, Molisan Italian), because before the nation-states the
   region was the homeland. The mix math stays exactly as it is today: half
   from each parent, an entry fills only what's still unknown.
3. **Symbol: the people through time.** Each people has a timeline of the
   symbols it used for itself, and a card shows the symbol of its own era. So
   scrolling up the tree walks back through history: a Finnish share shows
   the blue cross on a modern card and Finland's crowned lion on a
   grandfather born before 1918.

## Which year picks the symbol

**Recommended: the person's own birth year.** Each card shows the world
that person was born into, which is what makes change visible as you move
through the generations. A line's immigrant shows the symbol of the homeland
they left; their grandchildren show today's.

- *Alternative, "as carried":* every descendant shows the symbol from when
  the line left. Honors the homeland the family remembered, but the tree
  stops showing change.
- A person with no birth year gets one estimated from their nearest
  relatives' years (about 30 years a generation), for picking the symbol
  only; the estimate is never stored or shown as fact.

## Symbols

- **Represent people, not governments.** A symbol stands for the people, as
  they would wish to be represented. Where a people identified with the state
  they lived under, its symbol is theirs too and the two align; where they
  didn't, the tree shows the symbol that represents the people, never the
  government's. A
  Polish line in the partition era shows the white eagle, not the Russian or
  Prussian flag; a Ukrainian line in the Soviet era shows the blue and
  yellow. The rule also keeps regime flags that dishonor the people off the
  tree: a German line born 1933–1945 shows the black-red-gold, the colors of
  1848 and 1919, not the Nazi flag.
- **Art:** modern flags keep coming from the `svg-country-flags` package.
  Historical flags and coats of arms come from official downloads or
  Wikimedia Commons (or, as a last resort, our own drawing; see below),
  stored in the repo unedited, one file per symbol id,
  each with a record of its source page, author, licence (public domain
  preferred; a CC BY-SA drawing is fine with its credit shown), the official
  proportions and what it was checked against (`symbol-art.ts`; the
  `heritage-symbol-art` skill finds and verifies it). Coats of arms are
  drawn in their own shape and proportions, like flags: a shield and its
  crown, never boxed in a rectangle. So a scan of a printed plate gets a
  display file beside it with only the paper made transparent, the
  symbol's own pixels untouched and the scan kept as the record.
- **Accurate art, and our own drawing only as a last resort.** These
  symbols matter: a heritage the tree can confirm should end up with art
  that identifies it. Art comes, in order of preference, from an official
  source (a government's or institution's published design), then from a
  faithful existing file such as a Wikimedia Commons one checked against the
  official specification or the historical record (its proportions, colors
  and details), and only then from our own SVG. We draw one only when both
  published avenues are exhausted, the cited sources document the
  proportions, the colors and every element and its placement, and
  confidence is high; if any detail would be a guess, the symbol waits. A
  drawing's record says it is ours, what was searched and what each element
  rests on, and it is replaced as soon as verifiable published art turns
  up. A symbol that is clearly identifiable but has no single common design
  (the green harp flew in many variants) takes its most iconic, most widely
  recognized design. Where the sources leave no clear right answer (several
  forms of a symbol, one of them drawn by a ruling power), the question that
  decides is: if these people were alive today and we asked how they would
  like their heritage honored through a symbol, what would they likely
  answer? The form the people used for themselves, and would recognize as
  theirs, wins over an official form they would have seen as imposed. We
  never trace, recolor, crop or fix someone else's file (making a scan's
  paper transparent removes paper, not any of the symbol), and nothing
  approximate appears anywhere, mockups included. A symbol with no verified
  art isn't shown until it has some.
- **Every symbol the tree needs gets art.** A symbol is needed when someone's
  heritage share picks it at their birth year. "Art not verified" never
  appears on the tree, mockups included: the CLI's `needed-art` lists every
  needed symbol still without art, with who needs it, and art research works
  from that list. A people or region that research adds brings its needed
  symbols' art in the same round.
- **A symbol is always shown whole.** Anything that represents a place, a
  people or a country (a flag, a coat of arms, a regional emblem) is drawn at
  its true aspect ratio, uncropped, in its own colors, and nothing overlaps
  it: no badge, no other symbol, no label, no line. So no design may slice a
  flag into a share of a shape, clip it to a circle or a tab, stack symbols
  over one another, wrap one around a sphere, or tint, fade or filter it. A share is shown by the symbol's size or by
  something beside it, never by cutting the symbol.
- **Every chip and corner symbol names its era** on hover: "Finnish, Grand
  Duchy of Finland (Russian Empire), before 1918".

## Proposed timelines for the peoples in the tree today

Starting points to verify against sources. They are entered in
`symbol-timelines.ts` as unverified eras, for research to verify and cite.
"Region" means the symbol belongs to the region, so the people needs a
region entry for those years.

| People | Timeline |
|---|---|
| Finnish | before 1918: the crowned lion (arms of Finland, Grand Duchy under Sweden then Russia); 1918 on: blue cross |
| Hungarian | 1848 on: the red-white-green tricolor, the Kingdom's national flag (the arms flags were state variants) and today's; before 1848: to research |
| Italian | before 1861: region (e.g. Kingdom of the Two Sicilies); 1861–1946: Kingdom of Italy (tricolor with the Savoy shield); 1946 on: tricolor |
| Irish | 1798–1918: the green harp flag; 1919 on: tricolor (it displaced the harp flag after the 1918 election); before 1798: to research |
| English, Scottish, Welsh | unchanged: St George's cross, the saltire, the red dragon |
| German | before 1871: region (Bavaria, Prussia, and so on); 1871–1918: black-white-red; 1919 on: black-red-gold |
| Swedish, Dutch, Polish, Ukrainian | one symbol throughout (their own colors or arms through the eras in question) |
| Norwegian | before 1821: the Norwegian lion; 1821 on: the Norwegian cross |
| French | before 1790: the royal fleur-de-lis; 1790 on: tricolor |
| Lebanese | before 1943: the cedar (to verify: the mandate flag was a French tricolor with a cedar, a regime symbol); 1943 on: flag |

## The story

The person panel gains a **Heritage** section that tells each share's story
instead of listing it:

- each people in the person's mix, with its share;
- the line or lines it comes through: the immigrant ancestors, where they
  came from (as recorded, and the place today), and when;
- a short, sourced paragraph on that people in that era: what the homeland
  was, who ruled it, why people left (a famine, a war, a partition, the mines
  of the Upper Peninsula).

The paragraphs are curated content, one per people and era, written with
sources and reviewed like any other page text.

## Research changes

- **Record the origin, then the people.** Research fills the origin fields
  from records, then chooses the people from the evidence: a birthplace, a
  mother tongue (the 1910 and 1920 US censuses asked it), a naturalization's
  stated nationality, a stated religion, a church record's language, and
  the family's lore. Where the evidence only
  gives a state and the place was home to several peoples, the people stays
  unknown and the origin still shows: never a guess from a surname.
- `standards.md` and the project `CLAUDE.md` hold this rule, in place of
  the present-day-country rule heritage started with.

## Migrating what exists

Every current code maps one-to-one to a people (Finland to Finnish, Italy to
Italian, England to English, and so on), so no research is lost. Places now
in notes move into the origin fields where research recorded them. Regions
are added only where a record gives them.

## Phases

1. **Evidence (Part 1):** the fields, the research standard to capture
   them, and a backfill of what research already recorded in notes and logs.
2. **Peoples:** peoples and regions in the heritage list, chosen from the
   evidence; migration of existing entries.
3. **Symbols through time:** the historical art, and cards and chips picking
   by era.
4. **The story panel:** the Heritage section and the first era paragraphs,
   for the peoples already in the tree.

## Where Part 2 stands

**Built: the data model.**

- Every heritage entry names a people, with an optional region
  (`heritages.ts`); the old country codes migrate one to one on load.
- Each people has a symbol timeline, and each region one for its people's
  regional eras (`symbol-timelines.ts`), entered from the table above and
  marked unverified until research lists sources for each era.
- A pure picker gives the symbol and hover label for a heritage and a birth
  year, and a person without a birth date gets a year estimated from their
  nearest relatives, never stored.
- Validation, and CLI support for research: change files take the new
  codes, `peoples` lists peoples, regions and timelines with what is left
  to verify, and `undecided` lists who has origin evidence but no heritage
  decision on their line.

**What remains:**

1. **Research:** verify every era's years and symbol against sources,
   including the Lebanese mandate-era question; add regions where records
   give them; choose peoples for the lines `undecided` lists.
2. **The art:** verified art for every symbol id, through the
   `heritage-symbol-art` skill; `peoples` lists the symbols still without
   it.
3. **The card visuals** (owner's call): corner symbols and chips picked by
   each card's birth year, hover naming the era. Until then the cards show
   exactly what they did before peoples: each people shows today's flag of
   the country it was coded by, a region its people's flag, and a chip's
   hover names that country.
4. **The Heritage panel** with the journeys globe and the era paragraphs.

## A line's journey, and when a place becomes heritage

There is no number of generations after which a place becomes a family's
heritage: it differs by family, by place and by era. So the tree doesn't
apply a threshold. It records the journey instead: each generation's
birthplace, which the tree already holds once research climbs a line. A
line reads as a path with durations ("Germany until about the 1750s,
Pennsylvania for about 150 years, then Ohio"), and the story panel tells it
that way.

What makes a place more than a stop on the way is culture, not time: a
distinct people formed or kept there, with its own language, church or
community. The Pennsylvania Dutch kept a German dialect for two centuries;
French Canadians, Acadians and the Métis are peoples of their own. A place
becomes a heritage entry only as such a people, and only when the evidence
shows it: a mother tongue, a congregation, a gravestone's language, family
lore the owner vouches for. A birth in a settler country (the US, Canada) is
never an origin on its own; research climbs past it.

## Direction for the visuals

A throwaway mockup of six ideas on the tree's real data (a fan chart, a
ribbon, symbols through time, a line's journey, an origins map and a
story card) was shown to the owner. The two they liked most set the
direction:

- **Symbols through time** replace today's flags on the cards: the same
  corner symbols, picked by each card's birth year (decisions 2 and 3
  below).
- **A journeys map on a 3D globe**: each of the person's lines drawn as its
  journey through time, not a single origin-to-destination arc. A line's
  path runs through every generation's birthplace in order, from its
  earliest known ancestor down to the person, each stop dated by that
  generation's birth year, so a family that moved from place to place
  (Germany, then Pennsylvania, then Ohio) shows every move. The earliest
  stop is sized by the line's share, and the unknown share is stated
  plainly. It lives in the person panel's Heritage section. The map is
  always a 3D globe, in the 2D view as in the 3D view, never a flat
  projection. Every stop comes from a generation's `birthPlaceToday`, so
  research records it on every generation it reaches, the settler-country
  births included, in a form a map can place.

The journey and story paragraphs stay in the plan as the panel's text
around the map; the fan chart and the ribbon are set aside.

**Where it lives in the app.** No new view; two changes to what exists:

- **2D cards:** the corner flags and chips become era symbols, at the same
  places and sizes. Cards, lines and layout are unchanged; only the symbol
  a corner shows follows the card's birth year.
- **Person panel** (opened from either view): a Heritage section with a
  compact map of that person's lines and a line or two per people. It fits
  the panel's width on desktop and its bottom sheet on a phone.
- **3D view:** no heritage on the spheres, whose colors already mean the
  direct line, the selection and everyone else. Heritage reaches 3D through
  the same person panel.

## Decisions

Made against the project's two aims (connection, and the story of the
owner's peoples); the owner judges the result.

1. **A heritage entry names a people, with an optional region.** Cultural
   origin outlasts borders, which is what the story needs; a region covers
   the eras before nation-states. The list grows whenever the evidence names
   a people not yet in it.
   - **A region is part of the code, not a separate field:** `italian` or
     `italian/sicily`. An entry stays a flat list of codes, so the mix math,
     the change files and the validation are unchanged, and a region can
     never be recorded without its people. The mix treats a regional code
     as a heritage of its own; grouping shares by people is the display's
     job, derived and never stored.
   - **Codes are lowercase slugs of the people's English name** (`finnish`,
     `lebanese`), readable in change files. A people without a country of
     its own (`sami`, `roma`) is the same kind of entry as any other, so the
     old separate "people" kind is gone.
   - **Region slugs are unique across all peoples**, and each region names
     its people. A region entered under another people is rejected rather
     than read as a new region.
2. **A card's symbol follows that person's own birth year.** It shows how
   the world changed around each generation, which is the point of the
   story aim; "as carried" would freeze it.
   - **Eras are spans of birth years:** an era covers its first year up to,
     not including, the next era's first year, and a timeline runs without
     gaps from the earliest times to the present. So the German Empire's
     era runs to 1919: a child born in 1918 was born under it.
   - **A regional era still names a symbol for the people as a whole,** for
     a share with no region: the colors the people's own national movement
     used before unification (the Italian tricolour, the black-red-gold of
     1848). A share with a region shows its region's symbol in those years.
   - **The estimated birth year** comes from the nearest relatives with a
     birth date, over parent, child and partner links, about 30 years a
     generation, averaging relatives equally near.
3. **Symbols represent people, not governments.** Where a people identified
   with its state, the state's symbol serves; where it didn't, the symbol
   the people would choose for themselves, never one a government imposed,
   including German lines born 1933–1945, who show the black-red-gold.
4. **The story lives in the person panel's Heritage section,** not a page of
   its own: it stays one click from the tree, and the tree stays the way in.
5. **Journeys, not thresholds** (above): the story panel shows a line's whole
   path, back to its earliest known people.
6. **Each generation's heritage is its own answer.** The owner's rule: a
   person's heritage is what they would answer, with reasonably accurate
   knowledge, to "where are you, your people, your family from?". So heritage
   can change up a line as a family's culture changes with where it lives and
   who it marries into, and the visuals follow those changes through time.
   A newly found older origin never overwrites the heritage of the
   generations below it. A family that left Árva for Pest in the 1840s stays
   Hungarian for the grandchild born in Budapest in 1912. The older origin is
   part of that grandchild's journey, not a share of their mix.
   - **Until Part 2 can derive this from the evidence, the data follows it
     this way:** every generation research reaches gets its evidence fields
     (birthplace as written and today, emigration, mother tongue, recorded
     people, religion, family lore). A heritage entry goes on the generation whose identity the
     evidence shows. An ancestor found above it whose origin differs gets the
     evidence only, no entry: with no entry they pass "unknown" up, so the
     descendant's entry keeps the family's identity, and nothing is lost
     for Part 2 to interpret later.

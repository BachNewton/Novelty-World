# Heritage through time

A design for reshaping heritage from "the present-day country a line came
from" into the story of the owner's peoples: who they were, where and when
they lived, and how the world changed around them. It comes in two parts:

1. **The evidence, now.** Structured facts research records about each
   person: where they were born as the record words it, when they emigrated,
   their mother tongue, and the people or nationality a record states for
   them. These are what research would have to redo if it didn't capture
   them, and they are useful for research on their own.
2. **Interpretation and visualization, later.** Which people a line
   carries, its symbols through the eras, and the story panel. All of it
   can be built, and changed, from the evidence without new research, so it
   waits until the evidence is in.

The rest of this doc is the proposal for Part 2; Part 1 is built (see the
data model in the project `CLAUDE.md`). The decisions Part 2 asks for are
listed at the end.

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
   the emigration date, the mother tongue a census gives, and the people or
   nationality a record states (a passenger list's "Race or People", a
   naturalization's nationality). Structured fields on each person, so the
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

- **A people's own symbol in each era, never a regime imposed on it.** A
  Polish line in the partition era shows the white eagle, not the Russian or
  Prussian flag; a Ukrainian line in the Soviet era shows the blue and
  yellow. The rule also keeps regime flags that dishonor the people off the
  tree: a German line born 1933–1945 shows the black-red-gold, the colors of
  1848 and 1919, not the Nazi flag.
- **Art:** modern flags keep coming from the `svg-country-flags` package.
  Historical flags and coats of arms come from Wikimedia Commons (public
  domain, free), stored in the repo, each with its source and license noted.
  Coats of arms are drawn in their own proportions, like flags.
- **Every chip and corner symbol names its era** on hover: "Finnish, Grand
  Duchy of Finland (Russian Empire), before 1918".

## Proposed timelines for the peoples in the tree today

Starting points to verify against sources before building. "Region" means
the symbol belongs to the region, so the people needs a region entry for
those years.

| People | Timeline |
|---|---|
| Finnish | before 1918: the crowned lion (arms of Finland, Grand Duchy under Sweden then Russia); 1918 on: blue cross |
| Hungarian | before 1918: Kingdom of Hungary (tricolor with the crowned arms); 1918 on: tricolor |
| Italian | before 1861: region (e.g. Kingdom of the Two Sicilies); 1861–1946: Kingdom of Italy (tricolor with the Savoy shield); 1946 on: tricolor |
| Irish | before 1922: the green harp flag; 1922 on: tricolor |
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
  stated nationality, a church record's language. Where the evidence only
  gives a state and the place was home to several peoples, the people stays
  unknown and the origin still shows: never a guess from a surname.
- `standards.md` and the project `CLAUDE.md` replace the present-day-country
  rule with this.

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
- **An origins map**: each known origin a point sized by its share, with an
  arc to where the family settled, and the unknown share stated plainly.
  It lives in the person panel's Heritage section, for that person's lines.
  The points are the immigrants' birthplaces today; the arcs end at the
  first birthplace in the new country. Both come from `birthPlaceToday`, so
  research must record it in a form a map can place.

The journey and story paragraphs stay in the plan as the panel's text
around the map; the fan chart and the ribbon are set aside.

## Decisions

Made against the project's two aims (connection, and the story of the
owner's peoples); the owner judges the result.

1. **A heritage entry names a people, with an optional region.** Cultural
   origin outlasts borders, which is what the story needs; a region covers
   the eras before nation-states. The list grows whenever the evidence names
   a people not yet in it.
2. **A card's symbol follows that person's own birth year.** It shows how
   the world changed around each generation, which is the point of the
   story aim; "as carried" would freeze it.
3. **A people's symbol is its own, never a regime's imposed on it,**
   including German lines born 1933–1945, who show the black-red-gold.
4. **The story lives in the person panel's Heritage section,** not a page of
   its own: it stays one click from the tree, and the tree stays the way in.
5. **Journeys, not thresholds** (above): the displayed heritage of a line is
   its earliest known people; the story panel shows the whole path.

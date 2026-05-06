---
name: add-finland-idea
description: Add one or more travel ideas to the Finland Catalogue project (src/projects/finland-catalogue). Researches each idea on the web, fills out every property defined in the Idea schema, and appends fully-populated entries to ideas.ts. Use whenever the user asks to "add an idea (or ideas) to Finland", "/add-finland-idea X, Y, Z", or anything similar. Pass one or more ideas as a comma-separated list.
---

# Add Finland Catalogue Idea

You are adding entries to a hand-curated travel catalogue for Finland. Each
entry is a fully-researched `Idea` object appended to
`src/projects/finland-catalogue/ideas.ts`.

**Read `.claude/skills/_finland-shared/AUTHORING.md` first.** It covers
input parsing, parenthetical-context handling, image sourcing, slug
generation, append/commit/lint expectations — all identical between this
skill and `add-finland-topic`. The guidance below is the Idea-specific
layer on top of that.

## Examples of how the user might invoke this skill

```
/add-finland-idea
- Allas Sea Pool
- Löyly (the architecture is the draw, not just the sauna)
- a good ramen place in Helsinki (somewhere I'd take a friend visiting)
- husky safari (something for the winter trip in February)
```

## Workflow per idea

1. **Identify what the idea actually is.** Some inputs are concrete venues
   ("Löyly", "Allas Sea Pool"). Others are categories ("a good ramen place
   in Helsinki", "husky safari", "ice swimming"). For categories, your job
   is to pick the *best representative* — the one you'd actually recommend
   to a friend visiting Finland — and use that as the entry. Don't write a
   generic "huskies exist in Finland" entry; write about a specific operator
   or experience.

2. **Research with WebSearch + WebFetch.** Find the official site, read it,
   cross-reference one or two travel blogs or reviews to sanity-check
   pricing and access details. The mindset throughout is *what does someone
   planning a trip need to know to decide if this fits their visit?*

3. **Pick image URLs.** Aim for 3-5 gallery images plus a thumbnail, up to
   ~10 if you find genuinely varied high-quality images. See the shared
   image-sourcing playbook in AUTHORING.md.

4. **Fill out the entry.** Use the schema in `src/projects/finland-catalogue/types.ts`
   as the source of truth — read the JSDoc comments on each property, they
   explain the *spirit* of each field. When information is uncertain, make
   a best guess (the user explicitly prefers a confident guess + a note
   over a blank field), but do not invent specifics like exact opening
   hours or addresses you didn't find. If you genuinely don't know, omit
   the optional field.

5. **Cross-link with Topics.** Read `topics.ts` and check that each
   genuinely-Topic-worthy concept in your new Idea's prose (cultural
   touchstones like sauna, sisu, the Winter War; distinctively Finnish
   things; recurring concepts that several Ideas reference) is matched
   by some Topic's aliases. The auto-linker matches literal text, so
   vocabulary drift is the failure mode: if your Idea says "smoke bath"
   but Sauna's aliases are only `["sauna", "saunas", "sauna culture"]`,
   no link happens. Two fixes:
   - **Topic exists but its aliases don't catch your phrasing.** Add
     your phrasing to that Topic's `aliases` array. This retro-links
     everywhere the phrase appears, in this Idea and any others.
   - **Topic doesn't exist but probably should.** Don't create it from
     this skill — flag it in your summary as a candidate for
     `add-finland-topic`, and let the user decide.
   Be selective: only meaningful concepts need this treatment. Don't
   try to link every common noun.

## Field-by-field guidance

Read `src/projects/finland-catalogue/types.ts` for the canonical comments.
Highlights worth restating:

- **shortDescription**: the hook that fits on a card. One sentence. Make it
  specific enough that someone scanning a grid can tell what makes this
  idea worth doing. Avoid filler like "A wonderful experience..."
- **longDescription**: 2-4 paragraphs as a `string[]`. First paragraph
  describes what it actually is. Middle paragraph(s) cover what to expect,
  what makes it special, who it's for. Last paragraph practical tips
  (bring this, book like this, watch for that).
- **availability.suitableMonths**: array of month numbers (1=Jan, 12=Dec)
  when the idea is well-suited. Be specific: research the actual months
  rather than defaulting to broad seasons. A husky safari is `[12,1,2,3]`
  because that's the snow-reliable window — not all four "winter" months.
  An aurora-viewing experience is `[9,10,11,12,1,2,3]`. Year-round
  things use all 12: `[1,2,3,4,5,6,7,8,9,10,11,12]`. The UI summarizes
  this into a friendly chip ("Dec–Mar", "Year-round") so be precise
  about the boundaries.
- **availability.events**: ONLY for true date-locked events that recur
  annually — festivals, holiday markets, eclipses. Use "MM-DD" for from/to
  (no year — the year is implicit and recurring). Soft "best in late
  summer" ranges go in `suitableMonths`, not here. Most ideas have no
  events and should omit this field.
- **accessFromLauttasaari**: travel is measured from Lauttasaari, the
  residential island in western Helsinki where the trip is based.
  Lauttasaari sits one metro stop / ~6 min from Helsinki Central, and
  bus 21 is the other common way into downtown — both are worth
  mentioning when one or the other is more convenient (e.g. bus 21 if
  the destination is closer to a 21-route stop than to a metro station).
  For most central-Helsinki destinations this means a short metro hop
  or bus ride plus a walk; for things already on Lauttasaari (the
  southern beaches, Vattuniemi, the HSK marina) it's just a walk. For
  long-distance trips, start the route with a metro hop to Helsinki
  Central and pick up the train/ferry there. **Disregard flying as a
  transit mode** — even when an airport route exists (Rovaniemi,
  Savonlinna), describe the ground-transport alternative instead.
  **Private-boat option (May 1 – Oct 31).** A small private boat is
  docked at HSK Marina (Helsingfors Segelklubb) on Lauttasaari's
  southern shore. When the destination is on an island that has a
  public visitor dock (guest harbor, public pier, ferry-shared
  landing), evaluate boat-from-HSK against the public-transport
  route. **If the boat option is faster or simpler in season,
  present it as the PRIMARY route — let it drive `complexity`,
  `duration`, and the lead sentence of `notes` — and demote
  public transit to the secondary "off-season / boatless guests"
  fallback in the same `notes` field.** Frame the boat route
  with explicit seasonality ("By boat from HSK (May–Oct):
  ~Xmin direct across to the [destination] guest pier") and
  mention obvious caveats (open-sea exposure, weather sensitivity
  for a small boat, visitor-dock fees). Keep the public-transport
  description complete enough that it stands alone for the rest
  of the year. Skip the boat option entirely for mainland-only
  destinations, islands without public docking, ideas outside the
  May–October season, and destinations realistically out of
  small-boat range (Åland, Hanko, Kvarken, anything multi-hour
  open water). When the boat option exists but isn't faster or
  simpler than transit, mention it as a parenthetical alternative
  rather than promoting it.
  `complexity` is about *transfers and planning effort*, not duration —
  `duration` already captures how long the trip takes. A 12h overnight
  train with no transfers is `'simple'` or `'moderate'`, not `'complex'`,
  because the journey itself is straightforward (one comfortable train,
  no fragile connections). `'complex'` is reserved for routes with
  multiple transfers, sparse connecting services, required car rental,
  or material advance planning. A direct boat trip with no transfers
  is `'simple'` regardless of crossing time.
- **cost.perPersonEur**: best-guess EUR for one adult. 0 for free. If the
  cost varies wildly, pick a typical number and use `notes` for the spread.
- **booking.leadTime**: realistic horizon. `'months'` is for genuinely
  hard-to-get experiences (Christmas-week glass igloos, peak-season
  husky safaris) — don't over-use it.
- **suitableAgeRange**: an optional `{ min, max? }` object describing the
  age window of children this idea suits. Omit it entirely if the idea is
  not well-suited to children at all (late-night events, intense hikes,
  fancy restaurants, adult-only saunas) — its absence IS the
  "not-children-friendly" signal. When you do include it: `min` is the
  youngest age that can comfortably enjoy it; omit `max` when there's no
  upper bound (libraries, parks, most museums work for any age upward),
  set it when the idea genuinely loses its appeal past a certain age (a
  splash playground might cap at ~10). Use `min: 0` for things that work
  with babies/strollers. When unsure, err toward omitting and explain in
  `childrenNotes`.
- **childrenNotes**: caveats for visiting with kids — applies whether or
  not `suitableAgeRange` is set. e.g. "Stroller-unfriendly trail — bring
  a carrier", "No high chairs but kid-friendly menu", "Loud crowds may
  overwhelm under-3s even though they're allowed".
- **physicalIntensity**: most museums, restaurants, ferries → `'low'`.
  Half-day walking tours, swimming, skating → `'moderate'`. Serious
  hiking, cross-country skiing, multi-hour active sport → `'high'`.
- **website**: only if there's a real official site or canonical booking
  page. Don't link random blog posts.

## Tag and region policy

Tags and `location.region` are derived dynamically from `IDEAS` — the
filter UI renders one chip per unique value, so adding a new tag or
region to an idea makes its chip appear automatically. The catalogue is
the source of truth; there is no separate canonical list to update.

**Reuse existing values where they fit.** Read `ideas.ts` first and
prefer an existing tag or region over a near-duplicate (`"Helsinki"`
not `"Helsinki, Finland"`; `"food"` not `"foods"` or `"culinary"`).
Typos and casing variations create duplicate filter chips.

**Tags** — short labels for grouping. The catalogue itself is the
source of truth: tag names live in `ideas.ts`, and a tag's meaning is
whatever it consistently describes across the entries that carry it.
The skill tells you *how* to think about tags, not which ones exist.

**Workflow when filling in tags:**

1. **Survey first.** Before writing tags, scan every entry in
   `ideas.ts` and note which tags each carries. To know what
   `historical` means (or any other tag), look at every idea tagged
   with it and infer the pattern from usage — not from the bare word.
2. **Apply existing tags where they genuinely fit.** Match the new
   idea against the *inferred meaning* of each existing tag. A
   1900s-built sauna isn't `historical` if every other `historical`
   idea has the history as the *draw*, not incidentally old.
3. **After integrating, look for emergent patterns.** Adding an idea
   isn't just a write — it's a chance to notice that the catalogue
   now has, say, three nature-focused entries sharing a facet no
   existing tag captures. If a new pattern would apply to ≥2 ideas
   (the one being added plus at least one existing), introduce the
   tag AND backfill it onto the existing entries it applies to.
   One-off tags clutter the filter; a tag that retrofits onto
   existing entries is earning its keep. If nothing fits and no new
   pattern emerges, `tags: []` is fine.
4. **Call it out in your summary.** Tags applied to the new idea,
   any new tag introduced, and which existing entries you backfilled.
   The user reviews the diff against the recap.

**Regions** — geographic groupings. `location.region` is a `string[]`:
an idea can authentically belong to more than one region at once. The
filter UI renders one chip per unique region appearing across IDEAS,
and the granularity of those chips IS the planner's mental model of
"where could I go?".

**Multiplicity.** List every region a planner filtering by that chip
would expect this idea to surface under. An idea earns more than one
region when the place it occupies sits inside a broader area whose own
chip is meaningful for planners, when the activity itself crosses or
spans more than one distinct area, or when the venue is contained in a
named neighbourhood/district that itself functions as a destination
within a larger one. When none of those apply, a single-element array
is correct. Don't pad with regions the idea doesn't really belong to —
each entry in the array should withstand the test "if the user filters
on this region, would they be glad to see this idea in the result?".

**Granularity scales inversely with distance from Helsinki.** Close-in
destinations are independent day-trip decisions, so each meaningful
place earns its own chip. Far-away destinations cluster under broader
regional chips — once a planner has committed to the long journey,
the trip is the chip and the individual sites within it bundle
together. Between those extremes, balance: the question to ask is
whether a planner would decide on this place independently or as part
of a larger regional trip.

Reuse existing region values where the rules above point to them —
casing and spelling variants create duplicate chips. Introduce a new
region when the rules genuinely call for one and no existing region
fits; the filter chip is how a user discovers that destination exists
in the catalogue. Survey `ideas.ts` first to see what's already in use
before deciding whether to reuse or introduce.

## Idea-specific summary callouts

In addition to the shared "After writing" guidance in AUTHORING.md:
- If you introduced a new tag or region, state it in your summary so
  the user can sanity-check that it's worth keeping (vs. folding into
  an existing one).
- If you added an alias to an existing Topic so the auto-linker would
  catch a phrasing in your new Idea, list which Topic and which alias.
- If you spotted a Topic-shaped concept in your Idea that doesn't yet
  have a Topic, flag it as a candidate for `add-finland-topic`.
- The file you should normally be modifying is
  `src/projects/finland-catalogue/ideas.ts`. The one exception is
  `topics.ts` when you're adding aliases to existing Topics — don't
  create or otherwise edit Topic entries from this skill.

---
name: add-finland-idea
description: Add one or more travel ideas to the Finland Catalogue project (src/projects/finland-catalogue). Researches each idea on the web, fills out every property defined in the Idea schema, and appends fully-populated entries to ideas.ts. Use whenever the user asks to "add an idea (or ideas) to Finland", "/add-finland-idea X, Y, Z", or anything similar. Pass one or more ideas as a comma-separated list.
---

# Add Finland Catalogue Idea

You are adding entries to a hand-curated travel catalogue for Finland. Each
entry is a fully-researched `Idea` object appended to
`src/projects/finland-catalogue/ideas.ts`.

## Input format

The user gives you one or more ideas, typically as a bullet list. Each
bullet may optionally include a parenthetical context note explaining
*why* that idea is on the list — taste, a constraint, a hook to capture
in the entry. Both the title and the context are inputs to your research
and writing.

Examples of how the user might invoke this skill:

```
/add-finland-idea
- Allas Sea Pool
- Löyly (the architecture is the draw, not just the sauna)
- a good ramen place in Helsinki (somewhere I'd take a friend visiting)
- husky safari (something for the winter trip in February)
```

A comma-separated single-line form is also supported as a shortcut:
`/add-finland-idea allas sea pool, suomenlinna, ice swimming`.

Process each idea sequentially. **Do not parallelize web research across
ideas** — research one, write one, move to the next. This keeps the diff
readable and lets you reason about each entry on its own.

### Using the parenthetical context

When the user includes `(some context)` on a bullet, treat it as a
high-signal hint about what they care about. It should shape the entry
in concrete ways:

- **Pick the right representative for vague inputs.** "(somewhere I'd
  take a friend visiting)" steers a "good ramen place" toward an
  established, easy-to-recommend spot rather than a hidden gem with
  obscure hours.
- **Frame the longDescription.** If the context says "the architecture
  is the draw", make sure the description leads with the architecture
  rather than burying it.
- **Influence judgment-call fields.** "(for a winter trip in February)"
  is a planning hint — when narrowing `suitableMonths` for a snow-
  dependent activity, lean toward months that will reliably have snow
  in February.

Don't quote the context verbatim in the entry; let it inform the entry
naturally. If the context is purely for your benefit ("this made me
think of X"), use it as background and leave it out of the prose.

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

3. **Pick image URLs.** Hotlink real images from stable sources where you can
   (Wikimedia Commons, the venue's own site, established tourism sites like
   visitfinland.com or myhelsinki.fi). Prefer 3-5 gallery images plus a
   thumbnail. Vary the angles — don't pick five photos of the same façade.
   If you can't find good images, set thumbnailUrl to a picsum placeholder
   (`https://picsum.photos/seed/<idea-slug>/1200/900`) and leave galleryUrls
   short — flag this in your summary so the user can replace them.

4. **Fill out the entry.** Use the schema in `src/projects/finland-catalogue/types.ts`
   as the source of truth — read the JSDoc comments on each property, they
   explain the *spirit* of each field. When information is uncertain, make
   a best guess (the user explicitly prefers a confident guess + a note
   over a blank field), but do not invent specifics like exact opening
   hours or addresses you didn't find. If you genuinely don't know, omit
   the optional field.

5. **Generate the slug.** kebab-case, derived from the title. Verify it
   doesn't collide with an existing entry's slug — read `ideas.ts` first
   and check.

6. **Append to ideas.ts.** Add the new object inside the `IDEAS` array,
   after the last existing entry. Keep alphabetical-by-slug ordering only
   if the file already follows it; otherwise just append.

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
- **accessFromHelsinki**: `complexity` is the *planning effort* signal,
  not the literal mode count. A single 8h train to Lapland is `'complex'`
  because of the duration. A two-stop tram ride is `'simple'` even though
  it has a transfer.
- **cost.perPersonEur**: best-guess EUR for one adult. 0 for free. If the
  cost varies wildly, pick a typical number and use `notes` for the spread.
- **booking.leadTime**: realistic horizon. `'months'` is for genuinely
  hard-to-get experiences (Christmas-week glass igloos, peak-season
  husky safaris) — don't over-use it.
- **toddlerFriendly**: calibrated for ages 2-5. The question is *can a
  family with a young child do this without major workarounds?* Late-night
  events, intense hikes, fancy restaurants → false. When unsure, err
  toward false and explain in toddlerNotes.
- **physicalIntensity**: most museums, restaurants, ferries → `'low'`.
  Half-day walking tours, swimming, skating → `'moderate'`. Serious
  hiking, cross-country skiing, multi-hour active sport → `'high'`.
- **website**: only if there's a real official site or canonical booking
  page. Don't link random blog posts.

## Tag and region policy

Tags and `location.region` both pull from canonical vocabularies defined
in `src/projects/finland-catalogue/filters.ts` (`KNOWN_TAGS` and
`KNOWN_REGIONS`). The filter UI renders every value in those lists as
a chip, whether or not any current idea uses it.

**Tags** — current canonical list: **`'food'`**. Apply it to cafes,
restaurants, food markets, and food-focused experiences (food tours,
cooking classes). For everything else leave `tags` as `[]`.

**Regions** — current canonical list: **`Helsinki`**. Pick it for any
Helsinki-area idea, including satellite cities reachable as day trips
(Espoo, Vantaa, Porvoo) — put the actual location in `address` and
`accessFromHelsinki.notes`. For an idea outside the Helsinki area,
suggest a new region in your summary; do NOT silently add an entry with
a non-canonical region.

**Do not invent new tags or regions and apply them silently.** If a new
idea would form a clear grouping with multiple existing entries — three
sauna-focused ideas, two Turku ideas — suggest the new tag/region in
your summary. List existing entries that would share it, and let the
user decide whether to add it to `KNOWN_TAGS` / `KNOWN_REGIONS`.

## After writing

1. Briefly summarize what you added — title, one-line description per
   entry, and any uncertainties or guesses you made (especially around
   cost, dates, or images).
2. **Do not run `git add`, `git commit`, or `git push`.** The user will
   review the diff before committing.
3. If you used picsum placeholders for any images, call that out clearly
   so the user can replace them.
4. If you considered suggesting a new tag, state the suggestion and the
   ideas that would share it.

## Output expectations

- The only file you should be modifying is
  `src/projects/finland-catalogue/ideas.ts`.
- The new entry must satisfy the `Idea` type — run a quick mental
  type-check before saving.
- Lint must remain clean. The repo enforces strict rules (no `any`, no
  unnecessary conditions, etc.). If you're unsure, run `npm run lint`
  on your changes.

---
name: add-finland-idea
description: Add one or more travel ideas to the Finland Catalogue project (src/projects/finland-catalogue). Researches each idea on the web, fills out every property defined in the Idea schema, and appends fully-populated entries to ideas.ts. Use whenever the user asks to "add an idea (or ideas) to Finland", "/add-finland-idea X, Y, Z", or anything similar. Pass one or more ideas as a comma-separated list.
---

# Add Finland Catalogue Idea

You are adding entries to a hand-curated travel catalogue for Finland. Each
entry is a fully-researched `Idea` object appended to
`src/projects/finland-catalogue/ideas.ts`.

## Input format

The user provides one or more ideas as a comma-separated list. Examples:

- `Allas Sea Pool` — one specific venue
- `husky safari, ice swimming, Helsinki sauna culture` — three ideas, mixed specificity
- `a good cafe in Kallio, the Iittala outlet` — vague + specific in the same call

Split on commas and process each idea sequentially. **Do not parallelize web
research across ideas** — research one, write one, move to the next. This keeps
the diff readable and lets you reason about each entry on its own.

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
- **availability.seasons**: `'year-round'` if open all year. Otherwise a
  list of seasons. Finnish winter is roughly Nov-Mar; summer is Jun-Aug.
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

## Tag policy

The only canonical tag right now is **`'food'`** — apply it to cafes,
restaurants, food markets, and food-focused experiences (food tours,
cooking classes).

For everything else, leave `tags` as `[]`. Do **not** invent new tags and
apply them. If you notice that the new idea would form a clear grouping
with multiple existing entries (e.g. you've now added three
sauna-focused ideas), suggest the new tag in your summary — list which
existing entries would also get the tag and let the user decide whether
to adopt it. Don't apply it without confirmation.

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

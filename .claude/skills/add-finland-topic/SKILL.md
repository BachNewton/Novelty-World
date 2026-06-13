---
name: add-finland-topic
description: Add one or more cultural/educational Topics to the Finland Catalogue project (src/projects/finland-catalogue). Researches each topic on the web, fills out every property defined in the Topic schema, and adds fully-populated entries under src/projects/finland-catalogue/topics/ (one file per topic). Use whenever the user asks to "add a topic (or topics) to Finland", "/add-finland-topic X, Y, Z", or anything similar. Pass one or more topics as a comma-separated list.
---

# Add Finland Catalogue Topic

You are adding entries to the cultural/educational side of a Finland
catalogue. Each entry is a fully-researched `Topic` object living in its
own file under `src/projects/finland-catalogue/topics/` (see **File
layout** below). Topics are short explainers about Finland itself —
language quirks, social norms, historical moments, food traditions,
natural phenomena — that complement the activity-focused Ideas. Where an
Idea tells a visitor *what to do*, a Topic tells them *what they're
looking at while they do it*.

**Read `.claude/skills/_finland-shared/AUTHORING.md` first.** It covers
input parsing, parenthetical-context handling, image sourcing, slug
generation, append/commit/lint expectations — all identical between this
skill and `add-finland-idea`. The guidance below is the Topic-specific
layer on top of that.

## File layout

Topics are stored **one file per topic** under
`src/projects/finland-catalogue/topics/`. Each file exports a single
`Topic` const named after the camelCased slug, and `topics/index.ts` is
the barrel that gathers them into the `TOPICS` array the app consumes:

```
topics/
  sauna.ts            export const sauna: Topic = { slug: "sauna", ... }
  winter-swimming.ts  export const winterSwimming: Topic = { slug: "winter-swimming", ... }
  index.ts            import { sauna } from "./sauna"; ... export const TOPICS = [sauna, ...]
```

(The split exists because a single source file over 500KB trips a Babel
deoptimisation note during lint. One file per topic keeps every file tiny
and the note gone — don't reintroduce a monolithic `topics.ts`.)

**Adding a topic is three mechanical steps:**

1. **Create `topics/<slug>.ts`** containing
   `import type { Topic } from "../types";` then
   `export const <camelSlug>: Topic = { ... };`. CamelCase the kebab slug
   for the const name (`winter-swimming` → `winterSwimming`).
2. **Register it in `topics/index.ts`**: add
   `import { <camelSlug> } from "./<slug>";` alongside the other imports,
   and add `<camelSlug>,` to the `TOPICS` array. Order doesn't matter (the
   landing page shuffles on render), so appending to the end of both lists
   is fine.
3. **Slug-collision check**: before writing, confirm `topics/<slug>.ts`
   does not already exist.

**Surveying existing topics** (e.g. to check alias collisions): read
`topics/index.ts` for the full slug list, and `grep` across
`topics/*.ts` for `aliases:` lines rather than opening all the files.
**Editing an existing Topic's aliases** means editing that topic's own
`topics/<slug>.ts` file.

## Examples of how the user might invoke this skill

```
/add-finland-topic
- Sisu
- Sauna culture (this is the headline cultural concept — go deep)
- The Finnish language (focus on what makes it distinctive, not a grammar lesson)
- Kalevala
```

## Workflow per topic

1. **Identify the right scope.** Some inputs are sharp and well-bounded
   ("Sisu", "Kalevala"). Others are broad ("Finnish language", "Finnish
   food") — for these, decide what facet is genuinely worth a single
   topic entry. "The Finnish language" might become a topic about what
   makes it structurally distinctive (no gender, no future tense, 15
   noun cases) rather than a grammar primer; "Finnish food" might
   become "Karelian pies" or "The Finnish coffee habit". Don't write a
   Wikipedia-style overview — write the version a curious visitor would
   actually enjoy reading.

2. **Research with WebSearch + WebFetch.** Wikipedia is fine for facts
   and dates, but read at least one good long-form source (Visit
   Finland, This is Finland, BBC/Atlantic-style features, academic
   primers) to find the angle worth leading with. Topics live or die on
   having a point of view, not just facts. Cross-check anything you'd
   state as a number ("the world's most coffee-drinking country") or a
   strong claim ("invented by X in year Y") against a second source.

3. **Pick image URLs.** Topics need fewer images than Ideas — aim for
   1-3 gallery images plus a thumbnail, up to 5 only when the shots are
   genuinely great. Historical photos, infographics, and scene-setters
   all work; for abstract concepts ("Sisu") lean toward evocative scenes
   that capture the *feeling* rather than literal illustrations. See the
   shared image-sourcing playbook in AUTHORING.md.

4. **Fill out the entry.** Use the schema in `src/projects/finland-catalogue/types.ts`
   as the source of truth — read the JSDoc comments on each property,
   they explain the *spirit* of each field. When a fact is uncertain,
   prefer omitting a claim over inventing one. Topics that get factual
   details wrong are worse than Ideas that do, because the whole point
   of a Topic is to be informative.

## Field-by-field guidance

Read `src/projects/finland-catalogue/types.ts` for the canonical
comments. Highlights worth restating:

- **title**: concrete and specific. "Sauna culture" beats "Saunas".
  "Sisu" beats "Finnish grit". One line.

- **shortDescription**: the hook that fits on a card. One sentence.
  Lead with what's surprising or interesting, not a definition.
  "Coffee isn't a drink in Finland — it's the social fabric" beats
  "Finland has the highest per-capita coffee consumption in the world."

- **longDescription**: 2-4 paragraphs as a `string[]`. First paragraph
  delivers the core idea — what is this, in one tight paragraph that
  doesn't bury the lede. Middle paragraph(s) cover history, nuance,
  why it matters, modern-day caveats. Last paragraph (if needed)
  connects it back to what a visitor will actually encounter. Write
  like you're explaining it to a smart friend over a beer — educational,
  not encyclopedic.

- **aliases**: trigger phrases that auto-link this Topic when they
  appear in any Idea's `longDescription`. This is the field that gives
  Topics their connective power — get it right.
  - **Include the natural prose variants**, not just the title. For
    "Sauna culture", aliases might be `["sauna", "saunas", "sauna culture"]`
    — note both singular and plural. For "Sisu", just `["sisu"]` is
    probably enough.
  - **Be narrow and unambiguous.** Don't include generic words like
    "Finland", "winter", "summer", "north" — they'll match everywhere
    and turn Idea descriptions into a sea of links. Don't include
    words that overlap with another Topic's aliases — "coffee" should
    belong to *one* topic, not two.
  - **Empty array is allowed.** Some topics ("The Finnish education
    system") don't have a clean prose trigger. They'll still appear on
    the Topics page; they just won't auto-link from Ideas. Don't invent
    contrived aliases just to fill the field.
  - **Survey both directions before locking in aliases.** Scan
    existing Topics (`topics/*.ts`) to check your candidates don't
    collide with aliases already in use. *Then* scan existing Ideas
    (`ideas/*.ts`) for natural phrasings of this concept already in
    prose, and make sure your aliases catch them — otherwise the
    auto-linker silently misses real mentions. e.g. if Ideas already
    use "ice swimming" and "winter swimming" interchangeably, both
    belong in the Winter swimming Topic's aliases.

- **galleryUrls**: 1-3 typical, up to 5 only if the shots are
  exceptional. See the shared image-sourcing playbook in AUTHORING.md.

## Topic-specific summary callouts

In addition to the shared "After writing" guidance in AUTHORING.md:
- List the aliases you chose for each topic, so the user can quickly
  spot ones that are too generic or that overlap with another topic.
- If a topic ended up with empty `aliases`, briefly say why (no clean
  trigger phrase, ambiguous word, etc.) so the user can sanity-check.
- Note any phrasings you found in existing Ideas that influenced your
  alias choices — and any natural phrasings you considered but
  rejected as too generic or noisy.
- The only files you should be modifying are the new `topics/<slug>.ts`
  you create plus `topics/index.ts` to register it (and an existing
  `topics/<slug>.ts` when you add aliases to it).

# Finland Catalogue — shared authoring guidance

This file is referenced by both `add-finland-idea` and `add-finland-topic`.
The guidance here is identical between the two skills — input parsing,
image sourcing, the workflow scaffolding around the actual writing.
Type-specific guidance (which fields exist, what to research, what tone
to write in) lives in each skill's own `SKILL.md`.

This is not a skill itself; the leading underscore on the directory name
signals "shared reference, not loaded as a skill."

## Input format

The user gives you one or more entries, typically as a bullet list. Each
bullet may optionally include a parenthetical context note explaining
*why* that entry is on the list — taste, a constraint, a hook to capture
in the entry. Both the title and the context are inputs to your research
and writing.

A comma-separated single-line form is also supported as a shortcut, e.g.
`/<skill-name> foo, bar, baz`.

Process each entry sequentially. **Do not parallelize web research across
entries** — research one, write one, move to the next. This keeps the
diff readable and lets you reason about each entry on its own.

### Using the parenthetical context

When the user includes `(some context)` on a bullet, treat it as a
high-signal hint about what they care about. It should shape the entry
in concrete ways:

- **Pick the right representative for vague inputs.** A vague input
  ("a good ramen place in Helsinki") with context ("somewhere I'd take
  a friend visiting") steers toward an established, easy-to-recommend
  choice rather than a hidden gem with obscure hours.
- **Frame the writing.** If the context says "the architecture is the
  draw", make sure the description leads with the architecture rather
  than burying it.
- **Influence judgment-call fields.** "(for a winter trip in February)"
  is a planning hint — when narrowing season-dependent fields, lean
  toward what will be true in February.

Don't quote the context verbatim in the entry; let it inform the entry
naturally. If the context is purely for your benefit ("this made me
think of X"), use it as background and leave it out of the prose.

## Image sourcing — real photos matter, work for them

Real photos are *significantly* better than placeholders; the catalogue
lives or dies on its imagery. Try multiple sources before giving up:

- Wikimedia Commons (search the article + the `Category:<topic>` page
  for filenames)
- The venue's or institution's own site — fetch the homepage and any
  `/gallery`, `/media`, or `/press` page and look for
  `wp-content/uploads/...`, `/static/`, or CDN URLs in the HTML
- The official press kit or media bank if linked
- Established tourism sites: visitfinland.com, myhelsinki.fi,
  visit<city>.fi, the regional tourism board
- For events, the previous year's gallery on the official site is
  usually fair game (e.g. last year's photos for next year's entry)

**Weight the official source heavily.** If you've found an official
website for the entry — the Idea's `website`, or any source you're
going to link to in a Topic's prose — its images should be your
strongest candidates, not just one option among many. Fetch the
homepage and at least one `/gallery`, `/media`, or `/press` page and
exhaust what's there before falling back to Wikimedia or tourism
aggregators. If you're going to link to the site as authoritative,
its photos almost certainly outclass anything you'll find elsewhere.
Only reach for lower-tier sources when the official site genuinely
has nothing usable.

Vary the angles — don't pick five photos of the same façade. The target
image *count* differs between Ideas and Topics; see each skill's own
guidance for how many to aim for.

Picsum placeholders are a last resort, only when you've genuinely
exhausted the above and still come up empty. If you fall back to picsum,
flag it loudly in your summary so the user can replace them.

## Slug generation

kebab-case, derived from the title. Verify it doesn't collide with an
existing entry's slug before writing. *How* you check depends on the
catalogue's storage layout — see the skill's own file-layout guidance
(e.g. ideas are one file per slug, so the check is "does that file
already exist?").

## Add, don't reformat

Add the new entry without rewriting, re-indenting, or reordering the
existing ones — keep the diff to the entry you're adding. Exactly *where*
a new entry goes depends on the catalogue's storage layout, which differs
per skill (a single exported array vs. one file per entry plus a barrel),
so follow the skill's own file-layout guidance for the mechanics.

## After writing

1. Briefly summarize what you added — title and one-line description per
   entry, plus any uncertainties or guesses you made (especially around
   numeric or factual claims you couldn't fully verify).
2. **Do not run `git add`, `git commit`, or `git push`.** The user will
   review the diff before committing.
3. If you used picsum placeholders for any images, call that out clearly
   so the user can replace them.

Each skill layers its own additional summary callouts on top of the
above — see the skill file for what else to mention.

## Output expectations

- The new entry must satisfy its TypeScript type — run a quick mental
  type-check before saving.
- Lint must remain clean. The repo enforces strict rules (no `any`, no
  unnecessary conditions, etc.). If you're unsure, run `npm run lint`
  on your changes.

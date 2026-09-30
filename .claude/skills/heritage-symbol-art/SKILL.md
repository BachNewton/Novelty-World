---
name: heritage-symbol-art
description: Find the official design specification of a Family Tree heritage symbol (a flag, a coat of arms, a regional emblem), verify real art against it (or, as a documented last resort, draw it as SVG from the specification), and store it with its art record (src/projects/family-tree/symbol-art.ts). Use whenever a people or region is added to heritages.ts, a symbol timeline era is added or changed, a symbol id has no verified art, or the owner asks for a symbol's art or its source. Family-tree research invokes it in the same round as it adds a people or region, to propose the new timeline's symbols and find their art.
---

# Heritage symbol art

These symbols are important: a heritage the tree can confirm should end up
with art that identifies it, for each of its eras. Art comes, in order of
preference, from **an official published design**, then **a faithful
existing file** verified against the official design or the historical
record, and only as **a last resort from our own SVG**, drawn from
documented sources at high confidence ("Drawing our own", below). This
skill finds the design, finds or makes the art, proves it matches, and
stores it with a record of where it came from. The rules behind it are
"Symbols" in `src/projects/family-tree/ideas/heritage-through-time.md` and
"Heritage" in the project CLAUDE.md; read both first.

- **The symbols** are ids with a name in `SYMBOLS` (`symbol-timelines.ts`);
  each people's and region's timeline says which symbol each era shows.
- **The art** is one file per symbol id in
  `src/projects/family-tree/symbol-art/`, named `<symbol-id>.svg` (or
  `.png`), with its record in `SYMBOL_ART` (`symbol-art.ts`). A symbol
  without a record has **no verified art** and isn't shown.
- `npx tsx src/projects/family-tree/tools/tree-cli.ts peoples` lists every
  timeline and, at the end, every symbol still without verified art.
- **The needed symbols** are the ones the live tree picks: some person's
  heritage share picks the symbol at their birth year (their own, or the
  estimate from their relatives). `tree-cli.ts needed-art` lists every
  needed symbol without verified art, with how many people need it and one
  of them. That list is the work queue: art research targets needed
  symbols, and **every needed symbol must end with art**, because the tree
  never shows "art not verified". A symbol nobody needs can wait.

## When to use it

- **From research, in the same round:** whenever research adds a people or
  a region to `heritages.ts`, or adds, splits or changes an era in
  `symbol-timelines.ts`. For a new people or region, run "A new people or
  region" below.
- **On its own:** a needed symbol without art (the `needed-art` list), a
  record to re-check, or the owner asking where a symbol's art comes from.

A new people or region brings the art of the symbols it makes needed in the
same round: run `needed-art` after adding it, and the round isn't done
while that list names one of its symbols, unless the search below ends with
nothing verifiable, which goes to the owner as an open gap on the tree.

## The rules

- **Never trace, recolour, crop, simplify or "fix" someone else's art.** A
  published file is stored byte for byte as the source published it, and a
  test holds it to the SHA-1 in its record. Drawing our own is a separate,
  last-resort path with its own bar ("Drawing our own", below), never a way
  to patch a file that is almost right.
- **One wrong detail fails the file.** A file that is close but not right
  (a crown of the wrong era, a ratio off by more than pixel rounding, a
  shade the specification contradicts) is not verified. Look for another
  file; if none is right, the symbol stays without art.
- **Nothing verifiable and nothing drawable, no art.** The symbol stays
  without a record, and the open question goes where research keeps its
  questions (the research log), not in the repo: what was tried and what
  would settle it. For a needed symbol that is a gap on the tree, so it
  also goes to the owner; `needed-art` keeps listing it until it is closed.
- **A people's own symbol, never a regime's imposed on it.** This is the
  timeline's rule, and the art follows it: the art is of the symbol the era
  names, in the form the people used in those years.

## A new people or region

Research has found a heritage that isn't listed. In the same round:

1. **Propose the timeline.** From reference sources (a history of the flag,
   the country's official page on its symbols, Flags of the World), list the
   symbols the people used for itself through the eras, each with its years
   and why it was the people's own. Where the homeland was a region before
   a nation-state, that span is a regional era with the region's symbol.
   Where there was no own symbol for a span, say so rather than borrowing a
   ruler's.
2. **Add the symbol ids** to `SYMBOLS`: kebab-case, people or place first
   (`hungary-kingdom-flag`), one id per distinct design, with a name
   research can search by.
3. **Hand the eras to the research flow.** The eras themselves (years,
   names, which symbol, their sources) are research data: they are entered
   and verified under `standards.md` ("Symbol timelines") in the research
   skill. When this skill runs inside a research round, that round applies
   them; otherwise give the proposal to the owner or the next research round
   and don't edit the eras.
4. **Find the art** for each new symbol id, below.

## Finding the specification

The specification settles three things: **proportions** (width to height,
and the geometry inside: stripe widths, cross offsets, emblem size and
position), **colours** (named, or measured values where they exist) and
**details** (for arms and emblems: charges, tinctures, crown, supporters;
for flags with an emblem: which version of it).

Rank sources in this order and cite the highest one reached:

1. **The adopting act**: the law, decree, ordinance or constitution article
   that set the design, in its official gazette or a faithful transcription
   (Wikisource often has the gazette text with a scan). Later acts that
   changed it count for their years only.
2. **The government's own page** on its symbols (a ministry of the
   interior's flag page, a presidential or parliamentary page), and official
   colour specifications (Pantone, CMYK, RGB, CIE or NCS values), which are
   often in a later decision than the design itself.
3. **National archives and heraldic authorities**: a heraldic register, a
   state herald's grant, an archive's scan of the original drawing.
4. **Reputable vexillology and heraldry references**: Flags of the World
   (FOTW, fotw.info, mirrored at crwflags.com), which usually quotes the
   acts; Heraldry of the World; published flag and heraldry books.
5. **Wikipedia is a lead only.** Follow its citations to the sources above;
   never cite it for a specification.

What settles each thing:

- **Proportions** are settled by the act or an official construction
  sheet. A flag with no statutory ratio (England's cross) takes the ratio
  its official users fly and the references agree on, and the record says
  there is no statutory one.
- **Colours**: where an official specification gives values, the file's
  colours must be that specification's own sRGB equivalent or a published
  conversion of it (Pantone publishes sRGB values for its colours). Where
  the act only names the colours (most flags before about 1950), any true
  rendering of the named colour is faithful, and the record says the shade
  was unspecified; a reference's note on the historical shade (FOTW often
  has one) is checked too.
- **Details** are settled by the act's blazon or description, or the
  official drawing. For historical arms, match the version to the era:
  crowns, supporters and quarterings change with the years.

**No official specification** (an unofficial or popular flag like a
nineteenth-century green harp flag, which existed in many harp and layout
variants): the art can be verified only against the historical record, by
matching a documented surviving example or a design the references agree
was the standard one. **A symbol that is clearly identifiable but has no
single common design** (the green harp flew in many harp and layout
variants) takes **its most iconic, most widely recognized design**: the one
the references reproduce most, or the best-known surviving example. The
record says it is one variant of several and why this one was chosen, with
its sources; the art is then verified against that design. Only a symbol
that isn't clearly identifiable at all stays without art, with the
question written down.

**Sources disagree** (a Commons drawing of a grand-ducal arms whose crown
and arm are disputed on its talk page): follow the disagreement to the
highest-ranked source. If that source settles it, check the file against
it; if it doesn't, the symbol stays without art until one does.

## Finding the art

**Official downloads first.** A government that publishes its symbol's
artwork (an SVG or an EPS on the ministry's page) is the best source:
check its licence or terms of use, and record the page it came from.

**Wikimedia Commons** is the usual source otherwise:

- **The file page** (`https://commons.wikimedia.org/wiki/File:...`) has the
  description, author, source, the licence templates, a colour table and
  "other versions". Categories like "SVG flags with an aspect ratio of 18:11"
  and the "other versions" list are where to find alternatives.
- **The talk page** (`File_talk:...`) holds disputes: always read it. A
  file with an open dispute about the detail that matters isn't verified
  until the dispute is settled by a source.
- **The file history** shows who uploaded what. A recent re-upload that
  changed the design or the colours needs its reason checked; a revert war
  means the file is disputed.
- **The file page's claims are not the file.** A colour table or a
  description can disagree with what the file actually draws; check the
  file.

Get the file's metadata and the original bytes (never a thumbnail, which
is a PNG rendering) from the Commons API. Commons asks for a descriptive
User-Agent:

```bash
UA="NoveltyWorld-heritage-art/1.0 (research)"
curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&titles=File:Flag_of_Example.svg&prop=imageinfo&iiprop=url|sha1|size|user|timestamp|comment|extmetadata&iilimit=10"
curl -s -A "$UA" -o candidate.svg "<imageinfo[0].url without its query string>"
sha1sum candidate.svg   # must equal imageinfo[0].sha1
```

`redirects=1` matters: many familiar names redirect to a differently named
file, and the record's `source` is the page the file really lives on. The
wikitext (`action=parse&prop=wikitext&page=File:...`) gives the licence
templates and the author field verbatim. Work in the scratchpad, never in
the repo, until the file is verified.

**Compare the file with the specification:**

- **Proportions:** read the root `<svg>` element's `viewBox` (or its
  `width` and `height` when it has none) and compare the ratio with the
  specification's. Then check the geometry inside: stripe and cross
  positions in the paths against the act's units.
- **Colours:** list the file's `fill` and `stroke` values and compare each
  with the specification's values or named colours.
- **Details:** for arms and emblems, look at the file and compare each
  element of the blazon or the official drawing, one by one. Reading an
  image in the session is fine (render it in the scratchpad if needed);
  never use the owner's Chrome for it.

**Format and size:**

- **SVG is preferred.** Take a faithful SVG over a raster of the same
  design.
- **Raster only when no faithful SVG exists:** the original upload as PNG,
  at its full resolution. A PNG thumbnail is Commons' rendering, not the
  source; don't store one.
- **A huge file stays as it is.** An intricate arms SVG can be megabytes.
  Prefer an equally faithful, smaller file of the same design if one exists;
  otherwise store the large one unedited. Its size is the UI's problem to
  solve when it renders the art (a rendering is a derived display file,
  never the record). The test refuses files over 5 MB, which means a wrong
  file, not one to shrink.

## Drawing our own

The last resort, for a symbol whose design is certain but which has no
faithful published art.

**Allowed only when all of these hold:**

- **Both published avenues are exhausted:** no official artwork, and no
  existing file (Commons and its "other versions", official downloads,
  reference sites) that passes the checks above. The record lists what was
  searched and why each candidate fell short.
- **The design is fully documented:** cited sources settle the proportions,
  the colours, and every element and where it sits: the act's text or
  construction sheet, a heraldic blazon, a reference work's description,
  dated photographs of real specimens.
- **Confidence is high.** If any detail would be a guess (the pose of a
  lion, the form of a crown, the shape of a harp), it isn't: the symbol
  stays without art and the question is written down.

**How to draw it:**

- Hand-write a plain SVG: a `viewBox` in the specification's own units (an
  11:18 flag as `0 0 18 11`), simple shapes, the official colours as exact
  values, no filters, gradients or effects the design doesn't have.
- Only designs made of geometry and plain charges are realistically
  drawable to this bar: stripes, crosses, saltires, simple shapes. Detailed
  heraldic figures (lions, eagles, crowns) are almost never documented to
  every line, so for those keep looking for published art.
- Render it in the scratchpad and compare it against the specification and
  the dated specimens, element by element, before recording it.

**Its record** is a drawn one: `kind: "drawn"`, SVG, licensed CC0 (it is
our own work), `searched` (the avenues exhausted), `elements` (each element
of the design and the sources that document it), `proportions` and
`checked`, with the file's own SHA-1 pinned like any other. Drawn art is
held to every other rule: true proportions, the official colours, shown
whole, and a people's own symbol, never a regime's. **Replace it** with
published art as soon as a verifiable file turns up.

## Licence and attribution

The repo may be public, so every file's licence is recorded and honoured.

- **The design and the drawing are licensed separately.** Most flags and
  state arms are public domain as designs, but a particular Commons drawing
  can carry CC BY-SA. The drawing's licence is the one that counts.
- **Prefer public domain or CC0.** Of two equally faithful files, take the
  one that needs no credit.
- **CC BY and CC BY-SA are fine** with their attribution: the record's
  `attribution` holds the credit line (author, licence and source), and the
  UI must show it wherever the art appears, for example in a credits list.
  Storing the file unedited means share-alike asks nothing more of us.
- **Credits are automatic.** The site's credits page (`/credits`) builds
  Family Tree's credits from every published record, so art that needs
  attribution is credited from its record, with nothing extra to do.
- **Anything else** (non-commercial, no-derivatives, "fair use", unclear or
  missing licence) is not usable: look for another file.
- Record `licenseBasis` as the source states it: the Commons licence
  templates (`PD-shape`, `PD-FinlandGov`, `CC-BY-SA-4.0`) or the official
  terms of use.

## Recording it

1. Copy the verified file to
   `src/projects/family-tree/symbol-art/<symbol-id>.<svg|png>`, unedited.
2. Add its record to `SYMBOL_ART` in `symbol-art.ts`. For published art
   (`kind: "published"`): format, the source's SHA-1, the source page, author, licence and its basis, attribution (empty
   when the licence needs none), the official proportions, what it was
   checked against (most authoritative first) and what was checked and
   found. For our own drawing, the drawn record above. Art provenance may name URLs, unlike research sources in the
   tree row: this is reference data about public symbols, in code rather
   than the public row, and a Commons file page is the canonical way to
   credit a file under its licence.
3. `npx vitest run src/projects/family-tree/symbol-art.test.ts`: the SHA-1,
   the proportions within pixel rounding, no stray files. Then
   `npm run lint`, `npm run typecheck` and `npm run test`.
4. Commit the file and its record together (stage only your own files):
   `feat(family-tree): verified art for <symbol-id>`, with a body naming
   what it was checked against.

Nothing renders this art yet: the cards still show `flags.ts`. Wiring era
symbols into the UI is the owner's call.

## When the specification contradicts the timeline

The specification research often turns up era facts: Hungary's arms
changed in 1874, 1896 and 1915, so one "Kingdom of Hungary" era may need
several symbols. The art follows the timeline, never the other way round:

- **Don't edit the eras here.** Era years, names and sources are research
  data under the research skill's `standards.md`. Write the finding down
  for the research round, with its sources: the era, what is wrong, what
  the sources show, and the split or new symbol ids it needs.
- **Add the symbol ids the split needs** to `SYMBOLS`, and their art once
  verified; an id nothing uses yet is harmless.
- **Store nothing for an era you can't match.** Art for "the" Kingdom of
  Hungary flag isn't verifiable until the era says which years, and so which
  arms, it covers.

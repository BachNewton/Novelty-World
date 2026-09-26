# Heritage (parked idea)

Record each person's heritage (e.g. Italian, Irish, Finnish) and use it to decorate the tree.

**Status:** parked. The data model is mostly settled. The visual design is not: every direction tried so far was rejected.

## Why

1. **Vibrancy (the main goal).** The tree is plain to look at. Heritage is meant to be what adds color and life to it.
2. **Research (secondary).** Knowing which line is Finnish or Italian points you to the right archives and records.

## Settled so far

**Terminology**
- Call it **heritage**. Not "nationality", which means legal citizenship; not "ethnicity"; not "country of origin", which reads oddly for someone whose heritage is inherited.
- Values are present-day countries, from a curated list in code, since each one needs a designed look.
- Keep it at country level. Finer detail (a region, a specific emigration, a ship) goes in the person's notes.

**Data model**
- Heritage is **entered only on origin people**: immigrants, the earliest known ancestor on a line, and people who married in whose ancestry isn't in the tree.
- Everyone else's heritage is **derived**: each parent passes on half of their own mix. It's computed on the client and never stored.
- **A missing parent passes on an explicit "unknown" share.** Never quietly scale the rest up to fill the gap, which would make a half-known person look "100% Irish". "Unknown" is also a value you can enter.
- **An entry overrides what the person would inherit, and cuts inheritance above them.** This one rule covers conflicts, adoption, and married-in people.
- Step relationships pass nothing on. Only parent links do.
- One way to store it: a list of heritage codes per person, split equally ("half X, half Y"), with empty meaning "take it from the parents". Finer weights can come later if they're ever needed.
- New fields go through `normalizeTree`, as the project CLAUDE.md requires.

**Other decisions**
- **Color blindness is not a design constraint.** The owner decided this explicitly.
- **Privacy:** the tree is public. Heritage on mostly deceased origin people is low risk, and derived heritage adds little that the tree doesn't already imply. No extra measures beyond the tree-wide privacy rule.

## Visual directions tried and rejected

| Direction | Why it was rejected |
|---|---|
| One signature color per country, filling the whole card in blocks sized by share | Not what the owner pictured; they wanted flags |
| Flags filling the card behind the text (on a dark plate) | Text hard to read |
| The same, plus country-themed line drawings | Too much visual noise |
| Small flags plus percentages *inside* the card (a side column or a bottom row) | The inside of the card is reserved for the person's details and must stay untouched |
| Flags *outside* the card: ribbons above and below, bunting on top, or tabs on the sides | Still not what the owner is hoping for |

Things learned along the way:
- **Flags:** Italy and Ireland are both green-white-warm vertical tricolors. Cropping a narrow slice of either shows only green, so a flag in a narrow slot has to be squeezed, not cropped. Even then the two are hard to tell apart at small sizes.
- **Space around a card:** the sides are crowded, because spouse and partner lines run between cards at mid-height. Above and below, only a single centre line is in the way. Anything that needs extra spacing means changing the layout constants in `logic.ts`, which changes every layout snapshot.
- **Zoomed out, text-sized decoration disappears.** Only large areas of color keep the tree vibrant when zoomed out.

## Open questions

- What should it look like? The goal is vibrancy without touching the inside of the card.
- Britain as one heritage, or England, Scotland and Wales separately? Where does Northern Irish ancestry go?
- Do living married-in adults get heritage entered, or stay unknown until they agree?
- Should origin people (the ones heritage was entered for) be marked somehow, or only in the edit panel?

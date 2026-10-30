# Where Composer stands

The open work, for picking this up in a new session. Rewrite it when the state changes. How Composer works is in its `CLAUDE.md`, the owner's taste in the `music-taste` skill, and the workflow in `compose-music`.

## The owner's latest reactions

- River on the Sketchbook band is an overall improvement on what came before, apart from the right-hand piano.
- In River on Sketchbook, the left hand sounds fine and **the right hand's register is not nice to listen to.** This is the first thing to solve.

## First: the right-hand piano

Unsolved. Not known yet: which piano the owner was on (Sketchbook's default is Cottage Keys), or what word fits (thin, glassy, piercing, sour, too loud). Ask both first, and offer Sampler codes.

Tried, no audible difference, reverted: holding stiffness flat above C5, drawing unison strings closer above C5, halving the lift above C6 (`synth/struck.ts`). So overtones running sharp, beating and level at the very top are probably not the cause, unless the page was not reloaded. Next idea: a high note has very few partials under `topHz`, so it may be close to a pure tone. Give it more body, and compare the Sketchbook band with Iron Concert swapped in on the same bars.

## Waiting on the owner's ear

- The band picker: Synth Orchestra against Sketchbook on River, and Full Chip against Sketchbook on The Tidewheel Gym.
- Sampler: does the WHN row match what they mean by whine? Which BRT, THK and TGT codes feel closest to Emerald?
- The six pianos on the pieces they were picked for.
- Analysis: harmonies marked `?`, chiefly in Liszt, Debussy and River.

Ask whether "Sketchbook is closer to what I want" goes in `music-taste`.

## Planned

- Test `compose-music` on a fresh idea from the owner.
- More skills as there's material: composition craft, sound design, a guide per style.
- Let Sampler codes apply to a band: `GRT`, `OPN`, `CLR`, `TGT` and part of `HRS` have no chair or voice parameter yet.
- Loop playback for the Pokémon tracks. Ratings from the owner, if they want them.

## Known rough edges

- Levels from `tools/levels.ts` need rerunning when a piece or band changes.
- River's tempo curve jumps up before each ritardando so the bars keep their length: it reads oddly in the lane.
- Pause drops the render, so resuming loses the hall's tail for a moment.
- Dynamics are computed, so River's climax reads as bar 50, not the arrival at bar 43.
- Nothing has been tried on a real phone or in a production build. A piece uses about 240 MB, and sheet music is one SVG of 9,000 to 12,000 pixels.
- Verovio is pinned to a version published the day it was added; 6.3.0 is the safer pin. Its licence is LGPL.

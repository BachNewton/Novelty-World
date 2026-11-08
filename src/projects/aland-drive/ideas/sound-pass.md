# One sound pass, all together

A plan for later, not started: the owner wants the game's sound taken as one whole in a session of its own, since every sound is heard against all the others. Until then, sound changes wait for it rather than going in piece by piece.

## What the owner has heard so far

- **Places blurred into one wash.** The forest, the shore, the town and the frozen sea each sounded like the same broadband rush, and wind was mistaken for waves. The fix so far: each place got its own signature (birds and a woodpecker in the forest, waves and gulls at the sea, lapping at a lake, creaks on the ice, a church bell on the hour), and the forest's wind, the town's ambient bed and the ice's wind were removed. Wind is now the car's own at speed.
- **The town is its traffic and its people.** Passing cars, bicycles and footsteps are to come from the real traffic, cyclists and walkers, through the placed-sound mechanism (`audio/placed.ts`), which the traffic side builds its sounds on.
- **Gravel** was rebuilt as a crunch rather than rain-like pings; the noise under the crunches still doesn't sound right (see `audio/CLAUDE.md`).
- **The weather's own gusting wind** still plays by the wind's speed, even with the car standing still. Whether it stays, under "wind is the car's own", is for this pass.
- **The rain** was remade once and not judged since.

## Questions for the pass

- **The mix as a whole:** what each layer (engine, tyres, place, weather, placed sounds, one-shots) is for, how loud against the others, and what the car's own noise masks at speed.
- **Synthesis or recordings.** Every sound is made in code from noise and oscillators, which the weather session found has a ceiling for wind, water and crowds. Recordings would cross that, and each would need its credit (root `CLAUDE.md`, Credits).
- **How the owner judges it:** in the game, on the quietest car (`?car=strom`, the electric one), at a set of places and times, with the `?sounds` page for each layer alone.

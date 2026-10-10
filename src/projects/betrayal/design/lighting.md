# Lighting

How the house is lit, as a whole. `presentation.md` holds what the light means (its colour table) and the house it lights; the room-art and figure-art skills hold how a room or a figure brings its own lights. The code is in `art/`: `lighting.ts` (the house's light, the flicker signals, the budgets), `bake.ts` and its workers, `bake-schedule.ts`, and `lit-floor.ts`.

## Baked direct light

Each room's still pieces are merged and given a lightmap. The bake works out every lamp's and the moon's light on it, shadows and all, by casting shadow rays through the whole floor, held in a bounding-volume hierarchy so a ray tests only what it might hit. Because the whole floor is in the way, a lamp spills through doorways and passages into the rooms next door, and walls and shut doors stop it. Lightmaps are filtered smooth.

A bake happens only when the layout changes: a room and its neighbours re-bake, and nothing else does. Nothing re-bakes on a clock.

**Flicker stays live.** A baked light still wavers: the bake keeps, for each texel, how much of its light came from each flicker signal, and the frame weights those by the signals' current values. There are four flame signals and one for water, a slower swell.

## Bounce light

One bounce of indirect light: from each surface, cosine-weighted rays find what they hit, and bring back the light on it tinted by that surface's albedo. It is computed coarser than the direct light and filtered, and goes into the lightmaps and the probes. Its strength is above the physical one, because the dark palette reflects little and a true bounce barely shows; the strength is one named constant (`BOUNCE` in `lighting.ts`). `?bounce=off` turns it off, for comparison.

## Moving things

What moves (figures, animated pieces) is lit from light probes: an ambient cube, a colour for each of six directions, baked at the standing spots, at each moving piece and on a grid over the floor. The active explorer adds a live light from above, and a carried flame its own. At most two live lights cast shadows, and those are the house's.

## The house's own light

The house owns one fill, one fog and one moon, the same for every room. The moon shines from a fixed corner of the board and comes in only through real windows; no room effect is aimed at it.

## Fakes

What a point light can't give is faked, and faking is cheap: glows (a surface that is its own light), additive pools, haze and beams, and on water, reflections and caustics drawn as additive light. Light is not pixel art: it may move smoothly while surfaces stay pixel art.

## The bake at run time

The bake runs as passes, direct light first and then the bounce, on a pool of workers sized from the device's threads: three quarters of them, minus one. That is where speed was measured to plateau; beyond it, frames suffer. Work is cut into chunks by cost and taken by priority: finishing work in progress first, then an earlier pass before a later one, then the active explorer's room, then what is on screen. A newer layout supersedes stale work, whose chunks are dropped.

**Ready** means interactive with the direct pass; **fully lit** is separate, once every pass has landed. Screenshot tools wait for fully lit. While finer passes are coming, the screen shows a "Refining light" mark, and work that usually takes long shows its progress from the start, decided per kind of work by measurement. `?bake-debug` on the house shows the scheduler's chunks, lanes and passes.

## Depth

The camera's depth range follows what is on screen each frame, so the near plane stands as far out as the view allows. A fixed wide range caused z-fighting across the house.

## Budgets

- **Draw calls:** 300 a frame (`MAX_DRAW_CALLS`), a rule-of-thumb ceiling, not measured on a phone. The guard throws when a frame exceeds it. Merged rooms and a figure's parts batched per material keep under it.
- **Texture units:** a shader may use at most `MAX_TEXTURE_UNITS`; the same guard throws past it.

There are no graphics settings or quality tiers: the technique is what keeps it fast.

## Choosing how to light a new effect

- **Baked**, when the light stands still for the layout's life: a room's lamps, its glows' light on the walls. It costs load time, not frame time, so many are allowed.
- **Live**, only for what moves and must light what's round it: the active explorer, a carried flame, in time a haunt's short event light. Few, and the house adds them.
- **Faked**, for everything else: a glow, an additive pool or beam, a flicker driven from a signal. Prefer it whenever it reads.

A light that changes while the game runs (a lamp dimmed, a candle put out) needs a re-bake; report the need rather than faking it.

## Known gaps

- Frames drop during a bake.
- The first load takes several seconds, much of it building rooms rather than baking.

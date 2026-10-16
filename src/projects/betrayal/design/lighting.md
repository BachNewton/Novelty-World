# Lighting

How the house is lit, as a whole. `presentation.md` holds what the light means (its colour table) and the house it lights; the room-art and figure-art skills hold how a room or a figure brings its own lights. The code is in `art/`: `lighting.ts` (the house's light, the flicker signals, the budgets), `bake.ts` and its workers, `bake-schedule.ts`, `lit-floor.ts`, `shine.ts` (highlights), `shader-prep.ts`, `build-slices.ts` and `house-mood.ts` (the house's fill and fog).

## Baked direct light

Each room's still pieces are merged and given a lightmap. The bake works out every lamp's and the moon's light on it, shadows and all, by casting shadow rays through the whole floor, held in a bounding-volume hierarchy so a ray tests only what it might hit. Because the whole floor is in the way, a lamp spills through doorways and passages into the rooms next door, and walls and shut doors stop it. Lightmaps are filtered smooth.

A bake happens only when the layout changes: a room and its neighbours re-bake, and nothing else does. Nothing re-bakes on a clock.

**Shadows are hard**, in a lightmap of 48 texels a metre. Lighting quality comes first: memory is dealt with only if a real device shows a problem. Baked shadows don't move with a candle's flicker; only the brightness breathes (candle shadows that move with the flame are on the polish list in `v1-play.md`).

**Soft shadows are deferred**, a prototype behind `?shadows=soft`. Each lamp has a size from what gives it (`LAMP_RADIUS` by its `kind`: a candle's flame, a candelabra's row of flames, a lamp, a fire, a glow), and the moon a spread, so each texel's shadow test aims a fixed sunflower of rays across the lamp's disc and takes the share that gets through: a shadow is crisp where it touches and softens with distance, and the same every bake. The lightmap is then read through a cubic B-spline kept within each texel's own chart, so no edge shows the texel grid, at a lower density (`SOFT_SHADOWS`).

**Flicker stays live.** A baked light still wavers: the bake keeps, for each texel, how much of its light came from each flicker signal, and the frame weights those by the signals' current values. There are four flame signals and one for water, a slower swell.

## Bounce light

One bounce of indirect light: from each surface, cosine-weighted rays find what they hit, and bring back the light on it tinted by that surface's albedo. It is computed coarser than the direct light and filtered, and goes into the lightmaps and the probes. Its strength is above the physical one, because the dark palette reflects little and a true bounce barely shows; the strength is one named constant (`BOUNCE` in `lighting.ts`). `?bounce=off` turns it off, for comparison.

## Shine

Light makes shine; textures never paint it. Shiny surfaces take real highlights, worked out live in the shader: a GGX highlight from each baked lamp near the surface, from the moon, and from the live lights. A highlight is gated by the bake: the bake keeps, per texel, how much of its light came from each flicker signal, so a lamp the bake says is blocked shows no highlight there, and a highlight flickers with its lamp. A surface is marked with a named preset (`SHINES` in `shine.ts`: metals such as silver, brass, gilt, pewter, copper and iron, glass, glazed china, wax, marble, honed marble, polished wood, lacquer and wet stone), never with numbers, and only on things that clearly shine; the shine bench (`?bench=shine`) lays every preset side by side. A room's shell never shines: floors, walls, wainscot and trim are matte, and only the windows' glass takes highlights. There are no reflections: from the house's high camera only light reads, and no rule needs a true mirror ("Image in the Mirror" shows a vision, not a reflection), so reflection probes were dropped.

Floors and walls are matte by default: an old, dusty house, where a lamp's broad highlight across a floor reads as fake. A faint floor sheen goes only where the room's story calls for it, and a marble floor is honed, with no vein lines, which read as cracks at this pixel size. `?shine=off` turns the real highlights off for comparison, and never brings painted shine back. Each shine is a draw call of its own. Figures and moving pieces have no shine yet (it needs a lamp's uniforms per figure), nor does a texture carry a per-texel shine mask (gilt threads in damask); both are polish.

## Moving things

What moves (figures, animated pieces) is lit from light probes: an ambient cube, a colour for each of six directions, baked at the prime places, at each moving piece and on a grid over the floor. The active explorer adds a live light from above, and a carried flame its own. At most two live lights cast shadows, and those are the house's.

## The house's own light

The house owns one fill, one fog and one moon, the same for every room. The moon shines from a fixed corner of the board and comes in only through real windows; no room effect is aimed at it. At the haunt's reveal the fill and fog turn to the haunt's light for the rest of the game, as live light that costs no re-bake: red by default, with a colder moon blue (`?mood=cold`) to compare.

**A room's brightness** is measured against the house's (`tools/room-light.mjs`), from the four views with the clock frozen and the room fully lit. The room-art ledger records each room's intent (dark, normal or bright) beside its measurement, and the tool flags a room outside its band. The house is very dark overall (a median lightness, L*, of about 2 out of 100); revisit that once the lighting settles.

## Fakes

What a point light can't give is faked, and faking is cheap: glows (a surface that is its own light), additive pools, haze and beams, and on water, reflections and caustics drawn as additive light. Every visible flame is one shared kit piece (`art/kit/flame.ts`, judged on `?bench=flames`), never a lit diamond: a card facing the camera, drawn by a shader as light added onto what is behind it, its noise on the stage's clock and its brightness and height on its light's flicker signal, so the flame and the glow it throws on the walls dip together. A fire is several narrow flames across and into its bed. A flame that looks lit always lights something: a flame that names no signal takes its light's (the stage matches them), a flame with no flickering light in its room is an error, and a room's flames of one preset draw as one batch. Too small on screen to show its shape, a flame grows into a dimmer glow of a few pixels rather than vanishing. Light is not pixel art: it may move smoothly while surfaces stay pixel art.

A shadow is never faked: it is drawn by the bake, as every shadow is. To cast a shadow with nothing there to cast it, a room marks a mesh `bakeOnly` (in its `userData`): the bake sees it as a caster, and it is never drawn, nor solid to the overlap check, the placement solver or the walks. The stage uses the same flag for its unseen ceiling and doorway plugs; the Operating Laboratory's patient and surgeon no one can see are a room's. Give such a caster a dark material, since the bounce reads its albedo too. The bench draws a room's bake-only casters see-through over it at `?bench=<room>&casters`, to see what casts a hidden shadow.

## The bake at run time

The bake must keep frames smooth on every page; making the house load faster was never the goal in itself. Nothing the bake or the build does may hold the page's thread for long:

- **Shaders compile in the background.** three.js links a material's program the first time it draws it, and the frame waits on the GPU for it. `shader-prep.ts` compiles an object's programs on the GPU's own threads for the scene as it will be, and the object joins once they are done, so a room's baked light shows once both it and its shaders are ready. An object that brings lights of its own (a carried candle) changes every lit material's program, so those are compiled for the new lights first, one such object at a time.
- **Work runs in workers**: the bake's sample placement and its passes' last step (`bake-finish.ts`), the meshing of figures (`figure-mesh.ts`; a figure stands as a pawn until its parts land), and reading a room's free floor (`room-floor.ts`).
- **What stays on the page's thread runs in slices** (`build-slices.ts`), the most urgent first, under a frame budget: rooms are built with the visible floor first, and the freeze runs a few steps a frame and can resume. The bake starts before the figures are built.
- **Shared geometry is batched** (books on a shelf as one box geometry), and per-frame shader parameters are kept, never rebuilt.

The bake runs as passes, direct light first and then the bounce, on a pool of workers sized from the device's threads: three quarters of them, minus one. That is where speed was measured to plateau; beyond it, frames suffer. Work is cut into chunks by cost and taken by priority: finishing work in progress first, then an earlier pass before a later one, then the active explorer's room, then what is on screen. A pass finishes in order, so a large pool never lands a later pass first. A newer layout supersedes stale work, whose chunks are dropped.

Measured on a quiet machine, the first frame came down from 3.7 s to 0.5 s, ready from 4.9 s to 2.2 s, the longest task from 3.2 s to 0.08 s, and a re-bake's worst frame from 203 ms to 19 ms (`tools/startup-perf.mjs`).

**Measuring performance.** Benchmark only when an issue shows up, never proactively. A measurement is taken in a quiet window, with no other agents running, before and after back to back, and reports the machine's state with its numbers.

**A room placed in play shows solid at once.** A ghost only ever means a room not yet placed. The moment a room is placed, or lands where a rule moved it (and while it flies there), it shows solid in a flat light, the house's moon fill even over the whole room, and its baked light replaces it in the frame that light lands, with no ghost between. The flat room is drawn by the baked room's own materials with an even lightmap, so it needs no shader the house hasn't already compiled. A room rebuilt where it stands (a door now shut or opened by a neighbour) keeps showing as it was until its new build shows lit. The rooms of the house as first laid out, at the start and after a reload, show once their light lands, never as ghosts.

**Ready** means interactive with the direct pass; **fully lit** is separate, once every pass has landed. Screenshot tools wait for fully lit. While finer passes are coming, the screen shows a "Refining light" mark, and work that usually takes long shows its progress from the start, decided per kind of work by measurement. `?bake-debug` on the house shows the scheduler's chunks, lanes and passes.

## Depth

The camera's depth range follows what is on screen each frame, so the near plane stands as far out as the view allows. A fixed wide range caused z-fighting across the house.

## Budgets

- **Draw calls:** 300 a frame (`MAX_DRAW_CALLS`), a rule-of-thumb ceiling, not measured on a phone; about 248 with every floor drawn, shine adding about 42. The guard throws when a frame exceeds it. Merged rooms and a figure's parts batched per material keep under it.
- **Texture units:** a shader may use at most `MAX_TEXTURE_UNITS`; the same guard throws past it.

There are no graphics settings or quality tiers: the technique is what keeps it fast.

## Choosing how to light a new effect

- **Baked**, when the light stands still for the layout's life: a room's lamps, its glows' light on the walls. It costs load time, not frame time, so many are allowed.
- **Live**, only for what moves and must light what's round it: the active explorer, a carried flame, in time a haunt's short event light. Few, and the house adds them.
- **Faked**, for everything else: a glow, an additive pool or beam, a flicker driven from a signal. Prefer it whenever it reads.

A light that changes while the game runs (a lamp dimmed, a candle put out) needs a re-bake; report the need rather than faking it.

## Known gaps

- Removing a candle-bearer from the scene relinks the lit materials' shaders.
- A room's build (not its freeze) runs in one slice: about 90 ms for a room full of books.
- A ghost, and a room shown flat before its light lands, freezes all at once, on the frame it first shows.
- Draw calls stand at about 248 of 300 with every floor drawn.
- Baked shadows don't move with a candle's flicker.

## Optimisation ideas

Written down, not built: none is taken up until a real phone shows a problem.

- **The bake's cost at 48 texels a metre.** A room's bake grows with its texel count, about 23 times what it was at 10. A page given 2 cores on an idle machine took about 100 s to be ready (an e2e measurement under the suite's core share, not a phone). If phones show it:
  - **Two passes:** a coarse first pass (about 10 texels a metre) makes the room ready, and the full density refines it in the background and swaps in. Keeps the approved look and a fast first room; the shadows sharpen once, visibly, and each room is baked twice.
  - **A lower density,** about 20 to 24 texels a metre: about a quarter of the cost and no engine work, with blockier shadow edges than approved.

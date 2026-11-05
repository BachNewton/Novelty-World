# Åland Drive: time, seasons and weather

The day and night, the seasons and the weather: what is decided, how the work is split, and what each phase hands the next. `docs/PLAN.md` (phase 7, Depth) holds why they belong to the game; `ideas/surface-grip.md` the grip they set; `art/night` the night art already built. Each phase updates this doc as it lands, and the doc goes once every phase is in `CLAUDE.md`.

## Decided

- **The calendar is real.** The date is Åland's real date, the same for every player, so the season is the one outside: winter is long, summer short. The sun stands where it really would over Åland on that date, so midsummer nights stay a blue dusk and December days are a few hours long.
- **The hour runs fast.** A game day replays today's real sun path faster than real time, worked out from the world's clock (`sea/clock.ts`) with nothing sent. Its length is one constant, a starting value the owner tunes in the game. The boats keep real time, as they do now.
- **Seasons never switch on a date.** Everything seasonal is a continuous function of the date (and, for snow, of the weather before it): leaves turn and fall over weeks, tree by tree, each on a threshold of its own rolled from its place, so a wood turns gradually rather than all at once; snow builds and melts; the sea freezes from the sheltered bays outward and breaks up in spring. A placed thing that is out of season (café terraces, cows, moored boats) leaves over a window of days, each on its own threshold, the same way.
- **The weather is shared and drawn from Åland's climate.** It is a deterministic function of the world's clock, the same for every player, with how often it rains, snows, fogs and clears following Åland's real climate for that time of year. It sets the condition the grip already reads (dry, wet, snow, ice), and black ice comes from the temperature crossing zero after wet.
- **Winter is the law's.** Tyres follow the season as Finnish and Åland law do: studs in the winter months, summer tyres otherwise (`ideas/surface-grip.md`, "Later").
- **Included:** the Northern Lights on clear, dark winter nights (`art/night/aurora.ts`), Åland's real ice roads over the frozen sea in hard winters, autumn colours with fallen leaves, and the winter's lights: Advent candlesticks and stars in windows, and Christmas lights on homes, trees and Mariehamn's streets through the dark months.
- **New art is a subagent's task per piece**, built to fit how the game places it (`art/CLAUDE.md`), reviewed on its kit's gallery, then placed.

## What already exists

- **The day** (phase 1, `CLAUDE.md`, "The day"): Åland's real date and a fast hour from the world's clock (`time/day.ts`), the sun and moon over Åland (`time/sky-places.ts`), one live sun every material reads (`art/sun.ts`), the night's dial set from the sun's height and a winter night's dark below it (`render/day-and-night.ts`), the terrain's bake moved by the live sun (`render/terrain-light.ts`), and the night's lights in the game (`render/night-lights.ts`, lit rooms in the wall shader). `?date=`, `?hour=` and the dev menu's Day move a page's day.
- **The sky** (`art/sky`): a summer and a golden-hour look, and the night's dusk and night looks between them by the sun's height, darkened further on a winter night. Clouds have a cover.
- **The grip** by surface and condition (`sim/surfaces.ts`), set today from the dev menu or `?condition=`.
- **The aurora** (`art/night/aurora.ts`), built and not yet in the game: it waits for clear, dark winter nights, which need the weather and the seasons.

## Phases

Each phase is its own session, on its own branch, landing on main before the next that needs it starts. Phases 1 and R start together; 2 and 3 need 1, and their art can start once R has reported.

### R. Research (parallel with 1)

The real numbers the later phases are built on, written into this doc's Reference section: Åland's climate by time of year (rain, snow, fog and clear days, temperature, snow cover, sea ice by area and date) from FMI's open data or statistics; which ice roads Åland has opened, where, how they're marked and in which winters; Åland's dates for winter tyres and studs; the Christmas and Advent lights of Åland and Mariehamn, what goes up, where, and from when to when; and when birches and the other broadleaves turn and drop their leaves there. Sources named.

### 1. The day (the critical path)

- A pure time module: the real date, the fast hour, and the sun's (and moon's) place over Åland from them, allowing for the grid's north being 6.25° off true north. Unit-tested against known sunrise and sunset times. A link parameter to set the date and hour, and a dev control for both.
- The sun as a value every material reads, not a constant, and a lighting model for the terrain under a moving sun: what the 2 m bake can still carry (open sky, fine relief) and what it can't (cast shadows from one direction). Decided by screenshots against the current look and by the floor's frame cost, not by taste.
- The night integrated (`art/night/integration.mjs`, `docs/HANDOFF.md`, "Night"), driven by the sun's height rather than its own dial: lamps, windows, sea lights, headlights, the water's `seaAtHour`. Headlamps, brake and reverse lights go into `CarState` so other players' cars show them.
- Exit: one game day passes on today's date and on midsummer's and midwinter's, the owner sees each in the running game, and the frame cost is measured.

**Landed.** The terrain keeps its bake and is moved by how much more or less each slope faces the live sun than the baked one (`relit`), chosen from screenshots of three ways (the bake as it was, a flat dimming, and this) at the bake's own sun, a low north-east morning sun and a west evening one: identical to today where the sun stands where it was baked, and on Åland's low relief the cast shadows left where the bake put them show little. It costs four height reads per terrain vertex and a few sums per pixel. The night's lights add 5 draw calls and 30–70 k triangles at Mariehamn at night, and nothing by day.

**What the later phases hang off:**

- **`GameTime`** (`time/day.ts`): the date, the local hour, the instant whose sky is shown, and the sun's and moon's places. The weather is a function of the world's clock and the date; the seasons' dials of the date. Both read the same `DayClock` the render does, so a page's `?date=` moves them too.
- **The night's dials** (`art/night/night.ts`): `amount` (by the sun's height), `dark` (a winter night past midsummer's), `late` (the clock's small hours), and `lampsOn`. Overcast and rain lower the light and bring the lamps on early by adding to these, never by a dial of their own; the aurora shows on `dark` nights the weather leaves clear.
- **The sky's look** (`render/day-and-night.ts`): each frame the look for the hour, darkened for the night, with the real sun in it. The weather's overcast and storm looks blend over it there, and its cloud cover is the look's `cloudCover`.
- **`hazedAtHour`** (`render/game.ts`): the one function every colour goes through, the hour's light then the headlights then the haze. Fog thickens the haze there (`hazeM`), wet roads darken and shine where it tints, and snow cover is a change to a surface's colour before it.
- **The live sun** (`art/sun.ts`): its length is the sun's strength, so cloud cover dims direct light by shortening it, for every material at once.
- **The condition** (`drive.condition`, `sim/surfaces.ts`): the weather sets it where the dev menu does today.

### 2. Weather (after 1)

- The shared weather as a function of the clock and the climate (R), with its states blending, never switching: clear, cloud, overcast, rain, snowfall, fog.
- Sky looks for overcast and storm; rain and snow drawn near the camera; wet roads that darken and shine; fog through the haze; the condition set from it; rain, wind and wipers in the sound.
- Exit: every state seen in the running game, the grip following it, the frame cost measured.

### 3. Seasons (after 1; after 2 for snow, which the weather lays)

- The season's continuous dials from the date: leaf colour and fall, snow cover (built and melted by the weather), sea ice, the winter's lights, tyres.
- Every placed layer says which seasons it belongs to and leaves on its own threshold.
- The winter's art, a subagent per kit: snow over the land with the roads cleared and banked, bare broadleaves and snow on spruce, ice on the sea with boats laid up, the Advent and Christmas lights, the ice roads and their markers, autumn's colours and fallen leaves; the aurora on clear dark nights; studs in the tyres' sound and particles.
- Exit: a walk through the year, one date a month, seen by the owner in the running game.

## Reference

Filled in by R.

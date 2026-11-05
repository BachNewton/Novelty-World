# Åland Drive: time, seasons and weather

The day and night, the seasons and the weather: what is decided, how the work is split, and what each phase hands the next. `docs/PLAN.md` (phase 7, Depth) holds why they belong to the game; `ideas/surface-grip.md` the grip they set; `art/night` the night art already built. Each phase updates this doc as it lands, and the doc goes once every phase is in `CLAUDE.md`.

## Decided

- **Arcade first, as TDU, The Crew and Forza Horizon are.** The seasons and the weather change how the world looks and how the car handles, enough to feel and to choose a car for, never so much that it plays like a simulator. Grip keeps the real order of surfaces and conditions with the gaps squeezed hard (`ideas/surface-grip.md`): winter on studs is a looser, slidier drive that is still fun at speed, black ice is a patch that wiggles the car rather than a crash, and rain, snowfall and fog cut what can be seen without hiding the road. Where realism and fun disagree, fun wins, and the climate's numbers set how often things happen rather than how hard they hit.
- **The calendar is real.** The date is Åland's real date, the same for every player, so the season is the one outside: winter is long, summer short. The sun stands where it really would over Åland on that date, so midsummer nights stay a blue dusk and December days are a few hours long.
- **The hour runs fast.** A game day replays today's real sun path faster than real time, worked out from the world's clock (`sea/clock.ts`) with nothing sent. Its length is one constant, a starting value the owner tunes in the game. The boats keep real time, as they do now.
- **Seasons never switch on a date.** Everything seasonal is a continuous function of the date (and, for snow, of the weather before it): leaves turn and fall over weeks, tree by tree, each on a threshold of its own rolled from its place, so a wood turns gradually rather than all at once; snow builds and melts; the sea freezes from the sheltered bays outward and breaks up in spring. A placed thing that is out of season (café terraces, cows, moored boats) leaves over a window of days, each on its own threshold, the same way.
- **The weather is shared and drawn from Åland's climate.** It is a deterministic function of the world's clock, the same for every player, with how often it rains, snows, fogs and clears following Åland's real climate for that time of year. It sets the condition the grip already reads (dry, wet, snow, ice), and black ice comes from the temperature crossing zero after wet.
- **Winter is the law's.** Tyres follow the season as Finnish and Åland law do: studs in the winter months, summer tyres otherwise (`ideas/surface-grip.md`, "Later").
- **Included:** the Northern Lights on clear, dark winter nights (`art/night/aurora.ts`), Åland's real ice roads over the frozen sea in hard winters, autumn colours with fallen leaves, and the winter's lights: Advent candlesticks and stars in windows, and Christmas lights on homes, trees and Mariehamn's streets through the dark months.
- **New art is a subagent's task per piece**, built to fit how the game places it (`art/CLAUDE.md`), reviewed on its kit's gallery, then placed.

## What already exists

- **The night** (`art/night`): one dial from day to the deepest Nordic night, with lit windows, OSM lamps (`lights.json`), sea lights and lighthouses, headlights, glows and the aurora, and its exact replacements for the game in `integration.mjs`, written against older code. Not in the game.
- **The sky** (`art/sky`): a summer and a golden-hour look; the night adds dusk and night looks. Clouds have a cover.
- **The grip** by surface and condition (`sim/surfaces.ts`), set today from the dev menu or `?condition=`.
- **The world's clock** (`sea/clock.ts`), real seconds, which a time of day is worked out from.
- **The constraint:** the sun is one fixed direction, `manifest.sun`, baked into the terrain's 2 m shading (sun, cast shadow and open sky) and handed as a constant to every material. A moving sun means the lighting stops trusting that bake.

## Phases

Each phase is its own session, on its own branch, landing on main before the next that needs it starts. Phases 1 and R start together; 2 and 3 need 1, and their art can start once R has reported.

### R. Research (parallel with 1)

The real numbers the later phases are built on, written into this doc's Reference section: Åland's climate by time of year (rain, snow, fog and clear days, temperature, snow cover, sea ice by area and date) from FMI's open data or statistics; which ice roads Åland has opened, where, how they're marked and in which winters; Åland's dates for winter tyres and studs; the Christmas and Advent lights of Åland and Mariehamn, what goes up, where, and from when to when; and when birches and the other broadleaves turn and drop their leaves there. Sources named.

### 1. The day (the critical path)

- A pure time module: the real date, the fast hour, and the sun's (and moon's) place over Åland from them, allowing for the grid's north being 6.25° off true north. Unit-tested against known sunrise and sunset times. A link parameter to set the date and hour, and a dev control for both.
- The sun as a value every material reads, not a constant, and a lighting model for the terrain under a moving sun: what the 2 m bake can still carry (open sky, fine relief) and what it can't (cast shadows from one direction). Decided by screenshots against the current look and by the floor's frame cost, not by taste.
- The night integrated (`art/night/integration.mjs`, `docs/HANDOFF.md`, "Night"), driven by the sun's height rather than its own dial: lamps, windows, sea lights, headlights, the water's `seaAtHour`. Headlamps, brake and reverse lights go into `CarState` so other players' cars show them.
- Exit: one game day passes on today's date and on midsummer's and midwinter's, the owner sees each in the running game, and the frame cost is measured.

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

# Åland Drive: time, seasons and weather

The day and night, the seasons and the weather: what is decided, how the work is split, and what each phase hands the next. `docs/PLAN.md` (phase 7, Depth) holds why they belong to the game; `ideas/surface-grip.md` the grip they set; `art/night` the night art already built. Each phase updates this doc as it lands, and the doc goes once every phase is in `CLAUDE.md`.

## Decided

- **Arcade first, as TDU, The Crew and Forza Horizon are.** The seasons and the weather change how the world looks and how the car handles, enough to feel and to choose a car for, never so much that it plays like a simulator. Grip keeps the real order of surfaces and conditions with the gaps squeezed hard (`ideas/surface-grip.md`): winter on studs is a looser, slidier drive that is still fun at speed, black ice is a patch that wiggles the car rather than a crash, and rain, snowfall and fog cut what can be seen without hiding the road. Where realism and fun disagree, fun wins, and the climate's numbers set how often things happen rather than how hard they hit.
- **The calendar is real.** The date is Åland's real date, the same for every player, so the season is the one outside: winter is long, summer short. The sun stands where it really would over Åland on that date, so midsummer nights stay a blue dusk and December days are a few hours long.
- **The hour runs fast.** A game day replays today's real sun path faster than real time, worked out from the world's clock (`sea/clock.ts`) with nothing sent. Its length is one constant, a starting value the owner tunes in the game. The boats keep real time, as they do now.
- **Seasons never switch on a date.** Everything seasonal is a continuous function of the date (and, for snow, of the weather before it): leaves turn and fall over weeks, tree by tree, each on a threshold of its own rolled from its place, so a wood turns gradually rather than all at once; snow builds and melts; the sea freezes from the sheltered bays outward and breaks up in spring. A placed thing that is out of season (café terraces, cows, moored boats) leaves over a window of days, each on its own threshold, the same way.
- **The weather is shared and drawn from Åland's climate.** It is a deterministic function of the world's clock, the same for every player, with how often it rains, snows, fogs and clears following Åland's real climate for that time of year. It sets the condition the grip already reads (dry, wet, snow, ice), and black ice comes from the temperature crossing zero after wet.
- **Tyres are the player's choice, not the law's.** A car's tyres (summer, winter friction or studded) are swapped at home or at a car shop, and a car on snow or ice without winter or studded tyres handles poorly, so the season gives the player something to prepare for. Built: the grip of each tyre in each condition, the tyre fitted per car in this browser (`garage/tyres.ts`), chosen in the game menu or by `?tyres=` until homes and car shops exist, and studs heard and seen (`ideas/surface-grip.md`, "Each car runs on the tyres the player fitted").
- **The winter is more wintry than Åland's.** Real Åland is snow-poor, and the sea freezes hard about one winter in six, so for play snow comes more often and lies longer, and the sea freezes more often than it really does. When it does, cars drive on the frozen sea itself; there are no marked ice roads, as Åland has no official ones.
- **The Northern Lights are rare, but not as rare as real.** They show on clear, dark winter nights, more often than the about once a month the latitude really gives (`art/night/aurora.ts`).
- **Fog is light and short**, mostly spring's sea fog lifting by afternoon. A thick fog is kept for a bucket-list challenge.
- **Autumn is felt, not dated precisely:** leaves turn from about mid-September, peak in early October and are mostly down by early November, with fallen leaves along the verges.
- **The winter's lights:** Advent candlesticks and stars in windows, and Christmas lights on homes, trees and Mariehamn's streets through the dark months.
- **New art is a subagent's task per piece**, built to fit how the game places it (`art/CLAUDE.md`), reviewed on its kit's gallery, then placed.

## What already exists

- **The day** (phase 1, `CLAUDE.md`, "The day"): Åland's real date and a fast hour from the world's clock (`time/day.ts`), the sun and moon over Åland (`time/sky-places.ts`), one live sun every material reads (`art/sun.ts`), the night's dial set from the sun's height and a winter night's dark below it (`render/day-and-night.ts`), the terrain's bake moved by the live sun (`render/terrain-light.ts`), and the night's lights in the game (`render/night-lights.ts`, lit rooms in the wall shader). `?date=`, `?hour=` and the dev menu's Day move a page's day.
- **The sky** (`art/sky`): a summer and a golden-hour look, and the night's dusk and night looks between them by the sun's height, darkened further on a winter night. Clouds have a cover.
- **The grip** by surface and condition (`sim/surfaces.ts`), set by the weather (`climate/`, below), or held by the dev menu or `?condition=`.
- **The climate's logic** (`climate/`, below): the shared weather and the season's dials, pure and unit-tested, with nothing drawn yet.
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

**Landed.** A game day is half an hour of real time (`GAME_DAY_S`, the owner's choice). A winter night is darker than midsummer's but keeps the road readable by the sky's light and the headlights. The terrain keeps its bake and is moved by how much more or less each slope faces the live sun than the baked one (`relit`), chosen from screenshots of three ways (the bake as it was, a flat dimming, and this) at the bake's own sun, a low north-east morning sun and a west evening one: identical to today where the sun stands where it was baked, and on Åland's low relief the cast shadows left where the bake put them show little. It costs four height reads per terrain vertex and a few sums per pixel. The night's lights add a few draw calls and tens of thousands of triangles at Mariehamn at night, and nothing by day; a street lamp lights what's under it, cars included, through one light image the colours read (`createLampLight`).

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

- The season's continuous dials from the date: leaf colour and fall, snow cover (built and melted by the weather), sea ice, the winter's lights; tyres fitted at home or a car shop (the choice, its memory per car and the grip are built: the screens that call `garage/tyres.ts` wait for homes and shops).
- Every placed layer says which seasons it belongs to and leaves on its own threshold.
- The winter's art, a subagent per kit: snow over the land with the roads cleared and banked, bare broadleaves and snow on spruce, ice on the sea with boats laid up, the Advent and Christmas lights, the frozen sea as a surface to drive on, autumn's colours and fallen leaves; the aurora on clear dark nights. (Studs in the tyres' sound and particles are built.)
- Exit: a walk through the year, one date a month, seen by the owner in the running game.

## The climate (the logic of phases 2 and 3)

`climate/` is the logic half of the weather and the seasons: pure functions, no renderer, the same on every player's machine with nothing sent. The sky, the art and the sound read these values; none of them is drawn yet.

**Time in.** Both take plain inputs, which the game's day (`time/day.ts`) will feed: the date (Åland's `CalendarDate`), how far through it real time is (0 to 1, so nothing seasonal jumps at midnight; a date a link holds sits at its noon), the hour shown, and the world's clock in game days (seconds over `GAME_DAY_S`), which is what the weather's fronts follow, so every player has the same sky whatever their hour. Until the day lands, `climate/feed.ts` reads all four off the world's clock itself (its own copy of the game day's length, and UTC+2 for the date); once it lands those come from the day instead. Nothing here works out a sun: darkness is the day's.

**Exact arithmetic.** No `Math.sin`, `exp`, `pow` or the like anywhere in it (`climate/exact.test.ts` holds that): engines may round those each their own way, and two players' weather would part over a last bit. Random numbers are an integer hash (PCG) of whole numbers, eased between.

**The weather** (`climate/weather.ts`, `weatherAt`), at a moment:

| Value | Range | For |
|---|---|---|
| `cloudCover` | 0–1 | the sky's cloud, its light and its shadowless overcast |
| `rain`, `snowfall` | 0–1 each | drawn near the camera; rain and wipers in the sound |
| `fog` | 0–1 | the haze's thickness: the climate's fog stays under 0.6, 1 is a challenge's thick fog |
| `windMS`, `windFromDeg` | m/s; degrees from **true** north | the sound, flags, trees, the sea; the grid's north is 6.25° off |
| `temperatureC` | °C | breath, frost on glass, the sound of studs |
| `roadWet`, `roadSnow`, `blackIce` | 0–1 each | wet roads darkening and shining, snow on the road, ice's sheen |
| `aurora` | 0–1 | how strong an aurora is now, if the night is dark: the renderer multiplies it by its own darkness |
| `condition` | dry, wet, snow, ice | the grip (`sim/surfaces.ts`); the drive reads it every frame |
| `state` | clear, cloud, overcast, rain, snowfall, fog | a name for a readout or a sound's pick; a reading of the values, never a switch |

How it works: the fronts and showers are one number wandering smoothly along the game days, and a game day is wet when it rises past a threshold; the threshold is read off that number's own spread (worked out once, the same everywhere), so the share of wet game days is the month's, eased between month middles, and leans on the real day's wetness. Cloud is the same fronts with a wandering of its own, held to the month's cloudier share the same way. Rain or snow is the temperature's: the day's mean on the real calendar (`climate/climate.ts`: the normal, the extra cold for play, this winter's hardness, the day's own wander) with the day's swing by the hour, bigger under a clear sky. Fog is a morning's (and now and then an evening's), chosen per shown day, light, gone by 13:00. The road remembers rain and meltwater for 5 game hours in summer and 12 in winter, and snow for 6 until it's ploughed; black ice is a wet road below freezing. The condition is snow over ice over wet over dry, each past a threshold on those values.

**The season** (`climate/season.ts`, `seasonAt`), each a share of things, from the date:

| Dial | Range | For |
|---|---|---|
| `leaves.leafed`, `leaves.turned` | shares 0–1 | each broadleaf tree in leaf and in its autumn colour; a tree's one threshold serves both, so it turns before it falls, and leafs out green |
| `leaves.fallen` | 0–1 | fallen leaves along the verges and under the trees, gone by mid-December or under snow |
| `snow.depthCm`, `snow.cover` | cm; share 0–1 | snow over the land, built by the cold wet real days and melted by mild ones and the spring sun |
| `seaIce.reach`, `seaIce.drivable`, `seaIce.bayCm` | exposures 0–1; cm | the sea frozen out to that exposure, the ice that bears a car, and the bays' thickness; `iceAt(day, exposure)` gives any place's |
| `lights.town`, `lights.homes`, `lights.windows` | shares 0–1 | Mariehamn's streets and Torget's tree, homes' Christmas lights, windows' candlesticks and stars |
| `lights.adventCandles` | 0–4 | candles lit in a four-candle holder |
| `auroraNightChance` | 0–0.12 | the chance a game night has one, which the weather draws |
| `inSeason.terraces`, `grazing`, `boatsAfloat`, `bales` | shares 0–1 | placed things out in their season (`IN_SEASON`, a window each, which a new kind adds a row to) |

**One by one.** A thing changes when the share of its kind passes its own threshold: `oneByOne(share, threshold)` is that thing's state from 0 to 1, over a sliver of the share, so a wood turns tree by tree. The threshold is the art's, rolled from the thing's place with `art/hash.ts` (`unitOf` on the GPU, `unitOfSeed` on the CPU, which agree), so a tree in a shader and a prop on the CPU change alike. Sea ice reads exposure the same way: a place's exposure (0 the most sheltered bay, 1 the open Sea of Åland) is its threshold against `reach` and `drivable`. Working out each place's exposure (how far it is from open water, say) is the sea art's job: nothing computes it yet.

**What the tuning gives** (on six simulated years and thirty winters, `climate/rates.test.ts`): wet game days and cloudy time within a few points of each month's numbers; fog on two to five mornings a month in spring and autumn; snow lying from about December to March, 15–20 cm at its deepest, at least three weeks white in the mildest winter; ice in the bays in most winters, and the open sea frozen in about one in four. The road is dry about nine tenths of the time, wet the rest outside winter, with snow on it about one hour in twenty from December to February, and black ice rare, mostly in March's thaws. Each is a constant at the top of its module.

**Where the drive takes it.** The game sets the ground's condition from the weather on every frame (`climate/feed.ts`'s `groundCondition`). `?condition=` or the dev menu's Ground holds one instead, until a reload. A tool's or a test's page (on `?tiles=`, or driven by automation) stays dry, so a measurement doesn't change with the hour it ran at, unless it asks with `?weather`. `?date=2027-01-20` holds the date, the same parameter the game's day reads, and the world's clock (`?sea=`) moves the weather with the boats.

**`?weather-lab`** is the readout: every value at a date and hour (`?weather-lab&date=2027-01-20&hour=7`), stepping a day, a week or a month, the hour on a slider, and which of the date's game days; a strip of that game day hour by hour, and one of the whole year from July, the date marked, for the snow, the ice, the leaves, the lights and the terraces.

## Reference

The real numbers phases 2 and 3 are built from. Each is tagged **[S]** (read from the named source), **[O]** (a different provider, station or area than Mariehamn) or **[E]** (an estimate: no source gave it, and it is a modelling choice to be tuned in the game). Climate sets how often things happen, not how hard they hit: where a real figure would make the game miserable, the softened value for play is beside it.

Mariehamn's weather has been measured at the airport, then Jomala (Södersunda, Jomalaby), so "Mariehamn" below is that one climate ([ÅSUB MI001a](https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/Statistik__MI/MI001a.px/)). The official FMI normals are the PDF [Tilastoja Suomen ilmastosta 1991–2020](https://helda.helsinki.fi/bitstream/handle/10138/35880/Tilastoja_Suomen_ilmastosta_1991_2020.pdf), which no tool here could read; the monthly table below is its Mariehamn Airport column as quoted in [Wikipedia's Mariehamn climate box](https://en.wikipedia.org/wiki/Mariehamn). The PDF is the one source to open by hand to replace every [E] under Weather and Snow with a measured value.

### Climate by month [S] unless marked

| | Mean °C | Mean daily max | Mean daily min | Precip mm | Precip days | Sunshine h | Wet days ≥1 mm [O] | Cloudier / clearer % [O] | Mean wind km/h [O] |
|---|---|---|---|---|---|---|---|---|---|
| Jan | −1.3 | 1.0 | −4.3 | 53 | 17 | 39 | 7.2 | 69 / 31 | 29 |
| Feb | −2.3 | 0.4 | −5.5 | 35 | 13 | 74 | 5.0 | 69 / 31 | 27 |
| Mar | −0.2 | 3.1 | −3.7 | 38 | 12 | 130 | 5.2 | 63 / 37 | 25 |
| Apr | 3.8 | 8.0 | −0.1 | 31 | 9 | 207 | 5.8 | 59 / 41 | 23 |
| May | 8.9 | 13.4 | 4.0 | 35 | 10 | 297 | 5.7 | 49 / 51 | 20 |
| Jun | 13.3 | 17.5 | 8.6 | 53 | 10 | 296 | 6.3 | 44 / 56 | 20 |
| Jul | 16.8 | 20.8 | 12.2 | 52 | 9 | 312 | 6.6 | 42 / 58 | 20 |
| Aug | 16.1 | 20.0 | 11.6 | 76 | 13 | 235 | 7.9 | 47 / 53 | 23 |
| Sep | 11.8 | 15.5 | 7.8 | 61 | 12 | 163 | 7.6 | 50 / 50 | 24 |
| Oct | 6.8 | 9.6 | 3.5 | 70 | 16 | 91 | 8.6 | 59 / 41 | 28 |
| Nov | 3.2 | 5.2 | 0.6 | 71 | 17 | 41 | 9.0 | 67 / 33 | 27 |
| Dec | 0.4 | 2.5 | −2.5 | 59 | 17 | 26 | 8.8 | 67 / 33 | 29 |
| Year | 6.4 | 9.8 | 2.7 | 634 | 155 | 1911 | ≈84 | | 25 |

Sources for the [O] columns: [WeatherSpark, Åland Islands](https://weatherspark.com/y/150200/Average-Weather-in-Aland-Islands-%C3%85land-Islands-Year-Round) (modelled from reanalysis, not a station; cloud, wet days, and snowfall below) and [Airpult, Mariehamn Airport](https://airpult.com/climate/ax/mariehamn-airport/5828032512) (wind; [Windfinder](https://www.windfinder.com/windstatistics/mariehamn) gives a lower average, so take the shape, winter about 1.4 times summer, and the prevailing south-west). "Precip days" in the box states no threshold; at 155 a year it is a low one (about 0.1 mm), and days of 1 mm or more are roughly 55–60% of it.

Records [S]: highest 31.3 °C (Jul), lowest −32.9 °C (Feb). The monthly mean lows are below 0 °C every month but June to August. The sea keeps the coast mild: the day's swing is small, about 5 °C in winter, 8–9 °C from May to August (May largest, 9.4), 6 °C in October ([E], computed from the table's max and min).

### Weather: shapes for the model

How often, not how hard.

- **Wet days.** The chance a day is wet is the month's wet days over its length: about 0.23 in January, 0.17 in March, 0.19 in April, 0.21 in July, 0.28 in October, 0.30 in November and 0.28 in December ([O], from the table). The driest, sunniest season is April to July; the wettest is October to January, with August a local peak (76 mm, from showers).
- **Persistence** (no source gave any; [E]): a wet day follows a wet one about 0.55–0.65 of the time from October to February (frontal, several days at a stretch), and about 0.40–0.50 from May to August (showers). Holding the month's wet-day chance fixed then gives a mean wet spell of 2–3 days and dry spells of 3–5, to about 6 in April and May. A new low every 3–6 days in the cold season, 6–8 in summer.
- **Cloud.** Cloudier than clear on the table's measure from September to April, 67–69% in November to February. The grey lid is the winter's: sunshine is 26–39 h a month in December and January, about an hour a day, and a spell of overcast runs 3–7 days and sometimes two weeks ([E]). Clear spells run 2–5 days from April to July, when May to July see about 10 sunshine hours a day.
- **Fog** (no source; [E]): sea fog when warm air crosses the cold sea, April to June, and advection fog in autumn and winter; events last 6–24 hours, mostly from night to late morning, clearing on land in the afternoon, and rare on a July afternoon. About 15–30 foggy days a year on an exposed Baltic island. **For play:** fog is a morning and evening state of a few hours that lifts, never a multi-day one, at a few mornings a month in spring and autumn.
- **Gales** (no source; [E]): mean wind of 14 m/s or more on perhaps 5–10% of days from October to January and about 1% in summer. Storms are for the sound and the sea, not for pushing the car.
- **Temperature shape.** A day's mean follows the month's mean with a few degrees of year-to-year swing; January's mean moves about ±3–4 °C between winters ([E]), and a hard winter has 20–30 days under −10 °C ([E]). A clear calm day swings 1.5–2 times the table's range and an overcast windy day less ([E]).
- **Black ice.** In December to March the mean daily max is near 0–3 °C and the mean min near −2 to −6 °C ([S], table), so the day crosses zero often. Black ice is a wet or thawing road dropping below zero overnight: most likely November to March, and with the month's mean between about −3 and +2 °C ([E]).

### Snow

- **What the sources say** ([FMI snow statistics](https://en.ilmatieteenlaitos.fi/snow-statistics), [Climate of Finland](https://en.wikipedia.org/wiki/Climate_of_Finland) [O, the whole south-west]): the first snow cover is usually in November in the south and west; lasting snow in the south-west corner starts around Christmas; the depth is greatest around March. FMI counts first snow as 1 cm or more at 06 UTC, and lasting snow as the longest run of such days. No Åland figure is readable in text (FMI's are maps).
- **Snowfall** [O, WeatherSpark]: about 4 in. (10 cm) of snow a month in January, 3.5 in. February, 2.5 March, 0.9 April, 1.7 November, 3.6 December; the snowy season runs about 6 November to 13 April.
- **Shape for the model** ([E], from the above and the table's thawing winter): Åland is snow-poor. Lasting cover begins late December to mid-January and ends late February to mid-March, 50–80 days in an average winter; peak depth 5–15 cm in February and early March, 20–40 cm only in a snowy winter; some winters, perhaps one in four or five, have no lasting cover; snow often falls and is gone within days. **For play:** snow cover on a plausible fraction of winter days, building and melting over days with the weather's snowfall and temperature, and every winter has some white weeks (the real one that doesn't is not a good winter for a game).
- **Ice and snow on tyres:** the grip tables' snow and ice conditions (`ideas/surface-grip.md`) are the ones that matter on cold days, and there the player's choice of tyres does most; wet and dry are the rest of the year.

### Sea ice

- **Baltic-wide** ([FMI ice statistics](https://en.ilmatieteenlaitos.fi/icestatistics), [FMI, ice season](https://en.ilmatieteenlaitos.fi/ice-season-in-the-baltic-sea), [winter table](https://en.wikipedia.org/wiki/Ice_season_in_the_Baltic_Sea)): the mean maximum extent is 141,000 km² for 1991–2020, from 37,000 (2019/20) to 309,000 (2010/11); it peaks from the end of February to early March, freezing starts from October in the north and melting from April. Maxima by winter, in thousands of km²: 1995/96 265, 1996/97 265, 2002/03 233, 2009/10 244, 2010/11 309, 2017/18 175, 2018/19 88, 2019/20 37, 2020/21 127, 2021/22 93, 2022/23 81, 2023/24 135, 2024/25 85, 2025/26 181; 2007/08 49 and 2014/15 51 were the mild ones.
- **Åland's own sea** (FMI [ice winter 2010/11](https://en.ilmatieteenlaitos.fi/ice-winter-2010-2011): the hard winter; [2020/21](https://en.ilmatieteenlaitos.fi/ice-winter-2020-2021): an ordinary one): in 2010/11 the whole Finnish coast was frozen by mid-December, fast ice in the Archipelago Sea 25–55 cm and drifting ice in the Sea of Åland 10–25 cm; in 2020/21 ice formed in the outer Archipelago Sea only in February and was gone by 12 April. FMI says the Archipelago Sea is iced in normal winters.
- **Shape for the model** (no source gave Åland-specific first-ice or break-up dates; [E]): shelter freezes first. The sheltered bays (Mariehamn's harbours, Lumparn's inner water, Eckerö's bays) get ice in the first half of January in an average winter and late December in a cold one, about 10 cm by late January and 20–30 cm by late February in a cold winter; the archipelago's fast ice follows by one to three weeks; the open Sea of Åland is only partly iced even in an average winter, with drifting ice, and has none by April. Break-up late March to mid-April, later in a hard winter. In a mild winter (2019/20, 2014/15, 2007/08) the outer archipelago has little or no lasting ice and the harbours only thin ice for days.
- **How often a hard winter** (from the table): 6 of 36 winters reached a Baltic maximum of 220,000 km² or more (1993/94, 1995/96, 1996/97, 2002/03, 2009/10, 2010/11), about one in six; one in eight to ten of them freezes the Sea of Åland itself solid ([E]). **For play:** make the sea freeze often enough to be seen: an ice-bound bay or two most winters and a wider freeze in a hard one, rather than the real one in six.

### Ice roads (isvägar)

**This changes the plan.** The plan says "Åland's real ice roads over the frozen sea in hard winters"; the sources found describe no official ice-road system on Åland. What exists is unofficial and at the user's own risk.

- [Yle Svenska, 2003](https://yle.fi/a/7-20620): the route Hummelvik (Vårdö) – Kumlinge – Brändö – Kivimo (Houtskär) is unofficial, mostly private initiative, "på egen risk". Brändö ploughs from Brändö to the Åland border at Skiftet, Houtskär ploughs on to meet the official ice roads kept by the Finnish road agency in Åboland; Brändö also keeps Torsholma–Lappo; a private initiative ploughed Jurmo–Åva. The ice was up to about 0.5 m thick, with open cracks near Delet.
- A second-hand snippet of an [Åland travel-info page](http://home.aland.net/bosse/isvagsinfo.htm) (the page itself did not load) says the ice between Åland and the mainland bore a car for a few weeks in 1985, 1986, 1987, 1994, 1996 and 2003, and that no road between Åland and the mainland was ever officially opened to vehicles [O, unverified].
- [Ålandstidningen, 23 Feb 2026](https://www.alandstidningen.ax/nyheter/tog-sista-chansen-till-aeventyrlig-isfaerd/1163514): four families crossed from Föglö to Kökar on snowmobiles and ATVs; not an official road. Ice also stops ferries: [Ålandsradio](https://alandsradio.ax/nyheter/fran-mandag-angors-inte-overo-uppehall-kan-paga-fyra-veckor): Ålandstrafiken stopped calls at Överö for low water and ice, possibly four weeks.
- **Not found:** marking (spruce, poles, signs), speed limits, rules, which winters, thickness requirements. The nearest official rules are [Trafikverket's](https://www.trafikverket.se/resa-och-trafik/trafiksakerhet/sakerhet-pa-vagfarja/fardas-sakert-pa-isvag/) (Sweden: not opened unless it bears 2 tonnes), and Finland's agency's are the thing to look up if the game needs a real marking. Any marking drawn would be borrowed, not Åland's.
- **Recommendation:** the plan's ice roads stay, but as ploughed, unofficial, marked-by-their-ploughing routes between islands in hard winters (the Vårdö–Kumlinge–Brändö line is the real one), not an official network with signs. The marking is the art's choice (a ploughed track, brushwood or spruce tops are what an unofficial route would have); say so in the art brief rather than cite a real marking.

### Winter tyres and studs

- **Åland** (the law's text on [regeringen.ax](https://regeringen.ax/node/213686), the 2024 amendment of the 2023 road traffic act, in force 1 October 2024): in winter conditions (vinterväglag) from November to March, cars up to 3.5 t, motorcycles, mopeds and trailers over 0.75 t must use winter tyres of at least 3.0 mm tread, or equivalent equipment. It is conditions-based: no fixed start day.
- **Studs on Åland** ([the 2012 ordinance](https://www.regeringen.ax/node/26846); the 2008 one, [here](https://regeringen.ax/node/25925), said the same dates): allowed from 15 October to 15 April, and at other times in winter conditions or when they are feared. Not confirmed under the 2023 act: this is the last rule found.
- **Mainland Finland** ([Traficom](https://traficom.fi/fi/autoilijat/vinkkeja-liikenteeseen/auton-kesa-ja-talvirenkaat)): winter tyres 1 November to 31 March when weather or road conditions require, 3.0 mm; studs 1 November to 31 March, and at other times when conditions require. The old mainland rules (winter tyres 1 December to the end of February, studs to the Monday after Easter) ended with the 2020 law change ([Traficom's note](https://www.traficom.fi/files/media/publication/Tieliikennelain_uudistuksen_vaikutus_talvirenkaiden_kayttoon.pdf)).
- **Difference:** the winter-tyre duty is the same, November to March in winter conditions. The Åland stud window is wider: it opens about two weeks earlier (15 October against 1 November) and closes about two weeks later (15 April against 31 March). **For the game:** tyres are the player's choice, not the law's (Decided), so these dates say only when a sensible driver changes over, a hint a home or a car shop could give.

### Winter lights

Little of this is written down for Åland; what was found:

- **Mariehamn's calendar** ([City Mariehamn](https://citymariehamn.ax/event/marknad-vid-lilla-jul/), [Visit Åland](https://visitaland.com/en/events/lilla-jul-in-mariehamn/)): "Jul i city" on the Saturday a week before Lilla Jul, when the centre is dressed and lit against the dark (21 November in the year read); Lilla Jul at Torget on the Saturday before the first Sunday of Advent, a long-standing market (28 November in that year, though the city's page says "the day before first Advent"); a Christmas market at Torget the first weekend of December (5–6 December); on Christmas Eve a tree and stage at Torget ([Mariehamn's news](https://www.mariehamn.ax/nyheter/julfriden-2022)); and the tree and its ring games and dancing at Torget on 13 January, Tjugondag Knut, the end of Christmas ([Ålandstidningen](https://www.alandstidningen.ax/nyheter/julutsopning-pa-torget-kvall)). So the tree at Torget stands from late November to 13 January.
- **The street** ([Ålandstidningen, "Julgatan öppnar"](https://www.alandstidningen.ax/nyheter/julgatan-oppnar-tomten-pa-tidningsgarden)): Torggatan's Julgatan opens at the compass rose at 18:00 on the first big Advent-season Saturday, with the Christmas lighting over Torggatan lit then. "Julen öppnar i City" ([event](https://citymariehamn.ax/event/julen-oppnar-i-city-4/)) adds a Tomtetåg along Torggatan at midday and a Lucia group.
- **Advent candlesticks and stars** (the custom is Swedish and Åland's; no Åland date for putting them up or taking them down was found): lit in windows from the end of November, as [Ålandstidningen](https://www.alandstidningen.ax/nyheter/okej-tanda-ljusstake-och-julstjarna) takes for granted during a power cut. Swedish sources: the star in the window stands for the Star of Bethlehem, a candlestick has four candles lit one by one on the four Sundays of Advent, and the stars now often stay up through Christmas or longer ([SVT](https://www.svt.se/nyheter/inrikes/sederna-bakom-julen), [Sveriges Radio](https://www.sverigesradio.se/artikel/6031623)). [E] for the game: candlesticks and stars on the Saturday before the first Advent, the candles added one each Advent Sunday, down about 13 January (Tjugondag Knut) or 2 February (Kyndelsmässa).
- **Lucia** ([Ålandsradio](https://alandsradio.ax/nyheter/hon-ar-alands-lucia-2025), [Folkhälsan](https://www.lucia.ax)): Ålands Lucia is crowned on 13 December in S:t Görans kyrka in Mariehamn, at 16:00 or 18:00 by year, and a procession goes on to Torget. The city adds a Lucia visit on Torggatan on the market day.
- **Not found:** which streets besides Torggatan and Torget are lit and who pays; harbour, ferry and church decorations; the switch-off date. [E] for the game: the town's lit streets and Torget's tree from "Jul i city" (about a week before the first Advent Sunday) to 13 January; homes' lights and windows' stars from the last weekend of November; Lucia on 13 December as the evening's peak.

### Leaves

No source gave Åland dates for any species; the numbers are an estimate from the south coast and Mariehamn's temperatures. The data sets that would settle it (Luke's phenology network, [Pudas et al. 2008](https://jukuri.luke.fi/items/03f0425d-8e73-445b-9f98-895034c9c7eb/full) on birch, Luomus's yearbooks) were blocked here; FMI's daily means for Mariehamn from [its open data](https://opendata.fmi.fi/) give the thermal seasons by computation. FMI's definitions: spring when the daily mean is steadily above 0 °C, the growing season above +5 °C ([FMI](https://www.ilmatieteenlaitos.fi/terminen-kasvukausi), [seasons](https://www.ilmatieteenlaitos.fi/termiset-vuodenajat)).

- **What is sourced:** autumn colour on the Gulf of Finland coast is usually early October, peaking in its second week, and on the south-west coast can run to the end of October because the warm Baltic stretches it ([Seura](https://seura.fi/ilmiot/tiede-ja-luonto/ruska-johtuu-kasvien-ja-lehtipuiden-sisaisesta-kellosta/), [VR](https://www.vr.fi/vinkkeja-junamatkailuun/ruskaretki)). Downy birch drops its leaves about two weeks before silver birch ([Suomen Luonto](https://suomenluonto.fi/uutiset/oikukas-ruska/)); birch turns yellow, aspen red and yellow, maple often bright red, and alder drops its leaves green ([Yle](https://yle.fi/a/3-12145916), [Maaseudun Tulevaisuus](https://www.maaseuduntulevaisuus.fi/metsa/77d50da2-417d-4165-869b-4bec6197f93b)). Day length is the main trigger; a frost night makes leaves let go in one night and gales strip the weak ones ([same](https://www.maaseuduntulevaisuus.fi/metsa/77d50da2-417d-4165-869b-4bec6197f93b)); a meta-analysis ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4640124)) finds October's mean temperature moves the 50% leaf-fall date by about 2.5 days a degree, with the photoperiod binding at high latitude. [Visit Åland](https://visitaland.com/en/experience/experience-autumn-in-aland/) names the yellow birches and red maples on the water, and Mariehamn's lime-lined Esplanaden in colour.
- **Estimated timeline for Åland** [E]:

| Event | Estimate |
|---|---|
| First odd yellow in birch and aspen | mid-September |
| Birch broadly yellow | late September to about 10 October, ±10 days between trees |
| Peak colour, mixed broadleaves | about 5–20 October |
| Rowan, maple (red, orange) | early to mid October; rowan before oak |
| Lime, elm, hazel | yellow, early to mid October |
| Alder, ash | green or green-yellow, dropped in October |
| Oak | last: brown, late October into November |
| Half the leaves down | about mid-October; most down late October to early November |
| Larch | golden, after birch, October to early November |

  The sea moves all of it later by a few days to a week against inland ([E], direction from VR). Each tree turns on its own threshold (the plan's "each on a threshold of its own") and a frost night or a gale can bring a wood down in a day.
- **Spring** [E]: thermal spring (daily mean steadily above 0 °C) comes in the last week of March on the mainland south and later on Åland, whose March mean is still −0.2 °C and April's 3.8 ([Yle](https://yle.fi/a/3-9513203): in one year it had started "only in Mariehamn"); the growing season (above +5 °C, snow gone) begins late April to early May. Birch leaf-out about 5–15 May; wood anemones from mid-April to early May in the wooded meadows ([Visit Åland](https://visitaland.com/en/experience/aland-in-springtime)); blackthorn early to mid May, apple and cherry mid to late May, lilac late May to early June; oak leafs out last, mid to late May. The cool sea holds spring about a week behind the south-west mainland.
- **Frost** (no source; [E]): the last spring frost about late April to early May, the first autumn frost mid to late October on the coast, each ±2 weeks; the monthly record lows are below 0 °C in every month but July.
- **Grass**: green late April to mid May, no browning before November's frosts ([E]); the mild archipelago climate keeps golf playable into October ([Visit Åland](https://visitaland.com/en/experience/experience-autumn-in-aland/)).

### Northern Lights

- [FMI](https://en.ilmatieteenlaitos.fi/auroras-in-finland): on a clear dark night an aurora shows about 75% of nights at Kilpisjärvi, 50% in Lapland, 25% in central Finland, and in the south coast (Helsinki, Turku, Åland's latitude, 60.1° N) about once a month on average, a little more in spring and autumn than in winter and summer, following the 11-year sunspot cycle and strongest in the south at its maximum.
- **Realistic count for Åland:** about 12 opportunity nights a year on FMI's figure; with Åland's autumn-to-spring cloud (the table: cloudier on 50–69% of days from September to April) about 4–8 nights a year when it is actually seen ([E]).
- **Season and hours** [E]: September to April, with the equinox months (March, September–October) favoured; none from mid May to late July, when the nights are too light (daylight 18 h 58 min at midsummer, [WeatherSpark](https://weatherspark.com/y/150200/Average-Weather-in-Aland-Islands-%C3%85land-Islands-Year-Round)). Roughly 22:00 to 02:00 local, with real bursts lasting 10–60 minutes. At this latitude a display is a low glow on the northern horizon at geomagnetic activity (Kp) of about 5, overhead only at Kp 7 and above (unofficial: [Orbital Radar](https://orbitalradar.com/space-weather/aurora-forecast/helsinki)).
- **For play:** a few nights a year, each a clear dark night in the season and a spell of tens of minutes, drawn from the shared clock like the weather. The solar cycle's maximum was around 2024–25, so the real frequency is high now and falling towards a minimum about 2030 ([E]), which the game need not follow.

### Gaps to close

The official FMI normals PDF, which would give Mariehamn's fog days, clear and overcast day counts, mean snow depth and snow-covered days; FMI's Mariehamn daily series (its open data returned only part of the years, with precipitation and snow mostly missing) for the thermal seasons and frost dates; any Åland source for ice-road marking and for the Christmas lights' streets and dates; Åland's current stud dates under the 2023 act.

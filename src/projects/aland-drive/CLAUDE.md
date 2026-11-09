# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

Players see it as **Åland Drive Unlimited**, a nod to that series; the code keeps the name Åland Drive. It lives at Games → 3D Games → Åland Drive Unlimited. It is the whole main island, 54 tiles of road and the 40 around them, streamed in as the car moves: invented cars to drive on real roads, on land coloured by the real aerial photos, among forest grown from the laser data and buildings from NLS's 3D data and footprints, with a mini map, a world map and a GPS, and fifty real places to find, and bucket list challenges to play solo or as co-op for two, against the clock or a speed camera, and 32 races, laps of a loop or a road from A to B, for medals. Everyone who opens it drives in one shared world, online free roam, with every other player's car on the road and on both maps.

## Where it's written down

This file holds what applies everywhere in the project. Each system's own detail is in a `CLAUDE.md` in the folder that holds its code, read when working there:

| Folder | What its `CLAUDE.md` covers |
|---|---|
| `sim/` | The car: the rigid body, cars, gearbox, grip by surface, condition and tyres, driver's aids, what stops the car, the physics centre, `CarState` |
| `render/` | Streaming and distance: tiles, the terrain clipmap, roads, forest, plantings, buildings, everything placed, water, sky; the light through the day and the weather drawn |
| `pipeline/` | Building tiles: every pipeline module, the road surface, bridges, seams, the tests, how rough the roads are |
| `art/` | Art rules: art built for the game, no coplanar faces, far versions, measured LOD swaps |
| `net/` | Multiplayer: the shared world, stand-ins, the shared GPS destination, computer-driven cars, shared traffic |
| `traffic/` | Cars, cyclists and walkers on the lanes, and `?lane-lab` |
| `challenge/` | Challenges, co-op and races |
| `racers/` | The AI racers: the road as laid, the racing line and speed plan, the driver, difficulty, the field, and the race vetting tool |
| `map/` | The world map, mini map, GPS and places to find |
| `audio/` | Sound |
| `time/`, `climate/` | The calendar and clock; the shared weather |
| `sea/` | Boats under way |
| `components/` | The game menu, Graphics and the dev menu |
| `tools/` | The measuring tools and the labs |
| `playground/` | `?playground`, the made-up test map |

`docs/` holds the longer references: `DATA.md` (the sources and what was measured in them), `PLAN.md` (the phases), `ART.md` (every art kit), `CAR-METHOD.md` (how a car is built, reviewed and tuned into its tier), `TIME-AND-WEATHER.md`, `ROAD-SURFACES.md`, `JUNCTIONS.md`, `LIGHTHOUSES.md`, `HISTORY.md`, `DRIVING-CULTURE.md`, and `HANDOFF.md` (where the work stands). `ideas/` holds what isn't decided.

## Controls

| | Keyboard | Controller |
|---|---|---|
| Accelerate | W | RT |
| Brake, then reverse | S | LT |
| Steer | A and D | Left stick |
| Chase view or driver's seat, kept in this browser | C | RB |
| Look left, right or behind, while held | Left, Right, Down | Right stick, any way round; from the seat, the head turns as far as it's pushed |
| Look down on the car, while held (chase view) | Up | |
| Handbrake | Space | A |
| Back to the nearest road | R | Y |
| Free camera | F | |
| World map | M | View |
| Game menu | Esc | Menu |
| Start a challenge or open a race's card in its ring, or answer a co-op invite | E | X |
| Sound on or off | N, or the game menu | The game menu |

The world map pauses the drive and opens on the main island, north up, and zooms out to all of Åland. The wheel (about the cursor) or the triggers zoom, a drag, WASD or the right stick pans, a click or A sets a destination, with the left stick moving a controller's cursor, X clears the route, and Esc, M, B or View flies home. A pick on a place routes to it, and the cursor over one names it, with its note once it's found.

`~`, or the key under Esc on any layout, opens the dev menu. The menus are `components/CLAUDE.md`.

From the driver's seat the right stick turns the head smoothly, up to about 140° either way and a little up and down, and springs back when let go; the arrows look left, right and behind as in the chase view (behind, the head leans towards the middle to see past the seat). The seat is `render/CLAUDE.md`'s Cockpit.

The free camera is for inspection: WASD, Q and E, Shift, drag to look, the wheel for its speed. There is no touch. Prompts come from the shared glyphs and follow the last input used.

## Platform

Web only, WebGPU only, three.js driven directly with no React Three Fiber, and Rapier for physics. It never moves to a native engine. A browser without WebGPU is told the game needs it.

The render (`render/game.ts`) is one renderer, one scene and one loop. The page (`components/aland-drive.tsx`) only starts it and stops it, and shows the speed and the prompts; nothing in the game renders through React. After `renderer.init()` the game checks the backend really is WebGPU, because three drops to WebGL2 by itself when a device can't be made, and the page shows the same message as with no adapter.

`window.__alandDrive` is the probe for tools, waiting on events rather than time: frames, draw calls, triangles, GPU time and the size drawn, the car's state and its drive log, what the stream has done, a hold that stops the simulation following the clock, `advance` to step it by hand, the scripted driver and the camera. The tools run against local tiles, never the real host, in headless Chromium by name (`tools/CLAUDE.md`).

The scene is east +x, up +y and north -z. The renderer uses a reversed depth buffer.

A player starts in the car they last chose on the game menu's Cars page, or in Grus before they've chosen one (`PLAYER_START_CAR`), and a tool's or test's page in the Skerry GT, which what they hold was measured against.

**Links that set up a page**, combined freely in one link:

| | |
|---|---|
| `?at=east,north,height,yaw,pitch` | Opens there, the car on the nearest road (`render/start-place.ts`); the dev menu copies one |
| `?car=<id>`, `?tyres=`, `?paint=` | Starts in that car (its id in `sim/cars.ts`), on those tyres, in that paint (its index or colour in the car's list) |
| `?racers=<count>` | How many AI racers a race gets (`racers/CLAUDE.md`); the whole grid without it, 0 for none |
| `?weather=<kind>`, `?condition=` | Holds a weather (`climate/held.ts`: clear, cloud, overcast, rain, snowfall, fog, `ice`) or a ground condition; a tool's or test's page is dry without one |
| `?date=`, `?hour=`, `?sea=`, `?aurora=` | The real date, the hour, the boats' clock, a held aurora |
| `?tiles=local:<port>`, `?relay=local:<port>`, `?drive-world=<name>` | Local tiles, a local relay, a test's own world |
| `?playground`, `?lane-lab`, `?junction-lab`, `?forest-lab`, `?deer-lab`, `?weather-lab`, `?sounds` | The dev pages: `playground/`, `traffic/`, `tools/`, `docs/TIME-AND-WEATHER.md` and `audio/` say what each is |

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch. Nothing is optimised for a phone, and costs are judged against the floor laptop, never a phone. So no layout is built or checked at phone sizes, and no change needs a mobile screenshot.

The target is a steady 60 fps, drawing the 3D world at 100% of the screen's physical pixels: one rendered pixel per device pixel, the full `devicePixelRatio`. The frame meter is the shared stats.js one; a timestamp query gives the GPU time.

**Render scale is never a way to cheat performance.** The game menu's Graphics page has a render scale (`render/graphics-settings.ts`), 20–100% of the physical pixels each way in steps of 10, kept in this browser and applied live. It is the player's choice and the only thing that ever draws fewer pixels: the default is 100%, and nothing in the game lowers it, caps the pixel ratio, or scales resolution by device or on the fly. A frame that costs too much is made cheaper (fewer draws, triangles, pixels shaded per pixel), never drawn at a lower resolution, and a measurement or a target is always taken at 100%.

A chase view at 3440×1440 is 60–90 draw calls and 0.5–1.1 M triangles, of which about 0.4 M is the terrain, fixed wherever the car is. The forest follows what's in view: 0.05–0.15 M on open and coastal showcase views, 0.4 M in mixed forest and 0.63 M in Deep Forest.

## Graphics approach

Start simple, and add a feature only when it fixes something visibly wrong and its cost is known.

- **Build a system that scales, not one sized to a machine.** A graphics system is efficient by design and scales to the hardware: better hardware scales up, worse scales down, through levels of detail and reach, with the render scale left to the player (see Floor). A system is never built to a fixed budget, and the one thing to avoid is a system that can't scale. The floor laptop decides the default settings, not the design.
- **Bake ahead of time what can be baked**: terrain shading and soft shadows from the 2 m data.
- **Spend detail near the car.**
- **Keep distance cheap**: simplified terrain, simple crowns for far trees, haze.
- **A change of detail isn't noticed.** Good LOD works in the background and leaves the player to the game. While driving, a player shouldn't catch a tree fading in, a canopy shifting or anything growing out of the ground, and a crossfade doesn't excuse a change that would otherwise catch the eye. The bar is noticeable, not measurable: a change may be there if a driver doesn't see it, and it's judged by eye in motion. This holds for everything with levels of detail: trees, buildings, people, other cars and bikes. A handover goes further out, or the two versions are made to match, until it stops being noticed. Where a model swaps is measured, never chosen by hand (`art/CLAUDE.md`).
- **Rapier only needs the ground around the car.**
- **A shader never draws fine detail from the world's coordinates.** The island reaches 25 km from the world's origin, where a 32-bit float's steps are millimetres, about what a near pixel spans. A pattern laid from world position, or a normal from how world position changes across the pixel, turns to noise there: a roof's seams once did. So a pattern is laid in its surface's own metres, written on the vertices, and a flat face's normal comes from view space, which is measured from the camera (`art/flat-normal.ts`). World position is still fine for what varies over metres, such as weathering, and for looking things up in a tile's images.
- **What a face shares reaches its pixels a little different on some GPUs.** A value the same at every corner of a triangle, a model's place or kind, comes out of the blend across it a bit or two off at some pixels on Nvidia, and not on AMD, so anything that magnifies those bits sparkles there alone: a sheep's coat, a field stone's colour, a facade's panels did. So a model's own seed is a whole number made in the vertex stage, where its attributes are exact, and reaches its pixels as an integer, which isn't blended; every random roll is the integer hash in `art/hash.ts` on whole numbers, never `fract(sin(x) * big)` (`render/gpu-exact.test.ts` holds that); a float is rounded before it becomes an index; a count rounded from a measure the face shares (a facade's bays and storeys from its width and eaves) reads that measure through a flat varying, since a rounding that lands near a half flips on those bits, and a wall drew two layouts of its windows at once; a figure's digits are cut from a whole number in integer arithmetic, never by a float's division, power or `mod`, which land a hair under a whole number there (the cockpit's 100 read 109, with the face's own parameter, blended, picking the digit pixel by pixel); and a pattern on the ground reads its place from an anchor near the camera (`art/surfaces/tiled.ts`), not from the world's origin. Checking a change by eye on AMD alone can't show any of this, and the headless tools draw on the Radeon unless told otherwise: check it on both (`tools/look.mjs --egpu` shoots on the 4070), and in motion where a still shows nothing, since sparkle often shows only as the camera moves.
- **No pipeline is compiled mid-drive.** Every mesh is built once before the drive starts, and nothing made later may need a pipeline of its own (`render/CLAUDE.md`, "A landing costs a frame nothing"; `tools/shader-count.mjs` counts them).
- **Measure by counts** (draw calls, triangles, vertex shader invocations, fragments shaded and the overdraw they make, each pass's attachment bytes), per the repo's speed rule: `tools/frame-cost.mjs` counts them at the showcase views, the same on every run, `tools/frame-cpu.mjs` counts the main thread's side of the same frame (the calls by function and module, and the bytes allocated), and `tools/frame-diff.mjs` proves a change meant to change no pixel changed none (`tools/CLAUDE.md`). The owner's laptop is always busy with other work, so a time taken on it, paired or not, doesn't decide whether a change made things better or worse. The GPU's timestamps and `tools/drive.mjs --clock` show that a stall exists and where it is, and nothing more.

## Art direction

Clean, stylised realism: real land colour under a low-poly forest and flat-shaded buildings with real shapes, red houses with white trim. Detail comes from real data and simple shapes, not photographic textures. **All 3D models and textures are made from code:** no generative image models and no outside assets. Open geodata stays the world's base, aerial land colour included; other photos are reference only. Road signs are the one exception: they follow Finland's official drawings, shapes and lettering both, because a road sign has to be the real sign. Cars are invented, with no real brands, and match this style. The rules for building art are `art/CLAUDE.md`.

## Hosting

Tiles live in the public bucket `aland-drive-tiles` on the site's Supabase project, one folder per build under its version, and `render/tile-address.ts` is the one place that says so: the base address is the Supabase URL, the bucket and `TILES_VERSION`. Moving to another host is copying a folder and changing that one function. The files never change once published and carry a year's cache, so a browser keeps them; a rebuild is a new folder and a new `TILES_VERSION`, committed with whatever needs it, so a deployed page only ever sees the tiles it was built with. `pipeline/upload.py` creates the bucket if it's missing and uploads what isn't there, reading the service-role key from `.env.local`. Only the live version stays: once a new one is deployed and checked in the live game, `pipeline/upload.py --clear-old` deletes every other.

Nothing in the tests or tools touches that host: they serve tiles to themselves on localhost.

**Data per drive**, counted by the bytes a local server really sent: starting the game is 18.8 MB (the overview, nine tiles' far data and the start tile's detail), the same whatever the island's size, of 406 MB published for 94 tiles. A tile is 5–8 MB in the country, about 1 MB in the outer sea tiles and up to 14 MB in Mariehamn. A tile once fetched comes from the browser's cache, and driving a route again fetches nothing. So a player's download is bounded by the map, not by the hours: 313 MB for one person seeing everything.

Against Supabase Free's 5 GB of egress a month that's about 15 new players who see everything. Pro's 250 GB is fifty times that. R2 has no egress charge and 10 GB free. So stay on Supabase while the game is the owner's own, and move before it's shared widely: the move is a copy and one address.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule, and the game names them in a line on screen that links there. ODbL holds the tiles' road and building files to the same licence, so they are published as they are, each stating it.

## Phases

`docs/PLAN.md` holds the phases, why they run in that order, each phase's exit test and the risks.

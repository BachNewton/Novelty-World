# Åland Drive: the plan

The phased route from an empty scene to a Test Drive Unlimited-style game on the main island of Åland. The project's `CLAUDE.md` holds the standing decisions (platform, floor, graphics approach, data, hosting); this doc holds the order of the work, why it runs in that order, and what finishes each phase. A phase is done when its exit test passes, not when its list is ticked.

## The game

What Test Drive Unlimited is about, and what this game has to keep:

- **A real island at 1:1 scale**, driven without a loading screen, where getting to know the roads is the reward.
- **Cruising as the core**: the drive has to feel good with nothing else happening.
- **Ownership**: cars and a house, earned by driving.
- **Other players on the same roads**, met in passing and challenged on the spot.

Åland suits this: roads through forest, farmland and shoreline, one small capital, and bridges joining the land together. End to end it is a drive of roughly half an hour at road speed.

## Ordering principles

- **Playable early.** The first real drive comes after one phase of data work, and every phase after it adds to something already drivable.
- **Riskiest first.** Whether the driving feels good on real, noisy terrain decides the whole game, so it is tested before streaming, art or game systems.
- **Small area, then grow.** One tile, then about nine, then the island. Each step up exposes a problem the last size couldn't: streaming at nine tiles, seams and sheer data size at the island.
- **Judge the look from inside the world.** How realistic the game looks can't be known until the real data is on screen, so art direction is a decision taken at a phase, not an assumption made now.

## Phases

### 1. Data proof

Build the pipeline that turns raw sources into game-ready data, on tile L2343C: an inland tile with a main road, a junction, ridges and lakes.

- Heights in, a game-ready terrain tile out, with its baked shading.
- Roads and building footprints for the tile from OpenStreetMap, with their quality judged against the terrain, where laser data shows the true line of each road.
- Settle the unconfirmed sources: do the NLS Topographic Database, orthophotos and laser point clouds really cover Åland? A sample of real files answers it, not a product page.
- Check the edges: sea tiles, shoreline and tile seams.

The pipeline's output is plain data, independent of the game's code.

**Exit test:** the tile's terrain and roads are on screen, seen from a free camera, matching the real place; every source is marked confirmed or ruled out.

### 2. First drive

One 6×6 km area, simple graphics, one placeholder car, keyboard and controller.

- Rapier vehicle on the ground around the car.
- Road surfaces smoothed along their length and blended into the land. Raw terrain makes bumpy roads, and this is the phase's main technical risk.
- Car state shaped from the start so that it can later be sent to other players.
- Make "WebGPU only" real: the page checks for an adapter, but three.js falls back to WebGL2 when device creation fails. Check the renderer's backend after it initialises, so a failure reports instead of quietly running on the wrong renderer.
- Render below screen resolution, with the frame-cost counters on.

**Exit test:** driving this tile at speed is enjoyable with nothing else in the game, at a steady 60 fps on the floor laptop.

### 3. Grow

About nine tiles, loaded as the car moves.

- Streaming from storage through one configurable base address, starting on Supabase Storage.
- Terrain that simplifies with distance, with no visible seams or pops at speed.
- Measure the real download volume of a long drive. That number decides whether hosting stays on Supabase or moves to Cloudflare R2.

**Exit test:** a drive across all nine tiles with no loading stall, and a measured figure for data per drive.

### 4. Art direction check

Dress the nine-tile area: forest, shoreline, fields and building shapes from footprints. Then look at it and decide how realistic the game is going to be, and pick the car style to match.

NLS's 3D buildings are shapes with no textures, so walls have to be made. Try a library of wall textures made with image generation from real reference photos (Åland red timber, white trim, plaster, shopfronts), assigned by building type, side by side with purely procedural walls on one street, and keep whichever looks better. AI use is disclosed if the generated textures ship.

**Exit test:** the owner has judged the result in the running game, and the art direction and car style are decided and written into `CLAUDE.md`.

### 5. Whole island

Everything, end to end.

- All land tiles through the pipeline, with sizes and hosting confirmed.
- A mini map while driving, and a world map of the whole island with GPS routes set from it.
- Street names on the road as you drive, and on both maps.
- Bridges and causeways, which the terrain data doesn't carry as driving surfaces.
- First hand-made landmarks: Kastelholm, Bomarsund, central Mariehamn.

**Exit test:** Eckerö to Lumparland in one unbroken drive, navigated by the game's own map.

### 6. Game loop, then online

- Road discovery percentage and odometer.
- Races and time trials on real roads.
- Earning money, buying cars and a house.
- Online free-roam on the relay: other players on the road and challenges on the spot. This needs far more frequent position updates than any game on the relay today, so its capacity is tested early in the phase.

**Exit test:** a reason to keep driving, and two players meeting on a road.

### 7. Depth

Traffic, weather, seasons (a Finnish winter would set this game apart) and ferries to other islands. Picked one at a time by what the game wants most.

## Risks

- **Road quality.** Roads are the one surface the player stares at for the whole game, and neither the terrain nor OpenStreetMap gives a drivable surface directly. Phases 1 and 2 exist largely to prove this.
- **Forest at speed on an integrated GPU.** Forest to the horizon is the most expensive thing in the scene. The plan is flat cards beyond a short distance, and the real cost shows at phase 4.
- **Generated buildings.** Footprints give shapes, not character. Mariehamn will need hand-made work, while the countryside can stay simple.
- **Cars.** They are invented, so there is no licensing problem, but a good car is hard to generate in code. Expect a mix of openly licensed models and custom work, chosen at phase 4.
- **Data volume and download cost.** Measured at phase 3: a built tile is about 4.5 MB, and a player's download is bounded by the map because the browser keeps what it fetched, about 285 MB for one person to see the whole main island. `CLAUDE.md` holds the numbers and the hosting recommendation.
- **Relay load.** Fast car positions are a new kind of traffic for it. Phase 6 tests this before building on it.

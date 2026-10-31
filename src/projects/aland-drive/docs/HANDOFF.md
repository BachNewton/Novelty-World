# Åland Drive: handoff

Where the project stands, and what's next. `CLAUDE.md` holds how things work, `docs/PLAN.md` the phases, and `docs/ART.md` every art kit and whether it has reached the game. Delete this file when it has served its purpose.

## Where it stands

Phase 5's core is done and live at `https://novelty-world.vercel.app/games/3d-games/aland-drive`: the whole island, 94 tiles and 313 MB, streaming from Supabase as version `1af18d018287`, with 91 bridges, a mini map, a world map on one continuous crane camera, GPS, street names and showcase spots on keys 1–0. The exit test passed: Eckerö harbour to Långnäs on the game's own route, 57.8 km, no respawns.

A large library of art is built and pushed under `art/`, and almost none of it is in the game. There is no gameplay yet. The car on screen is still the red placeholder.

Older tile versions remain in the bucket, which now holds about 538 MB and shares its 1 GB with `audiobooks`. Superseded versions can go once the live one has proved itself.

## What's next, in order

1. **Measure performance alone on the machine.** Agents held the GPU for every recent measurement. Take a baseline before any art goes in, using `tools/drive.mjs --clock` on a production build. Average cost is level with Phase 4, but the worst frames are not: frame p99 39.8 ms and max 185 ms, against 20.5 and 54.5 ms. The long frames cluster round Mariehamn with nothing loading, possibly first-time building meshes, which is a guess.
2. **Integrate art in stages, showing the owner each one in the running game.** Ground and road detail, the player's car and the sky; then town ground and facades with the churches; then night art; then sound; then objects placed across the island by regional rules, the biggest piece. Landmarks and the harbour go in along the way. Measure after each stage, because the kits' costs add up and interact.
3. **Fix the leftovers** listed under Known problems.

Teleporting from the map is about half a day, because `jump` already handles streaming and placement.

## How each kit goes in

Most kits have an `integration.mjs` beside their code, holding exact replacements for `render/game.ts` and friends, which throw if the code has moved. They were written against older code and some touch the same lines, so expect to merge them, and do `art/surfaces` before `art/town-ground`. Each kit's `tokens.css` goes into `globals.css`.

- **Surfaces and signs (`art/surfaces`):** `art/roadside` has its own `buildSignPlate` and sign sheet, which must switch to `signPlate`, `signMaterial` and `signPost` or the two sets disagree.
- **Town ground (`art/town-ground`):** needs three new pipeline outputs, baked by `bake_surface.py`: `<tile>/town-surface.rgba.gz` (3000² RGBA of signed distances at 2 m), `<tile>/town-ribbons.bin` (a class byte per ribbon section) and `town-props` (hedges and fountains). `sources._roads_and_buildings` must pass through the OSM areas it drops today; `read_osm` in `bake_tile.py` shows how. It adds about 290 MB of GPU memory over six near layers, the decision to check first. Only L2334E is baked, and seams between tiles are unverified.
- **Facades and churches (`art/facades`):** `assign.py` picks a building's look and needs new facts per building in `pipeline/buildings.py`: nearest named street, OSM tags, nearby shop, rural, roof rise and fill. `bake.py` shows each one, but it's a gallery shortcut, not the pipeline path. Skip the solids in `replaced-solids.json`. `surfaces/shopfront.ts` and these fronts touch the same line and need merging. None of the models have collision. `church-yards.json` and `fuel-stations.json` came from scripts that were not kept.
- **Night (`art/night`):** the `real` list in `integration.mjs`, with steps for the baked light, haze, windows and each frame's updates. `lights.json` needs an OSM/ODbL credit when it ships. Make the new meshes part of the precompile, or the first use stalls a frame.
- **Water:** give `createWater` the sky with `skyAlong: sky.clearAlong` once the sky lands, and `seaAtHour` once the night does.
- **Sound (`audio/`):** add a thin wrapper round `AlandDrive` for the `?sounds` audition, loading `audio/sound-lab` with `ssr: false`, and a Sound section in `CLAUDE.md`. In the game: `createDriveAudio()` at start, `audio.update(stateFromCar(car, input, { vehicle, surface, place, paused }), dt)` each frame, `reset()` after a jump, `dispose()` on stop. The game must supply `surface` and `place` (forest, shore and town from 0 to 1), which nothing computes yet. The canopy image, water mask and building density are the obvious sources. It has only been checked by numbers. Nobody has heard it, and the owner judges it by ear.

## Decisions waiting on the owner

1. **Lighthouses.** No light on Åland really rotates. Six long-flash lights are read as turning to give a sweeping beam, each keeping its true rhythm at any one spot. Kept as built unless the owner says otherwise.
2. **Aerial photo resolution:** the open question in `docs/PLAN.md`, decided once the ground detail is in the game.
3. **Hosting.** Stay on Supabase while it's the owner's own game, and move to Cloudflare R2 before sharing it widely.
4. **Offered, not decided:** Northern Lights in the plan, radio music from Composer, and Åland culture events in phase 6.

Road sign lettering is decided: the regulation letters stay. The credits page lists them as all rights reserved by Traficom, because no licence for them was found.

## Known problems

- **Road check:** 12 of 5,462 road lines failed, with a worst jolt of 21 g. On real roads: L2334G:3 near (341, 7249) by Lemström, L2334E:3 near (-2782, 7397), L2433G:17, and L2343H:14, the Färjsund cycleway chain. The likely cause, rails or town geometry, is unconfirmed.
- **Bridges:** 73 of 91 crossed both ways. Of the other 18, 12 fail only because the tool starts at the very end of a ribbon, 2 are off main routes, and 4 failed in one run and were not investigated.
- **Floating cone:** one forest cone floats above the hill at the far left of Västerhamn's water view. It's new with the 1.5 km cone grid and not diagnosed. Look at it first.
- **Forest cost:** the new forest adds about 0.4 M triangles and about 1.4 ms on a contested machine. If it's too much, the cheapest cut is the outline grid's reach. Stands past about 460 m are visibly sparser, and the dither shows faintly from above.
- **Road corridors:** roads have a clearing 6–8 m wider than the carriageway, even on forest tracks, and 33 crowns still reach a carriageway.
- **World map:** at the top of the zoom the island sits off-centre when the car is at its edge, until the player pans. Tiles using 2022 photos look brighter at the south-east, and faint square patches of sea tone show at the outer tiles.
- **Coverage:** 7 outer tiles have no 2025 photo, and 10 have no laser sheets, so no trees.
- **`pipeline/buildings.py`** calls class 42231 PUBLIC, but these are holiday cottages, so the constant should be renamed and they stay timber.
- **Showcase spot 8** lands beside a house rather than at a view.
- **Tools:** `tools/forest-pop.mjs` and `tools/tree-film.mjs` need private test patches (`window.__lodShift`, `window.__treeMark`) that were never committed, so they won't run as they stand.
- **Shop names:** only HAVSBODEN was checked against real businesses. Check the rest before they ship. Real shop names from OSM are never shown.
- **The cleanup list** at the end of `docs/ART.md`.

## Not verified

- 60 fps on a quiet machine, a real controller and the real display.
- The reverse camera was tested with scripted input, not by hand.
- The forest and water as a whole: the agent's films and counts are real, but the final filmstrip and the final open-water and lake pictures were not viewed by anyone.
- Every art kit's weak spots are recorded only here in outline. Judge them in the running game, since galleries are not the game.

## Standing rules for this project

- Code-only art, with no generative images and no outside assets, except road signs, which follow Finland's official drawings.
- Keep Shipwright out of it: its habits and style aren't this game's.
- Other sessions share this checkout, so commit explicit paths only. Agents can't write into a worktree from a session not in one.
- NLS data may be ordered with kyle1235@gmail.com on CC BY 4.0 terms without asking. Anything else on that page, such as an account or payment, goes back to the owner. All 80 building sheets are already on disk.

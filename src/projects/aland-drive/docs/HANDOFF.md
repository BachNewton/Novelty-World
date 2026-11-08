# Åland Drive: handoff

Where the project stands, and what's next. `CLAUDE.md` and the `CLAUDE.md` in each code folder hold how things work, `docs/PLAN.md` the phases, and `docs/ART.md` every art kit and whether it has reached the game. Delete this file when it has served its purpose.

## Where it stands

Phase 5 is done and live at `https://novelty-world.vercel.app/games/3d-games/aland-drive`: the whole island, 94 tiles, streaming from Supabase as version `864b209e5ae8`, with 91 bridges, a mini map, a world map on one continuous crane camera, GPS, street names and showcase spots on keys 1–0. The exit test passed: Eckerö harbour to Långnäs on the game's own route, 57.8 km, no respawns.

Much of the art under `art/` is now in the game: the ground, roads and their paint, roofs, facades and shopfronts, the sky, water with a seabed, the forest (lit per face, see `render/CLAUDE.md`), verges, reeds, shrubs, boathouses and sheds, the medieval stone churches and the landmarks, the roadside (lamps, poles and wires, signs, rails, edge posts, mailboxes, shelters), stone walls and parked cars. `docs/ART.md` ticks each kit. Fourteen cars each drive and sound as their own, swapped from the dev menu, and online free roam puts every player in one shared world with collisions between cars. There is no gameplay yet. A car's brake, reversing and headlamps stay off, because `CarState` doesn't carry them.

The bucket holds one tile version, `864b209e5ae8` (about 400 MB of the 1 GB it shares with `audiobooks`, 105 MB). An island is about 400 MB, so one more fits beside it: clear the older once the newer has proved itself live.

## Waiting for the next tile publish

Granite (`pipeline/rocks.py`: rock outcrops, boulder fields and boulders) and the shore (`pipeline/docks.py`: jetties, harbour piers, pontoons and boats, and piers no longer laid as road bridges) are on main and in the game, but not in the published tiles, so the live island shows neither until the next publish. The docks change how roads are laid on piers, so it takes a full `build.py --island`, which runs every step, not the two scripts alone. Both read as absent on older tiles, so the game runs on the published tiles meanwhile, with neither.

People (`pipeline/waterfront.py`, `render/people.ts`: fishers, sitters, tenders and strollers on the docks, and groups at the landmarks) are in the game on tiles the script has been run on, and not in the published tiles either. `waterfront.py` alone adds them to tiles already built, after the docks; a tile without them has no one. Street furniture (`pipeline/furniture.py`, in the roadside's list) and people seated on it (`pipeline/seated.py`) are the same: in the game on tiles rebuilt since, run after the roadside, and not published. Walkers are the next to place, through the same per-tile files (`pipeline/people.py`).

## What's next, in order

1. **Measure performance alone on the machine.** Agents held the GPU for every recent measurement, and the art added since makes a baseline more pressing. Use `tools/drive.mjs --clock` on a production build. The last reading, before most of the art went in: average cost level with Phase 4, but the worst frames not, frame p99 39.8 ms and max 185 ms against 20.5 and 54.5 ms, clustered round Mariehamn with nothing loading. Placed models are the likely cost now: every place on a loaded tile runs its near version's vertices, folded to nothing past its swap (roadside lamps, boulders, marina boats; see Known problems).
2. **Integrate the rest of the art in stages, showing the owner each one in the running game.** What's left: the facades' remaining models, and the rural, street, marina and town kits not yet placed (`docs/ART.md`). Measure after each stage, because the kits' costs add up and interact.
3. **Start the game loop (phase 6).** Road discovery and an odometer, speed traps and zones, and time trials with ghosts fit what the game already has: the road network, the GPS, and a deterministic simulation whose recorded inputs replay exactly.
4. **Fix the leftovers** listed under Known problems.

Teleporting from the map is about half a day, because `jump` already handles streaming and placement.

## How each kit goes in

Most kits have an `integration.mjs` beside their code, holding exact replacements for `render/game.ts` and friends, which throw if the code has moved. They were written against older code and some touch the same lines, so expect to merge them, and do `art/surfaces` before `art/town-ground`. Each kit's `tokens.css` goes into `globals.css`.

- **Signs (`art/surfaces`):** in the game, with the roadside (`render/roadside.ts`): the plates, posts and their look are `art/surfaces`' own, placed through `art/roadside/signs.ts`. The later kits' `integration.mjs` lists were written before the surfaces went in, so their replacements on those lines need redoing.
- **Town ground (`art/town-ground`): tabled, merged switched off.** `build.py` bakes the town image only with `--town`, and a tile without one draws as it always has, so nothing of it shows. With it, the game draws the town's ground and each path's own surface (see `render/CLAUDE.md`, "The town's ground", and `pipeline/CLAUDE.md`, "Paths"), and the owner judged it worse than the game without it, so it waits. The art on its own is fine and could lift the towns; what it sits on isn't ready: junctions, merges, roads and paths close together, and roads over changing ground still look janky, and a ground surface drawn up to those edges only shows them more. Those come first. When it's taken up again, the owner's review found: a flat green lawn read as bare, so lawns stay the terrain's ground with the verge on them; a path's edge must keep wearing into grass; and in villages the paving strip along every street and the gravel round buildings turn grassy ground grey, so both should follow only what the map records. A fair before/after rebuilds the before tiles with the base commit's pipeline from the same raw data. Paths laid flat on the land (no crown, a 10 m profile rather than 30, `_PATH` in `pipeline/roads.py`) were part of it and are back to a road's profile: try them again with the junction work. Its hedges and fountains (`models.ts`) aren't placed.
- **Models in `art/facades`:** the facades, shop fronts and churches are in the game. Its other models aren't: villas' porches and add-ons, supermarket entrances and fuel stations, which the gallery (`gallery.mjs`) stands in the world. None of those have collision. `church-yards.json` and `fuel-stations.json` came from scripts that were not kept.
- **Night (`art/night`):** in the game, driven by the sun (`render/CLAUDE.md`, "Light through the day"). The aurora on clear dark nights, from the weather.

## Decisions waiting on the owner

1. **Aerial photo resolution:** the open question in `docs/PLAN.md`, decided once the ground detail is in the game.
2. **Hosting.** Stay on Supabase while it's the owner's own game, and move to Cloudflare R2 before sharing it widely.
3. **Offered, not decided:** Northern Lights in the plan, radio music from Composer, and Åland culture events in phase 6.

Road sign lettering is decided: the regulation letters stay. The credits page lists them as all rights reserved by Traficom, because no licence for them was found.

## Known problems

- **First load got slower:** in a hidden browser pane the live game took about 35 s to start before the forest and water went in, and about 90 s after, sitting near the end of the bar. A hidden pane isn't a fair measure and it's one reading each, but shader building is the likely cause and worth checking in a visible window.
- **Road check:** 12 of 5,462 road lines failed, with a worst jolt of 21 g. On real roads: L2334G:3 near (341, 7249) by Lemström, L2334E:3 near (-2782, 7397), L2433G:17, and L2343H:14, the Färjsund cycleway chain. The likely cause, rails or town geometry, is unconfirmed.
- **Bridges:** 73 of 91 crossed both ways. Of the other 18, 12 fail only because the tool starts at the very end of a ribbon, 2 are off main routes, and 4 failed in one run and were not investigated.
- **Floating cone:** one forest cone floats above the hill at the far left of Västerhamn's water view. It's new with the 1.5 km cone grid and not diagnosed. Look at it first.
- **Forest cost:** the new forest adds about 0.4 M triangles and about 1.4 ms on a contested machine. If it's too much, the cheapest cut is the forest's settings: full-shape reach, then far density. The dither shows faintly from above.
- **Placed models cost vertices out of sight:** each model is one list across every loaded tile, and every place runs its near version's vertices, folded to nothing past its swap. Around Mariehamn that's the roadside's 3,154 lamps and about 0.6 M triangles of marina boats, and boulders add 21–76k at the showcase views. Culling the lists by cell, as the buildings and stone walls are, is the fix if the cost shows; the parked cars instead keep each list to the cars within its reach of the camera (`render/parked-cars.ts`), which the others could share.
- **Open sea read as land, in thin lines and wedges: fixed in the pipeline, not yet in any tiles.** The height model writes each patch of the sea at its own level, a few centimetres apart, and the water test lost a patch cut under a hectare by a map sheet's edge, and the line where two levels meet when it ran diagonally: straight strips of "land" over open water across the archipelago, with reeds and no seabed, and wedges cut straight at seams (L3121G's south edge, `?at=137617,6690000,30,0,-1.5`). `terrain.flat_water` and `water_around` now take both as water; the next full `build.py --island` carries it. Separately, the outermost two pixels of the baked shading at about half the south and west seams are a third darker, which `check_seams.py` prints as a shade step of 50–95 against the usual 2–8; it lies under the sea, and its cause isn't known.
- **Granite at road cuts:** where a road runs through mapped rock, the rock reads only as a pale verge. A blasted rock face would need art of its own.
- **Road corridors:** roads have a clearing 6–8 m wider than the carriageway, even on forest tracks, and 33 crowns still reach a carriageway.
- **World map:** at the top of the zoom the island sits off-centre when the car is at its edge, until the player pans. Tiles using 2022 photos look brighter at the south-east, and faint square patches of sea tone show at the outer tiles.
- **Coverage:** 7 outer tiles have no 2025 photo, and 10 have no laser sheets, so no trees.
- **Showcase spot 8** lands beside a house rather than at a view.
- **Tools:** `tools/forest-pop.mjs` and `tools/tree-film.mjs` need private test patches (`window.__lodShift`, `window.__treeMark`) that were never committed, so they won't run as they stand.
- **Shop names:** only HAVSBODEN was checked against real businesses. Check the rest before they ship. Real shop names from OSM are never shown.
- **The cleanup list** at the end of `docs/ART.md`.

## Not verified

- 60 fps on a quiet machine, a real controller and the real display.
- The reverse camera was tested with scripted input, not by hand.
- The engine voices are first proposals, never tuned by ear in the game.
- The granite's fade to the ground before its stones swap or dissolve, judged by eye while driving.
- The reeds kept clear round docks, since the clearing moved from the mask's alpha to the 8 m fields layer when granite and the shore merged.
- The forest and water as a whole: the agent's films and counts are real, but the final filmstrip and the final open-water and lake pictures were not viewed by anyone.
- Every art kit's weak spots are recorded only here in outline. Judge them in the running game, since galleries are not the game.

## Standing rules for this project

- Code-only art, with no generative images and no outside assets, except road signs, which follow Finland's official drawings.
- Keep Shipwright out of it: its habits and style aren't this game's.
- Other sessions share this checkout, so commit explicit paths only. Agents can't write into a worktree from a session not in one.
- NLS data may be ordered with kyle1235@gmail.com on CC BY 4.0 terms without asking. Anything else on that page, such as an account or payment, goes back to the owner. All 80 building sheets are already on disk.

# Åland Drive: handoff

Where the project stands, and what's next. `CLAUDE.md` holds how things work; `docs/PLAN.md` holds the phases. Delete this file when it has served its purpose.

## Where it stands

Phases 1 to 3 are done. Phase 4 is built and waiting on one thing: the owner's judgement of the look in the running game, which is its exit test.

Live at `https://novelty-world.vercel.app/games/3d-games/aland-drive`, streaming from Supabase, confirmed in a browser with no errors. Keyboard: WASD to drive, Space for the handbrake, R back to a road, C for the camera, F for the free camera.

**What you can drive:** nine real 6×6 km tiles of western Åland (L2334B, D, F and L2343A–F), including northern Mariehamn. The town centre is on L2334E, which is not one of the nine. Start is on Route 1, about 12 km northwest of central Mariehamn.

**What's there:** real terrain and OSM roads smoothed into a drivable surface, land coloured from the 2025 aerial photos, forest placed from laser heights, 8,566 NLS 3D buildings plus 2,329 generated gables, walls with windows, doors and trim drawn in the shader, roofs coloured from the photos.

## Measured

Production build, on this laptop's 780M, drawn at 2408×1007 for a 3440×1440 window, all-nine real-time drive of 42.4 km:

| | Median | p99 | Max |
|---|---|---|---|
| Frame interval | 16.7 ms | 20.5 ms | 54.5 ms |
| GPU time | 2.93 ms | 5.66 ms | 52.4 ms |
| Draw calls | 71 | 86 | 89 |
| Triangles | 1.08 M | 1.34 M | 1.37 M |

Scripted drive: 0 respawns, 0 steps on unloaded ground, no sticking. Road check on real buildings: all 1,410 lines, 843 km, finished; worst jolt 2.02 g. Data: 17.4 MB at startup, 29.1 MB for the all-nine drive, 74 MB an hour.

Frame times were measured headless at a cap of about 60 fps, so they aren't proof on the real 100 Hz display.

## Not verified

- Whether it looks and feels right in motion. Only stills and scripted drives have been seen by an agent.
- The real display, a real controller, and the full drive on the final tile build, which differs from the tested build only in ground colour.
- Handbrake feel, and windows at distance while moving.

## Known problems

- **First load:** the screen stays dark with no progress shown while tiles arrive. It took about 20–30 seconds once in a hidden browser pane, which isn't a fair measure, so time it on a real visible load.
- **Hitch:** the 200–700 ms frames at tile landings were mostly a measuring artefact (the tool ran uncapped and queued 1.8 s of GPU work). A capped drive tops out at 54.5 ms. `tools/landings.mjs` still shows one 194 ms first landing that wasn't explained and didn't appear in the real drive.
- **433 buildings have no collision** because they're within 1.2 m of a motor road, driveways included. Roads through solids in the town centre are unchecked.
- **Art:** ground is soft close up, Mariehamn's streets are large flat tan areas, ground fill near buildings can smear, pines read as lollipops, windows are large and uniform, all barns are grey, and the road shoulder is wide.
- **Junction notch:** a small green notch shows where a service road meets Route 1 near a seam, at about 100637, 6690000.
- **Rough roads:** some quiet Mariehamn streets remain rough, up to about 2 g.

## Decisions waiting on the owner

1. **The look.** Drive it and judge the art direction. This closes Phase 4, and sets how realistic the game is and the car style.
2. **Hosting.** Supabase holds about 225 MB in four tile versions; three are superseded and can be deleted. Free's 5 GB of egress is about a dozen players seeing the whole island. Stay while it's the owner's own game, and move to Cloudflare R2 before sharing it widely: a copy and one address. Nothing has moved.
3. **Generated textures.** The shader's walls were enough for this pass, so neither the Gemini texture nor the code-made textures are in the game. Keep shader walls, or try the texture library from the plan? AI disclosure is only needed if generated textures ship.

## What's next

After the owner's judgement, in order:

1. Fix whatever the judgement finds, starting with the ground close up, which fills the most of the screen.
2. Add a simple loading state.
3. Decide on the small roadside kit (lamps, poles, signs), which was skipped to stay on the core.
4. Start Phase 5, the whole island. Order the remaining NLS sheets (80 for Åland, nine ordered so far, plus L2334E already decoded), run them through the pipeline, then build the map, GPS and bridges. A full island is roughly 400 MB for one player to see everything once, so settle hosting first.

## Useful leftovers

- **NLS 3D orders:** MapSite's Buildings 3D page, with `?lang=en&n=<north>&e=<east>&zoom=9` to centre the map. In a 1400×900 window: choose LOD2, then click the sheet tool, click the map, click the tool again, hover and drag a box until "N map sheets selected" shows. Confirm the sheets in the cart, enter the email twice, tick the licence box itself and order. The confirmation page's `/lataukset/<uuid>` link maps to `/karttapaikka/api/purchaseorders/downloadables/<uuid>`, which lists the zip links. The owner has approved ordering NLS data with kyle1235@gmail.com on CC BY 4.0 terms without asking again; anything else on that page, such as an account or payment, goes back to the owner.
- **Texture work and town-centre analysis** live only in a temporary session folder and will be lost. Gemini's original red timber image is in the owner's Downloads. The code-made textures would need regenerating, and the findings that matter are already in `CLAUDE.md`.
- **Gemini prompts:** ask for one image per new chat, starting with "Generate an image:". Plain requests failed with an access error more than once, with no known cause.

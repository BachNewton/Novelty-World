# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

It lives at Games → 3D Games → Åland Drive. So far it is a viewer: one real 6×6 km tile (L2343C, inland Hammarland, with main road 1 and a junction), its terrain under baked shading and its roads on top, seen from a free camera (WASD, Q and E, drag to look, the wheel for speed). There is no car, physics, streaming or gameplay yet.

## Platform

Web only, WebGPU only, three.js driven directly with no React Three Fiber, and Rapier for physics. It never moves to a native engine. A browser without WebGPU is told the game needs it.

The render (`render/game.ts`) is one renderer, one scene and one loop. The page (`components/aland-drive.tsx`) only starts it and stops it; nothing in the game renders through React. `window.__alandDrive` is the probe for tools, waiting on events rather than time: its frame count, its draw and triangle counts, and a camera move. `tools/look.mjs` takes a screenshot from any place on the map, in headless Playwright with `channel: "chromium"`, because the default headless shell falls back to WebGL2 here.

The scene is east +x, up +y and north -z. The renderer uses a reversed depth buffer, where a polygon offset pushed the roads under the ground, so roads clear the terrain by a small lift instead.

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch.

The target is a steady 60 fps, drawing the 3D world below screen resolution and scaling it up, with the UI sharp.

## Graphics approach

Start simple, and add a feature only when it fixes something visibly wrong and its cost is known.

- **Bake ahead of time what can be baked**: terrain shading and soft shadows from the 2 m data.
- **Spend detail near the car.**
- **Keep distance cheap**: simplified terrain, card trees, haze.
- **Rapier only needs the ground around the car.**
- **Measure by counts** (draw calls, triangles) and the GPU's timestamp queries, per the repo's speed rule.

## Art direction

Undecided until a prototype shows how the real data looks. Expected: real land and road layout, with simpler generated buildings and trees. Cars are invented, with no real brands, and must match the world's art style; they stay placeholder until that is judged.

## Data

**Confirmed, each by decoding a real file for this area:**

- **NLS Finland 2 m elevation model** (CC BY 4.0), in ETRS-TM35FIN, as 6×6 km tiles of 3000×3000 samples, from the mirror `https://mirrors.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/`. Land tiles are about 20–25 MB. Samples are 32-bit floats with no nodata anywhere, tagged as areas, so a sample's centre is 1 m in from its tile's edge.
- **OpenStreetMap** (ODbL) has about 18,000 road and path ways and 27,700 buildings in a box around the island. Its roads are measured below.
- **kartor.ax** (CC BY 4.0) has 19 datasets, none of them terrain, roads, buildings or imagery, but its traffic counts and landmark layers are useful.
- **NLS Topographic Database** (CC BY 4.0): `maastotietokanta/2025/shp/L2/L23/L2343L.shp.zip` on the same mirror has 96 km of classed roads and drives, 56 km of tracks and paths and about 880 building footprints on tile L2343C alone. Its shapefile sheets are named by left and right halves (`L2343L`, `L2343R`).
- **NLS orthophotos** (CC BY 4.0): `orto/normal_color_3067/mara_v_25000_50/2025/L23/02m/1/L2343C.jp2` is 12000×12000 RGB at 0.5 m, flown in 2025, 107 MB. The index `ortho_newest` lists 140 sheets in a box around the island.
- **NLS laser point clouds** (CC BY 4.0): `laserkeilaus/2008_latest/2013/L234/1/L2343C1.laz` is a 3×3 km classified LAZ of 75 MB and 15.65 M points (1.7 per m²), scanned in 2013. Its ground points sit on the 2 m model (median 0.00 m, 90% within 0.14 m) and first returns stand up to 27 m above it, so tree heights are there. The index `2008_latest` lists 422 sheets in the same box.

**Unconfirmed or ruled out:** none.

## Pipeline

`pipeline/` is Python in its own venv: rasterio and pyproj bring GDAL's readers and PROJ's transforms, and NumPy does the rest. Nothing in it touches the game's code.

    python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

That builds the venv on first use, downloads what is missing into `.data/raw/` (gitignored, one folder per source, read as untrusted data) and writes a folder of plain files per tile to `public/aland-drive/tiles/`, described by its `tile.json`. A tile takes about 15 seconds. Its eight neighbours are downloaded too, because the seams and the shading need a rim of them.

- **Space:** every position is ETRS-TM35FIN metres minus one world origin for the whole island (`pipeline/grid.py`). Here the grid runs 0.155% larger than the ground, and its north is 6.25° off true north. The game uses grid metres as they are; anything that needs a real compass bearing has to allow for that.
- **Heights:** 1501×1501 nodes, 4 m apart, in centimetres, 2.2 MB after delta coding and gzip. Nodes sit on the corners of the 2 m samples, each the mean of four, so two neighbours compute the same row. Full 2 m heights don't fit a tile in git; physics can have them from the pipeline when phase 2 needs them.
- **Shading:** a 3000×3000 image at 2 m of sun, cast shadow and open sky, under 1 MB. It carries the fine relief that the 4 m mesh can't.
- **Water:** a 2 m mask. A lake or the sea is one exact level in the elevation model, which real ground never is, so water is any flat area over a hectare.
- **Roads and buildings:** OSM ways clipped exactly at the tile's edge, and footprints kept whole in the tile holding their middle. The viewer draws the roads; the footprints wait for phase 4. These two files stay under ODbL, which each states.

A tile is 3.4 MB, so this one tile is committed and the page works when deployed. The island's tiles can't live in git: phase 3's hosting replaces this.

Tests: `render/tile.test.ts` in Vitest for the tile's reader and the committed tile, and `pipeline/test_grid.py` (`pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline`) for sheet names, reprojection and clipping. `pipeline/audit.py` measures OSM's roads on a built tile, and `pipeline/check_edges.py` decodes real sea, shore and neighbouring tiles.

## What the data does

**OSM's roads, on tile L2343C.** Centrelines were checked against the raised strip of the road in the 2 m heights, every 10 m. Primary, secondary and tertiary roads sit on the real road: a median offset of 1–2 m and a P90 of 3–5 m, with the strip found at 82–98% of stations. NLS's own lines measure the same (median 1 m), which is the method's floor; lines moved 40 m aside find a strip at only 9% of stations, with a median offset of 10 m. Tracks and service roads mostly have no strip to measure (found at 26–46%).

Line against line, OSM has all of NLS's classed roads and tracks, 90% of its drives, 66% of its tractor ways and 40% of its paths, with a median gap of 0.5–1 m where both have the line, and 97% of OSM's motor roads have an NLS line beside them. In the heights alone, with no map, 30.7 km reads as road. OSM has 21.8 km of it, which is 96% of what either map confirms as a way; 7.9 km is on neither map, and the longest of those, checked on the orthophoto, are nearly all ditch banks, pit rims and shores.

So OSM's lines are good enough to lay roads from, and the Topographic Database is there for the drives and tractor ways it lacks.

**Edges.**

- **Sea has no nodata.** It is flat water, near 0.1 m in the open and a few centimetres apart between tiles (0.051 and 0.088 m meet at one seam), so the game must never take sea level from a tile's own numbers. Lakes are flat at their own level.
- **The land beside the sea** is close to water level, so water comes from the mask and not from a height test.
- **Water levels meet in a one-sample blend,** which the mask has to close or a line of land crosses the bay.
- **A mostly-sea tile is tiny:** K2444F builds to 0.04 MB. Its neighbour K2444D doesn't exist on the mirror: the pipeline treats a missing tile as open sea, and only a 404 means that.
- **Seams are clean.** Raw samples step across a seam no more than within a tile (median 7.4 cm against 8.1 on one, 1.7 against 2.0 on another), built neighbours share their edge row of heights exactly, and baked shading steps at a seam about as it does inside a tile.

## Hosting

For now the viewer's one tile is served from the app. Tiles move to Supabase Storage with streaming, fetched from one configurable base address, so they can move to Cloudflare R2 if measured download volume calls for it. Supabase Free is 1 GB of storage and 5 GB of egress a month; R2 has free egress.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule, and the game names them in a line on screen that links there. ODbL holds the tiles' road and building files to the same licence, so they are published as they are, each stating it.

## Phases

`docs/PLAN.md` holds the phases, why they run in that order, each phase's exit test and the risks.

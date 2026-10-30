# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

It lives at Games → 3D Games → Åland Drive. So far it is one drivable real 6×6 km tile (L2343C, inland Hammarland, with main road 1 and a junction): a placeholder car on Route 1, on a road surface and land baked from real data, in simple graphics. There is no streaming or gameplay yet.

## Controls

| | Keyboard | Controller |
|---|---|---|
| Accelerate | W or Up | RT |
| Brake, then reverse | S or Down | LT |
| Steer | A and D, or Left and Right | Left stick |
| Handbrake | Space | A |
| Back to the nearest road | R | Y |
| Chase or front-bumper view | C | RB |
| Free camera | F | View |

The free camera is for inspection: WASD, Q and E, Shift, drag to look, the wheel for its speed. There is no touch. Prompts come from the shared glyphs and follow the last input used.

## Platform

Web only, WebGPU only, three.js driven directly with no React Three Fiber, and Rapier for physics. It never moves to a native engine. A browser without WebGPU is told the game needs it.

The render (`render/game.ts`) is one renderer, one scene and one loop. The page (`components/aland-drive.tsx`) only starts it and stops it, and shows the speed and the prompts; nothing in the game renders through React. After `renderer.init()` the game checks the backend really is WebGPU, because three drops to WebGL2 by itself when a device can't be made, and the page shows the same message as with no adapter.

`window.__alandDrive` is the probe for tools, waiting on events rather than time: frames, draw calls, triangles, GPU time and the size drawn, the car's state and its drive log, a hold that stops the simulation following the clock, `advance` to step it by hand, the scripted driver and the camera. `tools/look.mjs` takes a screenshot from any place on the map, and `tools/drive.mjs` runs the scripted drive along Route 1 and prints what it did and cost, both in headless Playwright with `channel: "chromium"`, because the default headless shell falls back to WebGL2 here.

The scene is east +x, up +y and north -z. The renderer uses a reversed depth buffer.

## The car

`sim/` is the simulation, with no renderer in it, so it runs in tests as it does in the page. All its numbers are in `sim/tuning.ts`; the cameras' are at the top of `render/chase-camera.ts`.

- **A rigid body on four rays** (`sim/car.ts`): each wheel's ray finds the surface, a spring holds the body up, and the tyre pushes on the body at the contact, so weight transfer, squat, dive and lean all come from the same forces. Rapier's own ray-cast vehicle isn't used: its tyres are one clamped friction, with no slip curve to shape a handbrake slide or the grip at 200 km/h.
- **A fixed step of 120 Hz**, with no clock in the simulation: the same inputs play out the same. Each frame draws the car between its last two steps.
- **The car's state** (`CarState`, `sim/car-state.ts`) is one small record that survives JSON, and the car is drawn from it and nothing else, ready to be sent to other players.
- **The tile's edge** is a wall with a low coloured band on it: there's nothing beyond it yet. **Water** has no depth in the data, so a car in it is dragged to a stop and put back on the nearest road within a few seconds, as is a car left on its side or roof. A road over water doesn't count as water.
- **What the car collides with is what's drawn** (`sim/ground.ts`): the same triangles of ground and road, in 120 m blocks, three by three round the car. A triangle mesh rather than Rapier's heightfield, so the diagonals are the render's by construction; `sim/drive.test.ts` holds the two copies together.

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch.

The target is a steady 60 fps, drawing the 3D world at 70% of the screen each way (`RENDER_SCALE` in `render/game.ts`) and letting the browser stretch the canvas, with the UI sharp in the page above it. The frame meter is the shared stats.js one; a timestamp query gives the GPU time.

A chase view on Route 1 is 60–100 draw calls and 2–4 M triangles, nearly all of it the terrain at its one level of detail, since 214,000 of them are roads. That leaves the GPU time far inside the budget on the floor's own adapter, so distance detail waits for phase 3.

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
- **Heights:** 1501×1501 nodes, 4 m apart, in centimetres, 2.2 MB after delta coding and gzip. Nodes sit on the corners of the 2 m samples, each the mean of four, so two neighbours compute the same row. The car collides with these same nodes: off the road, 2 m heights would add only a difference of 0.5 cm at the median and 13 cm at the 99th percentile, and only if the drawn mesh changed to match, or the car would drive on ground that isn't there.
- **Shading:** a 3000×3000 image at 2 m of sun, cast shadow and open sky, under 1 MB, baked from the ground as the roads leave it. It carries the fine relief that the 4 m mesh can't.
- **Water:** a 2 m mask, and a byte per height node for the simulation. A lake or the sea is one exact level in the elevation model, which real ground never is, so water is any flat area over a hectare.
- **Roads and buildings:** OSM ways clipped exactly at the tile's edge, and footprints kept whole in the tile holding their middle. The footprints wait for phase 4. The raw roads, the footprints and the road surface stay under ODbL, which each states.
- **The road surface** (`pipeline/roads.py`): see below.

A tile is 4.7 MB, so this one tile is committed and the page works when deployed. The island's tiles can't live in git: phase 3's hosting replaces this.

Tests: `render/tile.test.ts` and `sim/drive.test.ts` in Vitest, `e2e/aland-drive.spec.ts` in Playwright (the full Chromium, by name), and `pipeline/test_grid.py` and `pipeline/test_roads.py` (`pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline`). `pipeline/audit.py` measures OSM's roads on a built tile, `pipeline/road_audit.py` measures the surface built from them, and `pipeline/check_edges.py` decodes real sea, shore and neighbouring tiles.

## The road surface

Roads are baked, so the render and the physics read one surface. OSM's lines are the only source so far: every road the tile needs is in them.

- **Chains.** Ways are cut at every shared point and rejoined into continuous drives, the greatest road first, each carrying on through a junction the straightest way until it meets a road already laid. A lesser road ends on the greater one, and a crossroads is two T-junctions. Chain 0 is the tile's main road.
- **Line.** Stations every 2 m, rounded along the line with a Gaussian scaled by class, both ends fixed.
- **Height.** A Whittaker smoother over the median of the ground across the road, with the shortest wavelength it keeps set by class (280 m on a primary road, 30 m on a path). A bridge's stations carry no weight, so it spans.
- **Cross-section.** Width by class, a crown, and banking on bends up to a class's limit. Each cross-section is five points: the carriageway's edges and centre, and a shoulder each side whose outer point lies on the ground. The shoulder fades to the ground's colour, which is what hides the join from a low camera.
- **Junctions.** A lesser road flares, eases on to the greater road's plane over its last 16 m, and its edges slide along the greater road's edge. A shoulder that would rise through another road is dropped under it.
- **Ground.** Cut or filled to 12 cm under the road for the shoulder and one mesh cell beyond, then eased back to the real land over a blend set by class. Then any node of a cell a carriageway crosses is pressed under it, so no triangle comes up through the road.
- **Thinning.** Cross-sections are kept only where the road would otherwise move 2 cm, up to 14 m apart: 27,000 sections and 214,000 triangles from 127 km of road, 1.4 MB.

**Seams.** A tile's edge row of heights is never changed: the blend fades to nothing over 24 m and the build fails if the row moves. A road crossing the edge is pinned to a plane fitted to the elevation model within 24 m of the crossing, and its slope to that plane's, lifted to clear the edge row, so two tiles built apart compute the same end. Within a metre of the edge the ground can still stand a few centimetres above a road, on the last row that can't move. Phase 3 should expect the shading near a road at a seam to differ a little from the neighbour's, whose rim was the raw ground. Only L2343C and L2343E have OSM kept in `.data/raw/osm/`, so neighbours need Overpass to answer first.

**On Route 1,** measured over the baked ribbon: the worst vertical curve goes from a 781 m radius in the raw model to 4150 m, a 6 m-chord roughness from 6.3 mm to 0.7 mm, and the line stays within 1.03 m of OSM's and 0.25 m of the model's height.

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

For now the one tile is served from the app. Tiles move to Supabase Storage with streaming, fetched from one configurable base address, so they can move to Cloudflare R2 if measured download volume calls for it. Supabase Free is 1 GB of storage and 5 GB of egress a month; R2 has free egress.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule, and the game names them in a line on screen that links there. ODbL holds the tiles' road and building files to the same licence, so they are published as they are, each stating it.

## Phases

`docs/PLAN.md` holds the phases, why they run in that order, each phase's exit test and the risks.

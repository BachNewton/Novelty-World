# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

It lives at Games → 3D Games → Åland Drive. So far it is nine real 6×6 km tiles round L2343C, from Hammarland down to Mariehamn, streamed in as the car moves: a placeholder car on real roads, on a surface and land baked from real data, in simple graphics. There is no gameplay yet.

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

`window.__alandDrive` is the probe for tools, waiting on events rather than time: frames, draw calls, triangles, GPU time and the size drawn, the car's state and its drive log, what the stream has done, a hold that stops the simulation following the clock, `advance` to step it by hand, the scripted driver and the camera.

The tools run against local tiles, never the real host: `tools/serve-tiles.mjs` serves a folder of them and counts the bytes it sent, and a page takes it with `?tiles=local:<port>`. `tools/look.mjs` takes a screenshot from any place on the map. `tools/make-routes.ts` writes the scripted routes beside the tiles (edge to edge, through all nine, and a long wander), and `tools/drive.mjs` drives one and prints what it did, cost and downloaded, held and stepped by hand, or with `--clock` at real speed, which is the one that says whether anything stalled. `tools/road-check.ts` drives every motor road in the simulation alone. The browser tools use headless Playwright with `channel: "chromium"`, because the default headless shell falls back to WebGL2 here.

The scene is east +x, up +y and north -z. The renderer uses a reversed depth buffer.

## The car

`sim/` is the simulation, with no renderer in it, so it runs in tests as it does in the page. All its numbers are in `sim/tuning.ts`; the cameras' are at the top of `render/chase-camera.ts`.

- **A rigid body on four rays** (`sim/car.ts`): each wheel's ray finds the surface, a spring holds the body up, and the tyre pushes on the body at the contact, so weight transfer, squat, dive and lean all come from the same forces. Rapier's own ray-cast vehicle isn't used: its tyres are one clamped friction, with no slip curve to shape a handbrake slide or the grip at 200 km/h.
- **A fixed step of 120 Hz**, with no clock in the simulation: the same inputs play out the same. Each frame draws the car between its last two steps.
- **The car's state** (`CarState`, `sim/car-state.ts`) is one small record that survives JSON, and the car is drawn from it and nothing else, ready to be sent to other players.
- **The end of the world** is a wall with a low coloured band on it, on every side of a tile with no tile beyond. **Water** has no depth in the data, so a car in it is dragged to a stop and put back on the nearest road within a few seconds, as is a car left on its side or roof. A road over water doesn't count as water.
- **What the car collides with is what's drawn** (`sim/ground.ts`): the same triangles of ground and road, in 120 m blocks on one lattice for the whole world, three by three round the car. A triangle mesh rather than Rapier's heightfield, so the diagonals are the render's by construction; `sim/drive.test.ts` holds the two copies together. A block doesn't know which tile its heights and roads came from, so the car feels nothing at a tile's edge, and `sim/world.test.ts` pins that.
- **The world** (`sim/world.ts`) is all the land the game knows, with no GPU in it, for the simulation and the terrain alike. Every tile has far heights from the start, and those near the car have detail. Ground with no detail yet answers from the far heights, for what's drawn and what's driven on alike, so the car can't find a hole, only coarser ground with no roads.

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch.

The target is a steady 60 fps, drawing the 3D world at 70% of the screen each way (`RENDER_SCALE` in `render/game.ts`) and letting the browser stretch the canvas, with the UI sharp in the page above it. The frame meter is the shared stats.js one; a timestamp query gives the GPU time.

A chase view anywhere in the nine tiles is 45–70 draw calls and 0.45–0.6 M triangles at 2408×1007, of which about 0.4 M is the terrain, fixed, wherever the car is. On the floor's own adapter that's a median of 1.6 ms of GPU time and 6 ms at the slowest, measured on a real-time drive through all nine tiles. A tile's single-level wide view used to be 4.6 M.

## Streaming and distance

- **Tiles load round the car** (`render/stream.ts`): any tile within 2.2 km has its detail, and it goes at 2.8 km, so a car running along an edge doesn't load one back and forth. That reach is worked back from the top speed: the detail is first seen at 1.4 km, and 800 m is 14 seconds at 55 m/s, room for the two or three tiles that fall due together at a corner, one after another, over a slow connection. At this reach never more than four tiles are at full detail. Loading follows the car's position and each tile landing, with no timers. In the free camera it follows the camera.
- **Far first.** The far data of every tile comes before the drive starts: heights every 16 m, shading at 8 m and a surface mask at 4 m, about 0.25 MB a tile. Nothing beyond the detail radius costs more than that.
- **Off the main thread** (`render/tile.worker.ts`): the fetch, inflating, image decoding and mipmaps, and turning heights and roads into the arrays the game uses. What's left on the main thread is copying to the GPU, a slice of a tile's images a frame, and a tile counts as loaded only once all of it's there. A fetch that fails stops the game with a message on screen, and a test holds that.
- **The terrain is one mesh** (`render/clipmap.ts`), a clipmap: seven square rings of 192 cells that follow the camera, each ring's cells twice the size of the one inside, out to 25 km. Each ring's heights are a small texture copied from the world when it moves. A vertex is only a place in that texture, so tiles don't exist as far as the mesh is concerned: a seam can't show. A ring's vertices fold on to the next ring's lattice with distance, so rings meet without a crack and nothing pops, and the innermost ring is exactly the 4 m mesh the car collides with. Its triangle count doesn't grow with the number of tiles. This beat per-tile chunks with skirts, which would have needed geometry built and uploaded for each tile, seams hidden rather than absent, and more of both at island scale.
- **One shader for every tile** (`render/tile-layers.ts`): each kind of image is an array texture with a layer per tile, and a pixel finds its tile from where it is. So tiles cost no draw calls, and two tiles meet within a pixel. The image coordinates jump at a tile's edge, so the sampling's rate comes from world position, or a line of the blurriest mip would mark every seam.
- **Roads with distance.** Ribbons are cut into 600 m cells, shown within 1.2 km. Terrain paints its own roads from the mask, fading in from 250 m: under the ribbons, it only shows where a coarser ring rises through one, in the same colour, and past them it is the road. Paint fades by itself below a pixel. The 2 m shading gives way to the far shading between 1 and 1.4 km.
- **Past the last tile** is the sea plane and haze. The world's end is a deliberate wall.

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
- **NLS 3D buildings** (CC BY 4.0): CityGML LOD2 by 6×6 km sheet, from a 2022 scan, with 80 Åland sheets. They aren't on the mirror: MapSite's Buildings 3D page takes a free order of up to 100 sheets with an email address, and the zip's link comes back from the order's page and by email. Three sheets were decoded.

| | L2343C rural | L2334F north town | L2334E town centre | Central grid only |
|---|---|---|---|---|
| Buildings | 639 | 3,405 | 3,070 | 425 |
| Built area modelled | 91% | 97.5% | 97.1% | 98.5% |
| Footprints of 20 m² or more missing | 14% | 5% | 4.6% | 2.7% |
| Median roof distance from laser | 8 cm | 10 cm | 11 cm | 6 cm |
| Triangles | 18,000 | 129,000 | 133,000 | 33,000 |
| Gzipped | 85 kB | 624 kB | 634 kB | |

The model has real roof shapes as geometry and nothing else: no textures, windows or doors, and its `roofType`, `function` and `creationDate` are constants. Nothing under 20 m² is modelled, so sheds and about 11,700 footprints across the island need a generated shape. Joined buildings are one solid. Walls are sunk into the ground on purpose, about 0.8 m at the median, but a few dozen float, so walls get extended down. A building crossing a sheet edge lives in one sheet only, so sheets are processed with their neighbours. Rings can hold duplicate vertices and holes, and a few faces are invalid and need repair.

In Mariehamn, ordinary blocks and the esplanade houses are right. Landmarks vary: Sjöfartsmuseet, the Savoy, Ålands museum and the Västerhamn terminal read well; the water tower has no building at all, the towers of S:t Görans and the town hall are cut short, and the terminal's walkways are solid walls. At least one solid is false, a 34.6 m slab about 19 m above the laser at 108027, 6683455. Eleven solids contain OSM drivable roads, which needs checking before routing through them. The whole island is estimated at about 34,600 buildings, 950,000 triangles and 4.6 MB gzipped, from these three sheets.

**Unconfirmed or ruled out:** none.

## Pipeline

`pipeline/` is Python in its own venv: rasterio and pyproj bring GDAL's readers and PROJ's transforms, and NumPy does the rest. Nothing in it touches the game's code.

    python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

That builds the venv on first use, downloads what is missing into `.data/raw/` (gitignored, one folder per source, read as untrusted data) and writes a folder of plain files per tile to `.data/tiles/`, described by its `tile.json`, and `world.json` listing them all with a version hashed from their contents. A tile takes about 15 seconds. Its eight neighbours' elevation is downloaded too, because the seams and the shading need a rim of them. A tile the mirror doesn't have is open sea and stays out of the world.

`pipeline/upload.py` publishes that folder (see Hosting), and won't unless `pipeline/check_seams.py` passes.

- **Space:** every position is ETRS-TM35FIN metres minus one world origin for the whole island (`pipeline/grid.py`). Here the grid runs 0.155% larger than the ground, and its north is 6.25° off true north. The game uses grid metres as they are; anything that needs a real compass bearing has to allow for that.
- **Heights:** 1501×1501 nodes, 4 m apart, in centimetres, 2.2 MB after delta coding and gzip. Nodes sit on the corners of the 2 m samples, each the mean of four, so two neighbours compute the same row. The car collides with these same nodes: off the road, 2 m heights would add only a difference of 0.5 cm at the median and 13 cm at the 99th percentile, and only if the drawn mesh changed to match, or the car would drive on ground that isn't there.
- **Shading:** a 3000×3000 image at 2 m of sun, cast shadow and open sky, under 1 MB, baked from the ground as the roads leave it. It carries the fine relief that the 4 m mesh can't.
- **Water:** a byte per height node for the simulation, and the mask's red channel. A lake or the sea is one exact level in the elevation model, which real ground never is, so water is any flat area over a hectare.
- **Surface mask:** 1500×1500 at 4 m: water, then the coverage of main roads and of lesser ones, drawn from the road surface.
- **Far data:** every fourth height node, the same numbers as the 4 m grid where the two meet, and the shading reduced to 8 m.
- **Roads and buildings:** OSM ways clipped exactly at the tile's edge, and footprints kept whole in the tile holding their middle. The footprints wait for phase 4. The raw roads, the footprints and the road surface stay under ODbL, which each states. OSM comes from its own API, not Overpass, whose public servers are too often down: a tile's box at a time, in quarters if it's over the API's limit of 50,000 nodes, each answer kept in `.data/raw/osm-api/` so a fetch that stops resumes where it was. It's meant for this size of request. The whole island's roads would be a job for a Geofabrik extract (Finland is 774 MB).
- **The road surface** (`pipeline/roads.py`): see below.

Tiles don't live in git. One does: `fixture/` is L2343C with a `world.json` of its own, a whole world of one tile, for the tests. It needn't match what's published, and only needs refreshing when the format changes.

Tests: `render/tile.test.ts`, `sim/drive.test.ts` and `sim/world.test.ts` in Vitest, on the fixture and on tiles made up in the test, `e2e/aland-drive.spec.ts` in Playwright (the full Chromium, by name), serving the fixture to itself, and `pipeline/test_grid.py` and `pipeline/test_roads.py` (`pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline`). `pipeline/audit.py` measures OSM's roads on a built tile, `pipeline/road_audit.py` measures the surface built from them, `pipeline/check_edges.py` decodes real sea, shore and neighbouring tiles, and `pipeline/check_seams.py` measures every shared edge of the built tiles.

## The road surface

Roads are baked, so the render and the physics read one surface. OSM's lines are the only source so far: every road the tile needs is in them.

- **Chains.** Ways are cut at every shared point and rejoined into continuous drives, the greatest road first, each carrying on through a junction the straightest way until it meets a road already laid. A lesser road ends on the greater one, and a crossroads is two T-junctions. Chain 0 is the tile's main road.
- **Line.** Stations every 2 m, rounded along the line with a Gaussian scaled by class, both ends fixed.
- **Height.** A Whittaker smoother over the median of the ground across the road, with the shortest wavelength it keeps set by class (280 m on a primary road, 30 m on a path). A bridge's stations carry no weight, so it spans.
- **Cross-section.** Width by class, a crown, and banking on bends up to a class's limit. Each cross-section is five points: the carriageway's edges and centre, and a shoulder each side whose outer point lies on the ground. The shoulder fades to the ground's colour, which is what hides the join from a low camera. Where the land falls away from a road, on a bridge or over an underpass, the shoulder stops a metre down and stays a deck: reaching for the ground it would be a wall across whatever passes beneath.
- **Junctions.** A lesser road flares, eases on to the greater road's plane over its last 16 m, and stops with its edges and its centre along the greater road's edge. A shoulder that would rise through another road is dropped under it. A lesser road or path that runs across a greater one with no junction passes just under it, so the surface a car meets at any crossing is the greater road's.
- **Ground.** Cut or filled to 12 cm under the road for the shoulder and one mesh cell beyond, then eased back to the real land over a blend set by class. Then any node of a cell a carriageway crosses is pressed under it, so no triangle comes up through the road.
- **Thinning.** Cross-sections are kept only where the road would otherwise move 2 cm, up to 14 m apart: 27,000 sections and 214,000 triangles from 127 km of road, 1.4 MB.

**Seams.** A tile's edge row of heights is never changed: the blend fades to nothing over 24 m and the build fails if the row moves. A road crossing the edge ends on a seam section read only from what both tiles see the same: the whole way's direction there, from a chord across the edge; its class's widths; no banking; and a height and slope from a plane fitted to the elevation model within 24 m of the crossing, lifted to clear the edge row. The last 40 m of road ease on to it. The section is rounded to the millimetre, so two tiles built apart write the same numbers, whichever way their chains run and whatever junction lies near. Dashes are counted from a seam, and centred on it. All 130-odd crossings of the nine tiles match exactly. The only ends without a partner are a track that dips a few centimetres over an edge for 6 m and back.

The shading beside a road at a seam still comes from each tile's own view of its neighbour, whose rim is the raw ground. Measured along every seam it steps a median of 3–4/255 near a road against 2 elsewhere, with the same top end, and it doesn't show.

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

**Mariehamn's roads.** L2334F, the town's northern tile, has eight times the road parts of a country tile and costs nearly twice the bytes. Its bypass runs on an embankment with cycle underpasses that OSM tags as tunnels. The elevation model has no tunnel: the lesser road cuts a slot through the embankment, under the greater road's ribbon, which stays up as a deck.

**How rough the roads are.** The scripted driver down all 843 km of the nine tiles' motor roads, each at a speed its class can carry (`tools/road-check.ts`), finishes every one. A wheel drop at the very start of a road is only the car being put down, four wheels at once, and doesn't happen on the way. Drops on the way are real, and on 63 of 1410 lines: narrow roads where a wheel runs off the edge or a crossing lifts it, nearly all at town speeds. 48 lines go over 0.6 g, at worst 2.7 g, in Mariehamn's service roads. The worst on a main road is 1.7 g, a tertiary crossing a greater road at 140 km/h, where the two approaches each ease up to the road between.

## Hosting

Tiles live in the public bucket `aland-drive-tiles` on the site's Supabase project, one folder per build under its version, and `render/tile-address.ts` is the one place that says so: the base address is the Supabase URL, the bucket and `TILES_VERSION`. Moving to another host is copying a folder and changing that one function. The files never change once published and carry a year's cache, so a browser keeps them; a rebuild is a new folder and a new `TILES_VERSION`, committed with whatever needs it, so a deployed page only ever sees the tiles it was built with. `pipeline/upload.py` creates the bucket if it's missing and uploads what isn't there, reading the service-role key from `.env.local`. Old versions stay until someone clears them.

Nothing in the tests or tools touches that host: they serve tiles to themselves on localhost.

**Data per drive**, counted by the bytes a local server really sent: starting the game is 11.4 MB, far data for all nine tiles and the start tile's detail, of 40.8 MB published. New ground costs 0.44–0.66 MB per km, 47–91 MB per hour at a driver's pace. A 100 km wander through the nine tiles fetched only 27 MB, 0.27 MB/km, because a tile once fetched comes from the browser's cache, and driving a route again fetches nothing. So a player's download is bounded by the map, not by the hours: for the main island, about 60 tiles at this size, some 270 MB and 15 MB of far data, about 285 MB for one person to see all of it once.

Against Supabase Free's 5 GB of egress a month that's about 17 new players who see everything, or about 50 first hours of about 100 MB each. Pro's 250 GB is fifty times that. R2 has no egress charge and 10 GB free. So stay on Supabase while the game is the owner's own, and move before it's shared widely: the move is a copy and one address.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule, and the game names them in a line on screen that links there. ODbL holds the tiles' road and building files to the same licence, so they are published as they are, each stating it.

## Phases

`docs/PLAN.md` holds the phases, why they run in that order, each phase's exit test and the risks.

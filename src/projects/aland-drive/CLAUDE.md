# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

It lives at Games → 3D Games → Åland Drive. It is the whole main island, 54 tiles of road and the 40 around them, streamed in as the car moves: a placeholder car on real roads, on land coloured by the real aerial photos, among forest grown from the laser data and buildings from NLS's 3D data and footprints, with a mini map, a world map and a GPS. There is no gameplay yet.

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
| World map | M | Menu |

On the world map, which pauses the drive: a click or A sets a destination, the wheel or the triggers zoom, a drag or the right stick pans, the left stick moves a pad's cursor, X clears the route, and Esc, M, B or Menu closes it.

Keys 1 to 9 and 0 jump the car to the showcase spots (`render/showcase.ts`), with the first load's bar while the tiles there land and the spot's name on arrival. They have no prompt and no controller button. `tools/showcase.mjs` screenshots all ten through the probe, the repeatable view set for art and performance checks.

The free camera is for inspection: WASD, Q and E, Shift, drag to look, the wheel for its speed. There is no touch. Prompts come from the shared glyphs and follow the last input used.

## Platform

Web only, WebGPU only, three.js driven directly with no React Three Fiber, and Rapier for physics. It never moves to a native engine. A browser without WebGPU is told the game needs it.

The render (`render/game.ts`) is one renderer, one scene and one loop. The page (`components/aland-drive.tsx`) only starts it and stops it, and shows the speed and the prompts; nothing in the game renders through React. After `renderer.init()` the game checks the backend really is WebGPU, because three drops to WebGL2 by itself when a device can't be made, and the page shows the same message as with no adapter.

`window.__alandDrive` is the probe for tools, waiting on events rather than time: frames, draw calls, triangles, GPU time and the size drawn, the car's state and its drive log, what the stream has done, a hold that stops the simulation following the clock, `advance` to step it by hand, the scripted driver and the camera.

The tools run against local tiles, never the real host: `tools/serve-tiles.mjs` serves a folder of them and counts the bytes it sent, and a page takes it with `?tiles=local:<port>`. `tools/look.mjs` takes a screenshot from any place on the map. `tools/drive.mjs` drives a route the game's own GPS sets (`--gps=<x,z;x,z;...>`) and prints what it did, cost, held and downloaded, held and stepped by hand, or with `--clock` at real speed, which is the one that says whether anything stalled. `tools/landings.mjs` walks the load focus round the world so tiles land over and over, and prints what each cost. `tools/road-check.ts` drives every motor road in the simulation alone, and `tools/bridge-check.ts` every span, both ways. The browser tools use headless Playwright with `channel: "chromium"`, because the default headless shell falls back to WebGL2 here.

The scene is east +x, up +y and north -z. The renderer uses a reversed depth buffer.

## The car

`sim/` is the simulation, with no renderer in it, so it runs in tests as it does in the page. All its numbers are in `sim/tuning.ts`; the cameras' are at the top of `render/chase-camera.ts`.

- **A rigid body on four rays** (`sim/car.ts`): each wheel's ray finds the surface, a spring holds the body up, and the tyre pushes on the body at the contact, so weight transfer, squat, dive and lean all come from the same forces. Rapier's own ray-cast vehicle isn't used: its tyres are one clamped friction, with no slip curve to shape a handbrake slide or the grip at 200 km/h.
- **A fixed step of 120 Hz**, with no clock in the simulation: the same inputs play out the same. Each frame draws the car between its last two steps.
- **The car's state** (`CarState`, `sim/car-state.ts`) is one small record that survives JSON, and the car is drawn from it and nothing else, ready to be sent to other players.
- **The end of the world** is a wall with a low coloured band on it, on every side of a tile with no tile beyond. **Water** has no depth in the data, so a car in it is dragged to a stop and put back on the nearest road within a few seconds, as is a car left on its side or roof. A road over water doesn't count as water.
- **Buildings stop the car; trees don't.** A building's outline is a band of wall triangles in the same collision blocks, 6 m tall, from the pipeline's outlines, so the car never climbs a roof and a `sim/world.test.ts` case holds that it can't pass one at top speed. A building a motor road runs through gets no walls, which each tile's `solids.overRoads` counts. Trees have no collision: they are a shader's, with no list to collide with.
- **What the car collides with is what's drawn** (`sim/ground.ts`): the same triangles of ground and road, in 120 m blocks on one lattice for the whole world, three by three round the car. A triangle mesh rather than Rapier's heightfield, so the diagonals are the render's by construction; `sim/drive.test.ts` holds the two copies together. A block doesn't know which tile its heights and roads came from, so the car feels nothing at a tile's edge, and `sim/world.test.ts` pins that.
- **The world** (`sim/world.ts`) is all the land the game knows, with no GPU in it, for the simulation and the terrain alike. Every tile has far heights from the start, and those near the car have detail. Ground with no detail yet answers from the far heights, for what's drawn and what's driven on alike, so the car can't find a hole, only coarser ground with no roads.

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch.

The target is a steady 60 fps, drawing the 3D world at 70% of the screen each way (`RENDER_SCALE` in `render/game.ts`) and letting the browser stretch the canvas, with the UI sharp in the page above it. The frame meter is the shared stats.js one; a timestamp query gives the GPU time.

A chase view anywhere in the nine tiles is 70–90 draw calls and 1.1–1.4 M triangles at 2408×1007, of which about 0.4 M is the terrain and 0.6 M the forest, both fixed wherever the car is. On the floor's own adapter that's a median of 2.9 ms of GPU time and 5.7 ms at the 99th percentile, measured on a real-time drive through all nine tiles at 60 fps, whose longest frame was 55 ms.

## Streaming and distance

- **Tiles load round the car** (`render/stream.ts`): any tile within 2.2 km has its detail, and it goes at 2.8 km, so a car running along an edge doesn't load one back and forth. That reach is worked back from the top speed: the detail is first seen at 1.4 km, and 800 m is 14 seconds at 55 m/s, room for the two or three tiles that fall due together at a corner, one after another, over a slow connection. At this reach never more than four tiles are at full detail. Loading follows the car's position and each tile landing, with no timers. In the free camera it follows the camera.
- **Three steps of land, so nothing grows with the island.** The overview (`pipeline/overview.py`) is the whole world in two small files from the start: heights every 80 m with the forest on them, and the land's colour at 40 m with its light baked in. Far data, heights every 16 m, shading at 8 m and a surface mask at 4 m, is fetched per tile within 6 km of the car and dropped past 7.5 km, into a fixed pool of 16 layers. Detail is as above. Only the tiles round the start come before the drive does. The terrain fades from far images to the overview between 4.4 and 5.8 km, inside the reach every tile is sure to hold them, so tiles arriving at the edge never show as a line.
- **A landing costs a frame nothing** at a capped frame rate: about 1.4 s of slices, the worst frame near 20 ms. Uncapped, as a browser run with vsync off is, frames outrun the GPU by about 1.8 s of queued work and a texture copy blocks the main thread until that drains, for 200–700 ms a frame. No player meets that, because a display paces frames, so `tools/drive.mjs --clock` and `tools/landings.mjs` measure capped. A pipeline first used mid-drive would stall its frame while it compiled, so the game builds every mesh once before the drive starts.
- **Off the main thread** (`render/tile.worker.ts`): the fetch, inflating, image decoding and mipmaps, and turning heights and roads into the arrays the game uses. What's left on the main thread is copying to the GPU, a slice of a tile's images a frame, and a tile counts as loaded only once all of it's there. A fetch that fails stops the game with a message on screen, and a test holds that.
- **The terrain is one mesh** (`render/clipmap.ts`), a clipmap: seven square rings of 192 cells that follow the camera, each ring's cells twice the size of the one inside, out to 25 km. Each ring's heights are a small texture copied from the world when it moves. A vertex is only a place in that texture, so tiles don't exist as far as the mesh is concerned: a seam can't show. A ring's vertices fold on to the next ring's lattice with distance, so rings meet without a crack and nothing pops, and the innermost ring is exactly the 4 m mesh the car collides with. Its triangle count doesn't grow with the number of tiles. This beat per-tile chunks with skirts, which would have needed geometry built and uploaded for each tile, seams hidden rather than absent, and more of both at island scale.
- **One shader for every tile** (`render/tile-layers.ts`): each kind of image is an array texture with a layer per tile, and a pixel finds its tile from where it is. So tiles cost no draw calls, and two tiles meet within a pixel. The image coordinates jump at a tile's edge, so the sampling's rate comes from world position, or a line of the blurriest mip would mark every seam.
- **Roads with distance.** Ribbons are cut into 600 m cells, shown within 1.2 km. Terrain paints its own roads from the mask, fading in from 250 m: under the ribbons, it only shows where a coarser ring rises through one, in the same colour, and past them it is the road. Paint fades by itself below a pixel. The 2 m shading gives way to the far shading between 1 and 1.4 km.
- **The land's colour** is the photo at the same 2 m as the shading, near, and 8 m for every tile from the start, each a layer of an array texture. Its alpha fades the photo out over open water, so a shore is the photo's own rocks and reeds fading to the game's water, with no line drawn. Close up a tiling noise breaks the 2 m pixels up. A road's shoulder fades to the same image.
- **The forest** (`render/forest.ts`) is two fixed grids of instances that follow the camera, with no list of trees: an instance is a place on a world lattice, and the shader reads the tile's canopy image there for a height, and rolls the rest from the place, so a tree comes back the same and moving costs nothing. Turned shapes every 6 m to about 150 m, three-sided outlines every 12 m to 1.1 km, opaque, so there's no alpha test to shimmer or overdraw. Beyond that the terrain's own vertices rise by the canopy, fading in where the trees stop, so forest stands to the horizon for no extra triangles.
- **Buildings** (`render/buildings.ts`) stream with their tile, merged per 600 m cell, shown within the detail radius. There is no far version: past that a building is its roof in the photo. Their walls have no texture: boards, windows, door, corner boards and fascia are drawn in the shader from each facade's real width and eaves, and fade out by the size of a pixel, so they can't shimmer. The generated wall textures weren't needed.
- **Past the last tile** is the sea plane and haze. The world's end is a deliberate wall, out at sea or on the far shore of the tiles around the island.
- **First load** shows a bar counting what has landed: the overview, each far tile round the start, the start's detail, and the shaders. The road network comes after the drive starts, so it can't hold the start up, and the maps show when it lands.

## Graphics approach

Start simple, and add a feature only when it fixes something visibly wrong and its cost is known.

- **Bake ahead of time what can be baked**: terrain shading and soft shadows from the 2 m data.
- **Spend detail near the car.**
- **Keep distance cheap**: simplified terrain, outlines of trees, haze.
- **Rapier only needs the ground around the car.**
- **Measure by counts** (draw calls, triangles) and the GPU's timestamp queries, per the repo's speed rule.

## Bridges

The elevation model has no bridges: it drops to the water under them. So a stretch of road held up over a gap is a span (`pipeline/roads.py`): a tagged motor bridge, or any road over water in the model, at least 12 m long. Shorter is a culvert and stays an ordinary road. A span's stations shape no ground, so the water stays water under it; its profile runs from bank to bank, rising a little over open water, and the shoulder stays a flat deck. Each chain lists its spans as section ranges in `tile.json`. `bridgeKit` (`render/bridges.ts`) is the one function that says what a bridge looks like: kerb, parapet, rail, fascia, underside and piers, plus the walls the car can't pass. Replacing the kit is replacing that function. No span in the island crosses a tile's edge. Causeways are real ground in the model and need nothing.

## Maps and GPS

`map/` is both maps and the GPS, with no renderer in it. The world map isn't a screen of its own: it is the game's render from high up. Opening it flies the camera from the car to straight above the island, north up, and closing it flies back; the car waits, and everything worked out by distance (detail, the rings of terrain, the forest, what streams) stays at the car, so opening the map fetches nothing. Haze and the terrain's painted roads go as the camera lifts, and two more rings of terrain show, which a drive never needs. Over that render a clear canvas carries the road network at a fixed width on screen, the route, the car, and names by zoom level. Picks and that canvas read the ground as flat, which is within a few pixels from these heights. Land away from the car is the overview's, 40 m a pixel, at every zoom. The road network is one file, `map.json.gz` (`pipeline/road_map.py`), built from OSM's whole ways, so tile edges mean nothing to it: junctions, roads between them with their line thinned to a metre, names, kinds, one-way flags, and whether the road can be reached from Eckerö. A road a ferry separates is drawn and never routed to. `road-graph.ts` is the network and an A* over it by rough speed per kind, starting the way the car faces where it can. `navigator.ts` follows the car each frame: the road it's on (a name has to last 25 m before it shows), progress along the route, a reroute once the car is 60 m off it, the next turn, and the mini map, which turns with the car and redraws only when it moved. `world-map.ts` holds the map's view and input, and redraws only when something changes. The mini map's land is the overview's image.

Grid north is 6.25° off true north (see Data), and both maps are drawn to grid north.

## Art direction

Clean, stylised realism: real land colour under a low-poly forest and flat-shaded buildings with real shapes, red houses with white trim. Detail comes from real data and simple shapes, not photographic textures. **All 3D models and textures are made from code:** no generative image models and no outside assets. Open geodata stays the world's base, aerial land colour included; other photos are reference only. Cars are invented, with no real brands, and match this style.

## Data

**Confirmed, each by decoding a real file for this area:**

- **NLS Finland 2 m elevation model** (CC BY 4.0), in ETRS-TM35FIN, as 6×6 km tiles of 3000×3000 samples, from the mirror `https://mirrors.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/`. Land tiles are about 20–25 MB. Samples are 32-bit floats with no nodata anywhere, tagged as areas, so a sample's centre is 1 m in from its tile's edge.
- **OpenStreetMap** (ODbL) has about 18,000 road and path ways and 27,700 buildings in a box around the island. Its roads are measured below.
- **kartor.ax** (CC BY 4.0) has 19 datasets, none of them terrain, roads, buildings or imagery, but its traffic counts and landmark layers are useful.
- **NLS Topographic Database** (CC BY 4.0): `maastotietokanta/2025/shp/L2/L23/L2343L.shp.zip` on the same mirror has 96 km of classed roads and drives, 56 km of tracks and paths and about 880 building footprints on tile L2343C alone. Its shapefile sheets are named by left and right halves (`L2343L`, `L2343R`).
- **NLS orthophotos** (CC BY 4.0): `orto/normal_color_3067/mara_v_25000_50/2025/L23/02m/1/L2343C.jp2` is 12000×12000 RGB at 0.5 m, flown in 2025, 107 MB. The index `ortho_newest` lists 140 sheets in a box around the island.
- **NLS laser point clouds** (CC BY 4.0): `laserkeilaus/2008_latest/2013/L234/1/L2343C1.laz` is a 3×3 km classified LAZ of 75 MB and 15.65 M points (1.7 per m²), scanned in 2013. Its ground points sit on the 2 m model (median 0.00 m, 90% within 0.14 m) and first returns stand up to 27 m above it, so tree heights are there. The index `2008_latest` lists 422 sheets in the same box.
- **NLS 3D buildings** (CC BY 4.0): CityGML LOD2 by 6×6 km sheet, from a 2022 scan, with 80 Åland sheets. They aren't on the mirror: MapSite's Buildings 3D page takes a free order of up to 100 sheets with an email address, and the zip's link comes back from the order's page and by email. Sheets go in `.data/raw/buildings3d/` as `<sheet>.gml`, by hand, and the pipeline generates a shape for every footprint they don't cover. `run.py --new-building-sheets` rebuilds only the tiles a sheet added since their build reaches.

| | L2343C rural | L2334F north town | L2334E town centre | Central grid only |
|---|---|---|---|---|
| Buildings | 639 | 3,405 | 3,070 | 425 |
| Built area modelled | 91% | 97.5% | 97.1% | 98.5% |
| Footprints of 20 m² or more missing | 14% | 5% | 4.6% | 2.7% |
| Median roof distance from laser | 8 cm | 10 cm | 11 cm | 6 cm |
| Triangles | 18,000 | 129,000 | 133,000 | 33,000 |
| Gzipped | 85 kB | 624 kB | 634 kB | |

The model has real roof shapes as geometry and nothing else: no textures, windows or doors, and its `roofType`, `function` and `creationDate` are constants. Nothing under 20 m² is modelled, so sheds and about 11,700 footprints across the island need a generated shape. Joined buildings are one solid. Walls are sunk into the ground on purpose, about 0.8 m at the median, but a few dozen float, so walls get extended down. A building crossing a sheet edge lives in one sheet only, so sheets are processed with their neighbours. Rings can hold duplicate vertices and holes, and a few faces are invalid and need repair.

In Mariehamn, ordinary blocks and the esplanade houses are right. Landmarks vary: Sjöfartsmuseet, the Savoy, Ålands museum and the Västerhamn terminal read well; the water tower has no building at all, the towers of S:t Görans and the town hall are cut short, and the terminal's walkways are solid walls. At least one solid is false, a 34.6 m slab about 19 m above the laser at 108027, 6683455. Eleven solids contain OSM drivable roads, which needs checking before routing through them. All 80 sheets are in the build.

**Unconfirmed or ruled out:** none.

## Pipeline

`pipeline/` is Python in its own venv: rasterio and pyproj bring GDAL's readers and PROJ's transforms, and NumPy does the rest. Nothing in it touches the game's code.

    python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

That builds the venv on first use, downloads what is missing into `.data/raw/` (gitignored, one folder per source, read as untrusted data) and writes a folder of plain files per tile to `.data/tiles/`, described by its `tile.json`, and `world.json` listing them all with a version hashed from their contents, beside the overview and the road map. A tile takes under a minute on one core once its raw data is there. Its eight neighbours' elevation is downloaded too, because the seams and the shading need a rim of them. A tile the mirror doesn't have is open sea and stays out of the world. `run.py --island --jobs 7` builds them all, a core each.

**Which tiles** is worked out, not listed by hand: `pipeline/island.py` starts on the road at Eckerö and walks OSM's motor roads out, fetching each tile they reach, until none leads anywhere new. Ferries aren't roads, so that's Fasta Åland and what bridges join to it: 54 tiles. Round those go the 40 neighbours the mirror has, so a shore has land and sea beyond it. `pipeline/island.json` holds the result. Seven of those outer tiles have no 2025 photo, and take 2022's; ten have no laser sheets, and so no trees.

`pipeline/upload.py` publishes that folder (see Hosting), and won't unless `pipeline/check_seams.py` passes.

- **Space:** every position is ETRS-TM35FIN metres minus one world origin for the whole island (`pipeline/grid.py`). Here the grid runs 0.155% larger than the ground, and its north is 6.25° off true north. The game uses grid metres as they are; anything that needs a real compass bearing has to allow for that.
- **Heights:** 1501×1501 nodes, 4 m apart, in centimetres, 2.2 MB after delta coding and gzip. Nodes sit on the corners of the 2 m samples, each the mean of four, so two neighbours compute the same row. The car collides with these same nodes: off the road, 2 m heights would add only a difference of 0.5 cm at the median and 13 cm at the 99th percentile, and only if the drawn mesh changed to match, or the car would drive on ground that isn't there.
- **Shading:** a 3000×3000 image at 2 m of sun, cast shadow and open sky, under 1 MB, baked from the ground as the roads leave it. It carries the fine relief that the 4 m mesh can't.
- **Water:** a byte per height node for the simulation, and the mask's red channel. A lake or the sea is one exact level in the elevation model, which real ground never is, so water is any flat area over a hectare.
- **Surface mask:** 1500×1500 at 4 m: water, then the coverage of main roads and of lesser ones, drawn from the road surface.
- **Far data:** every fourth height node, the same numbers as the 4 m grid where the two meet, and the shading reduced to 8 m.
- **Land colour** (`pipeline/ground.py`): the 2025 orthophoto reduced to 2 m and 8 m. It's flown high in spring, so one fixed grade takes off the haze, the same for every tile so seams don't step, with colour fading out in shadow, where it's the sky's blue. The deepest shadow is lifted, or it goes near to black once the render takes it to linear light. Under trees it's darkened, because the photo there is treetops, not ground. The photo leans, so a building's roof lies beside where it stands: round every building the nearest ground takes its place. A real spring shows: ploughed fields are bare.
- **Forest** (`pipeline/laser.py`, `pipeline/canopy.py`): the highest laser return in each 2 m cell less the elevation model, kept in `.data/derived/` (a tile's four sheets take about a minute), then what's tall, not bright in the photo (the laser is years older, so this drops what's been felled), off water and clear of roads and buildings, at 4 m in quarter metres. This was chosen over a simpler source because the laser's shape is exact: every field edge and clearing lands where the photo has it, at about 0.17 MB a tile.
- **Buildings** (`pipeline/buildings.py`): `solids.bin.gz` holds 16-bit columns by 600 m cell, then the outlines the car hits. Solids come from a tile's sheet and its neighbours', kept by their middle, repaired, with ground faces dropped and walls run down past the ground. A Topographic Database footprint less than half covered by solids gets a generated shape: a ridge along its long side, or a flat top on a big non-house, as tall as the laser saw, within limits by class because the laser sees trees too. Class says the look: 42211 houses, 42212 apartments, 42221 and 42222 commercial, 42231 public, 42241 industrial, 42260, 42261 and 42270 outbuildings; a seeded choice picks a colour from the palette in `globals.css`. Roofs are the median of the photo inside the outline, with the sky's blue kept out, and get a strip of overhang past every outer edge. The street-facing facade gets the door, by the nearest road.
- **Roads:** OSM ways clipped exactly at the tile's edge. OSM's building footprints are still written but unused: NLS's took their place. The raw roads, the footprints and the road surface stay under ODbL, which each states. OSM comes from its own API, not Overpass, whose public servers are too often down: a tile's box at a time, in quarters if it's over the API's limit of 50,000 nodes, each answer kept in `.data/raw/osm-api/` so a fetch that stops resumes where it was. It's meant for this size of request. The whole island's 94 tiles came through it in a couple of minutes.
- **The road surface** (`pipeline/roads.py`): see below.

Tiles don't live in git. One does: `fixture/` is L2343C with a `world.json` of its own, a whole world of one tile, for the tests. It needn't match what's published, and only needs refreshing when the format changes.

Tests: `render/tile.test.ts`, `sim/drive.test.ts` and `sim/world.test.ts` in Vitest, on the fixture and on tiles made up in the test, `e2e/aland-drive.spec.ts` in Playwright (the full Chromium, by name), serving the fixture to itself, and `pipeline/test_grid.py` and `pipeline/test_roads.py` (`pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline`). `sim/world.test.ts` holds that a wall stops the car at top speed. `pipeline/audit.py` measures OSM's roads on a built tile, `pipeline/road_audit.py` measures the surface built from them, `pipeline/check_edges.py` decodes real sea, shore and neighbouring tiles, and `pipeline/check_seams.py` measures every shared edge of the built tiles.

## The road surface

Roads are baked, so the render and the physics read one surface. A ribbon triangle steeper than 45° that rises over 1.2 m is dropped when the mesh is made: a track crossing high above a road would otherwise dive under it in one section, a cliff across the carriageway. OSM's lines are the only source so far: every road the tile needs is in them.

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

**How rough the roads are.** The scripted driver down all 843 km of the nine tiles' motor roads, each at a speed its class can carry (`tools/road-check.ts`), finishes every one, buildings and all. A wheel drop at the very start of a road is only the car being put down, four wheels at once, and doesn't happen on the way. Drops on the way are real, and on 63 of 1410 lines: narrow roads where a wheel runs off the edge or a crossing lifts it, nearly all at town speeds. 48 lines go over 0.6 g, at worst 2.7 g, in Mariehamn's service roads. The worst on a main road is 1.7 g, a tertiary crossing a greater road at 140 km/h, where the two approaches each ease up to the road between.

## Hosting

Tiles live in the public bucket `aland-drive-tiles` on the site's Supabase project, one folder per build under its version, and `render/tile-address.ts` is the one place that says so: the base address is the Supabase URL, the bucket and `TILES_VERSION`. Moving to another host is copying a folder and changing that one function. The files never change once published and carry a year's cache, so a browser keeps them; a rebuild is a new folder and a new `TILES_VERSION`, committed with whatever needs it, so a deployed page only ever sees the tiles it was built with. `pipeline/upload.py` creates the bucket if it's missing and uploads what isn't there, reading the service-role key from `.env.local`. Old versions stay until someone clears them.

Nothing in the tests or tools touches that host: they serve tiles to themselves on localhost.

**Data per drive**, counted by the bytes a local server really sent: starting the game is 18.8 MB (the overview, nine tiles' far data and the start tile's detail), the same whatever the island's size, of 313 MB published for 94 tiles. A tile is 5–8 MB in the country, about 1 MB in the outer sea tiles and up to 14 MB in Mariehamn. A tile once fetched comes from the browser's cache, and driving a route again fetches nothing. So a player's download is bounded by the map, not by the hours: 313 MB for one person seeing everything.

Against Supabase Free's 5 GB of egress a month that's about 15 new players who see everything. Pro's 250 GB is fifty times that. R2 has no egress charge and 10 GB free. So stay on Supabase while the game is the owner's own, and move before it's shared widely: the move is a copy and one address.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule, and the game names them in a line on screen that links there. ODbL holds the tiles' road and building files to the same licence, so they are published as they are, each stating it.

## Phases

`docs/PLAN.md` holds the phases, why they run in that order, each phase's exit test and the risks.

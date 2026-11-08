# Åland Drive: the data

The geodata the world is built from, confirmed by decoding real files, and what was measured in it. How the pipeline uses it is `pipeline/CLAUDE.md`.

## Sources

**Confirmed, each by decoding a real file for this area:**

- **NLS Finland 2 m elevation model** (CC BY 4.0), in ETRS-TM35FIN, as 6×6 km tiles of 3000×3000 samples, from the mirror `https://mirrors.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/`. Land tiles are about 20–25 MB. Samples are 32-bit floats with no nodata anywhere, tagged as areas, so a sample's centre is 1 m in from its tile's edge.
- **OpenStreetMap** (ODbL) has about 18,000 road and path ways and 27,700 buildings in a box around the island. Its roads are measured below.
- **kartor.ax** (CC BY 4.0) has 19 datasets, none of them terrain, roads, buildings or imagery, but its traffic counts and landmark layers are useful. The traffic counts set how busy each road is (see The lane map in `pipeline/CLAUDE.md`): 169 sites on the regional government's roads, 2020 onwards, each a week's vehicles a day both ways, from about 25 on a village lane to 14,000 at Mariehamn's northern entrance; Mariehamn's own streets aren't counted.
- **NLS Topographic Database** (CC BY 4.0): `maastotietokanta/2025/shp/L2/L23/L2343L.shp.zip` on the same mirror has 96 km of classed roads and drives, 56 km of tracks and paths and about 880 building footprints on tile L2343C alone. Its terrain layer (`m_*_p` and `m_*_s`) has 34,357 rock areas over the island's sheets, 1,051 boulders and 867 boulder fields. Its shapefile sheets are named by left and right halves (`L2343L`, `L2343R`).
- **NLS orthophotos** (CC BY 4.0): `orto/normal_color_3067/mara_v_25000_50/2025/L23/02m/1/L2343C.jp2` is 12000×12000 RGB at 0.5 m, flown in 2025, 107 MB. The index `ortho_newest` lists 140 sheets in a box around the island.
- **NLS laser point clouds** (CC BY 4.0): `laserkeilaus/2008_latest/2013/L234/1/L2343C1.laz` is a 3×3 km classified LAZ of 75 MB and 15.65 M points (1.7 per m²), scanned in 2013. Its ground points sit on the 2 m model (median 0.00 m, 90% within 0.14 m) and first returns stand up to 27 m above it, so tree heights are there. The index `2008_latest` lists 422 sheets in the same box.
- **NLS 3D buildings** (CC BY 4.0): CityGML LOD2 by 6×6 km sheet, from a 2022 scan, with 80 Åland sheets. They aren't on the mirror: MapSite's Buildings 3D page takes a free order of up to 100 sheets with an email address, and the zip's link comes back from the order's page and by email. Sheets go in `.data/raw/buildings3d/` as `<sheet>.gml`, by hand, and the pipeline generates a shape for every footprint they don't cover. `run.py --new-building-sheets` rebuilds only the tiles a sheet added since their build reaches.
- **Luke's Multi-source National Forest Inventory 2023** (CC BY 4.0, credited as "©Natural Resources Institute Finland, 2023" and "The Multi-source National Forest Inventory Raster Maps of 2023"): one country-wide 16 m GeoTIFF per theme in EPSG:3067, `https://www.nic.funet.fi/index/geodata/luke/vmi/2023/<theme>_vmi1x_1923.tif`, tiled and read by window over `/vsicurl/`. Its pixels line up with the 6 km tiles, 375 to a side. Themes used: `manty`, `kuusi`, `koivu` and `muulp` (m³/ha), `latvuspeitto` (canopy cover, %), `ppa` (basal area, m²/ha), `keskilapimitta` (cm) and `keskipituus` (dm). 32767 is land outside forest land or sea, 32766 a value that couldn't be computed. Fields, yards and shores have no value, yet on tiles at least a fifth forest about 16% of that land has trees in the laser.

| | L2343C rural | L2334F north town | L2334E town centre | Central grid only |
|---|---|---|---|---|
| Buildings | 639 | 3,405 | 3,070 | 425 |
| Built area modelled | 91% | 97.5% | 97.1% | 98.5% |
| Footprints of 20 m² or more missing | 14% | 5% | 4.6% | 2.7% |
| Median roof distance from laser | 8 cm | 10 cm | 11 cm | 6 cm |
| Triangles | 18,000 | 129,000 | 133,000 | 33,000 |
| Gzipped | 85 kB | 624 kB | 634 kB | |

The model has real roof shapes as geometry and nothing else: no textures, windows or doors, and its `roofType`, `function` and `creationDate` are constants. Nothing under 20 m² is modelled, so sheds and about 11,700 footprints across the island need a generated shape. Joined buildings are one solid. Walls are sunk into the ground on purpose, about 0.8 m at the median, but a few dozen float, so walls get extended down. A building crossing a sheet edge lives in one sheet only, so sheets are processed with their neighbours. Rings can hold duplicate vertices and holes, and a few faces are invalid and need repair.

In Mariehamn, ordinary blocks and the esplanade houses are right. Landmarks vary: Sjöfartsmuseet, the Savoy, Ålands museum and the Västerhamn terminal building read well; the water tower has no building at all, the towers of S:t Görans and the town hall are cut short, and the terminal's walkways are solid walls run to the ground (`ahvenanmaa_2022_13485`, 470 m of them), which the town kit's terminal replaces. At least one solid is false, a 34.6 m slab about 19 m above the laser at 108027, 6683455. Eleven solids contain OSM drivable roads, which needs checking before routing through them. All 80 sheets are in the build.

**Unconfirmed or ruled out:** none.

## What the data does

**OSM's roads, on tile L2343C.** Centrelines were checked against the raised strip of the road in the 2 m heights, every 10 m. Primary, secondary and tertiary roads sit on the real road: a median offset of 1–2 m and a P90 of 3–5 m, with the strip found at 82–98% of stations. NLS's own lines measure the same (median 1 m), which is the method's floor; lines moved 40 m aside find a strip at only 9% of stations, with a median offset of 10 m. Tracks and service roads mostly have no strip to measure (found at 26–46%).

Line against line, OSM has all of NLS's classed roads and tracks, 90% of its drives, 66% of its tractor ways and 40% of its paths, with a median gap of 0.5–1 m where both have the line, and 97% of OSM's motor roads have an NLS line beside them. In the heights alone, with no map, 30.7 km reads as road. OSM has 21.8 km of it, which is 96% of what either map confirms as a way; 7.9 km is on neither map, and the longest of those, checked on the orthophoto, are nearly all ditch banks, pit rims and shores.

So OSM's lines are good enough to lay roads from, and the Topographic Database is there for the drives and tractor ways it lacks.

**The forest against MS-NFI, over all 94 tiles' MS-NFI land.** The mix planted from the stands image is 63/13/12/11 pine, spruce, birch and other by tree, against 60/15/13/12 by real volume. Tree height is what's off. MS-NFI's mean height is 1.20 times the canopy image's at the median (0.90–1.65 from the 10th to the 90th percentile, falling from 1.23 in low stands to 1.10 in the tallest), over 2.6 M well-wooded pixels, partly ten years' growth since the 2013 scan and partly that a lattice place reads the canopy's surface, not a tree's top. So `HEIGHT_RANGE` centres on 1.2. Crowns scale with height, so it decides cover too: a full lattice covers 40% of the ground against the real 41%, or 35% thinned by the stands image at 194 trees per hectare, which falls short because low stands can't reach their cover even full while tall ones are thinned to theirs. Whatever stands in for far trees (the terrain's lift, the overview) rises by the same mean. Real stems are about 510 per hectare, past the lattice's 278, which is why density targets cover.

**Edges.**

- **Sea has no nodata.** It is flat water, near 0.1 m in the open and a few centimetres apart between tiles (0.051 and 0.088 m meet at one seam), so the game must never take sea level from a tile's own numbers. Lakes are flat at their own level.
- **The land beside the sea** is close to water level, so water comes from the mask and not from a height test.
- **Water levels meet in a one-sample blend,** which the mask has to close or a line of land crosses the bay.
- **A mostly-sea tile is tiny:** K2444F builds to 0.04 MB. Its neighbour K2444D doesn't exist on the mirror: the pipeline treats a missing tile as open sea, and only a 404 means that.
- **Seams are clean.** Raw samples step across a seam no more than within a tile (median 7.4 cm against 8.1 on one, 1.7 against 2.0 on another), built neighbours share their edge row of heights exactly, and baked shading steps at a seam about as it does inside a tile.

**Mariehamn's roads.** L2334F, the town's northern tile, has eight times the road parts of a country tile and costs nearly twice the bytes. Its bypass runs on an embankment with cycle underpasses that OSM tags as tunnels. The elevation model has no tunnel: the lesser road cuts a slot through the embankment, under the greater road's ribbon, which stays up as a deck.

## Measured on the built roads

**On Route 1,** measured over the baked ribbon: the worst vertical curve goes from a 781 m radius in the raw model to 4150 m, a 6 m-chord roughness from 6.3 mm to 0.7 mm, and the line stays within 1.03 m of OSM's and 0.25 m of the model's height.

The shading beside a road at a seam still comes from each tile's own view of its neighbour, whose rim is the raw ground. Measured along every seam it steps a median of 3–4/255 near a road against 2 elsewhere, with the same top end, and it doesn't show.

**How rough the roads are.** The scripted driver down all 843 km of the nine tiles' motor roads, each at a speed its class can carry (`tools/road-check.ts`), finishes every one, buildings and all. A wheel drop at the very start of a road is only the car being put down, four wheels at once, and doesn't happen on the way. Drops on the way are real, and on 63 of 1410 lines: narrow roads where a wheel runs off the edge or a crossing lifts it, nearly all at town speeds. 48 lines go over 0.6 g, at worst 2.7 g, in Mariehamn's service roads. The worst on a main road is 1.7 g, a tertiary crossing a greater road at 140 km/h, where the two approaches each ease up to the road between.

`tools/junction-check.ts` (see `pipeline/CLAUDE.md`): a big roundabout's sharp exits throw the scripted driver wide too. Across the eight tiles rebuilt with aprons, 23,478 movements, 23,425 finish, against 23,415 with the roads trimmed to fit; movements over 0.6 g fell from 962 to 613, over 1 g from 317 to 180, and wheel drops from 6,794 to 4,845.

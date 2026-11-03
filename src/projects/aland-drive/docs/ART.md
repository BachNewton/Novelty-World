# Åland Drive: art inventory

Everything made for the world, and whether it has reached the game. All art is made from code. A kit isn't finished when it exists in `art/`: it's finished when it's placed in the world and has been seen in the running game. Tick a box only then, and add a row whenever new art is made.

Each kit has a gallery beside its code, and its integration steps were reported when it landed. **Placed** means the pipeline or game puts it on the real island; **Seen** means it's been checked in the running game at real positions.

## Placement

Most objects need a per-tile list from the pipeline: model, position, yaw, scale. Lists stay per tile or per cell, because an object that's folded away still costs vertex work, and regional rules decide the mix so each area keeps its own character. Sources are OpenStreetMap, the NLS Topographic Database, or a rule. The counts below are across the built tiles unless noted, and some OSM tags need a hand check.

## Kits

| Kit | Folder | Status | Placed from | In game | Placed | Seen |
|---|---|---|---|---|---|---|
| **Player's car** | `art/cars` | Built | The car the game starts in, drawn from `CarState` | [x] | [x] | [ ] |
| **Other cars** | `art/cars` | Built | By purchase and traffic | [ ] | [ ] | [ ] |
| **Ground, roads, paint** | `art/surfaces` | Built | Shader, from photo colour and road kinds | [x] | [x] | [ ] |
| **Roofs and shopfronts** | `art/surfaces` | Built | Shader, by building; a shop where OSM has `shop=*` | [x] | [x] | [ ] |
| **Road signs** | `art/surfaces`, `render/roadside.ts` | In the game: give way, stop, speed limits, bus stops, crossings | OSM stop, give way, bus stops and marked crossings; give way where a lesser road meets a main one; a speed sign where OSM's limit changes (`pipeline/roadside.py`) | [x] | [x] | [x] |
| **Sky and clouds** | `art/sky` | Built | One dome | [x] | [x] | [ ] |
| **Water** | `render/water.ts` | In the game, reflecting the sky; hour still to connect | Sea plane and terrain's water | [x] | [x] | [x] |
| **Forest fixes** | `render/forest.ts` | In the game | Existing forest | [x] | [x] | [x] |
| **Roadside kit** | `art/roadside`, `render/roadside.ts` | In the game: lamps, poles and wires, mailboxes, bus shelters; fences not yet placed | OSM lamps, poles and minor power lines, sheltered bus stops; lamps along roads tagged lit; mailboxes at country drives leading to a house (`pipeline/roadside.py`) | [x] | [x] | [x] |
| **Piers, pontoons** | `art/rural` (sections), `render/docks.ts` | In the game, on tiles rebuilt since; not yet published. `art/roadside`'s built-to-length pier, pontoon and gangway stay as gallery props | OSM `man_made=pier`: harbour piers by marinas, wide or long; pontoons where `floating=yes` (`pipeline/docks.py`) | [x] | [x] | [x] |
| **Guard rails, reflectors, speed cameras** | `art/street`, `render/roadside.ts` | In the game: guard rails and edge posts; speed cameras not yet placed | OSM `barrier=guard_rail`; rails on embankments and either side of a bridge; edge posts along unlit main roads (`pipeline/roadside.py`) | [x] | [x] | [x] |
| **Verges and wildflowers** | `art/street`, `render/verge.ts` | In the game | A shader's rule, from the road mask and the photo | [x] | [x] | [x] |
| **Linden trees** | `art/street` | Built | OSM `natural=tree_row`; esplanades by name | [ ] | [ ] | [ ] |
| **Street furniture** | `art/street`, `render/roadside.ts` | In the game: benches, bins, bike racks, café tables and parasols, with a seat for a person on each bench seat and chair; on tiles rebuilt since, not yet published. Planters not yet placed; the lone table and chair are gone, the set (whose chairs the seats are measured to) taking their place | OSM benches, waste baskets, bicycle parking, and terraces at cafés and bars with outdoor seating; benches along park paths, pedestrian streets and a town's waterside paths, bins at town bus stops, bike racks at supermarkets, schools and the like (`pipeline/furniture.py`) | [x] | [x] | [x] |
| **Flags, midsummer poles** | `art/street` | Built | OSM flagpoles; a hand list of poles | [ ] | [ ] | [ ] |
| **Harbour fittings** | `art/street` | Built | Rules along quays; OSM cranes, marinas | [ ] | [ ] | [ ] |
| **Parked cars** | `art/street` | Built | OSM `amenity=parking`, kerb lines | [ ] | [ ] | [ ] |
| **Windmills** | `art/rural` | Built | OSM `man_made=windmill` (123, needs a hand check) | [ ] | [ ] | [ ] |
| **Boathouses, sheds** | `art/rural` | In the game, on tiles rebuilt since; not yet published | NLS outbuildings (42260, 42261) at the water's edge, or small ones inland; OSM `building=boathouse`, `building=shed` (`pipeline/outbuildings.py`) | [x] | [x] | [x] |
| **Granite** | `art/rural`, `render/granite.ts` | In the game, on tiles rebuilt since; not yet published | Topographic Database rock areas (34100) as a 4 m image, outcrops laid on the mesh by a shader's rule; mapped boulders (34600) and the biggest of a field's as places, and boulder fields (34700) as an 8 m image the ground and a planting of small stones cover (`pipeline/rocks.py`). OSM's `natural=bare_rock` lies 87–94% inside the rock areas and adds nothing | [x] | [x] | [x] |
| **Bushes, juniper, birch** | `art/rural`, `render/shrubs.ts` | In the game | A shader's rule: forest edges from the canopy, rock among trees from the photo | [x] | [x] | [x] |
| **Reeds** | `art/rural`, `render/reeds.ts` | In the game | A shader's rule: sheltered shallows near land, from the water mask and the photo | [x] | [x] | [x] |
| **Stone walls** | `art/rural`, `render/stone-walls.ts` | In the game, on tiles baked since; not yet published | OSM `barrier=wall` in the country; by rule along the Topographic Database's field and meadow edges, gapped at every road (`pipeline/walls.py`) | [x] | [x] | [x] |
| **Jetties, boats** | `art/rural` | In the game, on tiles rebuilt since; not yet published | OSM piers that aren't a harbour's (1,290 runs); a head, and a rowing boat or sloop by rule (`pipeline/docks.py`) | [x] | [x] | [x] |
| **Bales, tractor, sheep** | `art/rural` | Built | Rule, on fields and meadows | [ ] | [ ] | [ ] |
| **Town ground, parks** | `art/town-ground` | Built | OSM land use, paths, parks; a baked surface mask | [ ] | [ ] | [ ] |
| **Facades** | `art/facades` | Built | Shader, by building: OSM material, class, size, roof and street (`pipeline/facades.py`) | [x] | [x] | [ ] |
| **Villas' porches, fuel stations, supermarket entrances** | `art/facades` | Built | Villas and big shops from the facades; OSM `amenity=fuel` | [ ] | [ ] | [ ] |
| **Stone churches** | `art/facades` | In the game, on tiles rebuilt since; not yet published | Their real sites, in place of their NLS solids (`pipeline/landmarks.py`) | [x] | [x] | [x] |
| **Town detail, terminal, ferry** | `art/town-kit` | Built | OSM and rules; the terminal at its real place | [ ] | [ ] | [ ] |
| **Homes** | `art/homes` | Built | Real plots, chosen in phase 6 | [ ] | [ ] | [ ] |
| **Dealerships** | `art/dealers` | Built | Real plots, chosen in phase 6 | [ ] | [ ] | [ ] |
| **Identity props** | `art/identity` | Built | OSM and rules | [ ] | [ ] | [ ] |
| **Stamp album** | `art/identity` | Built | Awarded at discoveries | [ ] | [ ] | [ ] |
| **Bicycles and riders** | `art/bikes` | Built | Rideable; cyclists on roads | [ ] | [ ] | [ ] |
| **Boats** | `art/boats` | Berths in the game, on tiles rebuilt since; not yet published. Moorings off the piers and the regatta still to place | Berths down a marina's piers and every pontoon, by rule (`pipeline/docks.py`); a distant regatta | [x] | [x] | [x] |
| **Marinas, sea marks, boatyards** | `art/marina` | Built | OSM `seamark:*`, marinas, `man_made=lighthouse` | [ ] | [ ] | [ ] |
| **People** | `art/people`, `render/people.ts` | In the game, on tiles baked since; not yet published: the waterfront and the landmarks. Terraces, parks and seats still to place | By rule, sparse, from the docks and landmarks a tile already has (`pipeline/waterfront.py`): fishing, sitting on the edge, on the bench or sunbathing on about a quarter of jetty heads; someone tending one rowing boat in seven and one berthed boat in twenty; now and then along a marina's piers and pontoons a pair chatting, someone standing, a parent and child, someone sitting on the edge or fishing; two or three groups round each landmark. 588 across the 94 tiles: 129 on edges, 121 standing, 106 chatting, 89 fishing, 56 tending boats, 50 on benches, 23 sunbathing, 14 children waving; 120 on Mariehamn's L2334E | [x] | [x] | [x] |
| **Night** | `art/night` | Built | Hour dial, windows, OSM lamps and sea lights | [ ] | [ ] | [ ] |
| **Sound** | `audio` | Built, not yet heard | Driven by the car, the surface and the place | [ ] | [ ] | [ ] |

## Landmarks

Each has a real position, exported with its model, and `pipeline/landmarks.py` drops what it replaces, from `art/landmarks/sites.json`. They're in the game on tiles rebuilt since, not yet published. Bomarsund's fort found no solids inside its outline to replace.

| Landmark | Folder | Replaces | In game | Seen on terrain |
|---|---|---|---|---|
| Water tower | `art/landmarks` | Nothing | [x] | [x] |
| Pommern | `art/landmarks` | Nothing | [x] | [x] |
| Von Knorring | `art/landmarks` | Nothing | [x] | [x] |
| S:t Görans church | `art/landmarks` | `ahvenanmaa_2022_15285` | [x] | [x] |
| Town hall | `art/landmarks` | `ahvenanmaa_2022_135417` | [x] | [x] |
| Kastelholm | `art/landmarks` | Solids inside its outline | [x] | [x] |
| Bomarsund fort | `art/landmarks` | Solids inside its outline | [x] | [x] |
| Notvikstornet | `art/landmarks` | Solids inside its outline | [x] | [x] |
| Ferry | `art/town-kit` | Nothing | [ ] | [ ] |

## Cleanup found along the way

- Footbridges that OSM tags `bridge=yes` without `surface=wood` (the terminal's walkway, some in the country) are still drawn by the bridge kit as concrete road bridges. Wooden ones are docks now.
- Every placed boat is moored. Boats under way, sailing and motor, wait for moving traffic, whose logic they would share: `art/boats` has the yachts' sailing state and the regatta, and a still boat out on open water would look stranded.
- The seabed is the pipeline's own shelf from the shore, not a survey, so berths and keels follow distance from land. Traficom publishes depth areas, contours and soundings as open data (CC BY 4.0, "not for navigation"), and the Transport Infrastructure Agency fairways and aids to navigation: the real seabed, buoys and beacons, if the water ever needs them.
- A marina's boats are one list per model across the loaded tiles, so every boat runs its near version's vertices wherever it is, folded to nothing past its swap: with Mariehamn loaded that's about 0.6 M of the triangle count (showcase 2 goes from 1.75 to 2.39 M). Lists per 600 m cell, shown by distance as the buildings are, would drop it.
- Pommern's near rigging is geometry finer than a pixel, so it sparkles in single pixels well before its swap.
- From close above, a church tower's roof shows a thin light line along its lower rim, which starts just outside the wall (seen on Sund).
- A placed boathouse or shed has the kit's dark roof, where a generated or NLS building takes its roof's colour from the photo.

- Remove the false slab `ahvenanmaa_2022_20193` in central Mariehamn, and check `ahvenanmaa_2022_12785`.
- Give parked cars a very simple stand-in past about 120 m, because they're most of a town street's cost.
- Fold the remaining kits' `tokens.css` into `globals.css` as each kit goes in (`art/roadside`, `art/street` and `art/rural` have none left).
- `art/rural` and `art/street`'s parked cars grow out of the ground at their reach; `art/roadside` and the rest of `art/street` dissolve instead, which suits the rule that a change of detail isn't noticed. Bring them in line once someone checks them in motion.
- Bus shelters stand in the verge's grass, which grows inside them: the verge reads only images, so it can't know they're there.
- Power lines cross the forest with trees standing under the wires, where a real line has a cleared corridor.
- Check real shopfronts on central Mariehamn, and the 11 solids holding OSM roads.

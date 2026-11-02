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
| **Road signs** | `art/surfaces` | Built | OSM `traffic_sign`, stop and give way; junction rules | [ ] | [ ] | [ ] |
| **Sky and clouds** | `art/sky` | Built | One dome | [x] | [x] | [ ] |
| **Water** | `render/water.ts` | In the game, reflecting the sky; hour still to connect | Sea plane and terrain's water | [x] | [x] | [x] |
| **Forest fixes** | `render/forest.ts` | In the game | Existing forest | [x] | [x] | [x] |
| **Roadside kit** | `art/roadside` | Built | Lamps, poles, stops, fences from OSM; mailboxes at drives by rule | [ ] | [ ] | [ ] |
| **Better pine** | `art/roadside` | Built | Replaces the forest's pine, once measured | [ ] | [ ] | [ ] |
| **Piers, pontoons** | `art/roadside` | Built | OSM `man_made=pier`, `floating=yes` | [ ] | [ ] | [ ] |
| **Guard rails, reflectors, speed cameras** | `art/street` | Built | OSM `barrier=guard_rail`, `highway=speed_camera`; rule along unlit roads | [ ] | [ ] | [ ] |
| **Verges and wildflowers** | `art/street`, `render/verge.ts` | In the game | A shader's rule, from the road mask and the photo | [x] | [x] | [x] |
| **Linden trees** | `art/street` | Built | OSM `natural=tree_row`; esplanades by name | [ ] | [ ] | [ ] |
| **Street furniture** | `art/street` | Built | OSM benches, bins, bike racks, cafés | [ ] | [ ] | [ ] |
| **Flags, midsummer poles** | `art/street` | Built | OSM flagpoles; a hand list of poles | [ ] | [ ] | [ ] |
| **Harbour fittings** | `art/street` | Built | Rules along quays; OSM cranes, marinas | [ ] | [ ] | [ ] |
| **Parked cars** | `art/street` | Built | OSM `amenity=parking`, kerb lines | [ ] | [ ] | [ ] |
| **Windmills** | `art/rural` | Built | OSM `man_made=windmill` (123, needs a hand check) | [ ] | [ ] | [ ] |
| **Boathouses, sheds** | `art/rural` | In the game, on tiles rebuilt since; not yet published | NLS outbuildings (42260, 42261) at the water's edge, or small ones inland; OSM `building=boathouse`, `building=shed` (`pipeline/outbuildings.py`) | [x] | [x] | [x] |
| **Granite** | `art/rural` | Built | OSM `natural=bare_rock` (2,286), MTK rock classes | [ ] | [ ] | [ ] |
| **Bushes, juniper, birch** | `art/rural`, `render/shrubs.ts` | In the game | A shader's rule: forest edges from the canopy, rock among trees from the photo | [x] | [x] | [x] |
| **Reeds** | `art/rural`, `render/reeds.ts` | In the game | A shader's rule: sheltered shallows near land, from the water mask and the photo | [x] | [x] | [x] |
| **Stone walls** | `art/rural` | Built | OSM `barrier=wall`; field edges by rule | [ ] | [ ] | [ ] |
| **Jetties, boats** | `art/rural` | Built | OSM piers (2,109); boats by rule | [ ] | [ ] | [ ] |
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
| **Boats** | `art/boats` | Built | OSM marinas and moorings; a distant regatta | [ ] | [ ] | [ ] |
| **Marinas, sea marks, boatyards** | `art/marina` | Built | OSM `seamark:*`, marinas, `man_made=lighthouse` | [ ] | [ ] | [ ] |
| **People** | `art/people` | Built | Sparse rules: terraces, jetties, parks, landmarks | [ ] | [ ] | [ ] |
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
| Ferry | `art/town-kit` (replaces the one in `art/landmarks`) | Nothing | [ ] | [ ] |

## Cleanup found along the way

- Pommern's near rigging is geometry finer than a pixel, so it sparkles in single pixels well before its swap.
- From close above, a church tower's roof shows a thin light line along its lower rim, which starts just outside the wall (seen on Sund).
- Marinas are drawn as bridges. The owner saw many places in the game that should read as a marina, a pier or pontoons, drawn instead with `bridgeKit`'s parapets, rails and piers: probably OSM paths along piers and pontoons (`man_made=pier`, `floating=yes`), which `pipeline/roads.py` holds up as spans because they run over water. They want the marina kit (`art/marina`, `art/roadside`'s piers and pontoons) instead, and no bridge where there's no road across the water. To come back to.
- A placed boathouse or shed has the kit's dark roof, where a generated or NLS building takes its roof's colour from the photo.

- Remove the false slab `ahvenanmaa_2022_20193` in central Mariehamn, and check `ahvenanmaa_2022_12785`.
- Make `art/roadside`'s lamps and poles grow and dissolve, as `art/street` and `art/rural` do.
- Give parked cars a very simple stand-in past about 120 m, because they're most of a town street's cost.
- Share `art/rural`'s and `art/street`'s repeated lighting with `art/roadside`, and fold each kit's `tokens.css` into `globals.css`.
- Check real shopfronts on central Mariehamn, and the 11 solids holding OSM roads.

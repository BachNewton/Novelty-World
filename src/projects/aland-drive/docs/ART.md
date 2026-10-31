# Åland Drive: art inventory

Everything made for the world, and whether it has reached the game. All art is made from code. A kit isn't finished when it exists in `art/`: it's finished when it's placed in the world and has been seen in the running game. Tick a box only then, and add a row whenever new art is made.

Each kit has a gallery beside its code, and its integration steps were reported when it landed. **Placed** means the pipeline or game puts it on the real island; **Seen** means it's been checked in the running game at real positions.

## Placement

Most objects need a per-tile list from the pipeline: model, position, yaw, scale. Lists stay per tile or per cell, because an object that's folded away still costs vertex work, and regional rules decide the mix so each area keeps its own character. Sources are OpenStreetMap, the NLS Topographic Database, or a rule. The counts below are across the built tiles unless noted, and some OSM tags need a hand check.

## Kits

| Kit | Folder | Status | Placed from | In game | Placed | Seen |
|---|---|---|---|---|---|---|
| **Cars** (player and five more) | `art/cars` | Built | Player's car swap; others by purchase and traffic | [ ] | [ ] | [ ] |
| **Ground, roads, paint** | `art/surfaces` | Built | Shader, from photo colour and road kinds | [ ] | [ ] | [ ] |
| **Roofs and shopfronts** | `art/surfaces` | Built | Shader, by building | [ ] | [ ] | [ ] |
| **Road signs** | `art/surfaces` | Being reworked | OSM `traffic_sign`, stop and give way; junction rules | [ ] | [ ] | [ ] |
| **Sky and clouds** | `art/sky` | Built | One dome | [ ] | [ ] | [ ] |
| **Water** | `render/water.ts` | Being built | Sea plane and terrain's water | [ ] | [ ] | [ ] |
| **Forest fixes** | `render/forest.ts` | Being built | Existing forest | [ ] | [ ] | [ ] |
| **Roadside kit** | `art/roadside` | Built | Lamps, poles, stops, fences from OSM; mailboxes at drives by rule | [ ] | [ ] | [ ] |
| **Better pine** | `art/roadside` | Built | Replaces the forest's pine, once measured | [ ] | [ ] | [ ] |
| **Piers, pontoons** | `art/roadside` | Built | OSM `man_made=pier`, `floating=yes` | [ ] | [ ] | [ ] |
| **Guard rails, reflectors, speed cameras** | `art/street` | Built | OSM `barrier=guard_rail`, `highway=speed_camera`; rule along unlit roads | [ ] | [ ] | [ ] |
| **Verges and wildflowers** | `art/street` | Built | Rule along road chains | [ ] | [ ] | [ ] |
| **Linden trees** | `art/street` | Built | OSM `natural=tree_row`; esplanades by name | [ ] | [ ] | [ ] |
| **Street furniture** | `art/street` | Built | OSM benches, bins, bike racks, cafés | [ ] | [ ] | [ ] |
| **Flags, midsummer poles** | `art/street` | Built | OSM flagpoles; a hand list of poles | [ ] | [ ] | [ ] |
| **Harbour fittings** | `art/street` | Built | Rules along quays; OSM cranes, marinas | [ ] | [ ] | [ ] |
| **Parked cars** | `art/street` | Built | OSM `amenity=parking`, kerb lines | [ ] | [ ] | [ ] |
| **Windmills** | `art/rural` | Built | OSM `man_made=windmill` (123, needs a hand check) | [ ] | [ ] | [ ] |
| **Boathouses, sheds** | `art/rural` | Built | OSM `building=boathouse` (269), `building=shed` (245) | [ ] | [ ] | [ ] |
| **Granite** | `art/rural` | Built | OSM `natural=bare_rock` (2,286), MTK rock classes | [ ] | [ ] | [ ] |
| **Bushes, juniper, birch** | `art/rural` | Built | OSM `natural=scrub` (619), edges by rule | [ ] | [ ] | [ ] |
| **Reeds** | `art/rural` | Built | OSM `wetland=reedbed` (386) | [ ] | [ ] | [ ] |
| **Stone walls** | `art/rural` | Built | OSM `barrier=wall`; field edges by rule | [ ] | [ ] | [ ] |
| **Jetties, boats** | `art/rural` | Built | OSM piers (2,109); boats by rule | [ ] | [ ] | [ ] |
| **Bales, tractor, sheep** | `art/rural` | Built | Rule, on fields and meadows | [ ] | [ ] | [ ] |
| **Town ground, parks** | `art/town-ground` | Being built | OSM land use, paths, parks; a baked surface mask | [ ] | [ ] | [ ] |
| **Facades, wooden houses, shops, churches** | `art/facades` | Being built | By building class and location; OSM `shop=*`, `amenity=fuel`; churches at real places | [ ] | [ ] | [ ] |
| **Town detail, terminal, ferry** | `art/town-kit` | Being built | OSM and rules; the terminal at its real place | [ ] | [ ] | [ ] |
| **Homes** | `art/homes` | Being built | Real plots, chosen in phase 6 | [ ] | [ ] | [ ] |
| **Dealerships** | `art/dealers` | Being built | Real plots, chosen in phase 6 | [ ] | [ ] | [ ] |
| **Identity props** | `art/identity` | Being built | OSM and rules | [ ] | [ ] | [ ] |
| **Stamp album** | `art/identity` | Being built | Awarded at discoveries | [ ] | [ ] | [ ] |
| **Bicycles and riders** | `art/bikes` | Being built | Rideable; cyclists on roads | [ ] | [ ] | [ ] |
| **Boats** | `art/boats` | Being built | OSM marinas and moorings; a distant regatta | [ ] | [ ] | [ ] |
| **Marinas, sea marks, boatyards** | `art/marina` | Being built | OSM `seamark:*`, marinas, `man_made=lighthouse` | [ ] | [ ] | [ ] |

## Landmarks

Each has a real position, exported with its model. Replacing an NLS solid means removing that solid from the pipeline too.

| Landmark | Folder | Replaces | In game | Seen on terrain |
|---|---|---|---|---|
| Water tower | `art/landmarks` | Nothing | [ ] | [ ] |
| Pommern | `art/landmarks` | Nothing | [ ] | [ ] |
| Von Knorring | `art/landmarks` | Nothing | [ ] | [ ] |
| S:t Görans church | `art/landmarks` | `ahvenanmaa_2022_15285` | [ ] | [ ] |
| Town hall | `art/landmarks` | `ahvenanmaa_2022_135417` | [ ] | [ ] |
| Kastelholm | `art/landmarks` | Solids inside its outline | [ ] | [ ] |
| Bomarsund fort | `art/landmarks` | Solids inside its outline | [ ] | [ ] |
| Notvikstornet | `art/landmarks` | Solids inside its outline | [ ] | [ ] |
| Ferry | `art/town-kit` (replaces the one in `art/landmarks`) | Nothing | [ ] | [ ] |

## Cleanup found along the way

- Remove the false slab `ahvenanmaa_2022_20193` in central Mariehamn, and check `ahvenanmaa_2022_12785`.
- Make `art/roadside`'s lamps and poles grow and dissolve, as `art/street` and `art/rural` do.
- Give parked cars a very simple stand-in past about 120 m, because they're most of a town street's cost.
- Share `art/rural`'s and `art/street`'s repeated lighting with `art/roadside`, and fold each kit's `tokens.css` into `globals.css`.
- Check real shopfronts on central Mariehamn, and the 11 solids holding OSM roads.

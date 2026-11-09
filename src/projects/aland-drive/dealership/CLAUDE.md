# Åland Drive: dealerships

Walking round a dealership in first person, among its cars, as `ideas/cars.md` ("Dealers", "Inside a dealership") decides it. Paths are relative to the project's folder, `src/projects/aland-drive/`; the project's own `CLAUDE.md` there is the overview.

## The interior definition

**A dealership is data, never code in the system.** Each place that sells cars hands the system one `DealerInterior` (`dealership/interior.ts`), and the system reads nothing else about it: the yacht, the delivery hall, the premium showroom, the town dealer, the village garage and the used lot are all the same few fields. The art for one (`art/dealers/`, or a kit of its own) builds its room and returns this; a line in the registry (`dealership/registry.ts`) names it by its site. The definition is kept small and changes rarely: a field is added only when a room needs something the others can't do without, and never to describe one room's look.

**The room's frame.** Everything is in the room's own metres: +y up, the floor walked on at y = 0, and the axes of the dealership's exterior model, its street side +z. `origin` puts the room's origin in the exterior's frame (zero for a building, the car deck's height for a yacht), so the site's place and yaw (`DEALER_SITES`, `art/dealers/index.ts`) put the room where its building stands, which is what makes the view through its windows the right one. A yaw turns about +y, anticlockwise seen from above, and yaw 0 faces -z, as a car's nose does at yaw 0.

What it holds:

- **`name`**, shown at its door.
- **`room`**: the room's still art, one soup of the dealer kit's `Shell` (`art/dealers/shell.ts`), drawn in one draw with the room's light. A part with glow 1 shines by itself (a lamp's face, a sign). The room paints nothing outside itself: no backdrop of sky or sea past its windows or doors, since every opening shows the real island (see the windows).
- **`turntables`**: parts that turn, each a soup centred on its own axis, its `centre` on the floor and a whole turn in `turnSeconds`. A spot on one rides it.
- **`stock`**: which cars it sells, by the car list's own fields (`sim/cars.ts`'s entries: `makers`, `tiers`, `from`), every car matching all the fields given. `ideas/cars.md`'s dealer table, as rules: the yacht `from: harbour, tiers: A1, A2`; the delivery hall `from: harbour, tiers: A3, A4, B2, B3`; the premium showroom `makers: Tärna, Aurelle, from: dealer`; the town dealer `makers: Västan, Ödmark, Norrsken, from: dealer`; the village garage `makers: Klippa`. A car added to the list in a dealer's makers and tiers stands there with no change to the room, as long as it has a spot.
- **`spots`**: where cars stand, in the order the stock fills them (the car list's order, fastest tier first), so the finest place comes first. Each is the floor under the car's middle (its y the floor's height there: a plinth's top, a lift's deck, a turntable's) and the way its nose points. A room has at least as many spots as its stock has cars; the test holds every car of its stock clear of the walls, the solids and the other cars on its spot.
- **`floor`** and **`solids`**: what the player walks. The floor is the outline they stay inside; a solid is a box (its centre, half its size and its yaw) or a round post on that plan, anything that stands on the floor: a desk, a sofa, a pillar, a stand. A car on a spot is solid by itself, from its own footprint, so the art doesn't list cars. There is one floor level: steps and a raised deck are solids, or not walked.
- **`windows`**: flat panes, four corners in order round each. The island is drawn behind the whole room as it looks from the dealership's real place, at that moment's hour, season and weather, captured once on entering; a pane draws that view with a touch of glass over it. An opening with no pane (an open workshop door, the used lot's open sky) shows the island too, plainly. A window's frame and mullions are the room's art.
- **`viewFrom`**: where the island is captured from, the middle of the windows at the eye's height. The view is right from there and a little off as the player walks away from it, which at a window's distance is hard to see.
- **`light`**: the room's own light, never the sun. `ambient` (0 to 1, in `ambientPaint`) is what every surface gets whatever it faces: a delivery hall's bright even light is high, a yacht's evening low. Up to 16 `lamps` (`MOST_LAMPS`), each a `point` that shines all round, a `spot` down a cone about its aim (a yacht's soft spots, a light over each car), or a `strip` from every point between its two ends (a workshop's tubes, a hall's rows of panels), each in a colour token, as bright as `power` at itself and half that at `reachM`. `mirrors` is what a glossy surface mirrors at a glancing angle: the floor's look, then the ceiling's. The cars are lit by the same light.
- **`door`**: where the player stands on entering, facing into the room, and how near it (`reachM`) they must come to leave.

Outside, the system reads the dealership's site (`DEALER_SITES`: its place, yaw and road) and its exterior's `entrance` (`art/dealers/exteriors.ts`: a point on the ground and a radius), which is where its door's marker stands on the island and where the player's car is put back on leaving. A dealership on the water (the yacht) has its exterior's origin at the sea's surface rather than the ground (`afloat` on its site).

**The rules a room keeps**, which `dealership/interiors.test.ts` holds for every dealership in the registry: the door, the view and every spot inside the floor; every car of its stock fits its spot, clear of the floor's edge, the solids and the cars beside it, and a turntable's car turns clear of what's round it; the door clear of everything; at most 16 lamps; each window flat; a room within the dealer kit's triangle budget.

## The system

To come.

# Headlights for traffic and computer-driven cars

An idea, not a plan: the owner would like traffic to have real headlights at night, and asked for it to be written down for later. Nothing here is decided.

## What there is now

- **Other players' cars** have it all: their lenses lit by their art's `setLights`, a glow on each lamp (`createCarGlows`, one draw for the whole fleet, placed on each car's own lenses by `lampCentres`), and the nearest `OTHERS_LIT` of them light the ground with the same pool as the player's car (`art/night/headlights.ts`).
- **Computer-driven cars** (`net/computer-cars.ts`) are drawn through the same remote views as other players' cars, so their lenses light, but they get no glow and no pool.
- **Traffic and parked cars** (`art/cars/fleet.ts`'s world cars) have no night lamps at all: no lit lenses, no glows, no pool. Only their indicators are modelled.

## How it would go, cheapest first

1. **Lenses and glows for traffic.** A world car's head and tail lenses lit at night in its fleet material, and its four lamps added to the car glows, from `lampCentres` on its own body. Glows cost one draw call however many cars there are, and nothing on any other surface, so this is nearly free. It is also most of the look from any distance: a road at night reads by its cars' lamps.
2. **Computer-driven cars in the lit list.** They are drawn exactly as other players' cars are, so they join the same nearest-`OTHERS_LIT` choice as those cars with no new cost.
3. **Traffic in the lit list.** The pools are chosen from one list of every car with its lamps on, players, computer drivers and traffic alike, nearest the camera first. The cost stays what the cap sets, whatever the traffic: each lit pool is about 70 arithmetic operations per pixel drawn, and an empty slot is one comparison. Traffic only makes it likelier that the slots are full.

## The cap as a graphics setting

`OTHERS_LIT` is one number, the other cars lit besides the player's own (three, so four cars in all), and it can become a graphics setting (beside `RENDER_SCALE`). Its cost is linear: each slot adds about 70 operations to every pixel while it's lit, under 1% of the floor laptop's GPU at 3440×1440 and 60 fps, counted from the pool's operations and the Radeon 780M's rated throughput, not timed. Changing it rebuilds every shader once, since the slots are part of the shader. That suits a setting changed in a menu, but not anything that changes during a drive, which is why the number is fixed rather than following how many cars are near.

## If many lit cars are ever wanted

Past a dozen or so pools, summing every pool on every pixel stops scaling. The usual answer is to draw each beam's pool as its own shape on the ground, a projected decal adding light only where it falls, so a pool costs only the pixels it covers. That is a different system from the pool sum, and only worth building if a town full of traffic at night needs more than the cap gives.

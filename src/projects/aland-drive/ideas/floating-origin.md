# Precision far from the origin

A problem the game doesn't have yet, and the fix if it ever does. Nothing is built; it waits on the world growing past the main island, such as ferries to the outer islands.

## The problem

Positions are 32-bit floats in the drawing (on the GPU) and in the physics (Rapier), measured from one fixed world origin, about 7 km north-east of Mariehamn. A 32-bit float has 24 bits of precision, so the smallest step a position can take grows with its distance from the origin, doubling at each power of two. Too far out, the car is drawn and simulated a few millimetres from where it should be, and the error changes from frame to frame: a jitter.

It has been seen. The playground first sat 123 km from the origin, where a position's step is 7.8 mm and its rounding error up to 3.9 mm: about a pixel on the car from the chase camera at 3440×1440, and the owner saw the car jitter. Moved to the origin, it stopped.

How far each place is, measured from the game's road map and the islands' real positions:

| Where | Furthest from the origin, either axis | Smallest step | Worst error | On the car, from the chase camera |
|---|---|---|---|---|
| Mariehamn | 7 km | 0.5 mm | 0.25 mm | about a twentieth of a pixel |
| Every road on the main island | 30 km | 1.95 mm | about 1 mm | about a fifth of a pixel |
| The main island's outermost tiles, off-road | 36 km | 3.9 mm | about 2 mm | about half a pixel |
| The outer islands (Kumlinge, Kökar, Brändö out to Jurmo) | 65 km | 3.9 mm | about 2 mm | about half a pixel |
| The playground where it first was | 123 km | 7.8 mm | about 3.9 mm | about a pixel: seen |

So today's map is clear of it, and the outer islands would show about half the jitter that was seen: faint, but likely noticeable to someone looking. The next step up, to 7.8 mm, comes at 65.5 km, just past Jurmo.

Moving the origin doesn't solve it: the archipelago is about 91 km across, so even an origin in its middle leaves its ends 45 km out, in the same 3.9 mm band.

## The fix

Draw and simulate everything relative to the car rather than to one fixed origin: a floating origin.

- **The drawing**: the scene is shifted so the camera always sits near zero, and whatever is placed in the world (tiles, the forest's lattice, the plantings, boats, other players' cars) is positioned relative to that shift. Shaders that read world positions for patterns (the road's paint and wear, the terrain's detail, the forest's places) take them from a high-precision offset plus a small local position, so a pattern doesn't drift or swim as the origin moves.
- **The physics**: Rapier also stores 32-bit positions, so the simulation needs the same: its world re-centred on the player's car when the car has gone far enough from the current centre, every body and collider moved by the same amount in one step. Several simulated cars far apart (racers, traffic) each need to be near some centre, so the re-centring follows the player and the others accept the precision where they are, or the simulation splits by region.
- **What doesn't change**: the world's own coordinates in the tiles, the maps and the network stay as they are. Other players' car states travel in world coordinates and are turned into the local frame on arrival.

With it, precision everywhere is Mariehamn's, however far the world reaches. It's real work across the renderer and the physics, so it belongs with whatever first takes the world past about 32 km from the origin (the ferries), not before.

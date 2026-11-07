# Precision far from the origin

The physics half of this is built: the simulation runs round a centre near the player's car (`sim/physics-centre.ts`). The drawing half is an idea, not a plan, waiting on the world growing past the main island, such as ferries to the outer islands.

## The problem

Positions are 32-bit floats in the physics (Rapier) and in the shaders on the GPU. A 32-bit float has 24 bits of precision, so the smallest step a position can take grows with its distance from the origin, doubling at each power of two. The world's origin is about 7 km north-east of Mariehamn.

### In the physics

What shows is not how far a car is from where it should be, a millimetre or two, but how unevenly it moves. Rapier moves a car's body in whole jumps of four of a float's steps, so a car's position changes by a multiple of that each step of the simulation (120 a second), and it moves at speeds in steps of that much a step. Its velocity is smooth; where it is follows it in jerks. At a crawl that is plain: reversing gently from rest at the start of a challenge in Eckerö, 22.5 km out, the car sat still for a second and then lurched off at 0.94 m/s, and a full reverse climbed in jumps of 0.94 m/s, each held about a quarter of a second. The owner saw it as jitter while crawling, most of all in reverse.

| Distance from the origin, either axis | A float's step | A car's speed moves in steps of |
|---|---|---|
| Within 1 km | 0.06 mm or less | 0.03 m/s or less |
| 4 to 8 km (Mariehamn) | 0.49 mm | 0.23 m/s |
| 8 to 16 km | 0.98 mm | 0.47 m/s |
| 16 to 32 km (every road on the main island lies within 30 km) | 1.95 mm | 0.94 m/s |
| 32 to 65 km (the main island's outermost tiles, the outer islands) | 3.9 mm | 1.9 m/s |

So it showed on today's map, the more the further out. Why Rapier moves by four steps rather than one isn't known; the fix doesn't need to know.

The collision ground had the same problem a second way: each block's triangles were written as 32-bit floats in world coordinates, so out at 22 km its corners were rounded by up to a millimetre.

### In the drawing

three works out each object's place relative to the camera in 64-bit numbers on the CPU, so a model is drawn where it is at any distance. What isn't is a shader that reads world positions itself, for a pattern or a normal; the project's `CLAUDE.md` has the rule that keeps fine detail out of them ("A shader never draws fine detail from the world's coordinates").

The playground first sat 123 km from the origin, where a float's step is 7.8 mm, and the owner saw the car jitter; moved to the origin, it stopped. At that distance the physics alone moves a car in speed steps of 3.75 m/s, which is jitter enough, so that sighting says nothing either way about the drawing.

## The physics: built

Rapier's origin is the physics centre, a place near the player's car, in whole metres. Every position given to Rapier is the world's less the centre, and every one read back is plus it; the four files that talk to Rapier (`sim/car.ts`, `sim/drive.ts`, `sim/ground.ts`, `sim/remote-cars.ts`) do that through the centre and nothing else does, so the car's state, the network, traffic and the challenges all stay in world coordinates.

- **It moves with the player.** When the player's car is more than a kilometre from the centre along either axis, the centre moves to it and every body and collider moves by the same amount, just before the world steps: Rapier's rays only find a moved collider once the world has stepped, so the move comes after the step's wheel rays. Within a kilometre a car's speed moves in steps of 0.03 m/s at most, and a move is a pass over the loaded ground and the cars, too rare to cost anything.
- **A move moves nothing.** The centre sits on whole metres, so a body's place less a whole number of metres is a float again, exactly: no car shifts by even a rounding, and the same inputs still play out the same, moving the centre on the same steps.
- **The ground is precise everywhere.** Each collision block is built from its own corner, and its collider put at that corner less the centre, so a move moves the blocks rather than building them again.
- **Other simulated cars** (racers, a hit traffic car) live wherever they are relative to the one centre, as precise as their distance from it allows, which on a race or near the player is close.

`sim/physics-centre.test.ts` holds it: on a test pad three tiles east, a car creeps backwards from rest moving by its speed every step, the same drive step for step as at the origin, and a drive across a move of the centre, with a second car and a parked stand-in, has no car jump, change speed or leave the ground.

## The drawing: still to do

Shaders that read world positions for patterns (the road's paint and wear, the terrain's detail, the forest's places) would take them from a high-precision offset plus a small local position, so nothing drifts or swims however far out. The rule above keeps fine detail out of world positions meanwhile, and it holds on the main island. It belongs with whatever first takes the world much further out (the ferries to the outer islands).

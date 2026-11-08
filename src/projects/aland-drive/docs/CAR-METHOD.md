# Building a car

How one drivable car of Åland Drive Unlimited is made, start to finish: its tuning into its tier, its art near and far, and how both are judged. The reference car is **Åska** (`aska`), Tärna's A1 hybrid hypercar: every step below was done on it, and its files are the worked example. The car list, the tiers and the makers are `ideas/cars.md`; the art rules every car obeys are `art/CLAUDE.md`. Paths are from `src/projects/aland-drive/`.

## The bar

The player looks at the car more than at anything else, so a car is the best art in the game: clean, stylised realism made entirely from code, invented (no real maker, badge or recognisable face), and good enough for the chase camera close up. A car clears the bar when, in the gallery and in the game:

- Its proportions say what it is before any detail does: from the side, a hypercar is low, wide and cab-forward, a pickup tall with a bed, a hatch short with an upright tail.
- Its surfaces are fair: a reflection runs along a door or a hood without a dent or a kink, and the light breaks on its character lines where the design wants a line.
- Its face and its tail are its maker's signature, readable at chase distance by day, and as its lamps alone by night.
- Its wheels are a design (a rim style, a brake disc and a caliper behind it, a tyre with a sidewall and a shoulder), not a black disc with spokes.
- Its far version, seen in the gallery's `far` view, has its outline, its colours and its lamps where the near one has them.
- Nothing about it is the same as another car's but the recipe it is built on.

Be hard on it: put it beside the best car already built (Åska) and say what it lacks.

## The files

A car is six files and four lines:

| | File | Registered in |
|---|---|---|
| Tuning and tier | `sim/cars/<id>.ts`, a `CarEntry` through `tuned()` (`sim/cars/character.ts`) | `sim/cars.ts` |
| Measured limits | `sim/limits/<id>.json`, written by `tools/car-limits.ts` | `sim/car-limits.ts` |
| Art | `art/cars/models/<id>.ts`, a `CarSpec` on the recipe | `art/cars/specs.ts` |
| Voice | `audio/voices/<id>.ts` | `audio/vehicles.ts` |

Each registry lists cars under their tier's header, fastest tier first; `sim/tiers.test.ts` holds the order. A new paint is a `--color-aland-drive-car-paint-<name>` token in `src/app/globals.css`.

Start with the tuning, since the art reads its axles, track, wheel radius and ride height from it (`driven(<id>)`), and the limits file must exist before the registry compiles: copy any car's JSON as a placeholder, then measure over it.

## Tuning into the tier

1. Write the `Character` (`sim/cars/character.ts` says what each number is): mass, outline, axles, track, wheel radius, centre of mass height, ride, grip, engine, gearbox, launch, drive split, brakes, drag, aero, steering. Start from the nearest car of its kind.
2. Measure: `npm run slot -- cores:1 -- npx tsx src/projects/aland-drive/tools/car-limits.ts --car=<id>` (about four minutes). It writes `sim/limits/<id>.json`; the tier test reads 0–100 km/h on dry asphalt (dry gravel in B) and the top speed on dry asphalt from it.
3. Check the band: `npm run slot -- unit -- npx vitest run src/projects/aland-drive/sim/tiers.test.ts`. The bands are `sim/tiers.ts`.
4. Check how it drives: `npm run slot -- cores:1 -- npx tsx src/projects/aland-drive/tools/handling.ts --car=<id>`, against a car it should feel like or unlike.

What to change for which effect:

| To change | Change | Notes |
|---|---|---|
| 0–100 km/h | `launchMS2`, then torque and first gear | Traction control holds the pull to `launchMS2` times mass, so a powerful car's launch is set by `launchMS2` alone: about 11.5 m/s² is 2.5 s, 7.5 is 3.9 s. A weak car's launch is set by torque through first gear instead. |
| Top speed | `dragPerMS2`, then torque at the top of the revs and top gear | Top speed is where the engine's power meets drag: power at the top ≈ peak torque × its share at those revs × the redline in rad/s; drag force = `dragPerMS2` × v². The top gear's `gearTopMS` must sit just above the speed wanted, or the car hits the redline first. |
| The shove between | the torque curve's shape, `gearTopMS` spacing, `shiftS` | A flat curve from low revs is an electric or hybrid shove; a peaky one with short gears is a screamer. |
| Grip and balance | `grip` front and rear, `peakSlip`, `slideShare`, `rearShare` | More rear grip than front is stable; `rearShare` 1 is RWD, 0.5–0.65 an AWD car. |
| Stability at speed | `aero` (downforce against the Skerry GT's, weight for weight) | A hypercar's is 2–3, a sports car's 1–1.5, a road car's 0–1. It adds no drag in the simulation. |
| Body control | `rideHz`, `damping`, `rollStiffness`, `massHeightM` | Low and stiff is sharp; soft and high floats and leans. |

## Art: the recipe

A car's art is a `CarSpec`: a body (`BodySpec`), a wheel (`WheelSpec`), a paint and its ride. The body is lofted (`art/cars/body.ts`): a silhouette down the car's centre from the nose's foot over the roof to the tail's, every point the top of a rib of twelve rows from the sill up the side, over the roof's edge to the centre, each row read off its own curve along the car. Glass, lamps and trim are bands: which rows, over which stretch of the silhouette, take which surface. So a car is a set of curves, not a mesh.

Two ways to write one (`art/cars/recipe.ts`):

- **`sketched`**: a dozen numbers (size, sill, hood, where the screen starts, meets the roof and the roof ends, a tail style and a nose style). For a plain car: world cars and the everyday tiers.
- **A full `Shape` through `bodyOf`**: every curve by hand. For any car the player will want to own. `extra` overrides any field of the `BodySpec`, so a car with a proportion the recipe's defaults don't make writes its own silhouette, bands, crown, width and shelf (Åska does all five).

The order of work, each step checked in the gallery before the next:

1. **Proportions from the side.** Axles and wheels from the simulation, then the silhouette: nose height, hood, where the screen starts (the cowl), the roof, where it ends, the tail. A cab-forward car's cowl sits near its front axle and its roof ends over its rear one; a front-engined car's cowl sits a metre and more behind its front axle.
2. **The plan from above.** `halfWidth` (hips over the rear wheels for a sports car), `railWidth` (the roof's edge: a narrow canopy on a wide body is a mid-engined car's), and `shelf`, a band of paint between the flank's top and the side glass, which is what lets a narrow cabin sit inboard of wide hips.
3. **The section.** `shoulder` and `belt` heights along the car (the flank's top and the crease below it), `crown` (how far the roof's edge sits below the centre; below zero over the hood, the fenders stand above a hood that dips between them, and over the rear wheels, hips above an engine cover), and `scoop` (how far the lower flank is sculpted in along the car, leading into an intake).
4. **Glass.** `windowZ`, `windowTop`, `pillars`, and the screen and rear glass as bands. A teardrop canopy is a `windowTop` that rises from the cowl, peaks over the seats and tapers behind them.
5. **Face and tail.** The silhouette's points at each end, each with a band: the mouth, the lamp, the housing, the gap, the tail bar, the mesh, the diffuser. The maker's signature goes here (Tärna's is a bracket of light, a full-width line turned down at its ends).
6. **Parts** (`art/cars/parts.ts`): `splitter`, `diffuser`, `sideIntake`, `lightLine`, `projectors`, `tailLine`, `louvres`; the recipe's own `plates`, `handles`, `reversing`, `reflector`, `thirdBrake`, `lampUnits`, `roundLamps`, `stripe`; the body's `wing` (with `endplates`), `exhausts`, `roofBars` and `blocks`.
7. **Wheels** (`art/cars/wheel.ts`): a rim `style` (`blade`, `split`, `turbine`, `mesh`, `aero`) and spoke count, `rimShare` (how big the rim is in the tyre: 0.6 a utility car, 0.76 a hypercar's low profile), tyre width. Every hero wheel has a brake disc and a caliper (`car-caliper`).
8. **Paint and finish.** The paint is a token; trim, cladding and grille are shared tokens; the material is `art/cars/material.ts`.

Rules the recipe holds you to:

- **No coplanar faces** (`art/faces.slow.test.ts`). A part stuck on another stands 1–2 cm off it, or one cuts through the other's inside. A decal lifts itself (`liftM`).
- **A part either goes to the far model or is fine.** A decal or block marked `fine` is near-only; anything that changes the outline or the colour seen from 100 m (a splitter, an intake, a lamp) is not fine.
- **Mid-silhouette points marked `fine`** smooth the near hood and deck; the far model uses only the firm points, so the firm points alone must still give the outline.

## Art: the review

While shaping, sketch the car on the CPU, which needs no GPU page and takes a second or two:

```
npx tsx src/projects/aland-drive/art/cars/sketch.ts --car=<id> <out>
```

It draws the near model from the side, the three-quarters, above, the front, the rear, the chase camera and a front wheel, and the far model, in flat colours under one light: proportions, sections, bands, parts and wheels, not the material. GPU pages are the machine's scarcest share, so iterate on the sketch and shoot the gallery for each real round.

Shoot the car in the gallery, near and far, by day and by night:

```
npm run slot -- browser -- node src/projects/aland-drive/art/cars/gallery.mjs <out> --detail --car=<index> --size=1600x900
```

`<index>` is its place in `CAR_IDS` (the registry's order: Åska is 0). It prints the car's triangle counts and saves, per car: `chase` and `chase-tight` (the game's camera), `side`, `front34`, `rear34`, `back`, `brake`, `steer` (front wheels turned), `far` (the far model at 60 m), `hood` (the bumper camera), `night` and `night-rear` (the world dimmed, lamps lit) and `wheel` (a front wheel close up), with a contact sheet of all of them.

Look at each, in this order, and write down what is wrong before changing anything:

1. `side`: proportions and stance. Do the wheels fill the arches? Is the cabin where the class puts it?
2. `front34`, `rear34`: the section and the surfaces. Do reflections run fair? Is there a line where the eye expects one?
3. `chase`, `chase-tight`, `brake`: what the player sees all game. Is the tail a design at this size? Do the brake lamps read?
4. `night`, `night-rear`: is the signature still the car's with only its lamps?
5. `wheel`, `steer`: rim, disc, caliper, sidewall.
6. `far`: same outline and colours as near? Every lamp where it was?

Then in the game, by day and by night, with local tiles: `node src/projects/aland-drive/tools/serve-tiles.mjs --port=<p>`, a dev server of the worktree's own on a spare port (`npx next dev --port <q>`, never 3001), and `ALAND_DRIVE_URL="http://localhost:<q>/games/3d-games/aland-drive?car=<id>&tiles=local:<p>&hour=<h>" npm run slot -- browser -- node src/projects/aland-drive/tools/look.mjs --shots=<folder> <name>:<east>,<north>,<height>,<yaw>,<pitch>`. Film it (`tools/film.mjs`) when a still hides something: a sparkle, a pop at the swap.

Redraw until it clears the bar. Several rounds is normal.

## Far version and cost

The far model is the near one built with fewer rows and stations (`build.ts`, `FAR`) and the stand-in is its silhouette's firm points simplified (`buildDistant`). Both come from the same spec, so there is nothing to draw twice, but check them: the gallery's `far` view, and `art/cars/cars.test.ts`, which holds every car under 25,000 triangles near, 2,000 far and 160 for the stand-in, its faces outward, its collision box matching what's drawn and its lamps at its ends.

Count what it costs: the gallery prints near and far triangles; the near car's draws are its body, its glass, four wheels and four calipers. `tools/frame-cost.mjs` counts a whole frame at the showcase views.

## Checks

Lint of the changed files (`npx eslint <files>`), `npm run typecheck`, `npm run test` (scoped), and the slow tests the change reaches, above all the faces test: `npm run slot -- cores:4 -- npx vitest run --config vitest.slow.config.ts src/projects/aland-drive/art/faces.slow.test.ts`.

## Cockpit

*Placeholder: the cockpit view (the first-person camera and the shared parametric interior) is being built on its own branch. What a car sets for its cabin goes here.*

## Paints

*Placeholder: the paint system (a car's list of paints with their finishes) is being built on its own branch. How a car chooses its paints goes here.*

## Voice

*Placeholder: the engine sound is being redone on its own branch. Until then a car's voice is a `Voice` on today's model (`audio/vehicles.ts`), written from the nearest car of its kind; how a voice is designed and judged goes here.*

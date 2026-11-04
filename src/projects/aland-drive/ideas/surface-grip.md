# Grip by surface and by condition

How Åland Drive's cars grip on each surface in each condition, why the model is shaped as it is, and what is still open. The model is built (see `CLAUDE.md`, The car); its numbers are a first pass, to be tuned by the owner's feel in the game. Weather and seasons don't exist yet: the condition is an input, dry unless a dev switch says otherwise.

## What the reference games do

Test Drive Unlimited, Forza Horizon and The Crew are open-world driving games, not simulators, and they treat surfaces the same way in spirit:

- **The order is real, the gaps are not.** Real tyres on gravel have about two thirds of their asphalt grip, wet asphalt 60–80%, packed snow a quarter to a third and ice a tenth. The games keep that order and squeeze it hard: a road car on dirt in Forza Horizon is slower and looser but still quick, and players often say its dirt and snow barely differ from tarmac. Ice at a tenth of the grip is unplayable at speed, so no open-world game models it honestly.
- **Loose surfaces slide predictably.** On gravel a real tyre grips best at a wider slip angle and keeps pushing once it slides, rather than letting go at a peak. That is what makes a gravel slide something to hold rather than a spin, and the games lean into it.
- **Soft ground slows the car rather than spinning it.** Grass and verges cost speed through rolling resistance and lower grip, and a road car keeps going: they punish the line, not the driver.
- **Assists carry the rest.** Steering that knows how much grip there is, stability control and ABS are on by default. TDU 2 reworked its off-road handling around optional aids that move a player between a more arcade and a more simulated feel, and reviews split on whether it got the balance right: the hard part, as expected.

The levers between arcade and simulation, then: how far the gaps between surfaces are squeezed, how gently a tyre lets go past its peak, how much soft ground slows the car rather than unsettling it, and how much the steering and the yaw assist adapt to the grip that's there.

## The model

**Every wheel has its own surface.** A wheel's ray already lands on a triangle of the collision mesh, which is the drawn ground and road, so the triangle says what the wheel is on: a car with two wheels over the road's edge grips on two and slides on two, which is how a verge should catch a car out.

- **A road's carriageway** is asphalt or gravel, the same as the road is drawn (OSM's `surface` where it says, else its class, town-aware). A junction apron takes the road nearest it, a car park is paved.
- **A road's shoulder**, past the carriageway's edge, is loose: gravel. Åland's roads have gravel verges, and it makes the edge of the tarmac something felt.
- **The ground itself** is grass, or rock where the Topographic Database maps bedrock (the same layer the granite outcrops are drawn from). Rock grips nearly as well as asphalt dry and turns slick when wet.

No new pipeline data was needed. What isn't distinguished yet: the town's hard ground (gravel yards, paving, setts) is off with the rest of the town ground, so a yard with no road ribbon reads as grass; the forest floor reads as grass because the canopy is only on the GPU; and the water's edge has no mud. Each would take a layer the simulation doesn't read yet, and none is needed for the racers' stages, which are all on roads.

**A surface in a condition reshapes the car's own tyre curve**, never replaces it, so each of the fourteen cars keeps its character: the grippiest car is still the grippiest on gravel, and one with a loose rear still lets go first on ice. Each surface-and-condition entry has five numbers:

- **grip**, times the car's own peak grip front and rear;
- **peak slip**, times the slip angle the car's grip peaks at: wider on loose surfaces, so they let go later and more gently;
- **hold-on**, how much of what a tyre loses past its peak it keeps: loose surfaces and snow keep pushing in a slide;
- **rolling**, extra resistance as a share of the load on the tyre, and **rolling with speed**, more of it with every metre a second, so soft ground costs a fast car most.

Dry asphalt is the car exactly as tuned: a grip of one, no change to the curve, nothing more to roll against. Measured, every one of the fourteen cars drives on it as before to the last digit.

**The condition is every surface's at once**: dry, wet, snow or ice. Snow and ice mostly override the surface beneath (packed snow on asphalt and on gravel grip about alike), wet keeps the surfaces apart and makes grass and rock slick. Weather and seasons will set it, and the physics won't reopen. For now it's `?condition=wet` (or snow, ice) in a link, or the Ground choice in the dev menu.

**The steering knows the footing.** The lock narrows with speed to the angle that asks for the grip there is; that angle now asks for the grip of the surface under the wheels, so full lock on ice asks for an ice corner rather than ploughing the fronts on, and the yaw assist asks for no faster a turn than that grip gives. That's the arcade assist the reference games have on by default. Brakes and throttle need nothing: the friction circle already caps them at the grip there is, which is a perfect ABS and traction control.

**The racers' table has a row per ground.** `tools/car-limits.ts` measures every car on a test pad of each surface, in each condition: sixteen rows a car. The racers' speed plan reads the row for the ground under each stretch of its route. The table's print covers the surfaces' grip as well as the cars' tuning, so changing either asks for the table to be measured again.

## What was measured

The Skerry GT and the Berg on the test pad, each surface on its own, before any tuning by feel. Corner is sideways grip held in a steady corner; stop is metres from 100 km/h; top is the fastest in a minute of full throttle.

| Ground | Skerry GT corner g at 100 km/h | stop from 100, m | 0–100, s | top, km/h | Berg corner g at 100 | stop, m | top, km/h |
|---|---|---|---|---|---|---|---|
| Dry asphalt (as before) | 1.36 | 30.5 | 4.7 | 258 | 0.88 | 46.0 | 154 |
| Wet asphalt | 1.09 | 34.5 | 4.7 | 258 | 0.72 | 50.4 | 154 |
| Snow on asphalt | 0.62 | 60.6 | 5.4 | 229 | 0.41 | 87.3 | 139 |
| Ice on asphalt | 0.33 | 111.6 | 9.0 | 257 | 0.22 | 157.8 | 154 |
| Dry gravel | 1.01 | 37.2 | 4.9 | 232 | 0.60 | 54.0 | 140 |
| Wet gravel | 0.93 | 40.4 | 4.9 | 226 | 0.56 | 58.7 | 137 |
| Dry grass | 0.84 | 44.3 | 5.1 | 203 | 0.44 | 64.3 | 115 |
| Wet grass | 0.66 | 56.9 | 5.5 | 188 | 0.31 | 82.2 | 110 |
| Dry rock | 1.20 | 31.9 | 4.8 | 254 | 0.77 | 47.4 | 151 |
| Wet rock | 0.82 | 45.9 | 4.8 | 254 | 0.54 | 66.3 | 151 |

Every car's sixteen rows are in `sim/car-limits.json`.

## Open

- **The feel.** Every number is a starting point for the owner to judge against the reference games: whether gravel lets go early enough and holds a slide well enough, whether grass punishes enough without spinning the car, whether wet asphalt is too forgiving, whether ice at a quarter of the grip is fun or a chore.
- **Ice's top speed.** With no rolling resistance on ice, a car on ice still reaches its dry top speed in a straight line, given time: true of real ice, but whether it plays well is the owner's call.
- **The sound** still finds the surface its own way, from the nearest road's line, so a wheel on the verge is heard on asphalt within 5 m of the centre. It could read the wheels' surfaces instead.
- **The autopilot** maps a wheel angle to steering by the dry lock, so on a loose surface it steers a little less than it means to and corrects as it goes. The racer that grows out of it should read the footing.

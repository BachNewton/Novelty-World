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

**Each car has a class, what it was built for**, so the order of the cars changes with the ground: on an asphalt race the sports cars win, and on gravel, grass or snow they struggle while the rally car and the four-by-fours win. The three reference games each do this their own way:

- **Test Drive Unlimited 2:** the class is the car. A (asphalt), B (off-road) and C (classic), each with tiers by performance and a licence of its own, and off-road events take B-class cars. A car never changes class.
- **The Crew:** the class is a kit on a car. One car can be built as Street, Dirt, Performance, Raid or Circuit spec, each bought from its own tuner, and events ask for a spec. Not every car has every spec.
- **Forza Horizon:** any car, made for a surface by its parts. Tyre compound and suspension decide what it's good at, off-road tyres for dirt and cross-country, and road, dirt and cross-country races are capped by one performance number.

Åland Drive takes TDU 2's: the cars are invented characters, there is no upgrade system, and each race names its ground. A car's class is one field of its description, so adding a car is one choice, and a tuning shop could later move a car between classes as Forza's tyres and The Crew's kits do, with no change to the physics. A class is a row on top of the surface table: times each surface's grip, its hold-on in a slide and its rolling, and times the grip in each condition. Every class is the car as tuned on dry asphalt, since a car's own numbers already say how it does there: the four-by-fours are already the softest and slowest to turn on tarmac.

- **Sports**: wide, soft tyres that snatch and let go on gravel, and a low nose that ploughs grass.
- **Road**: an ordinary car, the surface table as it is, a little worse on grass.
- **Rally**: tyres and long travel that keep a gravel slide going, and bite in snow.
- **Off-road**: tall, knobbly tyres that barely notice grass or gravel, and the most bite in snow.

**Each car runs on the tyres the player fitted**: summer, winter friction (studless) or studded. It's the player's choice, not the law's (`docs/TIME-AND-WEATHER.md`, Decided), so the winter is something to prepare for: a car caught on snow or ice on summer tyres handles poorly. The surface table above is each ground on the tyre made for it, summer tyres in the dry and the wet and winter tyres in snow and on ice, and a tyre is one more row on top, times the grip, the slip it peaks at and how much it keeps past the peak in each condition:

- **Summer**: the car as tuned in the dry and the wet. In snow and on ice about two thirds of a winter tyre's grip, peaking sooner and keeping half as much in a slide, so it is slow and loose, never stuck. Real summer tyres keep about half a winter tyre's grip there; the gap is squeezed as the surfaces' are.
- **Winter friction**: the snow and ice rows as they are; a few percent worse on a bare road, its soft, siped tread squirming a little.
- **Studded**: the best on ice by far, about 1.45 times a friction tyre (real studs about halve the braking distance of summer tyres on slippery ice), a touch better in snow, and a little worse again than friction tyres on a bare road, the studs lifting the rubber off it.

A car's class still applies on top, so a sports car on studs is still worse in snow than the rally car on studs. `sim/tyres.test.ts` holds the order on every surface for every class: on ice studs, then friction, then summer; in snow both winter tyres over summer; on a bare road summer, then friction, then studs; summer tyres in winter between half and four fifths of a winter tyre's grip; and summer tyres on dry asphalt the car exactly as tuned.

The tyres are a field of the car, which keeps them until they're changed. Until homes and car shops exist they're the game menu's tyre choices (Esc or a pad's Menu, outside a challenge), the three side by side with the fitted set marked, kept per car in this browser (`garage/tyres.ts`, which a home's garage or a shop will call), or `?tyres=studded` in a link for the car the drive starts in. Studs are heard and seen: they tick and hum on a bare road in the tyre sound, duller on ice, and on ice they throw chips of it. The tyres aren't in `CarState`: another player's car is a stand-in with no tyres of its own, and only the player's car throws particles.

**The racers' table has a row per ground.** `tools/car-limits.ts` measures every car on a test pad of each surface, in each condition, on summer tyres in the dry and the wet and on each of the three in snow and on ice, where the choice is the point: thirty-two rows a car. The racers' speed plan reads the row for the ground under each stretch of its route. The table's print covers the surfaces' grip as well as the cars' tuning, so changing either asks for the table to be measured again.

## What was measured

The Skerry GT and the Berg on the test pad, each surface on its own, before car classes and before any tuning by feel. Corner is sideways grip held in a steady corner; stop is metres from 100 km/h; top is the fastest in a minute of full throttle.

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

Those are before car classes. With them, every car's sideways grip at 60 km/h, best first:

| Ground | The order |
|---|---|
| Dry asphalt (unchanged) | Sund 1.43, Grus 1.33, Skerry GT 1.28, Sten, Ström, Ankar, Fjärd, Bris, Ljus, Vik, Sälta, Kobb, Holm 0.93, Berg 0.86 |
| Dry gravel | Grus 1.15, Holm 1.01, Sten 0.92, Ström, Berg 0.90, Fjärd, Bris, Ljus, Vik, Sälta, Sund 0.69, Kobb, Skerry GT 0.62, Ankar 0.58 |
| Dry grass | Holm 0.91, Grus 0.83, Berg 0.83, Ström 0.65, Sten, Fjärd, Bris, Ljus, Vik, Sund 0.53, Sälta, Skerry GT 0.49, Kobb, Ankar 0.44 |
| Snow on gravel | Grus 0.86, Holm 0.79, Berg 0.73, Ström 0.57, Sten, Fjärd, Bris, Ljus, Vik, Sälta, Kobb, Sund 0.32, Skerry GT 0.29, Ankar 0.27 |

The Berg's own grip is so low that on dry gravel it only draws level with the best road cars; it leads them on grass and snow.

On each set of tyres, sideways grip at 60 km/h and metres to stop from 100, for a car of each class:

| Ground | Tyres | Skerry GT (sports) | Ström (road) | Grus (rally) | Berg (off-road) |
|---|---|---|---|---|---|
| Snow on asphalt | Summer | 0.27 g, 127 m | 0.35 g, 104 m | 0.46 g, 78 m | 0.31 g, 111 m |
| | Winter | 0.44 g, 80 m | 0.56 g, 65 m | 0.73 g, 49 m | 0.49 g, 71 m |
| | Studded | 0.46 g, 77 m | 0.58 g, 62 m | 0.75 g, 47 m | 0.51 g, 68 m |
| Ice on asphalt | Summer | 0.19 g, 183 m | 0.21 g, 170 m | 0.25 g, 138 m | 0.17 g, 200 m |
| | Winter | 0.27 g, 131 m | 0.30 g, 120 m | 0.36 g, 98 m | 0.24 g, 145 m |
| | Studded | 0.39 g, 91 m | 0.44 g, 83 m | 0.52 g, 68 m | 0.34 g, 102 m |

Winter tyres in snow and on ice are the rows the table had before tyres, to the last digit, and summer tyres in the dry and the wet are too.

Every car's thirty-two rows are in `sim/car-limits.json`.

## Open

- **The tyres.** Whether summer tyres in winter are punishing enough to make changing them worth it without being a chore, and whether studs on ice feel like the reward they should; the gaps are first guesses.
- **The classes.** Which car is in which, and how far apart the classes are, are first guesses to judge in the game, as is whether the Berg should lead the road cars on gravel too.
- **The feel.** Every number is a starting point for the owner to judge against the reference games: whether gravel lets go early enough and holds a slide well enough, whether grass punishes enough without spinning the car, whether wet asphalt is too forgiving, whether ice at a quarter of the grip is fun or a chore.
- **Ice's top speed.** With no rolling resistance on ice, a car on ice still reaches its dry top speed in a straight line, given time: true of real ice, but whether it plays well is the owner's call.
- **The autopilot** maps a wheel angle to steering by the dry lock, so on a loose surface it steers a little less than it means to and corrects as it goes. The racer that grows out of it should read the footing.

## Later: winter and the feel against TDU

Decided as directions, not built. None of it is needed until the owner picks it up.

**What the racers fit.** A racer is a car added beside the player's, on summer tyres unless it's given others. Once there are seasons, the racers fit the season's tyres, and the speed plan reads the table's rows for them.

**Slush in a thaw** is the one winter particle not yet thrown, waiting on the weather to have a thaw.

**The art of winter** is the rest of the season, already in `docs/PLAN.md`'s Depth: snow over the land with the roads cleared and banked, snow on spruce, bare deciduous trees, ice on the sea, and the car itself carrying snow and road salt.

**The feel against Test Drive Unlimited.** With no way to measure TDU, the comparison is from what's known of it: TDU's cars feel weighty, steer slowly and understeer, with driving aids that can be turned down to a "sim" mode, and TDU 2 was widely called skittish. Åland Drive is more forgiving and a touch grippier: the steering never asks for more grip than there is, the yaw assist steadies the car, brakes and throttle are capped at the grip (a perfect ABS and traction control), and steady corners hold 0.86–1.43 g, at or a little above real road cars on road tyres. To come closer to TDU's weight: slower steering, more understeer allowed through, and an aids-off mode that turns the yaw assist and the grip-aware steering down. Fan-made dumps of TDU's handling files may hold real numbers to compare against; not looked into.

**Hills: a known gap.** The car's physics takes slopes from first principles: each wheel's spring pushes along the slope's upright and its tyre acts in the slope's plane, gravity pulls the car back up a climb and on down a descent, and grip follows the load on each tyre, so a steep slope, a crest or a weight shift changes what each wheel holds, and a steep enough climb on ice or gravel spins the wheels to a stop. What isn't covered: the steering's lock and the yaw assist work out the grip there is as if the ground were flat, so on a steep slope they ask slightly too much or too little; the racers' table is measured on a flat pad, so it says nothing of climbing or braking downhill, which the speed plan will have to allow for from the road's own heights; and the playground is flat, so none of it has been felt. If it's wanted, the playground gains climbs and descents at set gradients (about 5, 10 and 15%) in asphalt and in gravel, with a sharp crest and a dip, laid by `tools/playground.ts` on raised ground, and the limits tool measures each car climbing and braking downhill on each surface.

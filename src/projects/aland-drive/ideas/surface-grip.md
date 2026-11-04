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

**The racers' table has a row per ground.** `tools/car-limits.ts` measures every car on a test pad of each surface, in each condition: sixteen rows a car. The racers' speed plan reads the row for the ground under each stretch of its route. The table's print covers the surfaces' grip as well as the cars' tuning, so changing either asks for the table to be measured again.

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

Every car's sixteen rows are in `sim/car-limits.json`.

## Open

- **The classes.** Which car is in which, and how far apart the classes are, are first guesses to judge in the game, as is whether the Berg should lead the road cars on gravel too.
- **The feel.** Every number is a starting point for the owner to judge against the reference games: whether gravel lets go early enough and holds a slide well enough, whether grass punishes enough without spinning the car, whether wet asphalt is too forgiving, whether ice at a quarter of the grip is fun or a chore.
- **Ice's top speed.** With no rolling resistance on ice, a car on ice still reaches its dry top speed in a straight line, given time: true of real ice, but whether it plays well is the owner's call.
- **The sound** still finds the surface its own way, from the nearest road's line, so a wheel on the verge is heard on asphalt within 5 m of the centre. It could read the wheels' surfaces instead.
- **The autopilot** maps a wheel angle to steering by the dry lock, so on a loose surface it steers a little less than it means to and corrects as it goes. The racer that grows out of it should read the footing.

## Later: tyres, winter and the feel against TDU

Decided as directions, not built. None of it is needed until the owner picks it up.

**Tyres are an input of their own, beside the condition.** Snow and ice today assume no particular tyre (ice keeps about a quarter of a car's dry grip, snow about half), which misses the main thing about a Finnish winter: winter tyres are the law and most drivers run studs. So a tyre is one of summer, winter friction (studless) or studded, and the season sets it, not the driver: studded in snow and ice, summer in dry and wet, with a dev switch and a link parameter to try the others. Against summer tyres:

- **Studded**: much better on ice, roughly double the grip (Sweden's road research institute measured studs halving the braking distance on very slippery ice), much better in snow, a little worse on dry and wet asphalt.
- **Winter friction**: better on ice but well short of studs, about level with studs in snow, a little worse on dry and wet asphalt.
- A car's class still applies on top: a sports car on studs is still worse in snow than the rally car on studs.
- The racers' table assumes the season's tyres, so it keeps one row per ground, and the AI drives what the law puts on the cars.
- Åland makes its own road traffic law; its dates for winter tyres and studs weren't found (mainland Finland: winter tyres from 1 November to 31 March as conditions require, studs allowed then). They matter once there are seasons.

**What the tyres are heard and seen as.** Studs tick and hum on bare asphalt, a sound of their own beside each surface's. The tyre particles take the winter too: powder in snow, ice chips under studs, slush in a thaw.

**The art of winter** is the rest of the season, already in `docs/PLAN.md`'s Depth: snow over the land with the roads cleared and banked, snow on spruce, bare deciduous trees, ice on the sea, and the car itself carrying snow and road salt.

**The feel against Test Drive Unlimited.** With no way to measure TDU, the comparison is from what's known of it: TDU's cars feel weighty, steer slowly and understeer, with driving aids that can be turned down to a "sim" mode, and TDU 2 was widely called skittish. Åland Drive is more forgiving and a touch grippier: the steering never asks for more grip than there is, the yaw assist steadies the car, brakes and throttle are capped at the grip (a perfect ABS and traction control), and steady corners hold 0.86–1.43 g, at or a little above real road cars on road tyres. To come closer to TDU's weight: slower steering, more understeer allowed through, and an aids-off mode that turns the yaw assist and the grip-aware steering down. Fan-made dumps of TDU's handling files may hold real numbers to compare against; not looked into.

# Car traffic and AI racers

A design for the two kinds of computer-driven car Åland Drive will have: **traffic**, the island's ordinary drivers going about their day, and **racers**, a few AI drivers who race the player for real. It is an idea in its first steps: the foundation's first two pieces are built (several simulated cars, and each car's limits measured), so is the grip by surface the racers need, and so are the lane map in the pipeline and the game, its lab and the index of what's around (pieces 8–10), and the bubble with cyclists as its first users (piece 11), as the project's `CLAUDE.md` describes, and walkers on the same lanes; the rest isn't. The architecture, the order of work and four of the owner's decisions are settled, with police left open (see "The owner's decisions"); everything else, numbers included, is a starting point to be measured and judged once it is on the road.

The two are designed together because they stand on the same foundation, and because the obvious framing, cheap cars for traffic and real cars for racers, needed testing against the code before either is built. It holds, with three corrections the code forced:

- **The GPS's network can't be the lane map.** It joins roads at junctions, not lanes, and its lines are OSM's, not the road as laid. The lane map has to come from the pipeline's laid surface.
- **Racers don't need the lane map at all.** A race is one route, and everything a racer needs (its line, the road's edges, who is ahead) can be read along that route. So racers can come first, as phase 6 needs them, and traffic later.
- **Anything simulated far from the player needs ground of its own.** Today the physics loads ground only round the player's car, so a racer 300 m ahead would fall through the world.

The owner's decisions changed one more part of it. Traffic isn't each player's own: it is shared and fully synced, with every reaction and collision, the same for everyone. So one rule runs every computer-driven car online, traffic and racers alike: **the player nearest it runs it, and everyone else sees it as they see another player's car.**

## What's there today

- **Several simulated cars.** `sim/drive.ts` holds the player's `Car` and any others the game adds (`Drive.addCar`) in one Rapier world, each a body on four wheel rays (`sim/car.ts`), stepped 120 times a second from its own `DriveInput` (throttle, brake, steer, handbrake). The same inputs give the same drive, every time, and a car added elsewhere leaves the player's drive exactly as it was.
- **Ground round every simulated car.** `sim/ground.ts` keeps the 3×3 blocks of 120 m round each car loaded as collision meshes, the blocks of cars close together shared. So the ground reaches at least 120 m from every car in every direction, and nothing beyond.
- **Each car's limits.** `sim/car-limits.json`, measured by `tools/car-limits.ts` on a flat test pad of each surface in each condition: each car's sideways grip in steady corners from 60 to 220 km/h, its braking and its pull, band by band of speed. A test holds it to the cars' tuning.
- **Other players as stand-ins.** `sim/remote-cars.ts`: each other player's car is a dynamic body with no ground and no gravity, steered every step to where that car should be, so a hit trades momentum by weight and the stand-in is pulled back on its way. It touches only the player's car (`sim/groups.ts`). This is already most of what a traffic car near the player needs.
- **A plain driver.** `sim/autopilot.ts` follows one line by pure pursuit, slowing for bends ahead to a fixed 9 m/s² of sideways grip whatever the car. It knows nothing of other cars, the road's width or the car's own limits. It is the seed of the racer.
- **Road centre lines.** `sim/road-net.ts` holds each loaded tile's laid road centres, for respawning. A lesser road's line stops short of the road it meets (the apron between is paved, not lined), so the lines have gaps at every junction and nothing joins them.
- **The GPS's network.** `map/road-graph.ts`, from one island-wide file: junctions as nodes, roads between them as edges, with names, kinds and one-way flags, routed by A*. Any road into a junction can leave by any other: no lanes, no turn rules, no right of way. Its lines are OSM's thinned to a metre, not the laid ribbon, which the pipeline rounds and pushes clear of buildings.
- **Who gives way, in the pipeline.** `pipeline/roads.py` knows, for every lesser road, which road it ends on, and `pipeline/roadside.py` puts a give-way sign where a lesser road meets a greater one, or where OSM maps a stop or give-way, and reads OSM's speed limits for its speed signs. None of that reaches the game as data.
- **Cars to draw.** `art/cars/fleet.ts` draws "world cars, parked or in traffic": one draw call per model and level of detail however many there are, moving one costs four numbers, a full model to 120 m and a 30-triangle stand-in to 900 m. There are 18 world-only models (a taxi, a post van, a pickup, a raggare and family cars among them) beside the 14 drivable ones. A world car's wheels don't turn.

## What was measured

Lanes and junctions are counted from the published road map (`map.json.gz`) over the roads traffic would use, residential and above: a lane is one direction of one road between two junctions, a movement is one lane in to one lane out through a junction, and a junction is a meeting of three or more roads.

| Where | Road | Lanes | Junctions | 4-way or more | Movements |
|---|---|---|---|---|---|
| Whole main island | 2,074 km | 24,430 | 3,192 | 182 | 19,162 |
| L2334F, Mariehamn north (busiest tile) | 116 km | 2,756 | 420 | 28 | 2,058 |
| L2334E, Mariehamn centre | 68 km | 1,851 | 248 | 56 | 1,700 |
| L2343C, country | 58 km | 632 | 72 | 6 | 468 |
| Within 2.2 km of Storagatan (the detail reach) | 73 km | 2,132 | 350 | 54 | 1,986 |
| Within 2.2 km of L2343C's middle | 27 km | 224 | 26 | 1 | 162 |

Counting service roads and tracks too, the island has 3,546 km of motor road and 11,500 junctions, most of them drives. Only 581 roads are one-way, nearly all in Mariehamn. So the lane map is small: a few thousand lanes in the busiest place a player can be, a few hundred in the country.

**One simulated car**, counted on the fixture tile by the scripted driver along Route 1 for two minutes at 90 km/h (2.9 km): each step it casts **4 wheel rays**, is **1 body**, and is in contact with **1.2 ground blocks** on average. It **builds 31 ground blocks per km driven**, each about **1,800 ground and 130 road triangles** on a country tile. A traffic car moved along its lane costs no rays, no body and no ground at all.

**Several**, by the same driver on the same road for the same two minutes, every car at 90 km/h:

| Cars | Wheel rays a step | Bodies | Ground blocks loaded | Blocks built per km the cars cover |
|---|---|---|---|---|
| 1 | 4 | 1 | 9 | 28 |
| 4 in a pack, 12 m apart | 16 | 4 | 10 | 29 |
| 8 in a pack, 12 m apart | 32 | 8 | 11.3 | 30 |
| 2, 1 km apart | 8 | 2 | 18 | 27 a car |

Rays and bodies grow with the cars; ground grows with how spread out they are. A pack shares nearly all its blocks, so eight racers together cost the ground of one car and a bit; a racer far from the player costs a car's ground of its own.

## The shared foundation

### The lane map

A lane is a line a car drives along: one direction of one laid road, offset from the road's centre to the middle of its half. Lanes join through junctions by **connectors**, short curves across the junction's apron from one lane's end to another's start. A connector knows which other connectors it crosses or merges with, and which of each pair gives way.

- **Built in the pipeline, per tile**, from the road surface as laid, so a lane runs on the drawn road and never on OSM's sketchier line. The laid surface already has each road's centre and edges at every section, so a lane's middle is exact, its height lies on the surface, and banking comes free.
- **Topology from what the pipeline already knows**: which chain each lesser road ends on, one-way flags, roundabouts (whose ring is laid whole first), and OSM's turn restrictions, which the pipeline would start fetching. Every road on Åland is one lane each way except a handful of Mariehamn's streets, and OSM's `lanes` tag, which the pipeline already keeps, covers those.
- **Right of way by one rule, the one the signs follow.** At a junction with a give-way sign, the road it faces gives way, by the same test `pipeline/roadside.py` uses to place the sign, so what a player sees and what traffic does can't disagree. A roundabout's ring has priority. Two equal roads meeting with no sign give way to the right, as Finnish law has it. A left turn gives way to oncoming traffic.
- **Speed** is OSM's limit where it has one and the road class's otherwise, in the same table the speed signs read.
- **Paths too**: footways and cycleways are laid ribbons already, so the same build gives them lanes, which is what the cyclists and walkers will use. They join the roads at crossings.
- **Streams with detail**, as the road surface does: decoded in the tile worker, joined into one network for the loaded tiles the way `RoadNet` joins road lines. A lane crossing a tile's edge ends on the seam section, which both tiles already write to the millimetre, so its two halves find each other by place with no shared ids. Lanes exist only where detail is, within 2.2 km of the car, which is further than any traffic needs.
- **The GPS keeps its own network.** It routes across the whole island before detail exists, and that is a different job. A race's route comes from the GPS; a traffic car's choice at a junction comes from the lane map.

At these counts a tile's lanes are tens of kilobytes beside the 5–14 MB it already is.

### Knowing what's around

One index of every vehicle near the player, whatever drives it: the player's car, other players' stand-ins, racers, traffic, and later cyclists. Each is placed on the lane it's on (a simulated car is matched to the nearest lane running its way, as respawning finds the nearest road) with how far along it is. The questions it answers are few: what is ahead on my path within this distance, through the next junction and on lanes that merge into it; what is coming on the lanes my turn crosses; what is beside or behind me. Traffic, racers and cyclists all ask the same questions, so they all see each other and the player the same way.

### Drawing

Traffic is `art/cars/fleet.ts` as it stands: one draw call per model and level of detail, so twenty cars or two hundred cost the same draws, and each moves by four numbers. A traffic car carries a few per-instance numbers more than a parked one for what moves: brake lights, an indicator, hazards, and wheels that turn up close, since a world car's don't and a car passing at 10 m will show it. Racers are drivable cars and are drawn as other players' cars are (`render/remote-cars.ts`), with the full art.

A place shows a mix of models rather than all eighteen, so the draws stay a handful: Mariehamn's taxis and vans, the country's pickups and estates.

### Collisions

Kept to what already works:

- **A traffic car away from any simulated car is no body at all**: a place on a lane. Nothing can touch it, and nothing needs to.
- **Near a simulated car it is a stand-in**, exactly as another player's car is: a body with its own box and weight, steered each step to where its lane driver says it is, so a hit trades momentum by weight and nothing passes through anything. "Near" is within 100 m, inside the 120 m the simulated car's own ground already covers, so it costs no ground.
- **A traffic car that is hit becomes a car.** A stand-in is always pulled back on its way and has no ground, so a shove would be undone or leave it floating over a ditch. Once hit, or pushed off its lane, it is built as a real simulated car where the stand-in was, moving as it moved, as `Drive.setCar` does when the player swaps cars. Then it rolls, slides into the verge and stops on its own wheels. Its driver brakes and puts the hazards on. When it's back on its lane and the player has gone, it becomes a place on a lane again.
- **A world car's handling** comes from the drivable car nearest it in size and weight (the post van drives as the van), until it matters enough to give each its own character in `sim/cars.ts`.

### The simulation holds more than one car

Racers, and traffic once hit, are full cars in the player's own Rapier world, beside the player's, each from its own `DriveInput`. The simulation holds several cars and loads ground round each of them, the blocks round every simulated car together, so a racer 1 km ahead drives on real ground (`sim/several-cars.test.ts` holds that, and that two simulated cars collide). A pack of racers close together shares most of its blocks. A car added sits out its first step out of the world: a collider made since the last step isn't found by a ray until the world steps, so its new ground isn't there to it yet, and stepping the world for it would move every other car.

A simulated car needs detail under it, which only reaches 2.2 km from the player. Past that, a racer moves on a pace model instead: along its racing line at the speeds its plan says, with no physics, and back into the simulation once it's within reach. A player who is that far behind or ahead can't see it either way.

### Online: the nearest player runs it

Every computer-driven car, a traffic car or a racer, is run by exactly one player's machine at a time, and that is the player nearest it. That machine drives it, decides how it reacts, and sends its state to everyone, as a player's car is sent today. Every other player sees it as a stand-in, exactly as they see another player, so hitting it already works: both sides see the hit, each feels it by weight, nothing passes through, and with lag it comes out a little livelier than a real one, as hits between players do now.

- **Why the nearest.** Whoever is nearest is the one most likely to touch it, and sees it with no lag at all. A traffic car someone hits passes to them within moments, since they're now nearest.
- **Handing over** is the room's own trick: the state is the whole car plus a small record of its driver (which lane, how far along, which way it's turning next, what it's waiting for, its seed), so the next player carries on from exactly there.
- **Never mid-fight.** A car stays with whoever runs it while any other car is within a few metres of it, and changes hands only once another player is clearly nearer and has been for a moment. So in a three-way fight for a place, two players and a racer side by side, the racer doesn't flip between them: one of them runs it and the other sees it slightly late, no worse than three players fighting.
- **Spawning in a shared world.** Each stretch of lane is kept by the player nearest it, and only that player makes cars there, out of every player's sight. A car goes only once it is far from everyone. So two players driving together see one stream of traffic, not two.
- **What it costs.** A traffic car's state can be much smaller than a player's (where it is, its heading, speed and lamps, a few dozen bytes), sent only to players near it. Forza Horizon is reported to run far less traffic online than solo, which is the warning: while many players are together, the density may need to come down.

### Streaming

Nothing new streams. The lane map is a file in each tile's detail, and lands and goes with it. Traffic spawns only on lanes that are loaded, and a traffic car whose tile is about to go is out of sight and gone first.

## Traffic

### Where it comes from and goes

Traffic lives in a bubble round the player, a few hundred metres to about 1.5 km. A car appears only where the player can't see it appear: beyond the fleet's 900 m reach, or behind the player, or out of sight round a bend or over a crest, read from the lane's place against the camera. It goes the same way, out of sight and far enough off. Cars are made at the rate a road's density asks, from both ends of each lane, so a road ahead fills with oncoming cars and the player catches up with others going their way. A car is a seed, so its look and driver are the same if it comes back.

### How it drives

- **Along its lane**, at the speed limit with a little of its own (some drivers do 85 on a 90 road, some 95), and slower for bends: the same look-ahead the autopilot has, at a comfortable sideways pull a real driver uses rather than the tyres' limit.
- **Following** by the standard model for it (the Intelligent Driver Model: a gap that grows with speed, gentle braking, a firm brake only when it must), so queues form and dissolve as real ones do.
- **At a junction**, it chooses where to go as it nears: weighted to stay on the greater road, rarely into a drive. It slows to a turn's speed, signals, and gives way by the lane map's rule, waiting for a gap on every connector it must yield to, and creeps forward at a busy one.
- **Overtaking** is rare, as on Åland: only round something stopped or crawling (a tractor, a cyclist, a hit car), and only with the oncoming lane clear for the whole way past.

### Around the player

Traffic sees the player as it sees any car ahead, so most of this falls out of following and giving way. The rest is decided: traffic drives **like Test Drive Unlimited's, as real people do**, flaws included (see "The owner's decisions"). Now and then a driver is a little late on the brakes, hesitates at a junction or drifts to the line on a bend, so the roads feel lived in rather than run by rule. Never anything that would hurt the player's drive on purpose.

- **The player stops in its lane**: it slows and stops behind with a gap, waits a few seconds, then goes round when the oncoming lane is clear, or waits behind if it never is. A short horn if the player sits there long.
- **The player cuts in front**: it brakes as hard as it must and drops back to its gap. Nothing chases, flashes or punishes.
- **The player comes up fast behind**: it carries on. It doesn't pull over for a racing car; that's the player's to pass.
- **The player drives on the wrong side**: oncoming traffic slows and edges to its verge, as far as the road allows.
- **The player hits it**: it becomes a car (see Collisions), takes the hit by its weight, stops with hazards on, and after a while drives on if it can. Cars behind it queue and go round.
- **Another player does any of this**: the same, since traffic sees every player the same way, on whichever machine runs it.

Police aren't part of this. Åland has its own (Ålands polismyndighet), and the real thing would be stops and Finland's income-based fines rather than chases, but how police fit the game is open. A patrol car would be a traffic car with a job, so nothing here stands in its way.

### Density, by place and time

From the real island, kept light. Åland's roads are quiet outside Mariehamn, and that emptiness is the game's mood. kartor.ax has traffic counts among its datasets, so each road's share comes from the real count where there is one and its class otherwise: Route 1 and the Godby road busiest, a village lane seeing a car every few minutes, Mariehamn's streets busy by day. Once there is a day and night, the same counts follow the hours: a morning and evening peak, quiet nights, more on summer days, and the ferries' arrivals filling the roads from the harbours. Places add their own: a queue at the ferry, cars at the petrol station.

### How it sounds

A few voices, not one per car: a petrol car, a diesel, a van and an electric, on the same Web Audio graph the player's car uses, with revs from speed. Only the nearest two to four traffic cars are voiced, each with its pass-by rising and falling in pitch as it goes by, and tyre noise by speed and surface. The rest is silence, which the country's roads are anyway. A horn, an indicator's tick when stopped beside the player, and the thump of a hit, from the one-shots the game already plays.

### What it costs, and how it scales down

- **A traffic car away from the player**: no physics. Each step it moves along a line and asks the index what's ahead, a handful of arithmetic.
- **Near the player**: a stand-in body, one more body in the solver, still no rays and no ground.
- **Hit**: a full car, 4 rays and a body, for as long as it takes to stop and drive on. Only the few the player has touched.
- **Drawing**: two draw calls per model in use, a full model at most 2,000 triangles and a stand-in 30. Twenty cars in view are about 40,000 triangles beside a frame's 0.5–1.1 million.

Everything that costs is a number a frame reads, the forest's way: how many cars a road gets, how far the bubble reaches, how near a car has to be to become a stand-in, and how many are voiced. A weaker machine turns the first two down; no setting changes how a car drives.

## Racers

### The driver

A racer is an AI holding the same `DriveInput` of the same simulated car as the player: the same physics, grip, engine and gearbox, so whatever it does a player could do too. It grows out of the autopilot in three steps.

- **A racing line.** For the race's route, a line inside the road's edges that straightens the bends: outside, apex, outside. The road's edges come from the laid surface, which knows each section's width, so the line never leaves the tarmac. A racer that's being cautious, or on a narrow village road, keeps nearer its own side.
- **A speed plan for its own car.** Each car's real limits are measured once in the simulation by a tool (`tools/car-limits.ts`, into `sim/car-limits.json`): the sideways grip it holds at speed, how hard it brakes, how it pulls through its gears. From those, the plan works out the fastest speed at every metre of the line: as fast as the next bend allows, braking where this car must brake for it. Today's autopilot uses one number for every car, which is why it is slow in the GT and wild in the van. This makes each racer drive its car as that car can be driven.
- **Following the plan**: steering by pure pursuit along the line, throttle and brake to the plan's speed, and the handbrake only where a hairpin asks for it.

### Overtaking and defending

Racers see each other and the player along the route: who's ahead and how far, who's behind and closing. A faster racer picks a side and a place to pass, usually braking into a bend on the inside or along a straight, moves to its passing line, and back to the racing line once clear. A racer being caught holds the inside before a bend, once, and doesn't weave. Two racers side by side leave each other a car's width. They brake for a crash ahead rather than drive through it.

### Crashes and recovery

A racer crashes as any car does: it runs wide, clips a wall, is hit. It recovers as a player would, by steering back to the road, reversing out of a ditch, and, when it is stuck, upside down or in the water, by pressing its own R: the same reset the player has, to the nearest road, at the same cost in time. Nothing the game does for racers is done for nobody else.

### Difficulty without visible cheating

The rule: **a racer never gets more grip, power or luck than its car has.** No rubber banding, no speeding up out of sight. Difficulty is how well it drives:

- how much of its car's limit it uses (the plan at 85% of the grip or at 99%);
- how cleanly it follows the line, and how late it brakes;
- how quickly it reacts to a car in its way;
- how often it makes a small mistake, a late brake or a lift mid-bend;
- which car it drives.

Since the drive is deterministic, a racer's lap is the same every time for the same start and the same player, so its difficulty can be measured by counting: its time on each real stage, at each setting, from a tool.

### Races through traffic

On a road that's open, as every road is but on a closed race day, racers meet traffic. They see traffic in the shared index as they see each other, and pass it as they would a slow racer, only with the oncoming lane clear. Traffic treats a racer as it treats the player. A racer that hits a traffic car makes it a car, the same as the player does. Whether a race has traffic is the race's own choice: the real streetrace and rallysprint stages are closed roads.

### Who runs the racers online

Online racing is **co-op, the way Forza Horizon's team races are**: players together against the AI racers. A racer is run by the player nearest it, as traffic is (see "Online: the nearest player runs it"), sent to everyone 20 times a second as a player's car is, and held by whoever runs it while it's in a fight. Everyone sees the same race and the same racers, and the player wheel to wheel with a racer is usually the one running it, so they see it with no lag. A racer is a pure function of its car and its small driver record, so a handover changes nothing about how it drives. If a player leaves, their racers pass to the next nearest. See "The owner's decisions".

## What is shared and what isn't

| | Traffic | Racers |
|---|---|---|
| The lane map | Drives on it | Only through traffic, and to start on a road |
| Knowing what's around | Yes | Yes, along the route |
| Drawing | The fleet, world cars | The drivable cars' full art |
| Physics | None, then a stand-in near a car, then a car when hit | Always a full car, within detail |
| Ground of its own | Never: it is near the player when physical | Yes, round each racer |
| Its driver | Lane following, giving way | Racing line and speed plan |
| Online | Run by the nearest player, seen by everyone | The same |

## The order to build it in

Each piece is small enough for one session, and says what it needs first. Racers come first because phase 6's races need them, and traffic waits for the cyclists, as the owner's plan for life in the world has it.

**Foundation**

1. **More than one simulated car.** Built. The simulation holds several cars, each with its own input, and loads the ground round all of them. Holds by test that two simulated cars collide and that a car 1 km from the player drives on real ground.
2. **Each car's limits, measured.** Built. A tool drives each of the 14 cars through set manoeuvres in the simulation and records its grip at speed, its braking and its pull, into a table the racers read.

**Grip by surface comes before the racing line.** Built (`ideas/surface-grip.md`): each wheel grips by the surface under it (asphalt, gravel, grass, rock) and the condition (dry, wet, snow, ice), so the Ytterby gravel stage no longer drives like tarmac. Surfaces are the car's physics, not a racer's: every car has them, and the racers have them for free because they drive the same car. The limits table has a row per surface and condition, which the speed plan reads for the ground under each stretch of its route. Traffic doesn't need it: a traffic car away from the player runs no physics, and near one it is a stand-in steered to its lane, so a surface reaches it only as its lane's speed. Getting the feel right is the work, since the balance between arcade and realism is hard to strike. It is judged by the owner in the game against Test Drive Unlimited, Forza Horizon and The Crew, the games this one stands among: gravel that lets go earlier and slides predictably, and grass and verges that punish without spinning the car, rather than a simulator's.

**Racers** (needs 1, 2 and grip by surface; phase 6's race start and finish are their own work, and the racers need only a route)

3. **The racing line and speed plan**, for a route on real roads, inside the laid edges. Checked against the real stages of `docs/DRIVING-CULTURE.md`: every car finishes Norra Sundsvägen and the Ytterby gravel, and the times come out by count.
4. **The racer.** The autopilot grown into a driver of the plan, with recovery by its own reset, and difficulty as above.
5. **Racecraft**: racers seeing each other and the player along the route, passing and defending.
6. **Computer-driven cars online**: the nearest-player rule, built once for racers and traffic alike. A car's state and its driver's record sent to everyone, handed over to the nearest player, held mid-fight. Proven first on racers, by two pages on the e2e run's own relay racing one racer and swapping who runs it. Needs 4.
7. **Co-op races online**, the team against the racers. Needs 5, 6 and the online race itself.

**Lanes** (needs nothing; can run beside the racers)

8. **The lane map in the pipeline**: lanes along the laid roads and paths, connectors through junctions, right of way by the signs' rule, speed limits, joined at seams. Comes with an audit: counts per tile, every connector on the drawn surface, every lane reachable. Needs a tile rebuild, the owner's call.
9. **The lane map in the game**, streamed with detail, with a lab to see it drawn over the road, as the junction lab is, for the owner to judge its junctions.
10. **Knowing what's around**: the index of every vehicle on its lane.

**The bubble, then life on the roads** (needs 9 and 10)

11. **The bubble**: spawning and despawning out of sight round the player, by density. **Its first users are the cyclists**, which settle it: always kinematic, on path lanes and road edges, the simplest traffic there is. Walkers follow on the same lanes. Built, walkers too, in the lane lab, as the project's `CLAUDE.md` describes: `art/people`' walking crowd on the paths, by their own rules, crossing roads to the path beyond, cyclists and cars stopping for them; at four times Åland's density a standoff by a crossing can still hold walkers a while. Only the walk the people kit already has is used: whether walkers get art of their own (a dog on a lead, a pram, a jogger) is the owner's call. Built, in the lane lab (`traffic/bubble.ts`, `traffic/sight.ts`): seeded slots on every lane, a density per road and path kind per kilometre, cars and cyclists both, out of sight being past a kind's reach, out of view or behind the ground; trees and buildings don't count as cover yet. The densities per kind of road and path are starting values: the owner judges them by feel in play once traffic runs in the game, not in the lab. Cyclists are `art/bikes`' crowd. The player's car doesn't touch one yet: traffic and cyclists brake for it, but it passes through a cyclist, and what a hit should do is still open.
12. **Traffic driving**: lanes, speed, following, junctions, giving way, drawn by the fleet with lights and turning wheels. Begun: cars on the lanes follow, slow for bends and limits, give way, steer on their wheels and signal their turns, and on a road too narrow for two pass slowly at its edges or stop on the verge for each other, drawn by the fleet, in the lane lab only (`traffic/lane-driver.ts`); no lights and no signals' phases yet.
13. **Traffic and the player**: the reactions above, stand-ins near a simulated car, a car once hit. Needs 1. Begun, in the lane lab: traffic brakes for a simulated car lying across its path at any angle and goes round one standing once the oncoming side is clear; near one, each traffic car has a stand-in, and a car hit hard becomes a simulated car that stops with its hazards on and after a few seconds rejoins its lane, or waits for the player to go (`traffic/contact.ts`). Not yet: the horn, the small human flaws, and a hit car drawn rolled or pitched (the world cars turn only about the vertical), with the handling and collision box, once hit, of the drivable car nearest it in size.
14. **Shared traffic**: traffic on the nearest-player rule, with spawning by whoever keeps a stretch of lane, so players together see one traffic. Traffic isn't turned on online until this is in. Needs 6 and 13.
15. **Density by place and time, sound, and the settings that scale it down.** Cyclists included: how many ride follows the hour and the season, busiest on summer days and in the commuting hours, few at night and fewest in winter, from the game's own clock and calendar (`time/`, `climate/`). Until then the bubble's densities are the same at any hour and in any month.
16. **Races through traffic.** Needs 5 and 14.

## The owner's decisions

Each was put to the owner with a recommendation and its tradeoffs; these are their answers.

### How much traffic: light, true to Åland

| | Light, true to Åland | Busy, more than real | Off unless switched on |
|---|---|---|---|
| What it's like | Quiet country roads, a car every minute or two on main roads, Mariehamn busy by day | Something to pass and weave through on every road | Empty roads, as now |
| Feel | The game's mood: "90 on the sign, nobody around" | More arcade, more to do | Purest cruising, but the island feels dead |
| Cost | Least | Most: more cars in view and in the solver | None |

**Decided: light, true to Åland**, from kartor.ax's real counts, so the island feels lived in without crowding the drive.

### Whether traffic is shared: yes, fully synced

| | Shared and synced | Each player's own | Shared by the clock |
|---|---|---|---|
| What it means | One machine runs each car, the nearest player's, and everyone sees it | Every player's machine makes its own traffic | Every car a function of the time, like the boats |
| Two players cruising together | The same cars, the same reactions, the same hits | Different traffic; one swerves at a car the other can't see | The same until someone reacts to one, then different anyway |
| Network | A few dozen bytes per car, to the players near it | None | None |

The recommendation was each player's own first, shared when together later. **Decided: shared and fully synced, reactions and collisions included, from the start.** Traffic doesn't go online until it is (piece 14).

### How traffic behaves: like Test Drive Unlimited's

Asked what other games do, from reviews and player forums (none of these studios documents it): Forza Horizon's traffic keeps its lane, plods along and gets knocked aside, and players complain it brakes for no reason; TDU's was praised for driving like real people, flaws included; The Crew's is mostly something to crash through, with police that grow more aggressive the more you smash; Need for Speed Heat's is clutter, and its police are the game. None of them has traffic pull over for the player.

| | Calm, real drivers (TDU) | Plods, gets knocked (Forza) | Forgiving: makes way |
|---|---|---|---|
| Stops behind you | Waits, then goes round when it's clear | Waits, or is knocked aside | Goes round at once |
| A fast car behind | Carries on; yours to pass | Carries on | Pulls over to let you by |
| Feel | A real island, lived in | Simplest, least believable | Easier, more arcade |

**Decided: like TDU's, calm real drivers with their small human flaws.**

**Still open: police.** Åland has police, and the real consequence of speeding there is being stopped and fined by income, not chased. The owner doesn't want police now and hasn't decided how they'd fit the game. Nothing here blocks them: a patrol car would be a traffic car with a job.

### Who runs the racers online: the nearest player

The owner wants online racing to be co-op, as Forza Horizon's team races are: players together against the AI.

| | The nearest player runs each racer | The race's starter runs them all | Every player runs their own copy |
|---|---|---|---|
| Two players and a racer fighting for a place | One of the two runs it, the other sees it slightly late, as they see each other | The starter may be far away: both see it through lag | Each sees a different fight |
| Fair to a team | Yes: everyone races the same racers | Yes | No: any contact makes the copies differ |
| Network | About 6.4 kB a second per racer from whoever runs it | The same | None |

**Decided: the nearest player runs each racer, and keeps it while it's in a fight**, so it never flips between two players side by side. The same rule runs traffic, so it is built once (piece 6).

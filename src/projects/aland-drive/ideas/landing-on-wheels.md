# Landing on the wheels

How Åland Drive could make a car that flies off a crest more likely to land on its wheels, without taking away the fun of a wild roll in the air. Nothing is built. The direction is chosen (pull the car upright in the air), and the next step is to measure how the cars land today.

## The problem

Hitting a bump or a hill and rolling through the air is fun. Landing on the roof and having to reset is not. The game should cheat the physics enough that most big jumps end on four wheels, but not so much that a crash feels taken away from the player.

The rule in `CLAUDE.md` stays: nothing puts the car back by itself, and a reset is always the player's, with R or Y. Everything here is about the car's own motion, never a teleport.

## What the car already does against rolling

Several of the standard tricks are in `sim/` already, each per car (`sim/tuning.ts`, `sim/cars.ts`):

- **Tyre forces act above the road** (`forceLiftM`), so cornering levers the body over less than it would if they pushed at the contact.
- **Anti-roll bars** keep the body flatter in a corner.
- **Roll inertia** slows how fast a car can tip.
- **Downforce** holds the car on the road over crests at speed.
- **Steering narrows with speed, plus a yaw assist**, so the driver can't ask for a snap of grip that would start a roll.
- **Angular damping** slows any spin.

None of these acts in the air, and none helps once the car is on its side or roof.

## What other games do

None of them publish their physics, so this is part documented and part what players observe.

- **Pull the car upright in the air**: a steady twist toward wheels-down while airborne. Common in arcade and open-world racers; Forza Horizon and The Crew are widely believed to do it, but neither says so.
- **Air control**: the player rolls and pitches the car in the air with the stick (GTA IV and V, Rocket League). A control, so documented.
- **Rock it back over**: steering while on the side or roof rolls the car back on to its wheels (GTA V).
- **Right itself after a bad landing** (Rocket League), or **reset automatically** when stuck on the roof or in water (Forza Horizon, The Crew). Forza Horizon also has Rewind.
- **Always land on the wheels**, the car's angle scripted (kart racers), or **no cheat at all** (BeamNG.drive and the simulators).

**Test Drive Unlimited** couldn't be confirmed either way. One reader's review of the original's PS2 version, a separate port, says the car can't tilt past about 40°, which would be a hard lean limit rather than a pull upright. Nothing was found for TDU 2, and players of Solar Crown report rollovers from hard cornering and kerbs, which suggests no strong cheat there. The owner's memory of playing it is the best evidence available.

## The chosen direction: pull upright in the air

A small twist toward wheels-down while the car is airborne, for these reasons:

- **Leave small hops alone.** No help for short airtime, so bumps and kerbs feel real; it only switches on for real air.
- **Nudge, don't grab.** The twist is capped and grows gently, so a violent crash still overpowers it: wild crashes become rare rather than impossible.
- **Upright means the ground's upright**, the way the ground under the landing faces, not straight up, so a car landing on a slope lands flat on it.

Its known cost is that it fights a roll that has started, dragging it back flat, which is what makes crashes feel tamer in games that use it. That cost is what the measurement below is for.

**The alternative kept in reserve: finish the roll.** Predict when and at what angle the car will land, and nudge the spin's speed so it ends at the nearest wheels-down angle, on through a roll that is most of the way round, back from one that has barely started. It never cancels or reverses a spin, so a barrel roll stays a barrel roll. No game is known to have shipped this, so it's unproven; it's worth trying only if pulling upright costs too many rolls.

**Optional additions**, each separate from the assist:

- **Air control** for the players who want it, so landing well can be a skill and not only the game's help.
- **Rocking the car back over** with the steering while on the side or roof at low speed: the player's own way off the roof, which keeps the rule that nothing resets the car by itself.

## Measuring it: the jump test

Feel decides in the end, but the balance is found by counting first. A jump test on the playground (`?playground`) launches every car off crests and ramps at many speeds and spins, with the steering held in different ways, and counts for each jump:

- whether it landed on its **wheels**, its **side** or its **roof**;
- how many **full rolls** it made in the air, which shows whether the fun is still there.

Run on today's cars first, it says how big the problem is before anything changes. Then each version of the assist is run against the same jumps. A proposed starting target: about nine in ten big jumps land on the wheels, while jumps that rolled in the air still roll about as often as they do now. Once the numbers meet that, the owner drives it in the playground and on a few real Åland crests and judges whether it feels like cheating.

The playground has no ramps or crests built for this yet; the test may need some added to its layout.

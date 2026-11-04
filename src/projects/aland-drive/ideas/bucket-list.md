# Bucket list challenges

An idea with its main decisions taken, built for solo and co-op, both kinds (see the project's `CLAUDE.md`, Challenges): Forza Horizon's bucket list challenges, on Åland's real roads, played solo or as co-op for two, with a synced quick retry. These are decided: the challenges are Forza's (a clock or a speed trap, pass or fail against one target), co-op takes the two players' average, teammates are solid, either player can retry, and a challenge is one or two players. Retry lives in a new game menu on the controller's Menu button. The world map moves to View.

**The system is the foundation; the challenges on it are a first pass.** The owner played the solo challenges and judged the system sound and the list not yet good: the short ones are boring, and every one was beaten at the first try. So the twelve below, their roads, cars and targets, aren't a standard to copy or measure new challenges against. They're placeholders that prove the system, to be redesigned. Co-op is built and passes its e2e spec, but the owner hasn't played it yet.

A challenge is a timed run on its own, so it needs no AI drivers and no traffic. It needs only what's there: the road network and its GPS routes, the car's state, the places, and the online world.

## What Forza Horizon's bucket lists are

Forza Horizon 2 brought them in: two solo lists of fifteen ("15 More Things You Must Do This Summer" was the second), a Storm Island list, and co-op in online free roam. Forza Horizon 3 had 30 in Australia, 7 on Blizzard Mountain and 5 in Hot Wheels, plus blueprints, where players set their own.

- **One car, one goal, one place.** Each challenge hands you its own car, so you don't need to own it, and its title is its pitch: "Drive a Koenigsegg Agera Like You Stole It", "Outrun the Sun in a Ferrari F40", "Get Caught Doing 200 MPH in a Bugatti". FH3 labelled each easy, medium or hard and gave it a song.
- **One target, pass or fail.** Beat the time, or pass the camera at the speed, or the attempt fails. Of FH3's 30 Australian challenges, 13 are Set Routes (point to point in 1:10 to 6:00) and 6 are Speed Cameras (65 to 250 mph). Those are the two kinds this game takes. The rest were jumps, drifts and skill scores.
- **Co-op takes the average.** Both players drive the challenge at once and the team passes if their average makes the target. A strong run carries a struggling partner, and that is what made co-op fun: you could make up for a friend having a bad attempt by beating the target by more than it asked. FH2 added skill scores the same way, 30,000 alone or 60,000 between two. FH3's co-op was two players only, even in a four-player session.
- **Co-op had no restart.** To try again, one player had to quit, drive back to the start and ask to start the event, and the other had to accept, and then both loaded in again. That's a long wait between attempts of a challenge you'd try twenty times. Fixing it is what this design is for.

## The two kinds of challenge

| Kind | Solo passes when | Co-op passes when |
|---|---|---|
| **Route** | The car reaches the finish, through every gate in order, within the target time | The two finish times average within the target |
| **Speed trap** | The car passes the camera at the target speed or more | The two speeds at the camera average the target or more |

- **A Route's clock** runs from the green light, the same moment for both players. A gate is a line across the road along the route. Missing one, or going through out of order, doesn't count, so the run carries on until the car goes back through it. There's no other fail: driving off the route only costs time.
- **When a co-op Route is lost.** Neither player has finished when the clock reaches the target, but the team can still pass while the finish times can still average within it. A player still driving has a time of at least the clock's, so the run is lost once the finished times plus the clock for each unfinished player, divided by two, pass the target. After the first player finishes, the second is shown the time they now need: "Make it by 2:41". Each client has its own clock, so only a client still timing a player of its own calls the loss, and it tells the partner, whose client ends the attempt the same way.
- **A speed trap** is a camera at one point on a road, reached from the start along it. Each player's speed is taken as their car crosses its line. A co-op run ends when both have crossed it. A speed trap has no clock, so a run that's going nowhere is retried, not timed out.
- **Results** show each player's time or speed, the average in co-op, and whether it passed. A pass is kept in this browser, as finds are (`getProjectStorage`), against the challenge, with the best time or speed. A pass in co-op counts for both players.

## The game menu, and retry

The game has no menu of its own yet. The controller's **Menu** button opens one, as Start does on an Xbox, and **View** opens the world map, which Menu opens today. On the keyboard Esc opens the menu, when nothing else is open for it to close, and M stays the map.

- **In a challenge** the menu holds **Retry** and **Leave challenge**, with **Resume** first. Outside a challenge it holds what fits there: the sound, and later the settings. The dev menu stays where it is.
- **The free camera loses its controller button.** It's for inspecting the world, and F keeps it on the keyboard. A pad's View now goes to the map, which players use far more.
- **The menu doesn't stop a co-op challenge.** The partner is still driving, so the clock and the cars run on, the car's controls let go while the menu is open. Outside a co-op challenge it pauses as the map does today. The map in a challenge works the same way.
- **The result card** after an attempt has Retry first (A) and Leave (B), so a failed attempt is one button from the next.

**Retry is synced: either player retries, both retry.** Either player, at any moment, mid-run or from the result card: both cars go back to their places on the start line, standing still, and the lights count down again. No one asks and no one accepts.

- **A retry is one message**, `retry` with the next attempt's number, sent up to the world's host and handed on to the partner, as car states are now. Each client puts its car on its start place when the message arrives (`Drive.placeAt`, instant when the ground there is loaded) and answers `ready`. The lights go green only once both are ready: an event, not a delay. That's one round trip, about a tenth of a second.
- **Each green light is each player's own.** Each client counts down from when it hears the message, so the two greens can be a few tens of milliseconds apart. Each player's time runs from their own green, so the skew never reaches a result. Nothing reads a shared clock: the boats' world clock is each machine's own and can be seconds out between two players.
- **Attempt numbers settle the races.** Every message carries one. A retry for an attempt already over is dropped, and so is a second one in the same countdown, so both players pressing at once get one restart. Each player keeps the attempt number and the results so far, so either one leaving ends the co-op challenge and the other is told. The world's host only relays. The relay needs no change.
- **A retry far from the start loads, and that's fine.** The stream keeps detail round the car only, and drops a tile's past 2.8 km. Most of the list's routes stay within that of their start, so a retry there is instant. On a longer one the start's tiles have gone by the finish, and a retry goes back the way a dev menu jump does: the stream loads round the start, the first load's bar shows, and the car is put down once its tiles have landed (about 1.4 s a tile from the browser's cache). `ready` goes up only then, so the partner's lights wait for it. Keeping the start loaded through a run would make every retry instant, but it holds several more detailed tiles for the whole challenge, and a short load is better than a challenge that runs worse.

## Two players on the road

**Teammates are solid**, as they are in free roam: the stand-ins already let each car hit the other, with both clients seeing the hit. Pushing past a partner on a narrow road is part of it.

- **Two places on the start line**, side by side, each in its own lane facing along the route, at a spot where the road is wide enough for two. A challenge on a narrow road starts where it widens. Retry puts each car back on its own place.
- **After a retry the cars are apart.** A stand-in put more than 6 m from where it was already touches nothing until it's clear of this car. Two places a lane apart are never inside each other, so that guard isn't needed here, and nothing is thrown at a green light.
- **Everyone else in the world stays solid too**, so a player driving through can spoil an attempt. A retry is cheap.

**Joining.** A challenge's start is on both maps for everyone. A player who drives into its start ring is shown its own button (X, or E): alone in the ring it starts the challenge solo, and with another player there it offers Solo or Co-op, not the game menu. Co-op asks that player, whose HUD prompts the same button, and A on Join puts them in; the first countdown starts once both cars are on their places. Two is the most a challenge takes: a third player in the ring isn't offered the co-op one until it's over.

## The first list

A first pass, built to prove the system (see the top: not a standard). Twelve challenges, each on a real road or place from `docs/DRIVING-CULTURE.md` and `map/places.ts`, with lengths from that doc's table where it has them. Each car is picked for its character in `sim/cars.ts`, as Forza matched the car to the challenge. Every challenge is played solo or co-op.

| # | Title | Kind | Car | Where |
|---|---|---|---|---|
| 1 | Run the Ytterby sprint stage | Route | Grus (rally, turbo flat four) | Tomtbergsvägen and Ljufviksvägen, Jomala: the real Rallysprint's gravel stage, 1.6 + 2.5 km |
| 2 | Climb the Backrace road | Route | Bris (V6 cruiser) | Norra Sundsvägen, the real hill race's road, cut to a few kilometres |
| 3 | Climb to Soltuna | Route | Sten (hot hatch) | Getabergsvägen to the Getabergen tower, 1.2 km uphill, the hill race's first road |
| 4 | Nearly 200 on Getavägen | Speed trap | Sund (the fastest car) | Getavägen at Törnebolstad, 201 m from a standing start: the 2024 Streetrace record, nearly 200 km/h |
| 5 | 201 metres at Hammarbo | Route | Ström (electric, all its shove at once) | Hammarlandsvägen at Hammarbo, from a standstill: the 2025–26 Streetrace |
| 6 | Caught doing 145 through Lemland | Speed trap | Sälta (tired old estate) | Lemlandsvägen. A real [news story](https://www.alandstidningen.ax/nyheter/korde-145-kmh-genom-lemland), and hard in the slowest estate |
| 7 | Storagatan, harbour to harbour | Route | Vik (tiny open roadster) | Storagatan, Mariehamn, 1.0 km: the weekend cruise's street |
| 8 | Castle to fortress | Route | Ankar (V12 saloon) | Kastelholm Castle to Bomarsund Fortress |
| 9 | Up Orrdalsklint | Route | Berg (old mud-tyred 4×4) | To the Orrdalsklint viewpoint, Saltvik, the main island's highest point |
| 10 | Möckelöbacken | Speed trap | Holm (soft, wallowing pickup) | Hammarlandsvägen at Möckelö, the 2023 Streetrace |
| 11 | Road 2, flat out | Speed trap | Fjärd (estate, calm at 240) | Nya Godbyvägen, the 2021–22 Streetrace road, on its longest straight |
| 12 | Post road, the western leg | Route | Kobb (diesel van) | Gamla Postrotevägen from the Eckerö Post and Customs House east: the mail goes through |

A run of one to five minutes is what makes retries bearable, so #8 and #12 are measured first and cut to a leg if they're longer. The real post road is about 65 km. The roads and places are the point, so their names stay real. Only clubs, sponsors and brands are invented.

## Targets are measured

Forza's designers tuned their targets. Here they start from the simulation:

- **Par** is the scripted driver's time on the route in the challenge's car (`tools/drive.mjs` already drives a GPS route), or the speed it reaches at the camera flat out. The autopilot slows for bends at one fixed grip whatever the car, so its par on a Route is slow: a floor, not a target.
- **Each challenge has one target**, set from par and from the owner's own runs, and labelled easy, medium or hard by how far it sits past par, by one rule for every challenge.
- **A test holds that every challenge can be passed**, solo, by par in its own car beating the target scaled to the autopilot's floor, so no challenge in the list is impossible.
- **The rule is too kind.** The scripted driver is a floor, and targets near its par were all beaten at the first try. A target has to sit well past what the scripted driver manages, set from the owner's own runs, and a challenge is worth having only if it takes several tries. Short drags that are over in seconds have too little in them to retry.

## What's built, in order

1. **The game menu**, with View moved to the map. It's needed first, and it's worth having without challenges.
2. **Solo challenges with retry**, a retry far from the start loading as a jump does, and the start rings on the maps. Built for both kinds and the whole first list at once, since a Speed trap solo needed nothing a Route didn't: the run already took both.
3. **Co-op**: joining, two start places, the synced retry and the average. Its exit test is an e2e spec on the run's own relay. Two pages start a co-op Route. One retries mid-run, and both cars are back on their start places, counting down on the same attempt. Both retrying at once gives one attempt. A pass on the average of a fast run and a slow one counts for both.
4. **Speed traps in co-op**: #4, #6, #10, #11 on the average, as the Routes. Built with step 3, since co-op needed nothing a Speed trap did not already have from the run; its e2e spec plays a Route.
5. **Later:** blueprints, as FH3 had them, where a player picks a start, finish, kind and car on the world map. Then leaderboards.

## Still open

- **Better challenges**: a redesign of the list, its roads, cars and targets, on the system as it is.
- **Playing co-op**, which only its e2e spec has done so far.

- **What else the game menu holds** outside a challenge, beyond the sound.
- **The keyboard's retry.** Esc's menu reaches it in two presses. A key of its own may be worth it once it's been played.

## Sources

- [Forza Wiki, Forza Horizon 3 Bucket List](https://forza.fandom.com/wiki/Forza_Horizon_3/Bucket_List): every FH3 challenge with its type, target and difficulty.
- [TrueAchievements, Forza Horizon 2 walkthrough, After the Finale](https://www.trueachievements.com/walkthroughpage.aspx?pageid=7196): FH2's two solo lists, by title and difficulty, and the co-op achievement.
- [Forza Horizon 2 Achievement Guide](https://www.xboxachievements.com/game/forza-horizon-2-xbox-one/guide/) (from a search excerpt, the page itself was behind a bot check): co-op's combined skill score.
- [Co-Optimus, Forza Horizon 3 co-op review](https://www.co-optimus.com/review/1963/page/3/forza-horizon-3-co-op-review.html) (a search excerpt): two players only.
- The co-op restart, and the average carrying a partner: the owner, from playing FH2 and FH3 co-op.
- Åland's events, roads and places: `docs/DRIVING-CULTURE.md`, which carries its own sources.

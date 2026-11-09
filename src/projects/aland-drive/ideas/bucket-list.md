# Bucket list challenges

An idea with its main decisions taken, built for solo and co-op, both kinds (see `challenge/CLAUDE.md`): Forza Horizon's bucket list challenges, on Åland's real roads, played solo or as co-op for two, with a synced quick retry. These are decided: the challenges are Forza's (a clock or a speed trap, pass or fail against one target), co-op takes the two players' average, teammates are solid, either player can retry, and a challenge is one or two players. Retry lives in a new game menu on the controller's Menu button. The world map moves to View.

**The system is the foundation; the list on it is the third.** The owner played the first twelve and judged the system sound and the list not yet good: the short ones were boring, and every one was beaten at the first try. A second list of eleven, longer, followed and was judged too easy too. The list below is the third, 25 challenges on 25 cars, each in its own date, hour and weather, with targets the fastest the AI gets, and it hasn't been played yet. Co-op is built and passes its e2e spec, but the owner hasn't played it yet.

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
- **Results** show each player's time or speed, the average in co-op, and whether it passed. A pass is kept in this browser, as finds are (`getProjectStorage`), against the challenge, with the best time or speed. **Solo and co-op are kept apart**: each challenge has a solo pass and a co-op pass, each with its own best, since a team's average isn't a solo time, and the races keep their medals the same way (`ideas/races.md`). A pass in co-op counts for both players. The maps and the start rings show a challenge as passed when either is.

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

## The list

The third list, 25 challenges on 25 of the car list's 38 cars (`ideas/cars.md`): all eleven harbour cars (A1–A4), the motor club's three B1 cars, six barn-find classics and five others, 21 Routes and 4 Speed traps, near FH3's mix of 13 to 6. It replaced the eleven, ten of whose roads it keeps with a new car or new conditions.

- **The size follows Forza's.** Forza Horizon 3 had 30 challenges beside 63 championships, about one to every two, and Forza Horizon 2 30 beside about 168. At FH3's rate the 56 events of `ideas/races.md` carry about 28.
- **A challenge is a test drive.** Forza's handed you cars you didn't own, dream cars above all, so the list is built round the car list, the ones hardest to own first, and every car worth dreaming of can be driven before it's bought.
- **A challenge chooses its car, its road, its date, its hour and its weather.** The date gives the season: a midsummer night that never gets dark, autumn rain, January ice, a snowfall. The times and dates are the real ones where Åland's events give them (`docs/DRIVING-CULTURE.md`).

Target is the fastest the AI gets (see "Targets are measured"); "set by" says which driver, and where the racer's run still had a mistake in it, which makes that target softer than a clean run's.

| # | Title | Kind | Car | Road | Length | When | Weather | Target | Set by |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Do 200 in 201 metres where the Streetrace was rained off | Speed trap | A1 Blixt, electric hypercar | Hammarlandsvägen at Hammarbo, the Streetrace's 2025–26 site, 201 m from a standstill | 201 m | 29 August, 19:00 | Rain | 241 km/h | scripted, flat out |
| 2 | Catch the ship that calls at three | Route | A1 Åska, hybrid hypercar | Lemland church to Långnäs harbour, road 3 | 14.7 km | 22 June, 02:30 | Clear | 2:41.6 | racer, with 1 reset |
| 3 | Godby to Geta in the September fog | Route | A2 Virvel, mid-engined V8 supercar | Getavägen from Godby past Finström church and Törnebolstad | 9.0 km | 20 September, 06:30 | Thick fog | 2:32.0 | racer, with 2 resets |
| 4 | Make the Eckerö boat in the rain | Route | A2 Orkan, AWD twin-turbo coupé | Road 1 west from Hammarland over the Marsund bridge to Eckerö harbour | 11.9 km | 14 October, 17:30 | Rain | 2:36.9 | racer |
| 5 | Light up road 2 at midnight | Speed trap | A2 Varg, front-engined muscle supercar | Nya Godbyvägen's longest straight, Jomala | 1.5 km | 18 July, 23:30 | Clear | 314 km/h | scripted, flat out |
| 6 | Castle to fortress at sunset | Route | A3 Dyning, V12 grand tourer | Kastelholm to Bomarsund | 9.8 km | 10 August, 20:45 | Clear | 2:22.5 | racer, with 2 resets |
| 7 | Take the Backrace road on Backrace weekend | Route | A3 Strimma, mid-engined sports car | Norra Sundsvägen, the Backrace's road | 7.3 km | 10 October, 14:00 | Overcast, wet | 3:12.8 | racer, with 4 resets, 2 hits |
| 8 | Barely a body down Hultvägen | Route | A3 Spån, lightweight track car | Hultvägen, Sund | 2.8 km | 2 July, 05:00 | Clear | 0:56.7 | racer |
| 9 | Chase the painters' light round Önningeby | Route | A4 Sund | Önningebyvägen through Önningeby, then Lemlandsvägen | 7.9 km | 24 June, 22:00 | Clear | 2:21.3 | racer, with 1 reset |
| 10 | Island to island to Järsö at sunrise | Route | A4 Brus, front-engined V8 coupé | Järsövägen over the bridges and causeways to Järsö | 7.9 km | 15 May, 04:45 | Clear | 2:18.0 | racer, with 3 resets, 1 hit |
| 11 | Get the family to Geta in a snowstorm | Route | A4 Flod, super-estate | Getavägen's second half to Geta church | 12.0 km | 12 January, 15:00 | Snowfall, winter tyres | 3:58.2 | racer, with 1 reset, 1 hit |
| 12 | Run the Ytterby stage on rallysprint day | Route | B1 Grus | The Rallysprint's gravel stage, Jomala | 4.1 km | 25 July, 10:00 | Clear | 2:11.1 | racer, with 1 reset, 3 hits |
| 13 | Rally Nötviken's forest by night in the rain | Route | B1 Hagel, top-class hybrid rally car | Nötviken's gravel, Sund | 5.6 km | 24 October, 21:00 | Rain | 2:48.9 | racer, with 4 resets |
| 14 | Open the folkrace season at Vessingsboda | Route | B1 Gnista, electric rallycross car | Hagsviksvägen and Norra Byvägen beside Motorstadion, Lemland | 4.4 km | 25 April, 10:00 | Overcast, wet | 2:19.8 | racer, with 4 resets |
| 15 | Plough to Djurvik in the first snow | Route | B2 Dyn, desert pickup | Djurvikvägen's gravel, Hammarland | 4.0 km | 18 November, 13:00 | Snowfall, winter tyres | 2:44.0 | racer, with 1 reset, 1 hit |
| 16 | Out to Kullskär through the morning fog | Route | B3 Borg, fast luxury four-by-four | Alskog and Kullskärsvägen's gravel, Hammarland's west coast | 4.5 km | 8 May, 06:00 | Thick fog | 4:16.4 | racer, with 14 resets, 8 hits |
| 17 | Climb to the old shore at Orrdalsklint | Route | B4 Knott, tiny four-by-four | Västergatan and the forest track up Orrdalsklint | 3.9 km | 1 June, 07:00 | Clear | 2:42.8 | racer |
| 18 | Bring a legend to the Möckelö straight | Speed trap | C1 Altura, 1990s V12 supercar | Hammarlandsvägen at Möckelöbacken, the Streetrace's 2023 site | 900 m | 10 June, 20:00 | Clear | 302 km/h | scripted, flat out |
| 19 | Let Group B loose at Degersand | Route | C1 Frost, 1980s Group B rally car | Skeppsviksvägen, Långnabbavägen and Degersandsvägen, Eckerö | 5.9 km | 3 October, 16:00 | Overcast, wet | 3:07.6 | racer, with 9 resets |
| 20 | Carry the post the old way | Route | C2 Lontano, 1960s V12 grand tourer | The post road from Eckerö's Post and Customs House over the Marsund bridge | 8.5 km | 20 May, 10:00 | Clear | 2:28.1 | racer, with 1 reset |
| 21 | Cruise harbour to harbour, the Saturday-night way | Route | C3 Kraft, 1970s V8 muscle car | Storagatan from Österhamn to Västerhamn, then Sjöpromenaden | 2.1 km | 18 July, 18:30 | Clear | 1:07.8 | racer |
| 22 | Get the people's car up Getabergen | Route | C4 Kula, air-cooled people's car | Geta church up Getabergsvägen to Soltuna | 1.5 km | 15 August, 12:00 | Cloud | 1:15.3 | racer |
| 23 | Beat the 145 through Lemland | Speed trap | C4 Sälta | Lemlandsvägen | 2.3 km | 4 June, 13:00 | Clear | 148 km/h | scripted, flat out |
| 24 | Keep the electric saloon on the road in January ice | Route | A5 Ström | Norra Torpvägen and Södersundavägen, west of Jomala church | 5.9 km | 20 January, 09:30 | Black ice, winter tyres | 4:19.6 | racer, with 10 resets, 2 hits |
| 25 | Wring the hot hatch along Skagvägen at sunrise | Route | A6 Sten | Skagvägen, Eckerö | 3.9 km | 21 June, 03:30 | Clear | 1:14.2 | racer |

**What building it found:**

- **Three runs were cut to a challenge's length.** Mariehamn to Långnäs is 26 km, so the ship run starts at Lemland church; Getavägen is 21 km, so the fog run takes its first 9 and the snowstorm its last 12, rather than both driving the whole road.
- **Orrdalsklint's track (17) and the Soltuna climb (22), left out of the second list, are in.** The tiny four-by-four's racer climbs Orrdalsklint clean, and the people's car takes a long minute up Getabergen.
- **The streetrace's 201 m (1) and its title.** The electric hypercar reaches 241 km/h in 201 m in the rain, so "Do 200" undersells it; the target is the AI's.
- **The cruise (21) has no gentle target**: no challenge has a difficulty, so it is the fastest the AI gets like the rest.
- **Kullskär (16), Jomala's ice (24) and Degersand (19) have the softest targets**: the racer resets ten times or more on them, so they are the first to set by hand.
- **Thirteen cars have no challenge**: the Skerry GT, Ankar, Bris, Fjärd, Ljus, Holm, Berg, Vik, the A7 hot hatch, the rally-bred hatch, the electric pickup, the modern utility four-by-four and the 1990s rally saloon. Most are easy to own or are dealer cars a player can try there.

## The car suits the road

Grip by surface (`ideas/surface-grip.md`) gives every car a class (sports, road, rally, off-road), and the order of the cars changes with the ground: on gravel the rally car and the four-by-fours lead, and the sports cars and the V12 saloon fall to the bottom.

**Forza matched the car to the road.** Its off-road challenges used off-road cars (the Ariel Nomad through the rainforest, the Baldwin trophy truck at the shipwrecks, "Ignore the Road in a Bowler EXR S"), its rally ones rally cars (the RS200 at the golf course, the Lancia Delta S4 through a forest at night) and its road ones road cars. A car that fought its surface wasn't the way a bucket list got hard, and Åland Drive's off-road handling, closer to Test Drive Unlimited's than to Forza's forgiving one, would make it a chore. So a gravel road gets the rally car or a four-by-four, a tarmac one a road or sports car, and the difficulty is the target.

**A challenge sets its own hour, season and weather, as Forza's do.** Each challenge names a real date, the hour its attempt starts at and a weather, and starting it puts the player in them, whatever the shared world has, so its target always means the same thing (`challenge/CLAUDE.md`, "Its conditions"). Races are the other way round: they take the world as it is (`ideas/races.md`). The owner's rulings on how:

- **The player's own.** The world's clock runs on beneath, for everyone else in the online world, for what a host hands on and for this browser's save; a co-op partner reads the same conditions from the same challenge, so nothing is sent.
- **The hour runs on.** It starts at the challenge's hour at the green light and runs at the game's pace on the attempt's own clock, a game hour in about a minute, because Forza built challenges round the light changing as they went: a run can be timed against a sunset or a sunrise. A retry starts at the same hour again. The weather holds.
- **The sky changes behind the time cover** as a challenge starts and as it's left, the cover the online world's time uses.
- **The car is handed on tyres for its conditions**, winter on snow and ice, as a racer is, and its target is measured on them.

## Targets are measured

Forza's designers tuned their targets. Here they come from the simulation, and the owner may set some by hand once they've played them:

- **There are no difficulties.** The owner's ruling: a target is the fastest the AI gets in the challenge's car on its road, in its conditions, through every line in order (`challenge/targets.ts`, `tools/challenge-par.ts`). The old lists were too easy.
- **Two drivers have a go.** The AI racer (`racers/CLAUDE.md`) drives the racing line at its own skill and at bolder shares of the car's grip, and sets every Route, faster on each than the old scripted driver, by 6 to 37% (Hultvägen 56.7 s against 77.5), and the scripted driver never got round five of them at all. The old scripted driver keeps to the GPS line and eases the spots it loses the road at, but it goes flat out where the racer's plan stops pulling at the top of a car's measured pull table, so it sets the Speed traps: the old estate reaches 148.6 km/h at Lemland's camera with it and 138.5 with the racer.
- **The targets are a baseline**, the owner's call: sensible from the start and updated by hand once played, not chased by improving the racers, which need far more work than the bucket list does. Where the racer still makes mistakes (`ideas/racer-method.md`'s gaps) its reset or knock only slows it, so that target is softer than a clean run's; the list below says which.
- **A test holds that every challenge can be passed**: the target is par rounded the easy way, so the AI's own run passes it, and each target was measured on the car as tuned, the places as laid, and the ground and tyres its conditions give.
- **Fog and darkness don't change grip**, so the targets can't see them. None is eased for them; that waits for the owner's play.
- **Gates are the road's width and a little more**, standing on the laid road's own middle and reaching 6 m past its surface either side: narrow enough to read as the road's and to miss a short cut across the fields, forgiving enough for a fast line through a bend. The late-braking driver that sets par cuts the inside of a gravel bend at most 4.7 m past the road's edge. Gates once stood on the GPS line, which can lie metres off the road as laid, and reached 12 m past it, because a narrower one there was missed without a sign and the finish never counted; at that width a gate was hard to read.

## What's built, in order

1. **The game menu**, with View moved to the map. It's needed first, and it's worth having without challenges.
2. **Solo challenges with retry**, a retry far from the start loading as a jump does, and the start rings on the maps. Built for both kinds and the whole first list at once, since a Speed trap solo needed nothing a Route didn't: the run already took both.
3. **Co-op**: joining, two start places, the synced retry and the average. Its exit test is an e2e spec on the run's own relay. Two pages start a co-op Route. One retries mid-run, and both cars are back on their start places, counting down on the same attempt. Both retrying at once gives one attempt. A pass on the average of a fast run and a slow one counts for both.
4. **Speed traps in co-op** on the average, as the Routes. Built with step 3, since co-op needed nothing a Speed trap did not already have from the run; its e2e spec plays a Route.
5. **The list of 25**, each challenge in its own date, hour and weather, the hour running on through the attempt, its car on tyres for them, and its target the fastest the AI gets in them.
6. **Later:** blueprints, as FH3 had them, where a player picks a start, finish, kind and car on the world map. Then leaderboards.

## Still open

- **Whether the list is right**: whether its targets take several tries and its roads are worth retrying, once the owner has played it, and which targets they set by hand.
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
- [GamerFuzion, Forza Horizon 2 bucket list challenges](https://www.gamerfuzion.com/forza-horizon-2-bucket-list-challenges-guide/): FH2's 30, and the update that took them to 45.

# The racers: method and ruler

The brief the `machine-learning` skill asks for before any method is chosen, for the AI racers of `ideas/traffic-and-racers.md` (pieces 3 to 7) on the races of `ideas/races.md` (steps 2 to 7 of its build order). It says what a good racer is as a measurement, who judges it and how finely, what exists to build on, what class of problem it is and what that class's usual approach is, and what reads as done. It is being built against; the owner's rulings go at the end as they are made.

## The goal, as a measurement

A racer drives the same car through the same input as the player, and difficulty is only how well it drives (the decided rules in `ideas/traffic-and-racers.md`, "Difficulty without visible cheating"). So the goal has two readings, both counted by the vetting tool (`tools/race-vet.ts`):

- **Clean.** On every race, in every condition (dry, wet, snow, ice, on the tyres for it), from every place on the grid, in every car of the race's field, a racer finishes with no stop, no reset and no hit, and never strays further past the laid road's surface than a gate reaches (6 m). A grid of six does the same with passes made and no pile-up.
- **Spread by difficulty.** At each difficulty setting a racer's race time on a track is a fixed number (the drive is deterministic), and the settings spread those times so that the owner, racing the field, meets a close race at some setting on every track.

The second reading the owner judges by driving; the first is counted. The counts are deterministic, so a change is read as an exact difference, never against noise, and no interval is needed. The owner's own judgement is the low-resolution ruler: twenty races tell whether a setting is roughly right for them, never whether a change of 2% in pace helped, so the counts carry that weight.

## Who judges

- **The vetting tool** counts, headless, for every race at once: finished or not and where it failed, each lap's time, metres driven past the carriageway's edge and off the whole surface, hits, airborne steps, resets.
- **Watching racers** (`tools/film.mjs`, `tools/look.mjs`) for what a count can't catch: a racer that looks robotic, brakes for nothing or drives through another car fails however good its time.
- **The owner, racing it**, at each checkpoint, on a few tracks chosen for contrast, at a setting Claude picks. They judge whether it races like a driver and whether a setting is beatable; they don't tune numbers.

## What exists

Every car in one Rapier world with ground loaded round each (`sim/drive.ts`), each car's limits measured by surface and condition (`sim/limits/`, `tools/car-limits.ts`), the 32 races as challenges with grids, lines and laps (`challenge/`), a scripted driver round one line (`sim/autopilot.ts`, `tools/par-driver.ts`), and computer-driven cars online by the nearest-player rule (`net/computer-cars.ts`). The simulation runs a seven-minute race in a few seconds on one core, and a run is a pure function of its spec, so the whole list in every car and condition is tens of minutes on all cores through the shared worker pool.

## What class of problem

Three problems, none of them learning:

- **The racing line is an optimisation with a closed form.** The line a racer drives is the minimum-curvature path through the carriageway as laid, the textbook answer, solved by projected gradient descent on the lateral offset at every few metres with the laid edges as bounds, coarse to fine. Its speed plan is the measured limits applied along it: the fastest speed each metre's curvature allows on the ground there, a backward pass for braking and a forward pass for the car's pull. Nothing is learned; the car's limits were measured once.
- **Following and racecraft are rules.** Pure pursuit steering and a speed controller on the plan, recovery by the player's own reset, and passing and defending by the rules the owner decided (pass on the inside into a bend or along a straight, hold the inside once, a car's width side by side, brake for a crash). A learned policy would have to rediscover rules that are already written down, and would be judged by the same tool.
- **The racer's pace is a calibration of two numbers**: the share of its car's cornering grip the plan uses and the share of its braking, set as high as the vetting tool finds clean. Raising them is not tuning but making the plan see what catches it out, read track by track from the tool's traces.

So the skill's decision procedure ends at its first branch: a hand-written baseline, measured on the ruler, and no learner behind it. A learned racer (imitation of the owner's play, or policy gradient on the simulation) would be a later line, taken only if the rule-based racer fails a reading the owner cares about and the brief for it says what it would add.

## The ruler, and what it says

`tools/race-vet.ts` is the ruler, built first (step 2 of `ideas/races.md`'s order). Its first readings, the race's own car, dry, from the pole, on the par driver's plan at shares of the flat-pad grip, said more about the driver than the tracks: at 0.9 of the grip the plain driver, which follows the GPS's line and reads a bend's sharpness over 24 m, ran wide at junction corners and into what stood past the verge on most tracks, and the GPS's line itself leaves the laid road on several. Those readings were the floor; the findings about tracks are in `ideas/races.md`, section 7.

The racer on the racing line, read the same way (the race's own car, dry, from the pole, every race), at shares of its car's grip from 0.6 to 0.9 of the cornering grip (braking 0.7 to 0.98):

| Share of the grip | Races every run is clean on, of 32 |
|---|---|
| 0.60 | 27 |
| 0.68 | 23 |
| 0.76 | 11 |
| 0.83 | 3 |
| 0.90 | 2 |

Each step of share is worth about 10% of a race's time (Painters' Loop 5:31, 6:01 and 6:44 at 0.76, 0.68 and 0.60; Kastelholm 6:16, 6:50 and 7:36), and the racing line at any share is faster than the laid middle wherever both are clean (Kastelholm's lap 2:00 against 2:27). At the top shares the racer finishes most races but with a reset or a hit, and a reset costs more than the extra pace earns, so on a third of the tracks 0.76 beats 0.9. What this reading asks for is at the top: what the plan doesn't see on the tracks where it runs wide (camber, a crest it reads too gently, a bend the line's smoothing softens), read track by track from the vetting tool's traces.

### The racer at its skill, one change a run

After the owner's ruling for one racer at its top pace (0.85 of the cornering grip, 0.92 of the braking), the same reading, the race's own car, dry, from the pole, on the racing line, every race, was the ruler for the racer itself, one change a run, each predicted first and kept only where the prediction held. The traces named the failures before anything was changed: a car knocked or run a few metres off its line at speed steering to full lock and swapping one slide for the next until it was 14 m off and reset; full throttle out of corners on what the bend left of the tyres; finishers parked on the finish line; a reset that put a car down past the line it had yet to cross, so it could never finish.

| Change | Prediction | Clean | Finished | Resets | Off the surface (m) | Kept |
|---|---|---|---|---|---|---|
| As raced by the owner | | 2 | 22 | 82 | 14,182 | |
| Driver rejoins its line with a bounded sideways pull, and lifts when sliding | fewer resets | 0 | 9 | 113 | 21,950 | no: on gravel the car is always sliding, and the lift undid it |
| The plan's forward pass keeps the friction circle: throttle as the steering unwinds | resets down a fifth | 4 | 23 | 63 | 10,254 | yes |
| Crest lightness halved (0.6 to 0.3) | airborne steps halved | 4 | 23 | 61 | 10,258 | no: the air comes from running off the road, not from crests |
| A reset lands before the next line to cross | the missed-line finishes come back | 4 | 24 | 63 | 10,254 | yes |
| Look-ahead 1.0 s at speed (from 0.75) | fewer high-speed swings | 0 | 16 | 100 | 18,432 | no |
| Look-ahead 0.55 s | | 6 | 27 | 66 | 10,041 | yes |
| Look-ahead 0.4 s | | 7 | 27 | 50 | 6,979 | yes |
| Look-ahead 0.3 s | | 10 | 31 | 40 | 4,443 | yes |
| Look-ahead 0.2 s | | 11 | 29 | 34 | 3,375 | no: two gravel races lost |
| Look-ahead scaled by the car's steering lag | the slow-steering cars stop swinging | | | | | no: Lontano and Borg no better, Vik worse |

The look-ahead was the lever: pure pursuit on a racing line cuts every bend's inside by about the look's square times the bend, and the car then runs wide out of it; the traffic's 0.75 s is right for traffic, which never drives at the limit. The reading stopped at 0.3 s with 31 of 32 finished (X2 Kvarnbo's start is the one, a track finding) and 10 clean. Hits were over-counted until the end of the series, since the vetting tool counted the loss of speed at a reset as a hit; it no longer does.

What is left, by the traces: the heavy or slow-steering cars of a field (Lontano, Borg, and less so Kraft and Bris) run wide in S-bends at speed where the race's own car doesn't, so a field's weaker cars reset several times a race and finish last; and on the loose, a car at 150 km/h and more drifts off a gentle bend. The next reading is per car: the highest share each car is clean at, found by the tool, is what "as fast as it legally can be" means for that car.

### The owner's reading, and what ships

The owner raced the pack from the back of the grid and called it playable, comically bad but not terrible, and ruled to ship it with the gaps written down. Their reading, in their words made into counts: it all comes down to the mistakes. A racer misses a turn, hits a car, clips a wall or a building, and its race is over; it resets often enough that the race goes on, but **a reset must never be the racers' way of compensating for bad driving**: the mistake is what goes, and the reset stays the last resort it is for a player. And human players cut across the grass into a turn wherever no line of the race makes them take the corner, which the racers never do and lose ground by; whether that is a flaw in the racers or in the tracks (a race whose lines don't pin its corners invites the cut) is an open question for the track design, below.

What ships: the racer and racecraft as read above, the player at the back of the grid, and these gaps, each with its next step:

| Gap, as counted | Next step | How it is read |
|---|---|---|
| A racer that misses a turn or clips something ends up `lost` and resets: 45 resets alone over 32 races, 20 to 40 a grid of six | Read the traces for the mistakes alone first (where, at what speed, on what the plan said) and make the plan see what it misses there; then the knock at speed, where a player gathers the car up and the racer steers to full lock | The alone vet's resets and off-surface metres fall; a grid's resets fall with its passes kept |
| Lontano, Borg, Kraft and Bris run wide in S-bends where the race's own car doesn't | Per-car skill: the highest share each car is clean at, found by the tool and kept in `skill.ts`, is that car's "as fast as it legally can be" | A field alone: every car finishes, the weaker ones clean at their own share |
| A line a player would cut across the grass, the racers take round | Decide per track whether the corner is the race's (then a line pins it) or the cut is fair (then the racing line's corridor may leave the road there, which the laid-road corridor can't yet say); the vetting tool can count the metres a cut saves | A ruling per track in `ideas/races.md`; the line tool draws the corridor as ruled |
| X2 Kvarnbo's start and finish | The owner's call on the route (`ideas/races.md`, section 7) | The alone vet finishes it |
| Every reading so far is dry, from the pole, in the race's own car | The full ruler: every car of the field, every condition, every grid place, tens of minutes on all cores | Clean counts by condition, the table in section 7's spirit |

The player's driving line (`render/CLAUDE.md`, The driving line) draws in play the very line the racers drive, with the player's own car's plan on it.

### The grid, by the vetting tool's grid mode

A grid of six on Kastelholm and the Painters' Loop, each racer seeing the others, is the racecraft's ruler (`racers/vet-grid.ts`): places, passes, pile-ups, and each racer's hits and resets with their causes. Before: Kastelholm's pole car never finished (483 hits, 477 resets, lapping into the five cars parked on the finish line); the Painters' Loop had 140 pile-ups. After the finishers cool down off the line, the reset lands before the next line, a pass needs the racer to be closing (off a standing start everyone ahead is slow, and the grid is two abreast with no room), and a defence picks its side once: every racer finishes, no pile-up, 37 and 29 passes, and 22 and 38 resets across the six, almost all `lost` after a contact, Lontano's and Borg's half of them. Contact is now the thing to read: a knock at speed still ends in a reset, where a player would gather it up.

### The racer keeps its line: each mistake read, not counted

The readings above count mistakes. `tools/race-incidents.ts` reads them: one car round one race as the vetting tool drives it, and every excursion from its line with what led to it. Over seven of the worst races, 60 of 66 excursions left by the outside of a bend, with the car within a kilometre an hour of its planned speed and its wheel short of the lock. So the plan's speeds were not too high and the brakes were not late; the car was failing to deliver a bend the plan had every right to ask for. The traces named why, and one fault in the line itself.

- **The steering aimed along the nose.** A car cornering hard travels several degrees off the way it points (its rear tyres' slip), and pursuit along the nose reads that as pointing too far in and steers out: a metre and more outside every fast bend, nearly two on gravel, and into the verge. It is why every step shorter of look-ahead read cleaner above: the error grows with the look.
- **The pedals ignored the turn.** The plan budgets the tyres between turning and slowing; the pedals went to full at half a metre a second off the plan, mid-bend as on a straight, which takes a third to a half of the tyres' sideways grip, and held full throttle through every slide, which is what swapped one slide for the next.
- **The line cut through buildings.** Where the GPS line runs more than a sample's reach beside the built road (25 m beside a bend on `djurvik`), the corridor bridged the gap straight, across whatever stood there: within a car's half width of a wall on nine races, and a car reset on to such a spot stood wedged there, resetting for ever.

One change a run, on the same reading as above (the race's own car, dry, from the pole, now 56 races):

| Change | Prediction | Clean | Finished | Resets | Hits | Off the surface (m) | Kept |
|---|---|---|---|---|---|---|---|
| As it stood | | 24 | 52 | 63 | 36 | 7,626 | |
| The pedals held to what the turn leaves of the tyres, the turn read from the car's yaw | resets to 40 or fewer, pace no more than 2% slower | 29 | 55 | 36 | 26 | 3,444 | yes, 1.9% slower |
| Pursuit along the car's travel | resets to 24 or fewer, metres past the edge down a third | 39 | 56 | 18 | 21 | 1,453 | yes, 1.2% faster |
| The turn read from the tyres' own slip | resets to 12 or fewer | 43 | 55 | 16 | 5 | 1,057 | yes: 10 but for the reset loop at `djurvik`'s building |
| Look-ahead 0.4 s, and 0.5 s | resets to 7 or fewer | 44, 44 | 56, 56 | 12, 9 | 8, 5 | 859, 920 | no: nothing a nudge to any run doesn't do, and no better over the field |
| The built road followed by its own way where the GPS line strays | no line through a building where the road is laid | | | | | | yes: walls nearer the line than a car can pass on 9 races to 6, none of them a stray |

The yaw was the wrong reading of the turn: between the two halves of an S-bend a car's nose swings without the tyres giving anything sideways, and the brake was withheld just where the plan needed it. The tyres' slip, as the simulation reads it, has no such blind spot.

With ten mistakes left the one-car reading resolves nothing smaller than a nudge, so a change is now judged on the field: every car of each race's field, dry, from the pole, 148 runs. The recovery was read there, a change a run:

| Change | Prediction | Clean | Finished | Resets | Hits | Off the surface (m) | Kept |
|---|---|---|---|---|---|---|---|
| As it stood | | 54 | 128 | 219 | 114 | 20,809 | |
| The driver and the line as above | | 110 | 148 | 38 | 25 | 2,906 | |
| Well over the speed it is to hold, the brake takes the whole grip, sliding or not; a line passed without crossing it is gone back for | resets to 34 or fewer, no race lost | 113 | 148 | 24 | 30 | 3,172 | yes |
| Off its line a racer drives back at a careful speed, and is lost at 25 m, not 14 | resets to 20 or fewer, every run still finished | 115 | 148 | 14 | 30 | 3,310 | yes |

The pace on the runs with no reset before or after is the same to 0.2% throughout: the racers are no slower, they stop throwing their races away. Where a reset became a drive back, the race is a few seconds longer, which is the player's own cost.

The grid is read the same way (`--grid`: every race, its field in turn on every place of its grid, each racer seeing the others, dry; 298 racers in 56 grids):

| | Finished | Grids with every racer home | Racers with no reset | Resets, the loops apart | In a reset loop | Pile-ups | Hits |
|---|---|---|---|---|---|---|---|
| As it stood | 284 | 47 | 53 | 1,076 (3.7 each) | 4 | 6 | 974 |
| The driver and the line as above | 295 | 53 | 103 | 453 (1.5 each) | 2 | 4 | 625 |
| With the recovery | 298 | 56 | 150 | 312 (1.0 each) | 0 | 2 | 665 |

A reset loop was a racer that could never finish: one wedged at a wall its line ran through, or one that had run wide past a line without crossing it, lapped on without it, and at its line's end stood behind the parked finishers, stuck, resetting until the race's cap. Half the racers now finish a race in a pack without a reset, and the median is none. What remains is contact.

Three things were left by these readings, and each is read below: the line passing nearer a wall than a car can on six races, which the corridor now sees (it knows what stands in it, `racers/CLAUDE.md`, and only `out-to-jarso`'s run past its finish is still flagged); contact in a pack that ended in a reset; and the heavy cars' weave between the halves of an S-bend, which was the steering's, not the plan's.

What a reading can't tell: whether the racer looks like a driver. That is the owner's, at the checkpoint, and the films.

### The bar: Test Drive Unlimited 2's racers, and Forza Horizon's

The owner set the bar: at least as good as Test Drive Unlimited 2's racers, and ideally as good as Forza Horizon 2's or 3's. Neither game can be put on this ruler, so each is written here as what a player sees its racers do, and that as counts the tools read. The descriptions are from knowing the games, not from measuring them.

- **Test Drive Unlimited 2.** Its racers follow a path at a pace set by the difficulty. They finish every race and are never seen being put back on the road. In a pack they bump each other and the player, they take bends early and wide, and they get by traffic by slowing and nudging. It rains, and there is no snow.
- **Forza Horizon 2 and 3.** The Drivatars drive a racing line near their car's limit, hold it side by side, pass and defend, and make a driver's mistakes (a wide exit, a late brake) that they gather up. They are never seen reset, their pedals and steering are smooth, the first corner of a pack is rough and the rest mostly clean, and they hold up in the rain and, in Horizon 3's Blizzard Mountain, on snow and ice.

| Reading | The TDU2 bar | The Forza Horizon bar | The racers |
|---|---|---|---|
| Every racer finishes, alone and in a full grid | all, dry and wet | all, in every condition | all 298 in a grid, on a clear road and among traffic; 148, 148, 148 and 148 of 148 alone in the dry, wet, snow and ice |
| A racer's race in a full grid with no reset, on a clear road | 9 in 10 | 97 in 100 | 99 in 100 |
| The same among the game's traffic | 9 in 10 | 97 in 100 | 91 in 100 |
| Reset loops, and pile-ups that don't clear | none | none | no loop; 1 pile-up in 56 races on a clear road and 25 among traffic, each cleared |
| Alone, a run with no reset | 9 in 10, dry and wet | 97 in 100 in every condition | 99 in 100 dry, 99 in 100 wet, 97 in 100 on snow, 89 in 100 on ice |
| Hits a racer's race in a full grid | 2: they bump, and nudge past traffic | 1 in 2 | 0.14 on a clear road, 0.60 among traffic |
| Hit by a player, a racer drives on | mostly | nearly always, and gathers up a slide | 99.9 in 100 nudges, 99 in 100 shoves, 99 in 100 of a careless human's touches; 76 in 100 spins, from 96 under 80 km/h to 50 over 200 |
| Brake lamps, as the car behind sees them | | lit once for a bend and held: under 4 times a kilometre, none of them a flash | lit 2.4 times a kilometre alone, 3.3 in a pack and 3.8 among traffic, under one in a kilometre a flash |
| In the game, among traffic with the player on the road | every racer home, a reset or two a race | no reset in most races | every racer home in six races; resets: Djurvik 0, Tengsöda 0, Kastelholm 0, Round the Airport 2, Jomalaby 5, West Way Out 10 (26 before, as the racers were) |

So on a clear road the racers are past the first bar on every reading and at the second on most of them. Among traffic they are past the first bar, 91 in 100 through a race with no reset against nine in ten, with well under its allowance of hits, and short of the second. What is short of Forza Horizon's: traffic, where one racer in eleven still has a reset in its race; a car left standing in a narrow road (below); ice, where one run in nine still has a reset; and a spin at speed, which no one gathers up.

### The car, and the steering: what the snow showed

The first reading on snow would not run: the table of the cars' limits had no braking at all for a sports car on snow-covered gravel, and on ice a third of the field finished. Reading why found one fault in the car and three in the racer, none of them about snow.

- **Traction control took the tyres' sideways grip.** A tyre an aid holds at its grip shared that grip with everything the engine asked of it, and on snow an engine asks several times what the tyres hold: a sports car flat out on a straight had almost nothing left to keep it straight, and spun at 75 km/h with no hand on the wheel. What is asked past the tyre's grip now never reaches a tyre an aid is holding (`sim/CLAUDE.md`, the driver's aids). Dry and wet asphalt measure the same to the third digit; on snow and ice the cars reach 30 to 50 km/h more on the pad, and every table has its braking.
- **The racer steered on a dry road's lock.** The wheel's travel is the lock, which the car narrows on slippery ground, to a third of a dry road's on ice. The racer worked out its share of the lock as if on dry asphalt, so on ice its wheels turned a third as far as it meant.
- **The wheels turned only as far as the path's own angle.** The tyres' slip is the rest of the angle, most of it on loose ground at speed, and without it a car is short of every turn asked of it. Read first from the line's bend, it took the mean error round a test circle from 0.2 m to 0.01 m and changed little in a race; read from the turn the pursuit asks, with the rear tyres' slip as a clean corner would have it, it cured the heavy cars that weaved (Borg, Myr and Lontano clean) and broke the three whose rears let go first (Pil, Ljus, Frost), which it steered less the harder they turned; with the rear tyres' slip read as it is, from the way the rear axle travels, one rule is right for both, and a slide gets its opposite lock.
- **A plan held a standstill.** The plan's speed at its standing start was nothing, so a racer put down behind its own place on the grid waited there for ever, which was every reset loop left.

One change a run on the field alone (148 runs a condition):

| Change | Dry: clean, resets, hits | Snow: finished, clean, resets | Ice: finished, clean, resets |
|---|---|---|---|
| As it stood, with the line and the recovery above | 119, 13, 22 | would not run | would not run |
| Traction control leaves the tyre its sideways grip, and the tables measured again | 122, 15, 18 | 105, 59, 262 | 55, 9, 451 |
| The lock on the footing under the car, and the tyres' slip for the line's bend | 121, 19, 19 | 120, 68, 164 | |
| The tyres' slip for the turn asked, the rear's as a clean corner has it | 122, 32, 36 | 142, 124, 36 | |
| The rear's slip as it is | 138, 5, 6 | 148, 140, 2 | 147, 129, 19 |
| The pedals push as the plan does, and as a hold falls | 136, 4, 8 | 148, 139, 2 | 148, 118, 26 |

The last row is the pedals: three presses of the brake a kilometre where there were ten, for 0.8% of the pace and nothing on a dry road, and a little on ice, where a softer brake arrives at a bend a little fast. The wet reads 148, 136, 2, from 109, 39, 341 as the racers stood at the start.

### In a pack

The grid mode says each hit and reset by its kind, and before anything was changed 73 in 100 of a pack's hits came while passing: a racer dropped its hold on the car ahead the moment it meant to pass it, and drove into it before it was clear. The rules now (`racers/CLAUDE.md`, Racecraft) hold until the racer stands clear sideways, slow a racer running inside its line for the tighter turn, go round a stopped car by the verge, keep a racer in its lane for its first forty metres, and begin a pass only with the room to finish it. Two faults in the first writing of them each cost a run: a grid is all stopped cars until the lights, so every racer set off round the one ahead; and a racer off its line was held to its plan's standstill at the start.

| | Finished, of 298 | Racers with no reset | Resets | Hits | Pile-ups | Races with every racer home and none reset, of 56 |
|---|---|---|---|---|---|---|
| With the line and the recovery above | 298 | 150 | 312 | 665 | 2 | 7 |
| The hold stands until clear, the room ahead, the stopped car | 295 | 182 | 159 and two loops | 302 | 0 | 16 |
| The lane off the line, and no standstill in the plan | 297 | 199 | 201 | 272 | 15 | 17 |
| The steering and the pedals above; the pedals slow as a hold falls; a pass begins only with the room to finish it; `lemland-to-the-sea`'s finish moved back | 298 | 281 | 21 | 71 | 2 | 47 |

With the steering alone the resets fell by four fifths and the hits rose by half: racers that no longer reset out of each other's way stay bunched, and the new pedals, which chased a falling hold at a gentle rate, arrived at the car ahead still 3 m/s faster than it. Slowing as the hold itself falls took the four busiest races from 88 hits to 34 with as many passes, and the room to finish a pass took them to 24. 1047 passes are made in the 56 races.

`lemland-to-the-sea` finished a metre from the end of its road: the finishers stopped on the line itself and those behind could not reach it. Its finish stands 200 m back, and `tools/race-lines.ts` says any finish with too little line past it.

What is left, by the readings:

| Gap, as read | Next step |
|---|---|
| At about thirty tight junctions the line turns its corner at one point, where the route passes from one road to another with nothing between to round it; two are on `harbour-to-harbour`, where a car alone runs wide of each at 40 km/h, two to five hits a race and a reset in one, and a pack piles up | The corner belongs in the corridor: the junction's own apron, which is not laid as a road. Two things were tried and taken out. Cutting the corner across at the corridor's samples left as many sharp points as it removed. Letting the plan read such a turn at its own sharpness, with a crawl in place of the standstill that asks for, cleaned every one of the 14 races alone and jammed a pack at each (155 resets at `kastelholm`'s) |
| 14 of the pack's 71 hits are finishers: a racer over the line flat out has 150 m of line and nowhere to go at its end | The run past a finish follows the road on, as far as a car needs to stop |
| On ice one run in nine has a reset, most a single one on a different race | The racers fit friction tyres for ice (`tyresFor`), and the challenges are measured on them; studs are an owner's call, since the targets move with it |
| `out-to-jarso`'s finish stands 20 m before a building | The owner's to place, as `lemland-to-the-sea`'s was |
| A car left standing in a narrow road or on a junction's corner costs a racer that meets it a reset, one time in three: 13 among 36 racers in six races | The manoeuvre a driver makes there: back off to make room, round it on full lock, read on `--parked` |
| Among traffic one racer in eleven has a reset in its race, most of them stuck in a knot of racers at a junction that traffic is queuing at | Each knot read from its trace, as the causes above were; the lane map's own faults mended in the lane builder (twelve main-road lanes that end nowhere, five on a race's line) |
| In such a knot a racer going round a standing car pushes on once it stands 20 cm clear of it sideways, and bumps it at a crawl: 69 of the traffic reading's 178 hits are on traffic cars, 33 of them while passing and 17 under 30 km/h, 13 of them at `jomalaby`'s junctions, and a bump can knock a traffic car out of its lane to stand in the road | Read from a trace which part of the car touches; a racer takes itself and the other car to be as wide across its line as their widths, however they are turned, which is the first thing to read there. Then the manoeuvre round a standing car, above |

### After a hit

A racer races clean, a player doesn't, and a racer that is hit has to gather the car up as a driver does. Three readings ask it, none of which a clear road and a clean field do. `--knocks` gives a lone racer what a hit leaves it with, every 800 m of its race: a nudge (2 m/s sideways and a turn of 0.4 rad/s), a shove (4 and 0.8) or a tap on the rear quarter that spins it (2 and 2.5), and counts the knocks a reset followed, by the speed the car was going. `--human` gives the last place on a grid to a careless human, a car that sees no one and drives nearer its limit than a racer, and counts every touch. `--parked` leaves a car standing on the racing line.

| Reading | When first taken | Now |
|---|---|---|
| A nudge every 800 m, 148 runs: gathered up with no reset | 2,123 of 2,128 | 2,148 of 2,151 |
| A shove | 2,091 of 2,121 | 2,129 of 2,151 |
| A tap that spins the car | 697 of 1,335 | 1,298 of 1,698 |
| The same spin by speed: under 80, 80 to 120, 120 to 160, 160 to 200, over 200 km/h | | 136 of 141, 407 of 421, 331 of 414, 249 of 374, 175 of 348 |
| A careless human in each of 56 grids: touches the racer drove on from | 891 of 899 | 944 of 958 |
| Racer against racer on a clear road: racers touched who drove on | 280 of 282 | 140 of 140 |
| A car parked on the racing line, six races: resets at it | 291 | 13, every racer home |

What it took. A racer knocked 25 m off its line took its R, where a driver steers back: the R for being lost stands at 60 m now, and at fifteen seconds off the line, since among trees a racer backed and filled for minutes, each try a fresh one. The brake pedal was reverse for a car rolling backwards, so a car spun round at speed had no brakes at all, the player's as much as a racer's: it is reverse only under a metre a second now (`sim/CLAUDE.md`). And a racer held to a stand kept its brake on, which backed it away from whatever it had stopped for at up to 47 km/h until it was lost: it stands on its handbrake. What a spin at twice the limit leaves is a car off the road at 150 km/h, and its R is what a player presses too.

### Through traffic

Every race has the game's traffic on its roads, and nothing above was measured with it. `--traffic` puts it there (`traffic/CLAUDE.md`), kept round the middle of the pack as the game keeps it round a player. The first reading of all 56 grids among it: 293 of 298 finished, 204 with no reset, 1,045 resets, 981 hits, 143 traffic cars knocked out of their lanes. Each cause below was read from a trace of the race it jammed, and the twelve busiest grids were read after each change:

| The twelve busiest grids, 72 racers | Racers with no reset | Resets | Hits |
|---|---|---|---|
| The grid's stretch of road cleared of traffic until the lights, the R for lost at 60 m, no room read across a junction's apron | 30 | 222 | 453 |
| Meeting what comes the other way where the road hasn't the room, a sight of 400 m | 30 | 172 | 304 |
| Meeting only what is on the carriageway; the pass from behind a slow car, clear of what is coming for as long as it takes; traffic gives way to a fast car and keeps off lanes that lead nowhere | 36 | 132 | 280 |
| A sight of 600 m; a pass's side judged by what else is in it | 45 | 77 | 193 |
| Queuing at a junction; no traffic appearing ahead of a fast car | 50 | 35 | 147 |
| Where a car will be when reached; traffic's mirror; the verge only round a car that stays stopped | 54 | 22 | 99 |
| Put down past a standing car on a reset; a pass begun from behind a car at the racer's own speed, and the car being passed held for only until the racer is clear of it | 51 | 32 | 157 |
| The island's roads at their real width, and a road's surface and room read where the car meets them (below) | 64 | 10 | 84 |

What was wrong was as much the traffic's as the racers', and the player's car meets the same traffic, so each of these is the player's gain too:

- **Traffic gave way only to what was within 120 m of its junction**, and only on the one lane leading into it, which may be a few metres long: a car at 270 km/h was 1.6 s away when it was first seen, and traffic pulled out in front of it. A turn now looks back up the road through the junctions before it, as far as the fastest simulated car near covers in the time the turn takes.
- **Traffic pulled out round a standing car without looking behind**, into a racer closing at 200 km/h. It has a mirror.
- **Traffic appeared in front of racers.** The bubble fills where the player isn't looking, which is where a racer ahead round a bend is driving. Nothing starts near a simulated car now, or where one will be within the seconds it needs to slow.
- **The lane map ends lanes in the middle of main roads** in twelve places, five of them on a race's line (`west-way-out`, `night-ferry`, `kalmare-and-onningeby`, `harbour-to-harbour` twice): a car's trip ended there and it stood in the road, a queue behind it. Traffic keeps off a lane that can only lead to one. The map itself is the lane builder's to mend.
- **Traffic wasn't told of the racers in the game**, only of the player's car, so it drove into them and never gave way; and it stood on the grid at the lights.
- **A racer stopped for walkers on a path beside the road**, having been taught to meet what comes the other way: only what is on the carriageway is met.
- **A racer never passed a car it had settled behind**, since a pass began only while closing: traffic at 80 km/h held a queue of racers for the whole of a road.
- **A pass asked for the room it would take at the pace the racer was closing**, which behind a car at its own speed is the whole road, so behind a player at 50 km/h a racer sat for twenty seconds (`e2e/aland-drive-race.spec.ts` holds that it gets by). It asks for the room the pass takes at the pace a pass gathers. And out beside the car, the racer held back again whenever that car's way drifted towards its own: it holds for the car it is passing only until it stands clear of it sideways, and its path goes with that car. Among traffic this cost bumps, the last row of the table above and the gap listed earlier; on a clear road, with a careless human and round a parked car it reads level or better.
- **A racer drove into a car it could see**, where its line crossed that car's lane further on (into a roundabout, across a bend): the car stood beside the line until the racer reached it. A racer reads where a car will be when it gets there.
- **A racer squeezed round traffic waiting at a junction**, by a verge that was a traffic island, and called itself stuck while it queued. It queues, and takes a verge only round a car that has stayed stopped.

| All 56 grids among traffic, 298 racers | Finished | Racers with no reset | Resets | Hits | Traffic cars knocked out | Cyclists and walkers driven through | Races with no reset |
|---|---|---|---|---|---|---|---|
| The first reading | 293 | 204 | 1,045 | 981 | 143 | 15 | 30 |
| Now | 298 | 272 | 32 | 178 | 55 | 7 | 43 |

The clear road was read again on the same code, since every rule above acts there too: a grid of 298 finished with 286 unreset, 15 resets and 83 hits (it was 281, 21 and 71), and alone the field has 3, 2, 3 and 23 resets in the dry, wet, snow and ice (4, 2, 2 and 26). The hits a pack gained are racers closing up behind one that queues where it used to squeeze by.

A car left standing on the racing line is what a pack still handles worst (`--parked`). On a main road every racer goes round it at speed. On a lane or at a junction's corner a racer waits, tries the verge, and often can't swing out in the room it has: it gets by on its R, which puts it down past the car, where it used to be put down behind it again and loop. The manoeuvre itself, backing off to make room and going round on full lock, is the next step there.

### The brake lamps

The owner, driving behind the racers, saw their brake lamps flash like a nervous foot. The reading that had said otherwise, three presses a kilometre, was of one car alone. Read in a pack, the lamps came on 60 times a kilometre and 82 among traffic, all but one in a hundred of them a flash: held behind another car, a racer's brake pedal goes full on for a few hundredths of a second and off again, several times a second.

The lamps were the fault a driver sees, and they are the car's (`sim/CLAUDE.md`): they now light for braking of 0.7 m/s² or more and stay lit half a second after it eases, for a racer's car and a player's alike. The driving is the same to the last count.

| Brake lamps coming on a kilometre, and the flashes among them | Before | Now |
|---|---|---|
| One car alone, 148 runs | 2.9, 0.75 a flash | 2.4, 0.13 |
| A full grid on a clear road, 56 races | 60.0, 59.0 | 3.3, 0.57 |
| Twelve grids among traffic | 81.9, 81.2 | 2.6, 0.55 |

The pedal under them still flutters, and the vetting tool counts its presses beside the lamps so that it stays in sight: 2.9, 56 and 56 a kilometre. Its cause is read, not yet mended: a car ahead is placed on the racer's line at one of its 4 m samples, so the gap to it moves in jumps of 4 m, the speed the racer is held under jumps with it by several metres a second, and the pedals answer each jump. Placing a car between the samples is the mend, and every pack reading is to be taken again with it.

### On the roads at their real width

The island was built again with every road at its real width and place, its junctions' corners rounded and each road asphalt or gravel stretch by stretch as its own way says (`docs/ROAD-SURFACES.md`), and every place, lap, line and target was made again from it and every reading taken again. The same racers read better on it at once: a road with land beside it, where there was a shelf that read as road, and corners that are rounded leave a pack less to hit.

One reading was worse, and it showed two faults in how a racer read its road. `backrace-weekend`'s target came out 69 s slower, its racer put back on the road three times in its last 1.8 km: that road turns to gravel there, the tyres felt it, and the racer planned its speed for asphalt.

- **A road was one surface from end to end**, whichever most of it was. It is read place by place, from the paving's own points, as the tyres read it (`sealedReader`, `art/surfaces/road-attributes.ts`).
- **A line's surface and room were looked up by the corridor's own step**, a distance along the middle of the road. A racing line is shorter than the middle round the inside of every bend, so the two part as a route goes on: 22 m by 5.5 km on that road, where the racer met gravel at 76 km/h with its plan still on asphalt. They are read along the line itself (`lineThrough`, `racers/racing-line.ts`). That had been so on every race, and mattered little while a road's surface changed only at a junction.

| Reading | The island as it was | The roads at their real width | And the road read where the car meets it |
|---|---|---|---|
| A full grid on a clear road, 298 racers: with no reset, resets, hits, pile-ups | 286, 15, 83, 5 | 295, 3, 53, 2 | 296, 2, 43, 1 |
| The same among traffic, with the traffic cars knocked out | 263, 52, 250, 28, 78 | 272, 28, 200, 18, 56 | 272, 32, 178, 25, 55 |
| With a careless human, 242 racers: with no reset, resets, hits | 223, 21, 106 | 215, 31, 87 | 218, 25, 77 |
| A car parked on the racing line, six races: resets, hits | 41, 52 | 16, 39 | 13, 28 |
| Alone, 148 runs: resets in the dry, wet, snow and ice | 3, 2, 3, 23 | 2, 2, 4, 26 | 2, 2, 4, 26 |
| Alone: hits in the dry, wet, snow and ice | 9, 13, 7, 26 | 12, 16, 12, 34 | 13, 16, 12, 34 |

What the new roads cost: a racer alone hits a little more, most of it at `harbour-to-harbour`'s two tight junctions (the first gap below) and on `round-jomalaby`, and the careless human's race among the racers ends in a reset for a few more of them. `getas-islands`, whose laid road had a step that stopped a car dead, is clean alone.

### The challenges' targets

A bucket list target is the fastest the racer gets in the challenge's car on its road (`challenge/targets.ts`, `tools/challenge-par.ts`), so what changes the racer moves the targets, and they are measured again with it. Of the 21 routes, 16 came out harder, by 0.3 to 27 in 100: most on ice (`jomala-ice`, 259.6 s to 189.9 s), on gravel (`kullskar-fog`, 256.4 s to 197.6 s) and on gravel and tarmac in the wet (`degersand-group-b`, 187.6 s to 157.0 s), each par the racer's at the whole of the car's grip with no hit and no reset. Five came out easier, by 0.4 to 4 in 100, the two furthest both climbs (`getabergen-peoples-car`, `orrdalsklint-climb`): the racer is slower there than it was, and why is still to read. The four Speed traps are the scripted driver's flat out, and stand as they were.

On the roads at their real width 19 of the 25 are within a second of what they were, and every par is a run with no hit and no reset. `backrace-weekend` is 18.8 s slower, 198.3 s, its road's last 1.8 km being gravel in the wet; `kullskar-fog` and `djurvik-first-snow` are 6.4 and 3.2 s quicker; `post-road-old-way`, `notviken-night-rain` and `degersand-group-b` a second or two slower.

They will move again with the weather on the roads: a winter road becomes packed snow or ice where it is bare today.

## Done, and not done

Each step's "done" is in `ideas/races.md`, section 8. The line is done when every race is finished cleanly on it in every condition, faster than down the laid middle, by count. The racer is done when a race against racers has times that spread by difficulty, by count, and the owner has raced one and found it drives like a driver. The kill rule for the rule-based racer is the owner's: a reading they judge not worth fixing by rules, with the brief for a learned line written before anything learns.

## The owner's rulings

- **One kind of racer, as fast as it legally can be; no difficulty levels.** Put to the owner as five levels, each a share of the car's limit, with their spread measured; raced, and ruled against: every racer on the grid is to be as hard as possible while obeying the simulation, never cheating, and the work goes into their pace and their racecraft, not into grading them down. The owner's reasoning: it is hard to make an AI racer good and easy to make one bad, so the best racer comes first, and scaling it down into levels later, if ever wanted, is the easy part. What they lacked when raced was what the levels couldn't give: they saw neither each other, nor the player, nor the traffic, and a spun car struggled to recover.
- **A reset never compensates for bad driving.** The racers reset liberally enough that a race stays playable, and the owner ruled that this is not how they get round: the mistakes go, the reset stays what it is for the player, the last resort.
- **Shipped with the gaps written down**, above, and the next step for each, rather than held back until clean: playable, and known.
- Beyond that, those in `ideas/traffic-and-racers.md` and `ideas/races.md`.

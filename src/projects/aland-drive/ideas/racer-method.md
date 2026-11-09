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

### The grid, by the vetting tool's grid mode

A grid of six on Kastelholm and the Painters' Loop, each racer seeing the others, is the racecraft's ruler (`racers/vet-grid.ts`): places, passes, pile-ups, and each racer's hits and resets with their causes. Before: Kastelholm's pole car never finished (483 hits, 477 resets, lapping into the five cars parked on the finish line); the Painters' Loop had 140 pile-ups. After the finishers cool down off the line, the reset lands before the next line, a pass needs the racer to be closing (off a standing start everyone ahead is slow, and the grid is two abreast with no room), and a defence picks its side once: every racer finishes, no pile-up, 37 and 29 passes, and 22 and 38 resets across the six, almost all `lost` after a contact, Lontano's and Borg's half of them. Contact is now the thing to read: a knock at speed still ends in a reset, where a player would gather it up.

What a reading can't tell: whether the racer looks like a driver. That is the owner's, at the checkpoint, and the films.

## Done, and not done

Each step's "done" is in `ideas/races.md`, section 8. The line is done when every race is finished cleanly on it in every condition, faster than down the laid middle, by count. The racer is done when a race against racers has times that spread by difficulty, by count, and the owner has raced one and found it drives like a driver. The kill rule for the rule-based racer is the owner's: a reading they judge not worth fixing by rules, with the brief for a learned line written before anything learns.

## The owner's rulings

- **One kind of racer, as fast as it legally can be; no difficulty levels.** Put to the owner as five levels, each a share of the car's limit, with their spread measured; raced, and ruled against: every racer on the grid is to be as hard as possible while obeying the simulation, never cheating, and the work goes into their pace and their racecraft, not into grading them down. The owner's reasoning: it is hard to make an AI racer good and easy to make one bad, so the best racer comes first, and scaling it down into levels later, if ever wanted, is the easy part. What they lacked when raced was what the levels couldn't give: they saw neither each other, nor the player, nor the traffic, and a spun car struggled to recover.
- Beyond that, those in `ideas/traffic-and-racers.md` and `ideas/races.md`.

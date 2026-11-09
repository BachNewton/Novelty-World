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
- **Difficulty is a calibration of a few numbers**: the share of the limit the plan uses, how late it brakes, how cleanly it holds the line, how fast it reacts, how often it slips, which car it drives. Each setting is one point of those, and its time on every track is counted. If the spread of settings ever needs fitting (a setting that lands near the owner's own pace), that is black-box tuning on a deterministic objective, the cheapest kind there is.

So the skill's decision procedure ends at its first branch: a hand-written baseline, measured on the ruler, and no learner behind it. A learned racer (imitation of the owner's play, or policy gradient on the simulation) would be a later line, taken only if the rule-based racer fails a reading the owner cares about and the brief for it says what it would add.

## The ruler, and what it says

`tools/race-vet.ts` is the ruler, built first (step 2 of `ideas/races.md`'s order). Its first readings, the race's own car, dry, from the pole, on the par driver's plan at shares of the flat-pad grip, said more about the driver than the tracks: at 0.9 of the grip the plain driver, which follows the GPS's line and reads a bend's sharpness over 24 m, ran wide at junction corners and into what stood past the verge on most tracks, and the GPS's line itself leaves the laid road on several. Those readings were the floor; the findings about tracks are in `ideas/races.md`, section 7.

The racer on the racing line, read the same way (the race's own car, dry, from the pole, every race), at the five difficulty levels:

| Level | Races every run is clean on, of 32 |
|---|---|
| easy | 27 |
| medium | 23 |
| hard | 11 |
| expert | 3 |
| legend | 2 |

The spread between levels is real: a medium racer is about 10% slower than a hard one over a race and an easy one about 10% slower again (Painters' Loop 5:31, 6:01 and 6:44 at hard, medium and easy; Kastelholm 6:16, 6:50 and 7:36), and the racing line at any level is faster than the laid middle wherever both are clean (Kastelholm's lap 2:00 against 2:27). Expert and legend are not yet levels a racer can be trusted at: they finish most races but with a reset or a hit, and a reset costs more than the extra pace earns, so on a third of the tracks hard beats them. The next step this reading asks for is at the top, not the bottom: what the plan doesn't see on the tracks where expert runs wide (camber, a crest it reads too gently, a bend the line's smoothing softens), read track by track from the vetting tool's traces, before anyone tunes the shares.

What a reading can't tell: whether the racer looks like a driver. That is the owner's, at the checkpoint, and the films.

## Done, and not done

Each step's "done" is in `ideas/races.md`, section 8. The line is done when every race is finished cleanly on it in every condition, faster than down the laid middle, by count. The racer is done when a race against racers has times that spread by difficulty, by count, and the owner has raced one and found it drives like a driver. The kill rule for the rule-based racer is the owner's: a reading they judge not worth fixing by rules, with the brief for a learned line written before anything learns.

## The owner's rulings

None yet beyond those in `ideas/traffic-and-racers.md` and `ideas/races.md`.

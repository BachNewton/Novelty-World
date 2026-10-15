# Course authoring

How Frogmino gets its courses. Partly built: the proof solver, replays, designed co-op courses as data with their checks, and the co-op measures (see Built so far); the rest is planned.

## Principle

Claude is the game's main course designer. Courses made by people are a bonus: welcome, but the game never depends on them to have enough good courses. So the tooling is built for Claude first, and a human editor comes later on top of the same foundations.

## One course format

A course is data, not code: an ordered list of rows (which vehicles sit in which lanes), the spacing between rows, each player's piece, the course length, gold, silver and bronze times and a difficulty tier. Every source of courses produces this same format:

- Claude, designing courses on purpose;
- a human, through the editor.

Because the format is shared, every course gets the same checks and plays the same way, whoever made it.

## Claude's toolbox

Claude designs a course, runs the tools, reads what they say, and revises, the way a level designer iterates. The tools, all runnable from the command line:

- **Validate:** the course is legal (vehicles only from the fleet, one per lane) and completable: the team can pass every row. Fails loudly, naming the row.
- **Analyse:** per row, the number of ways through, which moves it demands (slide, rotate, hop, riding), decoys and near misses, and a difficulty curve across the whole course, so Claude can see whether it ramps, rests and peaks as intended.
- **Play:** an automated player that finds a good route through the course and reports its time, bonks, and where it struggled. Its times anchor the medal thresholds.
- **Preview:** a picture of each row (head-on silhouettes) and of the course as a whole, readable without running the game.
- **Prove and watch:** seeing is believing. A course is proved beatable by an input log that takes the team through every row without a bonk and over the finish, found by a solver and verified by replaying it in the real rules; and any log can be watched played out in the real game scene.

## Built so far

The foundation, in `proof/` and `coop-courses/` (see Courses and medals, Proving courses and Adding a co-op course in the project's `CLAUDE.md`):

- **The solver** proves a course row by row in the real engine: a breadth-first search over the team's poses per row (slides, turns with kicks, hops, perching on a partner), compiled to timed inputs, checked step by step against the engine, to the finish, then the whole log replayed from the start. It runs from a test or the CLI (`npm run frogmino:prove`), and names any row with no route.
- **Designed answers:** a course designed by hand names, per row, the pose each frog is meant to pass in, and the solver can be held to it, so the proof plays the course as designed.
- **The pose count:** how many team poses that the team can reach pass a row, the first seed of Analyse and the difficulty measure, printed per row by the CLI.
- **Readable routes:** per row, the steps in words, the row's face in ASCII at each stage, and the inputs. The first seed of Preview, as text.
- **Designed co-op courses as data:** one file per course in a registry, each with its id, name, tier, description, road width, any pair of pieces, its own length, medal times and rows, picked on the local join screen or by the online host. Validate's first part runs as the registry is built: legal rows, answers that pass with the frogs clear of each other, medal times in order and slower than a held jump down the course, and every row met before the finish by a team jumping flat out. A test holds every answer within the team's reach, and a slow test proves every course in its answers.
- **The co-op measures:** per row, its coupling (how far the frogs' ways through depend on each other, from parallel solo to fully coupled), its selfish decoys (a frog's ways through that strand its partner) and the coordination kinds of its designed answer and the solver's route (perch, both up, interlock, order, crossing), printed with the proof's time against the medal times in the CLI's course summary.
- **Replays:** a replay is plain data (a course spec, an input log, an end tick), and `?replay=<name>` plays it in the game scene at real speed, slower or paused. The CLI saves a proof as a replay, so a person can watch what the solver found.

What it proves today: every designed co-op course to its finish, every row in its designed answer.

How the rest builds on it:

- **Validate** is the solver run per row, with the legality checks the row format already makes (`traffic.ts`); it is built.
- **Analyse** reads the planner's search: how many poses pass, and for co-op its coupling, selfish decoys and coordination kinds (built); still to come, how far the shortest route is, which moves it needs (a hop, a kick), near misses, and a difficulty curve across the course.
- **Play** grows from the solver: today it plays at one fixed pace and only between rows; the automated player for medals needs the fastest route, moves made while a row overlaps the team, and recovery after a bonk. Until it has them, each course's medal times are provisional, set from the solver's proof and the held-jump floor, which the prove CLI prints (see Courses and medals in the project's CLAUDE.md).
- **Preview** grows from the ASCII faces into pictures of rows and courses.

## Designing co-op courses

What designing co-op courses has taught: first a teaching ramp for an L and a J (since replaced), then the three easy and two medium courses in `coop-courses/`. These notes gather it in one place ahead of a course-design skill. The steps for adding a course are Adding a co-op course in the project's `CLAUDE.md`. The courses themselves are the worked examples: read a course's file and its CLI summary together.

### What makes a co-op course good

- **Neither frog can get through alone.** Co-op is Brain Wall's pairs: two players making a shape neither could make by themselves. A row the frogs can pass as two separate solo puzzles is *parallel solo*. That's fine as a warm-up or a breather, and wrong as the substance of a course.
- **Fun is the call-outs.** "You go up, I'll go under", "wait, let me move first". The shared jump makes the team agree a pace, and the shared bonk makes one player's slip cost both. That shared stake is only fair when the opening's shape makes each frog's job readable, so a bonk shows which frog didn't fit.
- **Interesting is variety in how the frogs coordinate,** not just new vehicle layouts. The kinds:
  - **interlock:** fitting the two pieces into one shape;
  - **order:** one frog must move before the other can reach its spot ("make room");
  - **timing:** both hop together, with nothing under either;
  - **support (the perch):** one frog stands on the other, which also forgives an early hop;
  - **pace:** the gaps make the team hurry or wait as one.
- **No designed answer needs a crossing.** The frogs only swap sides by a turn kicking two lanes through the partner, an open rules question, so answers keep each frog on its own side, Sprout on the left.
- **Challenging means coordination difficulty:**
  - **Good:** a team pose that's hard to find, steps that must come in order, both players committing to a plan before the row arrives, and selfish decoys (a pose that fits one frog well and strands its partner), from medium on.
  - **Not co-op difficulty:** individual dexterity, each player's reflexes tested separately.
  - **Tight both-up timing is harder online,** where each player sees the partner late. Keep it rare, give it reading room, and design it so players call it out ("hop on three") rather than react to each other.
- **Satisfying is the interlock clicking into place.** That needs an answer the opening's shape suggests (the vehicles outline where each frog goes), and *chains*, where the pose one row leaves the team in sets up the next.

### Courses, tiers and medals

- **Each co-op course fixes its pair of pieces** for the whole course. The pair is the course's identity, so choose it first, for what its shapes can do (below).
- **The arc:** warm-up, build, breather, climax. One idea a row, each new idea first where it's easy to see, then repeated, then combined. Reading room is longest early and shrinks as the course goes. End on the course's hardest, most coupled row.
- **Short courses.** A medal is chased by retrying, and a retry is the whole course, so courses stay around one to two minutes:

  | Tier | Rows | Coupled rows | Gaps | Passing poses per row |
  |---|---|---|---|---|
  | Easy | 8–10 | about half; mirrored rows welcome | long (`READ_SLOW`, `READ`) | tens to hundreds |
  | Medium | 12–14 | most, apart from one or two breathers | `READ` shrinking to `PACE` | about 5–14, with 2–4 in order |
  | Hard | 14–16 | nearly all | `PACE`, with 10-unit bursts in chains | one, or a short-gap chain into one |

- **Medium rows** are fully coupled, every in-order way through is the same kind (all perches, say), and the row's decoy is the habit from the row before.
- **The finish** sits about five units past where a team jumping flat out meets the last row; the course checks hold every row to coming before it.
- **Medal times,** the same rule for every course so the tiers compare, from the proof's time and the held-jump floor the CLI prints, rounded to five seconds:
  - gold about halfway between the floor and the proof;
  - silver about 90% of the proof;
  - bronze about 125% of the proof.

  So the solver's own careful run earns bronze. They stay provisional until playtesting.

### The shapes the road allows

- **Openings are lanes.** A vehicle fills its lanes from the road up and never hangs over an empty one, so an opening is mostly whole free lanes, the space above low vehicles, and the odd roof under an overhang. A shape the frogs make together reads only where each lane of it starts on the road or on a low vehicle. A hole under a piece, such as the gap beneath a bar, is a cell no vehicle can fill, so it stays open and lets other answers through.
- **The open air above is what fights tight rows.** Nothing roofs rows 2 and 3 over three or more lanes, so a grounded answer with nothing over it lets raised poses through (two nested Ts on the road pass 72 ways). Rows go tight when the answer itself reaches row 2 (a perch, a lean) and buses pin its sides.
- **Ceilings come only from overhangs.** The vocabulary of single-cell overhangs is small:
  - **Over a lone lane at row 1,** with the road open under it: Z1 and S1 give two-cell overhangs (Z1 over its right lane, S1 its left); Z0, S0 and T2's arms give one cell; J2 and L2 overhang two lanes.
  - **At row 2:** only the J1 and L3 arms.
  - **Low lanes (blocked at row 0 only):** J3's left lane, L1's right lane, the J0 and L0 feet, T0's arms, and I0.
  - **A two-lane roof at row 2** needs J1 and L3 together. That costs four lanes, which caps how often such a "garage" fits on a narrow road.
- **A perch needs a one-cell-tall part underneath.** A hop lifts a frog one cell, so a raised frog can stand only on a flat I, a T's arm or nose, or an L's or J's foot. A two-cell-tall piece can't perch on another: a raised O always overlaps a grounded O.
- **Answer-first works:** choose the team's pose, then the vehicles that outline it.

### What each pair is good at

| Pair | Good at | Bad at |
|---|---|---|
| L + J (mirror pair) | Side-by-side touching shapes (noses together, a cup, a lean, a bridge over a low vehicle); one up, one down (a foot on the partner's foot). Mirrored rows on an even road set both frogs the same task, the quickest read there is. | No interlock with both frogs on the road leaves no hole. |
| O + O | Reads at once; make-room chains work well. All placement and order. | No perch, and no real coupling: "one up, one down" is only a step, the two blocks side by side, one a cell higher. |
| T + T | Two strong shapes: the nest (one pointing up, one down, offset into a parallelogram, outlined by an S1 or Z1 overhang over one end and a J3 or L1 low lane under the other) and the lean (one T on its side, the other up a cell with its nose on the first's). | The nest leaves holes under the arms that need specific vehicles. On 8 lanes the start is off-centre. A T kicks through its partner easily, so half its passes are crossed. |
| I + O | The clearest roles and the best perch: the O on a flat I. Tight answers are easy to force, since the I is only a flat bar or a full-height pole. | A row with the O beside the I uses a lot of road. |
| S + Z (mirror pair) | Stacks: one flat on the other's step, or on the partner standing as a tower. These read fully coupled with decoys, and swapping who's on top gives order and habit traps for free. | Low pass counts. The V and the bridge stay at 13–27 passes, tall-plus-flat hooks at about 19, and every tower row keeps a second in-order pass (the S flat with the Z upright on it). No S + Z row with a single in-order pass has been found, so its finales are hard by chain and swap. |
| T + L | The L leaning on, hooking or resting on the T: fully coupled rows, perches that can be forced, and a hook with one pass. Chains well, since the T often holds still while the L changes. | The T on top of the L always lets a side-by-side raised pose through: the L climbs, the T supports. |

### Reading the measures

`npm run frogmino:prove -- <id> --brief` prints per row: the passing poses (in order and crossed), coupling with its label, selfish decoys per frog, and the coordination kinds of the designed answer.

- **Coupling only sees shared lanes.** At its best lane line, it compares the team's ways through with every free pairing of the frogs' solo ways. 0 means a line splits the road and each frog picks freely; 1 means every way through shares a lane.
- **Read coupling with the kinds and the pass count, never alone.** It reads 0 for a both-up timing row that truly needs both frogs. It stays near 0 for any pair that can't share a lane (two Os, two flat pieces), whose coordination shows only as order, interlock and decoys. It reads low on a perch row where a raised frog can sit beside its partner instead of on it.
- **A lesson row must force its kind.** If the lesson is the perch, the side-by-side raised alternative must not pass (the teaching ramp's one-up rows failed this). Check the in-order passes, not the total: crossed passes need a kick through the partner. Printing every in-order passing pose under the row's face shows which alternatives are still open.
- **The kinds count any perch,** so read the pass list to see which frog is up.
- **Hundreds of passing poses** is a warm-up, **a handful** a puzzle, **one** a finale.

### How to work

- **Search, then hand-finish.** The medium courses were found with a throwaway script: given an answer pose, it samples rows that keep that pose open and scores them with `analyse.ts`. A filter rejects any row where an in-order pass has a raised frog not on its partner, which is how to force a perch. That was far faster than editing a course file and rerunning the CLI. A row-search tool along those lines is worth building into `proof/`, along with a `--passes` flag that prints a row's in-order passing poses.
- **The CLI doesn't check that an answer passes while drafting;** only the course check does, once the course is registered. Mark the cells where a frog would sit in a vehicle as you draft, so a broken answer shows before it's registered.
- **Chains create order for free.** Pick the next row's answer so that one frog's target overlaps where its partner was left standing.
- **Short gaps (10) work** and still prove, as long as each answer is one move from the last. Use them for chains, not for travel. Moving a stack four or more lanes in a 13-unit gap is fine for the solver, and it's where players will bonk.
- **Prove in the answers,** and save the proof as a replay to watch it played.

## Claude's skill

Not yet: the lessons gather in Designing co-op courses first, course by course, and become a skill once there are enough of them to be sure. The skill would teach course design for Frogmino: what makes a row interesting (one clean answer, a tempting decoy, a forced rotation, a hop that riding forgives), how to pace a course (warm-up, build, breather, climax), how to design for co-op pairs, and how to set medal times from the automated player. It ends with the tools: design, validate, analyse, play, revise.

The goal is a spread of courses from gentle to brutal, each one hand-shaped rather than random.

## The human editor (later)

A visual editor for the owner's friend and anyone else who wants to build: place vehicles row by row, see the fit analysis and validation live, test-play instantly, and save to the same course format. It reuses Claude's validate, analyse and play tools, so a human-made course is held to the same standard.

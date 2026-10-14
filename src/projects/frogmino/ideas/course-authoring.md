# Course authoring

How Frogmino gets its courses. Partly built: the proof solver, replays, designed co-op courses as data with their checks, and the co-op measures (see Built so far); the rest is planned.

## Principle

Claude is the game's main course designer. Courses made by people are a bonus: welcome, but the game never depends on them to have enough good courses. So the tooling is built for Claude first, and a human editor comes later on top of the same foundations.

## One course format

A course is data, not code: an ordered list of rows (which vehicles sit in which lanes, and any gates with the piece each sets), the spacing between rows, the starting piece, the course length, gold, silver and bronze times, a difficulty label, and whether it's solo, co-op or both. Every source of courses produces this same format:

- the seeded generator (endless variety, quick play);
- Claude, designing courses on purpose;
- a human, through the editor.

Because the format is shared, every course gets the same checks and plays the same way, whoever made it.

## Claude's toolbox

Claude designs a course, runs the tools, reads what they say, and revises, the way a level designer iterates. The tools, all runnable from the command line:

- **Validate:** the course is legal (vehicles only from the fleet, one per lane, gates wide enough) and completable. Completable means every row can be passed by every piece the player could be holding there, with gates optional. For co-op it means every pair of pieces the partners could be holding, given that a gate closes behind the first frog through. Fails loudly, naming the row and the stuck piece.
- **Analyse:** per row, the number of ways through, which moves it demands (slide, rotate, hop, riding), decoys and near misses, whether a gate is needed later, and a difficulty curve across the whole course, so Claude can see whether it ramps, rests and peaks as intended.
- **Play:** an automated player that finds a good route through the course and reports its time, bonks, and where it struggled. Its times anchor the medal thresholds.
- **Preview:** a picture of each row (head-on silhouettes) and of the course as a whole, readable without running the game.
- **Prove and watch:** seeing is believing. A course is proved beatable by an input log that takes the team through every row without a bonk and over the finish, found by a solver and verified by replaying it in the real rules; and any log can be watched played out in the real game scene.

## Built so far

The foundation, in `proof/` and `coop-courses/` (see Courses and medals, Proving courses and Adding a co-op course in the project's `CLAUDE.md`):

- **The solver** proves a course, solo or co-op, row by row in the real engine: a breadth-first search over the team's poses per row (slides, turns with kicks, hops, perching on a partner), compiled to timed inputs, checked step by step against the engine, backing up to take a gate a later row needs, to the finish, then the whole log replayed from the start. It runs from a test or the CLI (`npm run frogmino:prove`), and names any row with no route.
- **Designed answers:** a course designed by hand names, per row, the pose each frog is meant to pass in, and the solver can be held to it, so the proof plays the course as designed.
- **The pose count:** how many team poses that the team can reach pass a row, the first seed of Analyse and the difficulty measure, printed per row by the CLI.
- **Readable routes:** per row, the steps in words, the row's face in ASCII at each stage, and the inputs. The first seed of Preview, as text.
- **Designed co-op courses as data:** one file per course in a registry, each with its id, name, tier, description, road width, any pair of pieces, its own length, medal times and rows, picked on the local join screen or by the online host. Validate's first part runs as the registry is built: legal rows, answers that pass with the frogs clear of each other, medal times in order and slower than a held jump down the course, and every row met before the finish by a team jumping flat out. A test holds every answer within the team's reach, and a slow test proves every course in its answers.
- **The co-op measures:** per row, its coupling (how far the frogs' ways through depend on each other, from parallel solo to fully coupled), its selfish decoys (a frog's ways through that strand its partner) and the coordination kinds of its designed answer and the solver's route (perch, both up, interlock, order, crossing), printed with the proof's time against the medal times in the CLI's course summary.
- **Replays:** a replay is plain data (a course spec, an input log, an end tick), and `?replay=<name>` plays it in the game scene at real speed, slower or paused. The CLI saves a proof as a replay, so a person can watch what the solver found.

What it proves today: every designed co-op course to its finish, every row in its designed answer, and solo's row stream to the finish, through the gates its needs-gate rows need.

How the rest builds on it:

- **Validate** is the solver run per row against every piece, or pair of pieces, the team could hold there, with the legality checks the row format already makes (`traffic.ts`); for co-op courses without gates it is built.
- **Analyse** reads the planner's search: how many poses pass, and for co-op its coupling, selfish decoys and coordination kinds (built); still to come, how far the shortest route is, which moves it needs (a hop, a kick), near misses, and a difficulty curve across the course.
- **Play** grows from the solver: today it plays at one fixed pace and only between rows; the automated player for medals needs the fastest route, moves made while a row overlaps the team, and recovery after a bonk. Until it has them, each course's medal times are provisional, set from the solver's proof and the held-jump floor, which the prove CLI prints (see Courses and medals in the project's CLAUDE.md).
- **Preview** grows from the ASCII faces into pictures of rows and courses.

## Designing co-op rows

What designing the teaching ramp (`coop-courses/teaching-ramp.ts`), the first co-op course, taught, for the skill to come. The steps for adding a course are Adding a co-op course in the project's `CLAUDE.md`.

- **Openings are lanes.** A vehicle fills its lanes from the road up and never hangs over an empty one, so an opening is mostly whole free lanes, the space above low vehicles, and the odd roof under an overhang (a car carrier's deck, a crane's arm). A shape the frogs make together reads only where each lane of it starts on the road or on a low vehicle; a hole under a piece, such as the gap beneath a bar, is a cell no vehicle can fill, so it stays open and lets other answers through.
- **So the pair's shapes are few.** For the L and the J, no interlock with both frogs on the road leaves no hole. The clean shapes are side by side, touching (noses together, a cup, a lean, a bridge over a low vehicle), and one up, one down (a foot on the partner's foot, lying across a low vehicle onto it). Answer-first works: choose the pair's pose, then the vehicles that outline it.
- **The air above is open.** Everything above a low vehicle or a free lane is open to the top of the face, so raised poses pass alongside the intended one. Count them with the pose count rather than fight them: a row stays readable if its intended answer is the shape the opening shows.
- **Mirror images.** The L and the J are mirror images, and on an even road the frogs start as mirror images too, so a row mirrored about the middle sets both frogs the same task. It is the quickest read there is, and the place to start a ramp.
- **Who goes where.** Frogs keep their sides of each other, except where a turn kicks two lanes through the partner; answers keep Sprout on the left. Making room (one frog moving aside before its partner can pass) is a lesson of its own.
- **Timing is a co-op idea too.** A frog up with nothing under it must hop within its airtime of the row, so two frogs up at once must hop together; a frog up on its partner's foot can hop as early as it likes (the perch). Both are worth a row.
- **Pacing.** One idea a row, each new idea first where it is easy to see, then combined, ending on the row with one answer. Early rows get more reading room. A course's finish is its own: put it just past the last row, which the course checks hold to a team jumping flat out meeting every row first. A slow team meets the rows again after the last, every row unless the course says only its last few.
- **Prove in the answers,** and count each row's passing poses: hundreds is a warm-up, a handful a puzzle, one a finale.
- **Measure whether a row needs both frogs.** The pose count says how hard a row is, not whether it is co-op. Coupling says how far the frogs' ways through depend on each other: 0, parallel solo, means a lane line splits the road and each frog can take any of its own ways; near 1, every way through has the frogs sharing lanes. Selfish decoys count the ways a frog alone fits that leave its partner nowhere, the row's traps for a player not watching the other. The coordination kinds say what the designed answer asks: a perch, both up, an interlock, order or crossing. On the teaching ramp, the side-by-side rows read parallel solo, as meant. The one-up rows read partly coupled with many decoys: their answer is a perch, but a few ways through keep the frogs in their own lanes, a raised frog to one side of its partner. Hopping together over low vehicles reads partly coupled too, since the open air over them lets raised frogs drift into each other's lanes. The finale has one way through and four decoys, its frogs in lanes of their own, so the coordination it asks is the timing of two frogs up at once. To make a row truly need both frogs, close the ways through that keep the frogs apart: an answer that shares lanes and the fewest free pairings.

## Claude's skill

A project skill that teaches course design for Frogmino: what makes a row interesting (one clean answer, a tempting decoy, a forced rotation, a hop that riding forgives), how to pace a course (warm-up, build, breather, climax), how to use gates as a puzzle (sometimes needed later, sometimes a trap, sometimes a shortcut), how to design for co-op pairs, and how to set medal times from the automated player. It ends with the tools: design, validate, analyse, play, revise.

The goal is a spread of courses from gentle to brutal, each one hand-shaped rather than random.

## The human editor (later)

A visual editor for the owner's friend and anyone else who wants to build: place vehicles and gates row by row, see the fit analysis and validation live, test-play instantly, and save to the same course format. It reuses Claude's validate, analyse and play tools, so a human-made course is held to the same standard.

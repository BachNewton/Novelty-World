# Course authoring

How Frogmino gets its courses. Partly built: the proof solver, replays, designed co-op courses as data with their checks, and the co-op measures (see Built so far); the rest is planned.

## Principle

Claude is the game's main course designer. Courses made by people are a bonus: welcome, but the game never depends on them to have enough good courses. So the tooling is built for Claude first, and a human editor comes later on top of the same foundations.

## One course format

A course is data, not code: an ordered list of rows (which vehicles sit in which lanes), the spacing between rows, each player's piece, the course length, and gold, silver and bronze times. Every source of courses produces this same format:

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

- **The solver** proves a course row by row in the real engine: a breadth-first search over the team's poses per row (slides carrying riders, turns with kicks, hops lifting a partner, double jumps), compiled to timed inputs, checked step by step against the engine, to the finish, then the whole log replayed from the start. It runs from a test or the CLI (`npm run frogmino:prove`), and names any row with no route.
- **Designed answers:** a course designed by hand names, per row, the pose each frog is meant to pass in, and the solver can be held to it, so the proof plays the course as designed.
- **The pose count:** how many team poses that the team can reach pass a row, the first seed of Analyse and the difficulty measure, printed per row by the CLI.
- **Readable routes:** per row, the steps in words, the row's face in ASCII at each stage, and the inputs. The first seed of Preview, as text.
- **Designed co-op courses as data:** one file per course in a registry, each with its id, name, description, road width, any pair of pieces, its own length, medal times and rows, picked on the local join screen or by the online host. Validate's first part runs as the registry is built: legal rows, answers that pass with the frogs clear of each other, medal times in order and slower than a held jump down the course, and every row met before the finish by a team jumping flat out. A test holds every answer within the team's reach, and a slow test proves every course in its answers.
- **The co-op measures:** per row, the simplest way through (solo, perch, lift or double jump, and how many ways take that little), its coupling side by side (how far the frogs' ways through depend on each other when neither stands on the other, from parallel solo to fully coupled), how many ways through are stacked, its selfish decoys (a frog's ways through that strand its partner) and the coordination kinds of its designed answer and the solver's route (perch, stack, the stacking moves carry, hop off and double jump, both up, interlock, order, crossing), printed with the proof's time against the medal times in the CLI's course summary.
- **Replays:** a replay is plain data (a course spec, an input log, an end tick), and `?replay=<name>` plays it in the game scene at real speed, slower or paused. The CLI saves a proof as a replay, so a person can watch what the solver found.

What it proves today: every designed co-op course to its finish, every row in its designed answer.

How the rest builds on it:

- **Validate** is the solver run per row, with the legality checks the row format already makes (`traffic.ts`); it is built.
- **Analyse** reads the planner's search: how many poses pass, the simplest way through, and for co-op its coupling, selfish decoys and coordination kinds with the stacking moves an answer needs (built); still to come, how far the shortest route is, which moves it needs (a hop, a kick), near misses, and a difficulty curve across the course.
- **Play** grows from the solver: today it plays at one fixed pace and only between rows; the automated player for medals needs the fastest route, moves made while a row overlaps the team, and recovery after a bonk. Until it has them, each course's medal times are provisional, set from the solver's proof and the held-jump floor, which the prove CLI prints (see Courses and medals in the project's CLAUDE.md).
- **Preview** grows from the ASCII faces into pictures of rows and courses.

## Designing co-op courses

What designing co-op courses has taught, last for the seven stacking courses in `coop-courses/` (the frogs stand on each other, a hop lifts what stands on the hopper, and rows have no ceiling; see The motion model in the project's `CLAUDE.md`). These notes gather it in one place ahead of a course-design skill. The steps for adding a course are Adding a co-op course in the project's `CLAUDE.md`. The courses themselves are the worked examples: read a course's file and its CLI summary together.

### What makes a co-op course good

- **Neither frog can get through alone.** Co-op is Brain Wall's pairs: two players making a shape neither could make by themselves. A row the frogs can pass as two separate solo puzzles is *parallel solo*. That's fine as a warm-up or a breather, and wrong as the substance of a course.
- **Fun is the call-outs.** "Get on my back", "I'll lift you, then jump", "wait, let me move first". The shared jump makes the team agree a pace, and the shared bonk makes one player's slip cost both. That shared stake is only fair when the opening's shape makes each frog's job readable, so a bonk shows which frog didn't fit.
- **Interesting is variety in how the frogs coordinate,** not just new vehicle layouts. The kinds:
  - **interlock:** fitting the two pieces into one shape;
  - **order:** one frog must move before the other can reach its spot ("make room");
  - **timing:** both hop together, with nothing under either;
  - **the stacking moves,** each a moment of its own: the **perch** (one frog stands on the other, which also forgives an early hop), the **hop off** (a frog hops from its partner, a cell higher than a hop off the road), the **carry** (a hop lifts the frog standing on the hopper, or a slide takes it along) and the **double jump** (the top frog hops off while its partner is still in the air, two cells above where it stood);
  - **who climbs:** with the same task open to either frog, the read is whose turn it is to be on top, and swapping it after a row that set the habit the other way is a decoy for free;
  - **the crossing:** the frogs swap sides by climbing over each other, and a later row makes them cross back. With asymmetric pieces one direction is harder than the other, which is the point: a hard skill to learn and practise;
  - **pace:** the gaps make the team hurry or wait as one.
- **Challenging means coordination difficulty:**
  - **Good:** a team pose that's hard to find, steps that must come in order, both players committing to a plan before the row arrives, and selfish decoys (a pose that fits one frog well and strands its partner).
  - **Not co-op difficulty:** individual dexterity, each player's reflexes tested separately.
  - **Tight both-up timing is harder online,** where each player sees the partner late. Keep it rare, give it reading room, and design it so players call it out ("hop on three") rather than react to each other. The double jump is timing too, but one frog's: the top frog hops while it rides its partner up.
- **Satisfying is the interlock clicking into place.** That needs an answer the opening's shape suggests (the vehicles outline where each frog goes), and *chains*, where the pose one row leaves the team in sets up the next.

### Courses and medals

- **Each co-op course fixes its pair of pieces** for the whole course. The pair is the course's identity, so choose it first, for what its shapes can do (below). A course is named by its pair and its idea, never by a difficulty; the registry's order is the picker's, and the first course teaches stacking.
- **The arc:** warm-up, build, breather, climax. One idea a row, each new idea first where it's easy to see and nothing simpler gets through, then repeated, then combined. Reading room is longest early (`READ_SLOW`, `READ`) and shrinks as the course goes (`PACE`, 10-unit bursts in chains). End on the course's hardest row.
- **Short courses.** A medal is chased by retrying, and a retry is the whole course, so courses stay around one to two minutes: eight to ten rows.
- **The finish** sits about five units past where a team jumping flat out meets the last row; the course checks hold every row to coming before it.
- **Medal times,** the same rule for every course so they compare, from the proof's time and the held-jump floor the CLI prints, rounded to five seconds:
  - gold about halfway between the floor and the proof;
  - silver about 90% of the proof;
  - bronze about 125% of the proof.

  So the solver's own careful run earns bronze. They stay provisional until playtesting.

### The shapes the road allows

- **Openings are lanes, and the air above them is open.** A vehicle fills its lanes from the road up and never hangs over an empty one, so an opening is whole free lanes, the space above the vehicles, and the odd roof under an overhang. Nothing roofs anything over the middle of a pocket, so a frog flying high (a hop off a partner, a double jump) passes most rows in hundreds of ways. That is fine: those ways are harder, not easier. What a row must not have is a *simpler* way through than its lesson, and the simplest way through is the measure to read.
- **How high a frog gets:** its own hop, one cell; a perch, on its partner's top where its own hop left it; a lift (a carry, or a hop off a partner) one cell above that; a double jump two cells above where it stood. Tall partners have high tops: an L's foot or a T's nose is a step two cells up, which only a lift reaches, and an L or J reaches the top of a bus (four cells) by lifts alone.
- **A flat partner on the road always offers a perch over its middle.** Overhangs reach only the lanes next to a vehicle, so the middle of a flat I (or any frog three or more lanes wide) can't be roofed. To force a hop off or a double jump, use **the slot**: the bottom frog stands in a slot shaped exactly like one of its own poses (buses either side, an arm over a low lane), whose top is too high to perch on, while the top frog flies over a vehicle two cells tall (a hop off, an ice-cream van) or three (a double jump, a crane) beside it. The vehicles say it at a glance: "stand here", "fly over that". The bottom frog gets into its slot after the top one has taken off, so the slot is also where its partner's way below is.
- **What can't be forced,** found by searching: a carry, with an I and an O (the I upright and the O beside it, both hopped, always passes too, so the carry row has a both-up alternative); a double jump with two Ts (none found in thousands of sampled rows: their noses reach the same heights by lifts), and only in cluttered rows with a T and an L; a perch for two Is (two upright Is side by side pass any pocket a flat I fits). And two Os can't stack at all: an O is two cells tall and a hop lifts it one.
- **Ceilings come only from overhangs.** The vocabulary is small:
  - **Over a lone lane at row 1,** with the road open under it: Z1 and S1 give two-cell overhangs (Z1 over its right lane, S1 its left); Z0, S0 and T2's arms give one cell; J2 and L2 overhang two lanes; T1's and T3's arms are the usual pocket edge.
  - **At row 2:** only the J1 and L3 arms. J1 and L3 side by side make a garage: a roof three cells up over four lanes with a two-lane tunnel under it, which nothing four wide fits, and a flat I clears only by a double jump.
  - **Low lanes (blocked at row 0 only):** J3's left lane, L1's right lane, the J0 and L0 feet, T0's arms, and I0.
- **Answer-first works:** choose the team's pose, then the vehicles that outline it.

### What each pair is good at

| Pair | Good at | Bad at |
|---|---|---|
| I + O | The teaching pair: the O on the flat I is the clearest perch, and with the I standing in a slot the O's hop off (over a van) and double jump (over a crane) can each be forced. | The carry can't be forced (a both-up alternative). A row with the O beside the I uses a lot of road. |
| O + O | Reads at once; make-room chains work well. All placement and order. | No stacking at all, and no crossing: the ground course. |
| T + T | The staircase: a T pointing up has an arm a cell up and a nose two up, so the other climbs onto the arm (a perch, unique in a pocket with the arms' outer lanes roofed) or is lifted onto the nose. Who climbs is the read. | No forced double jump found. Identical pieces make a crossing only a matter of who is who. |
| L + J (mirror pair) | Climbing on the partner's back (a perch, unique with a T arm and an L3 arm shaping the pocket), hopping off a partner standing in its slot, and mirrored rows on an even road: each frog takes each part. Asymmetric, so the crossing and back differ. | Reaches the top of a bus by lifts, so a double jump isn't forced. |
| I + I | Towers (upright in slots, hopped onto low lanes) and the double jump over a garage, the lifter standing up in its slot below; who flies swaps, and the flyer crosses over and back. | No forced perch or lift: two uprights side by side pass any open pocket. |
| S + Z (mirror pair) | The bridge, the lean, climbing each other's step, and hopping off over a van from a slot; the crossing and back, mirror pieces climbing differently each way. | The step rows keep a few crossed side-by-side ways through (reached by climbing over, so still coupled). |
| T + L | Everything: the lean, climbing on top, the lift onto the T's nose, hopping off from slots, crossing and back; chains well, since the T often holds still while the L changes. | A forced double jump only in cluttered rows. |

### Reading the measures

`npm run frogmino:prove -- <id> --brief` prints per row: the passing poses (side by side, in order and crossed, and stacked), the simplest way through, coupling with its label, selfish decoys per frog, and the coordination kinds of the designed answer and the solver's route.

- **The simplest way through says what a row asks.** Solo, perch, lift or double jump, with how many ways take that little. A lesson row reads its lesson here: a double-jump row reads "double jump", and a row meant to need a stack must not read "solo". The pass count alone says little: with no ceiling, frogs flying high pass most rows in hundreds of ways, each harder than the simplest.
- **Coupling reads only the ways side by side.** At its best lane line, it compares the team's ways through with neither frog on the other with every free pairing of the frogs' solo ways. 0 means a line splits the road and each frog picks freely; 1 means every way side by side shares a lane, or only a stack passes. The stacked ways are counted apart: they share lanes and outnumber the ways side by side by tens to one, so counting them read every row fully coupled.
- **Read coupling with the kinds and the simplest way, never alone.** It reads 0 for a both-up timing row that truly needs both frogs, and stays near 0 for any pair that can't share a lane (two Os), whose coordination shows only as order, interlock and decoys.
- **The stacking moves are exact.** An answer needs a carry, a hop off or a double jump when the team can't reach its pose at all without one; a pose two ways reach (a frog lifted on its partner: a carry, or a hop off then the partner's hop beneath it) shows its stack and needs neither, so a lift row's answer may list no move while the route shows the one the solver used.
- **The kinds count any perch,** so read the pass list to see which frog is up.

### How to work

- **Search, then hand-finish.** Rows were found with throwaway scripts: given an answer pose, sample rows that keep it open and score them with `analyse.ts`, rejecting any row with a way through simpler than the lesson; or try a hand-made row and print every passing pose with the stacking level each needs. That is far faster than editing a course file and rerunning the CLI. A row-search tool along those lines is worth building into `proof/`, along with a `--passes` flag that prints a row's passing poses. Random rows rarely read well: the readable ones come from templates (pockets roofed at their edges, slots in a wall of buses beside a van or a crane), with the search to confirm nothing simpler gets through.
- **The CLI doesn't check that an answer passes while drafting;** only the course check does, once the course is registered. Mark the cells where a frog would sit in a vehicle as you draft, so a broken answer shows before it's registered.
- **Chains create order for free.** Pick the next row's answer so that one frog's target overlaps where its partner was left standing.
- **Short gaps work** and still prove, as long as each answer is a few moves from the last. Use them for chains, not for travel. A double jump into a slot fits the solver's timing with nothing to spare: the top frog's airtime covers the lifter landing, standing up and sliding into its slot.
- **Prove in the answers,** and save the proof as a replay to watch it played.

## Claude's skill

Not yet: the lessons gather in Designing co-op courses first, course by course, and become a skill once there are enough of them to be sure. The skill would teach course design for Frogmino: what makes a row interesting (one clean answer, a tempting decoy, a forced rotation, a hop that riding forgives), how to pace a course (warm-up, build, breather, climax), how to design for co-op pairs, and how to set medal times from the automated player. It ends with the tools: design, validate, analyse, play, revise.

The goal is a spread of courses from gentle to brutal, each one hand-shaped rather than random.

## The human editor (later)

A visual editor for the owner's friend and anyone else who wants to build: place vehicles row by row, see the fit analysis and validation live, test-play instantly, and save to the same course format. It reuses Claude's validate, analyse and play tools, so a human-made course is held to the same standard.

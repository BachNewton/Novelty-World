# Course authoring

Planned, not built. How Frogmino gets its courses.

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

## Claude's skill

A project skill that teaches course design for Frogmino: what makes a row interesting (one clean answer, a tempting decoy, a forced rotation, a hop that riding forgives), how to pace a course (warm-up, build, breather, climax), how to use gates as a puzzle (sometimes needed later, sometimes a trap, sometimes a shortcut), how to design for co-op pairs, and how to set medal times from the automated player. It ends with the tools: design, validate, analyse, play, revise.

The goal is a spread of courses from gentle to brutal, each one hand-shaped rather than random.

## The human editor (later)

A visual editor for the owner's friend and anyone else who wants to build: place vehicles and gates row by row, see the fit analysis and validation live, test-play instantly, and save to the same course format. It reuses Claude's validate, analyse and play tools, so a human-made course is held to the same standard.

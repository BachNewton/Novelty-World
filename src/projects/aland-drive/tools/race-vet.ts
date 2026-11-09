// The race vetting tool (`ideas/races.md`, "Vetting tracks by driving them"): every race driven in the simulation
// alone, by the car it hands the player and the field of cars its racers will drive, in every condition on the tyres
// for it, from every place on its grid, through the race's own rules, and what happened counted: finished or not and
// where it failed, each lap's time, the metres off the carriageway and off the whole surface, the hits, the resets. It is
// the ruler everything about the racers is read on, so it counts and never eases: a race a car can't finish cleanly is a
// finding. No browser and no network: it reads the road map and the tiles from disk, a run a few seconds on one core,
// spread over the machine's cores through the shared worker pool (`src/shared/lib/bot-lab/pool.ts`).
//
//   npx tsx src/projects/aland-drive/tools/race-vet.ts [--folder=<tiles>] [--only=<id>,<id>] [--cars=own|field]
//     [--conditions=dry,wet,snow,ice] [--slots=pole|all] [--line=racing[,middle,gps]] [--grip=racer[,0.9,0.75,...]] [--workers=N]
//     [--out=<file.json>] [--trace]
//
// The default is the whole list: every race, its field, every condition, every grid place, which is tens of minutes on
// all cores (ask the owner first, as the root CLAUDE.md says of the machine's CPU). --cars=own, --conditions=dry and
// --slots=pole cut it to one run a race, seconds each. --grip is the racer's own skill (`racers/skill.ts`), or shares of
// its measured grip, several a run each: the highest a race is clean at says how hard it is, and a race clean at none
// has a fault in it.
// --line is the line driven, or several, a run each: the racing line (`racers/racing-line.ts`), the laid road's middle,
// or the GPS's own line on the par driver's plan, which is what the challenges were measured with. --trace, with
// --workers=1, prints what each run does every second, for diagnosing one.
//
// A clean finish is a finish with no stop, no reset and no hit, never further past the laid surface than a gate reaches
// (`tools/road-places.ts`): what a track has to give every car of its field in every condition before the racers see it.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inlineRunner, WorkerPool, type GameRunner } from "@/shared/lib/bot-lab/pool";
import { timeText } from "../challenge/format";
import { RACES } from "../challenge/list";
import { fieldOf, tyresFor } from "../racers/field";
import { RACER_SKILL } from "../racers/skill";
import { LINE_KINDS, loadRace, vetRun, type LineKind, type VetResult, type VetSpec } from "../racers/vet";
import { initPhysics } from "../sim/drive";
import { CONDITIONS, type Condition } from "../sim/surfaces";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const CARS_ASKED = option("cars", "field");
const CONDITIONS_ASKED = option("conditions", CONDITIONS.join(","));
const SLOTS = option("slots", "all");
/** The shares of its measured grip the driver plans on, one run each: the racer's own (`racer`), or numbers, to find the highest a race is clean at. */
const GRIPS = option("grip", "racer")
  .split(",")
  .map((token) => {
    if (token === "racer") return { skill: token, ...RACER_SKILL };
    const share = Number(token);
    if (!(share > 0 && share <= 1)) throw new Error(`--grip takes shares of the grip, 0 to 1, or "racer" for the racer's own, not ${token}`);
    return { skill: share.toFixed(2), cornerShare: share, brakeShare: share };
  });
const WORKERS = Number(option("workers", "0"));
const OUT = option("out", "");
/** The lines driven, a run each: the GPS's own line on the par driver's plan, the laid middle, or the racing line. */
const LINES = option("line", "racing").split(",").map((name) => {
  if (!(LINE_KINDS as readonly string[]).includes(name)) throw new Error(`--line takes ${LINE_KINDS.join(", ")}, not ${name}`);
  return name as LineKind;
});
/** Prints what each run does every second, on this thread: for diagnosing one run, so with --workers=1. */
const TRACE = process.argv.includes("--trace");
/** How far past the laid surface a clean run may stray: as far as a gate reaches (`tools/road-places.ts`). */
const CLEAN_PAST_SURFACE_M = 6;

const conditions = CONDITIONS_ASKED.split(",").map((name) => {
  if (!(CONDITIONS as readonly string[]).includes(name)) throw new Error(`--conditions takes ${CONDITIONS.join(", ")}, not ${name}`);
  return name as Condition;
});
if (!(CARS_ASKED === "own" || CARS_ASKED === "field")) throw new Error(`--cars takes own or field, not ${CARS_ASKED}`);
if (!(SLOTS === "pole" || SLOTS === "all")) throw new Error(`--slots takes pole or all, not ${SLOTS}`);

const races = RACES.filter(({ id }) => ONLY === "" || ONLY.split(",").includes(id));
if (races.length === 0) throw new Error(`no race matches --only=${ONLY}`);

/** Every run of one race, in the order they're reported. */
const specsOf = (raceId: string, from: number): VetSpec[] => {
  const race = RACES.find(({ id }) => id === raceId);
  if (!race) throw new Error(`no race ${raceId}`);
  const cars = CARS_ASKED === "own" ? [race.car] : fieldOf(race.car, race.ground);
  const slots = SLOTS === "pole" ? [0] : race.grid.map((_, slot) => slot);
  const specs: VetSpec[] = [];
  for (const car of cars) for (const condition of conditions) for (const slot of slots) for (const line of LINES) for (const { skill, cornerShare, brakeShare } of GRIPS) specs.push({ index: from + specs.length, race: raceId, car, condition, tyres: tyresFor(condition), slot, gripShare: cornerShare, brakeShare, skill, line, folder: FOLDER });
  return specs;
};

const isClean = (run: VetResult) => run.finished && run.hits === 0 && run.resets === 0 && run.worstOffSurfaceM <= CLEAN_PAST_SURFACE_M;

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, width: number, places = 0) => value.toFixed(places).padStart(width);

function printRace(raceId: string, runs: readonly VetResult[]): void {
  const race = RACES.find(({ id }) => id === raceId);
  if (!race) throw new Error(`no race ${raceId}`);
  const clean = runs.filter(isClean).length;
  const gridOff = runs[0]?.gridOffM ?? 0;
  console.log(`\n${race.number} ${race.id}: ${race.shape}, ${race.ground}, ${race.laps} lap${race.laps === 1 ? "" : "s"} of ${(race.lapM / 1000).toFixed(2)} km, ${race.grid.length} on the grid${gridOff > 3 ? ` (standing up to ${gridOff.toFixed(1)} m off the laid road)` : ""}; ${clean} of ${runs.length} runs clean`);
  console.log(`  ${pad("car", 10)} ${pad("cond", 5)} slot ${pad("line", 6)} ${pad("grip", 6)} ${pad("time", 8)} ${pad("laps", 28)} shoulder off-surf worst off-line  hits  air rst  ${pad("outcome", 40)}`);
  for (const run of runs) {
    const laps = run.lapsS.map((lap) => timeText(lap)).join(" ");
    const time = run.raceS === null ? "-" : timeText(run.raceS);
    const outcome = run.finished ? (isClean(run) ? "clean" : "finished") : (run.failed ?? "failed");
    console.log(`  ${pad(run.car, 10)} ${pad(run.condition, 5)} ${num(run.slot + 1, 4)} ${pad(run.line, 6)} ${pad(run.skill, 6)} ${pad(time, 8)} ${pad(laps, 28)} ${num(run.shoulderM, 8)} ${num(run.offSurfaceM, 8)} ${num(run.worstOffSurfaceM, 5, 1)} ${num(run.meanOffLineM, 3, 1)}/${num(run.worstOffLineM, 4, 1)} ${num(run.hits, 5)} ${num(run.airborneSteps, 4)} ${num(run.resets, 3)}  ${outcome}`);
  }
}

const { manifest } = readRoads(FOLDER);
if (manifest.tiles.length === 0) throw new Error(`no tiles in ${FOLDER}`);
await initPhysics();

const all: VetSpec[] = [];
const byRace = new Map<string, VetSpec[]>();
for (const { id } of races) {
  const specs = specsOf(id, all.length);
  byRace.set(id, specs);
  all.push(...specs);
}
const workers = WORKERS > 0 ? WORKERS : undefined;
const runner: GameRunner<VetSpec, VetResult> =
  WORKERS === 1
    ? inlineRunner((spec) => vetRun(spec, loadRace(spec.folder, spec.race), TRACE ? (line) => console.log(`  ${spec.race} ${spec.car} ${spec.condition} ${line}`) : undefined))
    : new WorkerPool<VetSpec, VetResult>(new URL("../racers/vet-worker.ts", import.meta.url), workers === undefined ? undefined : Math.min(workers, all.length));
console.log(`${all.length} runs over ${races.length} race${races.length === 1 ? "" : "s"} (${CARS_ASKED === "own" ? "the race's car" : "its field"}, ${conditions.join("/")}, ${SLOTS === "pole" ? "from the pole" : "every grid place"}, at ${GRIPS.map(({ skill }) => skill).join("/")} of the grip) on ${runner.size} worker${runner.size === 1 ? "" : "s"}`);

const results: VetResult[] = [];
try {
  // Each race's runs are one call, so a race is reported as soon as its runs are in while the rest play on.
  await Promise.all(
    [...byRace].map(async ([id, specs]) => {
      const runs = await runner.run(specs);
      results.push(...runs);
      printRace(id, runs);
    }),
  );
} finally {
  await runner.close();
}

results.sort((a, b) => a.index - b.index);
const unclean = races.filter(({ id }) => results.some((run) => run.race === id && !isClean(run)));
console.log(`\n${results.filter(isClean).length} of ${results.length} runs clean. ${unclean.length === 0 ? "Every race is finished cleanly by every run." : `${unclean.length} race${unclean.length === 1 ? "" : "s"} with a run that isn't: ${unclean.map(({ id }) => id).join(", ")}`}`);
if (GRIPS.length > 1 || LINES.length > 1) {
  // On each line at each share, how many races every run is clean at; and each race's highest clean share on each line.
  const shares = [...GRIPS].sort((a, b) => b.cornerShare - a.cornerShare);
  const cleanAt = (id: string, line: LineKind, skill: string) => results.filter((run) => run.race === id && run.line === line && run.skill === skill).every(isClean);
  console.log(`\n${pad("line", 6)} ${pad("grip", 6)} races every run is clean at`);
  for (const line of LINES) for (const { skill } of shares) console.log(`${pad(line, 6)} ${pad(skill, 6)} ${races.filter(({ id }) => cleanAt(id, line, skill)).length} of ${races.length}`);
  console.log(`\n${pad("race", 28)} ${LINES.map((line) => pad(`${line}: clean at`, 16)).join(" ")}`);
  for (const { id } of races) console.log(`${pad(id, 28)} ${LINES.map((line) => pad(shares.find(({ skill }) => cleanAt(id, line, skill))?.skill ?? "none", 16)).join(" ")}`);
  // The spread between the shares: what each share of the grip is worth on each race, by count; a dash where a run did not finish.
  console.log(`\n${pad("race", 28)} ${pad("line", 6)} ${shares.map(({ skill }) => pad(skill, 8)).join(" ")}`);
  for (const { id } of races) {
    for (const line of LINES) {
      const times = shares.map(({ skill }) => results.find((run) => run.race === id && run.line === line && run.skill === skill && run.slot === 0 && run.condition === conditions[0]));
      console.log(`${pad(id, 28)} ${pad(line, 6)} ${times.map((run) => pad(run?.raceS == null ? "-" : timeText(run.raceS), 8)).join(" ")}`);
    }
  }
}
if (OUT !== "") {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named
  mkdirSync(dirname(OUT), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named
  writeFileSync(OUT, `${JSON.stringify({ folder: FOLDER, grips: GRIPS.map(({ skill }) => skill), lines: LINES, cars: CARS_ASKED, conditions, slots: SLOTS, results }, null, 2)}\n`);
  console.log(`written to ${OUT}`);
}

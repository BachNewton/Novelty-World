// Each bucket list challenge driven solo by the AI, in its own car, in its own conditions (`challenge/conditions.ts`:
// the ground's condition and the tyres for it), in the simulation alone, through the challenge's own rules
// (`challenge/run.ts`): its par is the fastest the AI gets, the best time at the finish or speed at the camera, and its
// target is par by the one rule (`challenge/targets.ts`), written with the par to `challenge/targets.json`. One core, no
// browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-par.ts [--folder=<tiles>] [--only=<id>,<id>]
//
// Two drivers have a go, and the fastest run that crosses every line in order is par. The AI racer
// (`racers/CLAUDE.md`) drives its racing line for the car's width, planning on a share of the car's measured grip in
// the condition, at its own skill and at bolder shares. The old scripted driver (`tools/par-driver.ts`) keeps to the
// GPS line and eases the spots it loses the road at: far slower round bends, but flat out where the racer's plan stops
// pulling at the top of the car's measured pull table, so it sets the Speed traps. A Speed trap's line ends at the
// camera and runs straight on, so neither brakes there for a bend past it. The racer still makes mistakes on some
// roads (`ideas/racer-method.md`'s gaps): a run with a reset or a hit is slower for it, never shorter, and the table
// says which pars have one, since those are the targets that tighten as the racer improves. A challenge no driver
// finishes fails loudly, with what went wrong in each run.

import { readFileSync, writeFileSync } from "node:fs";
import { challengeLine, cutAt, runOn } from "../challenge/line";
import { challengeFrom, placesPrint, type PlacesEntry, type TargetsEntry } from "../challenge/measured";
import { conditionOf, groundText, tyresOf } from "../challenge/conditions";
import { advanceRun, startRun, type ChallengeRun } from "../challenge/run";
import { CHALLENGE_SPECS } from "../challenge/specs";
import { targetFromPar } from "../challenge/targets";
import type { BucketChallenge, RaceChallenge } from "../challenge/types";
import { RACER_SKILL, type DriverSkill } from "../racers/skill";
import { LaidRoad } from "../racers/laid-road";
import { corridorOf, geometryOf, middleLine } from "../racers/racing-line";
import { ROUTE_STEP_M, RoutePlan, tilesNear } from "../racers/route-plan";
import { alongOfPlace, racerFor, racingLineFor, type LoadedRace } from "../racers/vet";
import { tuningPrint } from "../sim/car-limits";
import { headingOf, speedOf } from "../sim/car-state";
import { CARS } from "../sim/cars";
import { Drive, initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { STEP_S } from "../sim/tuning";
import { drivePar, type ParGround } from "./par-driver";
import { option, readRoads, round } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = new Set(option("only", "").split(",").filter((id) => id !== ""));
const OUT = "src/projects/aland-drive/challenge/targets.json";
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/places.json", "utf8")) as Record<string, PlacesEntry>;

/** The racer's own skill, then bolder. */
const SKILLS: readonly DriverSkill[] = [RACER_SKILL, ...[0.9, 0.95, 1].map((share) => ({ cornerShare: share, brakeShare: Math.max(share, RACER_SKILL.brakeShare) }))];
/** A loss of speed in one step no brake makes (about 12 g): the car hit something. */
const HIT_DROP_MS = 1;
const SLOWEST_MS = 8;
const LONGEST_MARGIN_S = 120;
/** Past the finish or the camera, so the racer doesn't turn for the line's last point as it gets there. */
const RUN_ON_M = 150;

/** A challenge as the racer knows how to drive one: a sprint of one lap whose lines are its gates, or its camera. */
function asRace(challenge: BucketChallenge): RaceChallenge {
  return {
    ...challenge,
    kind: "race",
    number: "",
    shape: "sprint",
    ground: "road",
    laps: 1,
    gates: challenge.kind === "route" ? challenge.gates : [challenge.camera],
    grid: [...challenge.starts],
    lapM: challenge.lengthM,
    lineM: 0,
  };
}

/** A challenge's world and lines for the racer, as the vetting tool loads a race's: a Speed trap's cut at its camera. */
function loadChallenge(challenge: BucketChallenge): LoadedRace {
  const route = challengeLine(roads.graph, challenge.waypoints);
  const ends = challenge.kind === "route" ? route : cutAt(route, route.nearest(challenge.camera.x, challenge.camera.z).along);
  const gpsLine = runOn(ends, RUN_ON_M);
  const world = readWorld(FOLDER, tilesNear(roads.manifest, gpsLine));
  const laid = new LaidRoad(world);
  const plan = new RoutePlan(gpsLine, laid);
  const corridor = corridorOf(plan);
  const pavedAt = (alongM: number) => corridor[Math.max(0, Math.min(corridor.length - 1, Math.round(alongM / ROUTE_STEP_M)))].paved;
  const middle = { line: middleLine(corridor), pavedAt, geometry: geometryOf(corridor, new Float64Array(corridor.length)) };
  return { race: asRace(challenge), world, laid, gpsLine, plan, corridor, middle, racing: new Map() };
}

interface Run {
  driver: string;
  result: number | null;
  resets: number;
  hits: number;
  worstOffSurfaceM: number;
  failed?: string;
}

const finished = (run: Run): run is Run & { result: number } => run.result !== null;

function drive(challenge: BucketChallenge, loaded: LoadedRace, skill: DriverSkill): Run {
  const { world, laid } = loaded;
  const condition = conditionOf(challenge.conditions);
  const tyres = tyresOf(challenge.conditions);
  const [place] = challenge.starts;
  const road = world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${challenge.id}: no road at the start`);
  const car = new Drive(world, { ...road, x: place.x, z: place.z, heading: place.heading }, challenge.car);
  car.condition = condition;
  car.tyres = tyres;
  const line = racingLineFor(loaded, challenge.car);
  const from = alongOfPlace(line.line, place.x, place.z);
  const racer = racerFor(loaded, line, challenge.car, condition, tyres, skill, from, (point) => {
    const under = world.roads.nearest(point.x, point.z);
    if (!under) throw new Error(`${challenge.id}: no road to reset to at ${point.x}, ${point.z}`);
    car.placeAt({ ...under, x: point.x, z: point.z, heading: point.heading });
  });
  let run: ChallengeRun = startRun(challenge, 1);
  let placements = car.placements;
  let lastSpeed = 0;
  let hits = 0;
  let worstOffSurfaceM = 0;
  const outcome = (result: number | null, failed?: string): Run => ({ driver: `racer ${skillText(skill)}`, result, resets: racer.record.resets, hits, worstOffSurfaceM, failed });
  try {
    for (let step = 0; step < (challenge.lengthM / SLOWEST_MS + LONGEST_MARGIN_S) / STEP_S; step++) {
      const state = car.stateAt(1);
      const placed = car.placements !== placements;
      placements = car.placements;
      const resetsBefore = racer.record.resets;
      const input = racer.step(state, placed);
      run = advanceRun(run, STEP_S, [{ x: state.position[0], z: state.position[2], speedMS: speedOf(state), placed }]).run;
      if (run.outcome) return outcome(run.outcome.results[0]);
      car.step(input);
      if (run.clockS < 0) continue;
      const after = speedOf(car.stateAt(1));
      if (racer.record.resets === resetsBefore && lastSpeed - after > HIT_DROP_MS) hits++;
      lastSpeed = after;
      const [x, , z] = state.position;
      const under = laid.nearest(x, z, headingOf(state.rotation));
      if (under) {
        const offset = (x - under.x) * Math.cos(under.heading) - (z - under.z) * Math.sin(under.heading);
        worstOffSurfaceM = Math.max(worstOffSurfaceM, offset > 0 ? offset - under.outerRightM : -offset - under.outerLeftM);
      }
    }
    return outcome(null, "never got there");
  } finally {
    car.dispose();
  }
}

/** The old scripted driver's run on the GPS line, cut at a Speed trap's camera, in the challenge's conditions. */
function scripted(challenge: BucketChallenge): Run {
  const route = challengeLine(roads.graph, challenge.waypoints);
  const line = challenge.kind === "route" ? route : cutAt(route, route.nearest(challenge.camera.x, challenge.camera.z).along);
  const world = readWorld(FOLDER, tilesNear(roads.manifest, runOn(line, RUN_ON_M)));
  const ground: ParGround = { condition: conditionOf(challenge.conditions), tyres: tyresOf(challenge.conditions) };
  const run = { driver: "scripted", resets: 0, hits: 0, worstOffSurfaceM: 0 };
  try {
    return { ...run, result: drivePar(challenge, line, 0, world, false, undefined, undefined, ground).measured.par };
  } catch (error) {
    // It eased every spot it lost the road at and still never got there, which it throws: no par from this driver.
    return { ...run, result: null, failed: (error as Error).message };
  }
}

const skillText = ({ cornerShare, brakeShare }: DriverSkill) => `${cornerShare.toFixed(2)}/${brakeShare.toFixed(2)}`;
const runText = (run: Run, unit: string) =>
  `${run.driver}: ${run.result === null ? run.failed : `${run.result.toFixed(1)} ${unit}`}${run.resets ? `, ${run.resets} resets` : ""}${run.hits ? `, ${run.hits} hits` : ""}, ${run.worstOffSurfaceM.toFixed(1)} m off`;

const roads = readRoads(FOLDER);
await initPhysics();
const targets = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, TargetsEntry>;
const rows: string[][] = [];
const failures: string[] = [];
for (const spec of CHALLENGE_SPECS) {
  if (ONLY.size > 0 && !ONLY.has(spec.id)) continue;
  const places = PLACES[spec.id] as PlacesEntry | undefined;
  if (!places) throw new Error(`${spec.id} has no places: run tools/challenge-places.ts first`);
  const challenge = challengeFrom(spec, places, { par: 0, target: 0 });
  // Unbeatable while measuring: a Route is only lost against its target, which par is what sets.
  const unbounded: BucketChallenge = challenge.kind === "route" ? { ...challenge, targetS: Infinity } : { ...challenge, targetKmh: 0 };
  const loaded = loadChallenge(unbounded);
  const unit = spec.kind === "route" ? "s" : "km/h";
  const runs = [...SKILLS.map((skill) => drive(unbounded, loaded, skill)), scripted(unbounded)];
  console.log(`${spec.id}, ${conditionOf(spec.conditions)} on ${tyresOf(spec.conditions)} tyres: ${runs.map((run) => runText(run, unit)).join("; ")}`);
  const best = runs.filter(finished).sort((a, b) => (spec.kind === "route" ? a.result - b.result : b.result - a.result))[0] as (Run & { result: number }) | undefined;
  if (!best) {
    failures.push(spec.id);
    continue;
  }
  const par = best.result;
  const target = targetFromPar(spec.kind, par);
  targets[spec.id] = { tuning: tuningPrint(CARS[spec.car]), places: placesPrint(places), ground: groundText(spec.conditions), par: round(par, 2), target };
  const mistakes = [best.resets && `${best.resets} resets`, best.hits && `${best.hits} hits`].filter(Boolean).join(", ") || "clean";
  rows.push([spec.id, spec.car, `${(places.lengthM / 1000).toFixed(2)} km`, `${conditionOf(spec.conditions)}`, best.driver, `${par.toFixed(1)} ${unit}`, `${target} ${unit}`, mistakes]);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(CHALLENGE_SPECS.flatMap(({ id }) => (id in targets ? [[id, targets[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
const head = ["challenge", "car", "length", "ground", "driver", "par", "target", "par's run"];
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
if (failures.length > 0) throw new Error(`no driver finished ${failures.join(", ")}`);

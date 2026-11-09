import type { Indexed } from "@/shared/lib/bot-lab/pool";
import { raceRoute, runOn } from "../challenge/line";
import { RACES } from "../challenge/list";
import { advanceRun, startRun, type ChallengeRun } from "../challenge/run";
import type { RaceChallenge } from "../challenge/types";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, steerLimit, type DriveInput } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { CARS, type CarId } from "../sim/cars";
import { Drive } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import type { RoadLine } from "../sim/road-net";
import type { Condition, Tyre } from "../sim/surfaces";
import { STEP_S, wheelBaseOf } from "../sim/tuning";
import type { World } from "../sim/world";
import { readRoads, type Roads } from "../tools/road-places";
import { LaidRoad } from "./laid-road";
import { Racer } from "./racer";
import { corridorOf, crestOf, curvatureOf, middleLine, racingLine, type CorridorSample } from "./racing-line";
import { alongsOf, ROUTE_STEP_M, RoutePlan, speedPlanFor, tilesNear } from "./route-plan";
import { planSpeeds } from "./speed-plan";

/*
 * One vetting run (`ideas/races.md`, "Vetting tracks by driving them"): one car
 * driven alone round a whole race in the simulation, from a place on its grid,
 * in a condition on the tyres for it, through the race's own rules, and what
 * happened counted: finished or not and where it failed, each lap's time, the
 * metres driven off the carriageway and off the whole surface, how far off its
 * line it ran, the hits, the resets. A run is a pure function of its spec, so
 * the same spec counts the same on any thread. The driver eases nothing: a spot
 * it can't make is what the count is for. It drives one of three lines: the
 * GPS's own line on the par driver's plan (what the challenges were measured
 * with), or the laid road's middle or the racing line (`racing-line.ts`), both
 * driven by the racer itself (`racer.ts`), recovery and all, on the speed plan
 * from the car's limits along them (`speed-plan.ts`), so what is counted here
 * is what races the player.
 */

export const LINE_KINDS = ["gps", "middle", "racing"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface VetSpec extends Indexed {
  race: string;
  car: CarId;
  condition: Condition;
  tyres: Tyre;
  /** The place on the grid it starts from, pole first. */
  slot: number;
  /** The shares of the car's measured cornering grip and braking the driver plans on, and the name they go by. */
  gripShare: number;
  brakeShare: number;
  skill: string;
  line: LineKind;
  /** The tile folder the run reads. */
  folder: string;
}

export interface VetResult extends Indexed {
  race: string;
  car: CarId;
  condition: Condition;
  tyres: Tyre;
  slot: number;
  gripShare: number;
  brakeShare: number;
  skill: string;
  line: LineKind;
  finished: boolean;
  /** Why and where it didn't finish. */
  failed?: string;
  failedAlongM?: number;
  /** Seconds from the green light to the finish, and each lap's. */
  raceS: number | null;
  lapsS: number[];
  /** Metres driven with the car's middle past the carriageway's edge, and past the whole surface's. */
  shoulderM: number;
  offSurfaceM: number;
  /** The furthest the car's middle stood past the surface's edge. */
  worstOffSurfaceM: number;
  /** How far the furthest place on the grid stands from the laid road's middle. */
  gridOffM: number;
  /** How far the car's middle strayed from the line it drove, at worst and on average over the metres driven. */
  worstOffLineM: number;
  meanOffLineM: number;
  /** Sudden losses of speed no brake makes: a wall, a pole, a parked car. */
  hits: number;
  airborneSteps: number;
  contactLosses: number;
  /** The racer's own resets. */
  resets: number;
  topKmh: number;
  drivenM: number;
  /** Simulated seconds the run took, countdown included. */
  simS: number;
}

const FLAT_OUT_MS = 150;
/** Past the finish, so the driver doesn't turn for the line's last point as it gets there. */
const RUN_ON_M = 150;
/** Off its line by this much, the par driver has lost the road; the racer resets itself before then. */
const LOST_M = 30;
/** Going back this far along its way is losing the road there. */
const BACK_M = 20;
/** A line counts as missed once the driver is this far past it along its way. */
const MISSED_M = 40;
/** Stopped is getting no further along its way than this in that long: longer than the racer takes to back out and reset. */
const STUCK_M = 5;
const GIVE_UP_STOPPED_S = 20;
/** A run with this many resets isn't a race any more. */
const MOST_RESETS = 5;
/** The longest a run may take: the race at a crawl, and a margin. */
const SLOWEST_MS = 8;
const LONGEST_MARGIN_S = 120;
/** A loss of speed in one step no brake makes (about 12 g): the car hit something. */
const HIT_DROP_MS = 1;
/** One hit is counted once, however many steps the crunch takes. */
const HIT_APART_S = 1;
/** A car this far from any laid road has left the road for the count, where the road's own width isn't known. */
const OFF_UNKNOWN_M = 6;
/** The tightest turn a plan asks of the steering is this much wider than the lock's own, for the tyres' slip. */
const STEERING_ROOM = 1.3;

/** A race's world, route and lines, read once for every run on it. */
export interface LoadedRace {
  race: RaceChallenge;
  world: World;
  laid: LaidRoad;
  /** The GPS's own line for the whole race, run on past the finish. */
  gpsLine: RoadLine;
  plan: RoutePlan;
  corridor: CorridorSample[];
  middle: RoadLine;
  /** The racing line for each car's half width, drawn as asked for. */
  racing: Map<number, RoadLine>;
}

export function raceById(id: string): RaceChallenge {
  const race = RACES.find((each) => each.id === id);
  if (!race) throw new Error(`no race ${id}`);
  return race;
}

export function loadRace(folder: string, id: string, roads: Roads = readRoads(folder)): LoadedRace {
  return loadRaceOf(folder, raceById(id), roads);
}

/** A race as given, rather than the list's: for a tool measuring one before its laps are set. */
export function loadRaceOf(folder: string, race: RaceChallenge, roads: Roads = readRoads(folder)): LoadedRace {
  const route = raceRoute(roads.graph, race);
  const gpsLine = runOn(route.line, RUN_ON_M);
  const world = readWorld(folder, tilesNear(roads.manifest, gpsLine));
  const laid = new LaidRoad(world);
  const plan = new RoutePlan(gpsLine, laid);
  const corridor = corridorOf(plan);
  return { race, world, laid, gpsLine, plan, corridor, middle: middleLine(corridor), racing: new Map() };
}

/** The line a run drives, by kind, for its car. */
export function lineFor(loaded: LoadedRace, kind: LineKind, car: CarId): RoadLine {
  if (kind === "gps") return loaded.gpsLine;
  if (kind === "middle") return loaded.middle;
  const halfWidth = CARS[car].car.halfSize[0];
  let line = loaded.racing.get(halfWidth);
  if (!line) {
    line = racingLine(loaded.corridor, halfWidth).line;
    loaded.racing.set(halfWidth, line);
  }
  return line;
}

/** Whether the road under a place along a corridor's line is sealed: the corridor's own sample, at the line's even step. */
const pavedAlong = (corridor: readonly CorridorSample[], alongM: number) => corridor[Math.max(0, Math.min(corridor.length - 1, Math.round(alongM / ROUTE_STEP_M)))].paved;

/** How far each place on the grid stands from the laid road's middle: a grid measured on the GPS's line stands off the road where that line strays. */
export function gridOffRoadM(loaded: LoadedRace): number[] {
  return loaded.race.grid.map(({ x, z, heading }) => loaded.laid.nearest(x, z, heading, 40)?.distance ?? Infinity);
}

/** Where along a line a place on the grid stands. */
function alongOfPlace(line: RoadLine, x: number, z: number): number {
  let best = { distance: Infinity, along: 0 };
  for (let along = 0; along <= Math.min(line.length, 1000); along += 1) {
    const point = line.at(along);
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < best.distance) best = { distance, along };
  }
  return best.along;
}

/** What drives a run: the par driver on its own rules, or the racer on its. Each keeps the race's run for the car. */
interface Pilot {
  readonly along: number;
  readonly run: ChallengeRun;
  readonly resets: number;
  /** The input for the coming step, from where the car is; `placed` says the car was put somewhere since the last step. */
  step(car: CarState, placed: boolean): DriveInput;
}

function pilotFor(spec: VetSpec, loaded: LoadedRace, line: RoadLine, from: number, drive: Drive): Pilot {
  const { race, world } = loaded;
  if (spec.line === "gps") {
    const autopilot = new Autopilot(line, FLAT_OUT_MS, from, 0, undefined, speedPlanFor(spec.car, spec.condition, spec.tyres, loaded.plan, spec.gripShare));
    let run = startRun(race, 1);
    return {
      get along() {
        return autopilot.along;
      },
      get run() {
        return run;
      },
      resets: 0,
      step(car, placed) {
        run = advanceRun(run, STEP_S, [{ x: car.position[0], z: car.position[2], speedMS: speedOf(car), placed }]).run;
        if (run.clockS < 0) return { ...NO_INPUT, handbrake: true };
        return autopilot.input(car);
      },
    };
  }
  const limits = { asphalt: limitsOn(spec.car, spec.condition, "asphalt", spec.tyres), gravel: limitsOn(spec.car, spec.condition, "gravel", spec.tyres) };
  const tuning = CARS[spec.car];
  // The racing line and the middle run the corridor's length, sample for sample, near enough to read its surface by distance.
  const plan = planSpeeds({
    curvature: curvatureOf(line, ROUTE_STEP_M),
    crest: crestOf(line, ROUTE_STEP_M),
    stepM: ROUTE_STEP_M,
    limitsAt: (sample) => (pavedAlong(loaded.corridor, sample * ROUTE_STEP_M) ? limits.asphalt : limits.gravel),
    cornerShare: spec.gripShare,
    brakeShare: spec.brakeShare,
    tightestRadiusAt: (speed) => (STEERING_ROOM * wheelBaseOf(tuning)) / Math.tan(steerLimit(tuning, speed, false)),
    fromM: from,
  });
  const racer = new Racer(race, line, plan, from, {
    reset: (point) => {
      const road = world.roads.nearest(point.x, point.z);
      if (!road) throw new Error(`${race.id}: no road to reset to at ${point.x}, ${point.z}`);
      drive.placeAt({ ...road, x: point.x, z: point.z, heading: point.heading });
    },
    // Water a car sinks in, as the simulation reads it: a road along the shore or over it isn't.
    inWater: (x, z) => world.isWater(x, z) && !world.bearsCar(x, z) && (world.roads.nearest(x, z)?.distance ?? Infinity) > 6,
  });
  return {
    get along() {
      return racer.record.along;
    },
    get run() {
      return racer.run;
    },
    get resets() {
      return racer.record.resets;
    },
    step: (car, placed) => racer.step(car, placed),
  };
}

/** What a run says of itself each second, for diagnosing one: `vetRun` says nothing without it. */
export type VetTrace = (line: string) => void;

export function vetRun(spec: VetSpec, loaded: LoadedRace, trace?: VetTrace): VetResult {
  const { race, world, laid } = loaded;
  if (spec.slot >= race.grid.length) throw new Error(`${race.id} has no grid place ${spec.slot}`);
  const place = race.grid[spec.slot];
  const road = world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${race.id}: no road at grid place ${spec.slot}`);
  const drive = new Drive(world, { ...road, x: place.x, z: place.z, heading: place.heading }, spec.car);
  drive.condition = spec.condition;
  drive.tyres = spec.tyres;
  const line = lineFor(loaded, spec.line, spec.car);
  const from = alongOfPlace(line, place.x, place.z);
  const pilot = pilotFor(spec, loaded, line, from, drive);
  const lineAlongs = alongsOf(race, line, from);
  const base = { index: spec.index, race: race.id, car: spec.car, condition: spec.condition, tyres: spec.tyres, slot: spec.slot, gripShare: spec.gripShare, brakeShare: spec.brakeShare, skill: spec.skill, line: spec.line, gridOffM: Math.max(...gridOffRoadM(loaded)) };
  const counts = { shoulderM: 0, offSurfaceM: 0, worstOffSurfaceM: 0, worstOffLineM: 0, meanOffLineM: 0, hits: 0 };
  let offLineSum = 0;
  let offLineSteps = 0;
  const lapsS: number[] = [];
  let furthest = from;
  let stuck = { along: from, s: 0 };
  let lastSpeed = 0;
  let lastHitS = -Infinity;
  let nextTraceS = 0;
  let placements = drive.placements;
  let crossed = 0;
  const longestS = race.lengthM / SLOWEST_MS + LONGEST_MARGIN_S;
  const result = (finished: boolean, raceS: number | null, failed?: string, failedAlongM?: number): VetResult => {
    const { log } = drive;
    counts.meanOffLineM = offLineSteps === 0 ? 0 : offLineSum / offLineSteps;
    return { ...base, finished, failed, failedAlongM, raceS, lapsS, ...counts, resets: pilot.resets, airborneSteps: log.airborneSteps, contactLosses: log.contactLosses, topKmh: log.topSpeedMS * 3.6, drivenM: log.metres, simS: pilot.run.clockS + 3 };
  };
  try {
    for (let step = 0; step < longestS / STEP_S; step++) {
      const state = drive.stateAt(1);
      const speed = speedOf(state);
      const sample = { x: state.position[0], z: state.position[2] };
      // A car put somewhere since the last step, by the racer's own reset, crosses no line on its way.
      const placed = drive.placements !== placements;
      placements = drive.placements;
      const input = pilot.step(state, placed);
      const { run } = pilot;
      // Each lap's time, from the lines crossed since the last step; the finish's lap comes with the result.
      const nowCrossed = run.players[0].nextGate;
      for (; crossed < nowCrossed; crossed++) if ((crossed + 1) % race.gates.length === 0 && crossed + 1 < race.gates.length * race.laps) lapsS.push(run.clockS - lapsS.reduce((sum, lap) => sum + lap, 0));
      if (run.outcome) {
        const [raceS] = run.outcome.results;
        if (raceS === null) throw new Error(`${race.id}: over with no result`);
        lapsS.push(raceS - lapsS.reduce((sum, lap) => sum + lap, 0));
        return result(true, raceS);
      }
      drive.step(input);
      if (run.clockS < 0) continue;
      const after = speedOf(drive.stateAt(1));
      if (lastSpeed - after > HIT_DROP_MS && run.clockS - lastHitS > HIT_APART_S) {
        counts.hits++;
        lastHitS = run.clockS;
      }
      lastSpeed = after;
      const metres = speed * STEP_S;
      const under = laid.nearest(sample.x, sample.z, headingOf(state.rotation));
      const offset = under ? (sample.x - under.x) * Math.cos(under.heading) - (sample.z - under.z) * Math.sin(under.heading) : null;
      if (under && offset !== null) {
        const pastEdge = offset > 0 ? offset - under.rightM : -offset - under.leftM;
        const pastSurface = offset > 0 ? offset - under.outerRightM : -offset - under.outerLeftM;
        if (pastEdge > 0) counts.shoulderM += metres;
        if (pastSurface > 0) {
          counts.offSurfaceM += metres;
          counts.worstOffSurfaceM = Math.max(counts.worstOffSurfaceM, pastSurface);
        }
      } else if ((world.roads.nearest(sample.x, sample.z)?.distance ?? Infinity) > OFF_UNKNOWN_M) counts.offSurfaceM += metres;
      const onLine = line.at(pilot.along);
      const offLine = Math.hypot(onLine.x - sample.x, onLine.z - sample.z);
      if (speed > 1) {
        counts.worstOffLineM = Math.max(counts.worstOffLineM, offLine);
        offLineSum += offLine;
        offLineSteps++;
      }
      if (trace && run.clockS >= nextTraceS) {
        trace(`${run.clockS.toFixed(0).padStart(4)} s ${pilot.along.toFixed(0).padStart(6)} m along ${(speed * 3.6).toFixed(0).padStart(4)} km/h at ${sample.x.toFixed(0)}, ${sample.z.toFixed(0)}; ${offLine.toFixed(1)} m off the line, ${offset === null ? "no laid road" : `${offset.toFixed(1)} m right of the laid middle`}; throttle ${input.throttle.toFixed(2)} brake ${input.brake.toFixed(2)} steer ${input.steer.toFixed(2)}; hits ${counts.hits}, resets ${pilot.resets}`);
        nextTraceS = run.clockS + 1;
      }
      const { nextGate } = run.players[0];
      const where = `${sample.x.toFixed(0)}, ${sample.z.toFixed(0)}, ${pilot.along.toFixed(0)} m along, before line ${nextGate + 1}`;
      if (pilot.along > lineAlongs[nextGate] + MISSED_M) return result(false, null, `missed line ${nextGate + 1} at ${where}`, lineAlongs[nextGate]);
      if (offLine > LOST_M) return result(false, null, `lost the road at ${where}`, pilot.along);
      if (pilot.resets > MOST_RESETS) return result(false, null, `reset ${pilot.resets} times by ${where}`, pilot.along);
      furthest = Math.max(furthest, pilot.along);
      if (furthest - pilot.along > BACK_M) return result(false, null, `went back along its way from ${furthest.toFixed(0)} m at ${where}`, furthest);
      stuck = furthest >= stuck.along + STUCK_M ? { along: furthest, s: 0 } : { along: stuck.along, s: stuck.s + STEP_S };
      if (stuck.s > GIVE_UP_STOPPED_S) return result(false, null, `stopped at ${where}`, pilot.along);
    }
    return result(false, null, `not over after ${longestS.toFixed(0)} s`, pilot.along);
  } finally {
    drive.dispose();
  }
}

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { Indexed } from "@/shared/lib/bot-lab/pool";
import { placeOf, type Standing } from "../challenge/standings";
import { PARKED_CARS } from "../render/parked-places";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { CARS, type CarId } from "../sim/cars";
import { Drive, type SimulatedCar } from "../sim/drive";
import type { Condition, Tyre } from "../sim/surfaces";
import { STEP_S } from "../sim/tuning";
import { Bubble } from "../traffic/bubble";
import { TrafficContact } from "../traffic/contact";
import { LaneTraffic, type DrivenCar } from "../traffic/lane-driver";
import { decodeLanes, type LanesFile } from "../traffic/lane-map";
import { LaneNet } from "../traffic/lane-net";
import type { SeenCar } from "./awareness";
import { seenCarOf } from "./grid";
import type { Racer } from "./racer";
import { alongOfPlace, lampReader, racerFor, racingLineFor, type LampCounts, type LoadedRace } from "./vet";

/**
 * The careless human: it sees no one, so it brakes for no car and leaves none room, and it drives nearer its car's limit
 * than a racer does, braking as late as the car can. From the back of the grid, where a player starts, it catches the
 * racers and goes through them. What is read is what the racers do about being hit.
 */
const HUMAN_SKILL = { cornerShare: 0.95, brakeShare: 1 };

/** Traffic steps every this many of the simulation's steps, and its bubble is seen to every this many of its own, as the game's. */
const TRAFFIC_EVERY = 4;
const BUBBLE_EVERY = 4;
/** How far off the game draws each kind of traffic, which is how far round a player it keeps them. */
const TRAFFIC_REACH_M = { car: 900, bike: 400, walker: 200 } as const;
/**
 * What a player racing in the pack sees of the traffic, which is what the game's bubble may not change: within its
 * kind's reach, in the view ahead of their car from the camera a little behind it, half the owner's screen's width
 * either way. The game's own sight has the ground hide things as well.
 */
const EYE_BACK_M = 8;
const VIEW_HALF_COS = Math.cos((54 * Math.PI) / 180);
/** The parked car stands this far past the pole's place: far enough for the pack to be at speed, and met again each lap of a circuit. */
const PARKED_PAST_GRID_M = 600;
/** While a grid stands at the lights its stretch of road is closed: traffic this near a car on it is taken away, as the game takes it away when a grid forms. */
const GRID_CLEAR_M = 120;
/** The trace names the traffic within this of a racer. */
const TRACE_TRAFFIC_M = 60;
/** Two cars whose outlines come within this of each other are touching. */
const TOUCH_M = 0.1;

/** Whether two cars' outlines meet, as rectangles on the ground: neither's length nor width keeps them apart. */
function touching(one: CarState, other: CarState): boolean {
  const apart = (from: CarState, to: CarState) => {
    const heading = headingOf(from.rotation);
    const turned = headingOf(to.rotation) - heading;
    const [wide, , long] = CARS[from.car].car.halfSize;
    const [toWide, , toLong] = CARS[to.car].car.halfSize;
    const [dx, dz] = [to.position[0] - from.position[0], to.position[2] - from.position[2]];
    const ahead = Math.abs(-dx * Math.sin(heading) - dz * Math.cos(heading));
    const beside = Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading));
    // The other's outline as far as it reaches along this car's length and across its width.
    return ahead > long + Math.abs(Math.cos(turned)) * toLong + Math.abs(Math.sin(turned)) * toWide + TOUCH_M || beside > wide + Math.abs(Math.sin(turned)) * toLong + Math.abs(Math.cos(turned)) * toWide + TOUCH_M;
  };
  return !apart(one, other) && !apart(other, one);
}

/** A racer whose body comes this near a cyclist's or a walker's middle, past its own half sizes, has driven through them. */
const THROUGH_M = 0.3;

/** The traffic on a race's roads: the lanes of its tiles, what drives on them, the bubble that brings it and takes it away, and its contact with the simulated cars. */
interface RaceTraffic {
  lanes: LaneTraffic;
  bubble: Bubble;
  contact: TrafficContact;
  knockedOut: number;
  steps: number;
  bubbleSteps: number;
}

function trafficOn(loaded: LoadedRace, folder: string, drive: Drive, density: number): RaceTraffic {
  const net = new LaneNet();
  for (const tile of loaded.tiles) {
    const file = `${folder}/${tile}/lanes.json.gz`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile's own file in the folder the run was given
    if (!existsSync(file)) continue;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- as above
    net.add(tile, decodeLanes(JSON.parse(gunzipSync(readFileSync(file)).toString()) as LanesFile));
  }
  const halves = PARKED_CARS.map(({ half }) => half);
  const lanes = new LaneTraffic(net, halves);
  const bubble = new Bubble(net, lanes, { car: { reachM: TRAFFIC_REACH_M.car, density }, bike: { reachM: TRAFFIC_REACH_M.bike, density }, walker: { reachM: TRAFFIC_REACH_M.walker, density } });
  const traffic: RaceTraffic = { lanes, bubble, contact: new TrafficContact(drive, lanes, halves, TRAFFIC_EVERY), knockedOut: 0, steps: 0, bubbleSteps: 0 };
  traffic.contact.onHit = () => traffic.knockedOut++;
  return traffic;
}

/*
 * A whole grid vetted at once (`ideas/races.md`, "Racecraft... a grid of six
 * finishes every race with passes made and no pile-up the vetting tool can
 * find"): every place on the grid filled with a racer in a car of the field,
 * all in one simulation, each seeing the others, through the race's own rules
 * for each, and counted as a race: who finished and where, each one's hits and
 * resets, the passes made among them, and the pile-ups, a knot of racers
 * stopped together. Deterministic, so a change to racecraft reads as an exact
 * difference.
 */

export interface GridSpec extends Indexed {
  race: string;
  /** The cars on the grid, pole first, as many as the grid has places for. */
  slots: CarId[];
  condition: Condition;
  tyres: Tyre;
  gripShare: number;
  brakeShare: number;
  skill: string;
  folder: string;
  /** Whether the last place on the grid is a careless human's: a car that races as if alone on the road, as a player in a hurry does. */
  human?: boolean;
  /** The traffic on the race's roads, as a share of Åland's own: cars, cyclists and walkers on the lanes, as the game has them round a player. None without it. */
  traffic?: number;
  /** Whether a car stands in the road a way past the grid, square on the racing line, as a player who has stopped leaves theirs. */
  parked?: boolean;
}

export interface GridRacerResult {
  slot: number;
  car: CarId;
  /** Whether this is the careless human, which the racers' counts leave out. */
  human: boolean;
  finished: boolean;
  raceS: number | null;
  /** Its place at the end, by finish time, then by how far round it got. */
  place: number;
  hits: number;
  resets: number;
  offSurfaceM: number;
  /** The cyclists and walkers it drove through: they have no body to hit, so no hit counts them. */
  through: number;
  /** Its brake lamps as the car behind saw them, over the metres it drove. */
  lamps: LampCounts;
  drivenM: number;
  /** Each hit and each reset, with what it was and what was going on, for reading a pack's mistakes by kind. */
  events: GridEvent[];
}

/** What a racer met in a hit: another racer (ahead of it, behind it or beside it), a car of the traffic, or something standing. */
export type HitKind = "ran into a car" | "hit from behind" | "side by side" | "a traffic car" | "something standing";

/**
 * A hit, a touch or a reset in a grid race. A hit is a loss of speed no brake makes, which a car run into from behind
 * doesn't have: a touch is two cars' outlines meeting, counted once as they come together, whoever came off worse. A
 * reset says its cause and what came before it within a few seconds: contact with a car, a hit on something standing,
 * or neither. A hit and a reset say whether the racer was passing or being passed at the time.
 */
export type GridEvent =
  | { kind: "touch"; clockS: number; alongM: number; kmh: number; human: boolean }
  | { kind: "hit"; clockS: number; alongM: number; what: HitKind; kmh: number; passing: boolean; human: boolean }
  | { kind: "reset"; clockS: number; alongM: number; cause: string; after: "a car" | "something standing" | "nothing"; passing: boolean; kmh: number };

export interface GridResult extends Indexed {
  race: string;
  condition: Condition;
  skill: string;
  racers: GridRacerResult[];
  /** Times one racer moved ahead of another over the race, read every second. */
  passes: number;
  /** Knots of three or more racers stopped together for a few seconds. */
  pileUps: number;
  /** Seconds until the last finisher, or the cap. */
  simS: number;
  /** The traffic the race met: the vehicles that came on to its roads, and the cars a hit knocked out of their lanes. */
  traffic: { met: number; knockedOut: number };
  /** Where along the pole car's line the parked car stands, if there is one. */
  parkedAlongM: number | null;
  failed?: string;
}

/** The longest a grid may take: the race at a crawl, and a margin. */
const SLOWEST_MS = 8;
const LONGEST_MARGIN_S = 120;
/** A loss of speed in one step no brake makes: a hit. */
const HIT_DROP_MS = 1;
const HIT_APART_S = 1;
/** A pile-up is this many racers within this of each other, under this speed, for this long. */
const PILE_UP_CARS = 3;
const PILE_UP_WITHIN_M = 12;
const PILE_UP_SLOW_MS = 3;
const PILE_UP_AFTER_S = 3;
/** Places are read this often for the passes. */
const PLACES_EVERY_S = 1;
/** A hit this near another car's middle was that car; and a reset this soon after a hit came of it. */
const CAR_HIT_WITHIN_M = 6.5;
const AFTER_HIT_S = 6;
/** How often the trace speaks, in seconds: finer when diagnosing a moment. */
const TRACE_EVERY_S = Number(process.env.RACE_VET_TRACE_EVERY_S ?? "1");

interface Entry {
  slot: number;
  car: SimulatedCar;
  racer: Racer;
  id: string;
  human: boolean;
  hits: number;
  lastSpeed: number;
  lastHitS: number;
  placed: boolean;
  /** Put down this step, so its loss of speed is no hit. */
  justPlaced: boolean;
  events: GridEvent[];
  lastCarHitS: number;
  lastStandingHitS: number;
  /** The cyclists and walkers it has driven through, by id, each counted once. */
  through: Set<string>;
  /** Whether it was passing a car at its last step, and how fast it went then: a reset clears both. */
  wasPassing: boolean;
  resetsSeen: number;
  offSurfaceM: number;
  lamps: ReturnType<typeof lampReader>;
  drivenM: number;
  input: DriveInput;
  /** For the trace: where the car stands right of its line, and whether it's on the laid surface. */
  rightOfLineM: number;
  onSurface: boolean;
}

/** What a grid run says of each racer every second, for diagnosing one. */
export type GridTrace = (line: string) => void;

export function vetGridRun(
  spec: GridSpec,
  loaded: LoadedRace,
  trace?: GridTrace,
): GridResult {
  const { race, world, laid } = loaded;
  if (spec.slots.length === 0 || spec.slots.length > race.grid.length)
    throw new Error(
      `${race.id} has ${race.grid.length} grid places, not ${spec.slots.length}`,
    );
  const roadAt = (slot: number) => {
    const place = race.grid[slot];
    const road = world.roads.nearest(place.x, place.z);
    if (!road) throw new Error(`${race.id}: no road at grid place ${slot}`);
    return { ...road, x: place.x, z: place.z, heading: place.heading };
  };
  const drive = new Drive(world, roadAt(0), spec.slots[0]);
  drive.condition = spec.condition;
  drive.tyres = spec.tyres;
  const entries: Entry[] = [];
  const skill = { cornerShare: spec.gripShare, brakeShare: spec.brakeShare };
  spec.slots.forEach((carId, slot) => {
    const car =
      slot === 0 ? drive.player : drive.addCar(roadAt(slot), carId, spec.tyres);
    const driven = racingLineFor(loaded, carId);
    const from = alongOfPlace(
      driven.line,
      race.grid[slot].x,
      race.grid[slot].z,
    );
    const human = spec.human === true && slot === spec.slots.length - 1;
    const entry: Entry = {
      slot,
      car,
      id: `racer-${slot}`,
      human,
      hits: 0,
      lastSpeed: 0,
      lastHitS: -Infinity,
      placed: false,
      justPlaced: false,
      events: [],
      lastCarHitS: -Infinity,
      lastStandingHitS: -Infinity,
      through: new Set(),
      wasPassing: false,
      resetsSeen: 0,
      offSurfaceM: 0,
      lamps: lampReader(),
      drivenM: 0,
      input: NO_INPUT,
      rightOfLineM: 0,
      onSurface: true,
      racer: null as unknown as Racer,
    };
    entry.racer = racerFor(
      loaded,
      driven,
      carId,
      spec.condition,
      spec.tyres,
      human ? HUMAN_SKILL : skill,
      from,
      (point) => {
        if (slot === 0) drive.placeAt(point);
        else {
          car.place(point);
          car.land();
        }
        entry.placed = true;
      },
      !human,
    );
    entries.push(entry);
  });
  const base = {
    index: spec.index,
    race: race.id,
    condition: spec.condition,
    skill: spec.skill,
  };
  const standings = (): Standing[] =>
    entries.map(({ racer }) => ({
      finishedS: racer.finishedS,
      progress: racer.progress,
    }));
  const placesNow = () =>
    entries.map((_, at) =>
      placeOf(
        standings()[at],
        standings().filter((__, other) => other !== at),
      ),
    );
  let places = placesNow();
  /** The pairs of cars touching now, so a touch is counted as they come together and not again while they stay so. */
  const together = new Set<number>();
  let passes = 0;
  let pileUps = 0;
  let pileS = 0;
  let nextPlacesS = PLACES_EVERY_S;
  let nextTraceS = 0;
  const longestS = race.lengthM / SLOWEST_MS + LONGEST_MARGIN_S;
  // A racer at its line's end unfinished missed a line on the way: it is said so, since it can never finish.
  const racing = entries.filter(({ human }) => !human);
  const poleLine = racingLineFor(loaded, spec.slots[0]).line;
  const parkedAlongM = spec.parked ? alongOfPlace(poleLine, race.grid[0].x, race.grid[0].z) + PARKED_PAST_GRID_M : null;
  const parked = parkedAlongM === null ? null : drive.addCar(poleLine.at(parkedAlongM), spec.slots[0], spec.tyres);
  if (parked) parked.input = { ...NO_INPUT, handbrake: true };
  const traffic = spec.traffic ? trafficOn(loaded, spec.folder, drive, spec.traffic) : null;
  /** One traffic step, as the game's: told where the simulated cars are, its bubble kept round the middle of the pack and what that racer has in view left alone, as for a player racing there, and every vehicle moved. */
  const stepTraffic = (on: RaceTraffic) => {
    const driven: DrivenCar[] = on.contact.driven(null);
    for (const { id, car } of entries) {
      const state = car.stateAt(1);
      const [wide, , long] = CARS[state.car].car.halfSize;
      driven.push({ id, x: state.position[0], z: state.position[2], heading: headingOf(state.rotation), vx: state.velocity[0], vz: state.velocity[2], half: [wide, long] });
    }
    on.lanes.setDriven(driven);
    if (on.bubbleSteps === 0) {
      const byProgress = [...racing].sort((a, b) => a.racer.progress - b.racer.progress);
      const middle = byProgress[Math.floor(byProgress.length / 2)].car.stateAt(1);
      const [x, , z] = middle.position;
      const heading = headingOf(middle.rotation);
      on.bubble.update({ x, z }, (vehicle) => {
        const [dx, dz] = [vehicle.pose.x - (x + EYE_BACK_M * Math.sin(heading)), vehicle.pose.z - (z + EYE_BACK_M * Math.cos(heading))];
        const away = Math.hypot(dx, dz);
        return away < TRAFFIC_REACH_M[vehicle.kind] && -dx * Math.sin(heading) - dz * Math.cos(heading) > away * VIEW_HALF_COS;
      });
    }
    on.bubbleSteps = (on.bubbleSteps + 1) % BUBBLE_EVERY;
    if (clockS < 0) {
      for (const vehicle of [...on.lanes.all()]) {
        if (entries.some(({ car }) => Math.hypot(car.position[0] - vehicle.pose.x, car.position[2] - vehicle.pose.z) < GRID_CLEAR_M)) on.lanes.remove(vehicle.id);
      }
    }
    on.lanes.step(STEP_S * TRAFFIC_EVERY);
  };
  const failedText = () => {
    const unfinished = racing.filter(({ racer }) => racer.finishedS === null);
    const ranOut = unfinished.filter(({ racer }) => racer.record.along >= racer.line.length - 10);
    return `${unfinished.length} racer(s) not over after ${longestS.toFixed(0)} s${ranOut.length > 0 ? `, ${ranOut.length} at the end of its line` : ""}`;
  };
  let clockS = -3;
  try {
    for (let step = 0; step < (longestS + 3) / STEP_S; step++) {
      const states = entries.map(({ car }) => car.stateAt(1));
      const seen: SeenCar[] = entries.map(({ id }, at) =>
        seenCarOf(id, states[at]),
      );
      if (parked) seen.push(seenCarOf("parked", parked.stateAt(1)));
      if (traffic) {
        for (const hit of traffic.contact.running()) seen.push(seenCarOf(hit.id, hit.car.stateAt(1)));
        for (const { id, pose, body, speedMS, half } of traffic.lanes.all())
          seen.push({ id, x: pose.x, z: pose.z, heading: body.heading, vx: -Math.sin(body.heading) * speedMS, vz: -Math.cos(body.heading) * speedMS, halfWidthM: half[0], halfLengthM: half[1] });
      }
      let playerInput: DriveInput = NO_INPUT;
      entries.forEach((entry, at) => {
        entry.wasPassing = entry.racer.craft.passing !== null;
        const input = entry.racer.step(
          states[at],
          entry.placed,
          seen,
          entry.id,
        );
        entry.justPlaced = entry.placed;
        entry.placed = false;
        entry.input = input;
        const { record } = entry.racer;
        if (record.resets !== entry.resetsSeen) {
          entry.resetsSeen = record.resets;
          const sinceCar = clockS - entry.lastCarHitS;
          const sinceStanding = clockS - entry.lastStandingHitS;
          entry.events.push({
            kind: "reset",
            clockS,
            alongM: record.along,
            cause: record.lastReset ?? "?",
            after: sinceCar < AFTER_HIT_S && sinceCar <= sinceStanding ? "a car" : sinceStanding < AFTER_HIT_S ? "something standing" : "nothing",
            passing: entry.wasPassing,
            kmh: speedOf(states[at]) * 3.6,
          });
        }
        if (at === 0) playerInput = input;
        else entry.car.input = input;
      });
      // A racer's clock stops when it finishes, so the race's is that of whoever is still racing.
      clockS = Math.max(...entries.map(({ racer }) => racer.run.clockS));
      if (racing.every(({ racer }) => racer.finishedS !== null)) break;
      traffic?.contact.beforeStep(traffic.steps);
      drive.step(playerInput);
      if (traffic) {
        traffic.contact.afterStep();
        traffic.steps = (traffic.steps + 1) % TRAFFIC_EVERY;
        if (traffic.steps === 0) stepTraffic(traffic);
      }
      if (clockS < 0) continue;
      for (const entry of entries) {
        const state = entry.car.stateAt(1);
        const speed = speedOf(state);
        if (
          !entry.justPlaced &&
          entry.lastSpeed - speed > HIT_DROP_MS &&
          clockS - entry.lastHitS > HIT_APART_S
        ) {
          entry.hits++;
          entry.lastHitS = clockS;
          // What it met: the nearest other car if one is within a car's length or so, ahead of it, behind it or beside it; else something standing.
          const [x, , z] = state.position;
          const heading = headingOf(state.rotation);
          let nearest: { distance: number; ahead: number; beside: number; human: boolean } | null = null;
          for (const other of entries) {
            if (other === entry) continue;
            const [otherX, , otherZ] = other.car.position;
            const distance = Math.hypot(otherX - x, otherZ - z);
            if (distance > CAR_HIT_WITHIN_M || (nearest && distance >= nearest.distance)) continue;
            // A heading points along (-sin, -cos), and its right is (cos, -sin).
            nearest = { distance, ahead: -(otherX - x) * Math.sin(heading) - (otherZ - z) * Math.cos(heading), beside: (otherX - x) * Math.cos(heading) - (otherZ - z) * Math.sin(heading), human: other.human };
          }
          // No racer that near: a car of the traffic, on its lane or knocked out of it, if one is.
          const trafficNear =
            !nearest &&
            traffic !== null &&
            ([...traffic.lanes.all()].some((vehicle) => vehicle.kind === "car" && Math.hypot(vehicle.pose.x - x, vehicle.pose.z - z) < CAR_HIT_WITHIN_M) ||
              traffic.contact.running().some((hit) => Math.hypot(hit.car.position[0] - x, hit.car.position[2] - z) < CAR_HIT_WITHIN_M));
          const what: HitKind = trafficNear ? "a traffic car" : !nearest ? "something standing" : Math.abs(nearest.beside) > Math.abs(nearest.ahead) ? "side by side" : nearest.ahead > 0 ? "ran into a car" : "hit from behind";
          if (nearest || trafficNear) entry.lastCarHitS = clockS;
          else entry.lastStandingHitS = clockS;
          entry.events.push({ kind: "hit", clockS, alongM: entry.racer.record.along, what, kmh: entry.lastSpeed * 3.6, passing: entry.racer.craft.passing !== null, human: nearest?.human ?? false });
        }
        entry.lastSpeed = speed;
        entry.lamps.read(state.lamps.brake, entry.input.brake > 0 && !state.lamps.reverse);
        entry.drivenM += speed * STEP_S;
        if (traffic && !entry.human) {
          // A cyclist or a walker inside the car's own outline: driven through.
          const [x, , z] = state.position;
          const heading = headingOf(state.rotation);
          const [wide, , long] = CARS[state.car].car.halfSize;
          for (const vehicle of traffic.lanes.all()) {
            if (vehicle.kind === "car" || entry.through.has(vehicle.id)) continue;
            const [dx, dz] = [vehicle.pose.x - x, vehicle.pose.z - z];
            if (Math.abs(-dx * Math.sin(heading) - dz * Math.cos(heading)) < long + THROUGH_M && Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading)) < wide + THROUGH_M) entry.through.add(vehicle.id);
          }
        }
        const under = laid.nearest(
          state.position[0],
          state.position[2],
          Math.atan2(-state.velocity[0], -state.velocity[2]),
        );
        if (under) {
          const offset =
            (state.position[0] - under.x) * Math.cos(under.heading) -
            (state.position[2] - under.z) * Math.sin(under.heading);
          const pastSurface =
            offset > 0
              ? offset - under.outerRightM
              : -offset - under.outerLeftM;
          if (pastSurface > 0) entry.offSurfaceM += speed * STEP_S;
          entry.onSurface = pastSurface <= 0;
        } else entry.onSurface = false;
        const onLine = entry.racer.line.at(entry.racer.record.along);
        entry.rightOfLineM = (state.position[0] - onLine.x) * Math.cos(onLine.heading) - (state.position[2] - onLine.z) * Math.sin(onLine.heading);
      }
      for (let a = 0; a < entries.length; a++) {
        for (let b = a + 1; b < entries.length; b++) {
          const pair = a * entries.length + b;
          if (!touching(entries[a].car.stateAt(1), entries[b].car.stateAt(1))) together.delete(pair);
          else if (!together.has(pair)) {
            together.add(pair);
            for (const [me, it] of [
              [entries[a], entries[b]],
              [entries[b], entries[a]],
            ])
              me.events.push({ kind: "touch", clockS, alongM: me.racer.record.along, kmh: speedOf(me.car.stateAt(1)) * 3.6, human: it.human });
          }
        }
      }
      // A knot of racers stopped together.
      const slow = entries.filter(
        ({ car }) =>
          speedOf(car.stateAt(1)) < PILE_UP_SLOW_MS &&
          !entries.find((e) => e.car === car)?.racer.finishedS,
      );
      const knotted = slow.some(
        (one) =>
          slow.filter(
            (other) =>
              Math.hypot(
                other.car.position[0] - one.car.position[0],
                other.car.position[2] - one.car.position[2],
              ) < PILE_UP_WITHIN_M,
          ).length >= PILE_UP_CARS,
      );
      if (knotted) {
        pileS += STEP_S;
        if (pileS >= PILE_UP_AFTER_S && pileS - STEP_S < PILE_UP_AFTER_S)
          pileUps++;
      } else pileS = 0;
      if (trace && clockS >= nextTraceS) {
        for (const entry of entries) {
          const state = entry.car.stateAt(1);
          const { record } = entry.racer;
          // The traffic nearest it, for reading what holds it: how far ahead of its nose and to its right, and what that one is doing.
          let nearby = "";
          if (traffic) {
            const [x, , z] = state.position;
            const heading = headingOf(state.rotation);
            const around = [
              ...[...traffic.lanes.all()].map((vehicle) => ({ what: `${vehicle.kind}${vehicle.waiting ? " waiting at a junction" : ""}${vehicle.meeting ? ` ${vehicle.meeting}` : ""}${vehicle.goingRound ? " going round" : ""}${vehicle.finished ? " at its trip's end" : ""}`, x: vehicle.pose.x, z: vehicle.pose.z, kmh: vehicle.speedMS * 3.6 })),
              ...traffic.contact.running().map((hit) => ({ what: "a car knocked out of its lane", x: hit.car.position[0], z: hit.car.position[2], kmh: speedOf(hit.car.stateAt(1)) * 3.6 })),
            ]
              .map((each) => ({ ...each, away: Math.hypot(each.x - x, each.z - z) }))
              .filter(({ away }) => away < TRACE_TRAFFIC_M)
              .sort((a, b) => a.away - b.away)
              .slice(0, 2);
            nearby = around.length === 0 ? "; no traffic near" : `; near: ${around.map((each) => `${each.what} ${(-(each.x - x) * Math.sin(heading) - (each.z - z) * Math.cos(heading)).toFixed(0)} m ahead ${((each.x - x) * Math.cos(heading) - (each.z - z) * Math.sin(heading)).toFixed(1)} m right at ${each.kmh.toFixed(0)} km/h`).join(", ")}`;
          }
          trace(
            `${clockS.toFixed(0).padStart(4)} s slot ${entry.slot + 1} ${entry.racer.finishedS !== null ? "finished" : record.phase.padEnd(9)} ${record.along.toFixed(0).padStart(5)} m ${(speedOf(state) * 3.6).toFixed(0).padStart(3)} km/h at ${state.position[0].toFixed(0)}, ${state.position[2].toFixed(0)}; offset ${record.offsetM.toFixed(1)} hold ${entry.racer.craft.passing ? `passing ${entry.racer.craft.passing.id} on ${entry.racer.craft.passing.side}` : "-"}; hits ${entry.hits} resets ${record.resets}${record.lastReset ? ` (${record.lastReset})` : ""}; lines ${entry.racer.progress.toFixed(2)}; ${entry.rightOfLineM.toFixed(1)} right of line, ${entry.onSurface ? "on" : "OFF"} the surface; steer ${entry.input.steer.toFixed(2)} throttle ${entry.input.throttle.toFixed(2)} brake ${entry.input.brake.toFixed(2)}${nearby}`,
          );
        }
        nextTraceS = clockS + TRACE_EVERY_S;
      }
      if (clockS >= nextPlacesS) {
        const now = placesNow();
        passes += now.filter((place, at) => place < places[at]).length;
        places = now;
        nextPlacesS += PLACES_EVERY_S;
      }
    }
    const final = placesNow();
    return {
      ...base,
      racers: entries.map((entry, at) => ({
        slot: entry.slot,
        car: spec.slots[at],
        human: entry.human,
        finished: entry.racer.finishedS !== null,
        raceS: entry.racer.finishedS,
        place: final[at],
        hits: entry.hits,
        resets: entry.racer.record.resets,
        offSurfaceM: entry.offSurfaceM,
        through: entry.through.size,
        lamps: entry.lamps.counts,
        drivenM: entry.drivenM,
        events: entry.events,
      })),
      passes,
      pileUps,
      simS: clockS,
      traffic: { met: traffic?.bubble.counts().spawned ?? 0, knockedOut: traffic?.knockedOut ?? 0 },
      parkedAlongM,
      failed: racing.every(({ racer }) => racer.finishedS !== null) ? undefined : failedText(),
    };
  } finally {
    drive.dispose();
  }
}

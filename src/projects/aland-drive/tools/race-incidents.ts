// Why a racer left its line: one car driven alone round a race by the racer (`racers/racer.ts`), as the vetting tool
// drives it, and every excursion from its line reported with what led to it. The vetting tool (`tools/race-vet.ts`)
// counts the mistakes; this reads each one, so a change to the racer is aimed at a cause that was measured.
//
//   npx tsx src/projects/aland-drive/tools/race-incidents.ts --only=<id>[,<id>] [--car=<id>] [--condition=<dry, wet,
//     snow or ice>] [--folder=<tiles>] [--corner=<share>] [--brake=<share>] [--detail] [--detail-at=<seconds>,<seconds>]
//     [--resets]
//
// An excursion starts when the car's middle stands a metre and a half off its line, and ends once it has been back
// within less than a metre for two seconds, or in a reset. Each prints one line: where and how fast against the plan,
// how it ended and the furthest it went, and from the three seconds before: how far over the plan's speed the car ran,
// the most of its grip the bend asked, how long the wheel was at its lock, off the ground or past the carriageway's
// edge, the most its nose pointed off its way, the slope, and whether it went to the bend's inside or outside.
// --detail prints every excursion's tenth-of-a-second trace from five seconds before it (speed against the plan, how
// far off the line and off its heading, the slip, the bend's radius, the pedals and the wheel, the laid edges, what
// each wheel stands on, the most any tyre is asked of its grip); --detail-at only for those that start at the seconds
// named. --resets prints each reset with its cause and place. A run is a pure function of its options, so the same
// options print the same.

import { RACES } from "../challenge/list";
import { tyresFor } from "../racers/field";
import { ROUTE_STEP_M } from "../racers/route-plan";
import { RACER_SKILL } from "../racers/skill";
import { plannedSpeedAt } from "../racers/speed-plan";
import { alongOfPlace, loadRace, racerFor, racingLineFor } from "../racers/vet";
import { headingOf, speedOf } from "../sim/car-state";
import { isCarId } from "../sim/cars";
import { Drive, initPhysics } from "../sim/drive";
import { CONDITIONS, isCondition } from "../sim/surfaces";
import { STEP_S, WORLD } from "../sim/tuning";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const CAR = option("car", "");
const CONDITION = option("condition", "dry");
if (!isCondition(CONDITION)) throw new Error(`--condition takes ${CONDITIONS.join(", ")}, not ${CONDITION}`);
const DETAIL = process.argv.includes("--detail");
const DETAIL_AT = option("detail-at", "").split(",").filter(Boolean).map(Number);
const RESETS = process.argv.includes("--resets");
const CORNER = Number(option("corner", String(RACER_SKILL.cornerShare)));
const BRAKE = Number(option("brake", String(RACER_SKILL.brakeShare)));

/** An excursion starts this far off the line, and is over once the car has been back within the lower bound this long. */
const START_M = 1.5;
const BACK_M = 0.8;
const BACK_S = 2;
/** One not over by now is reported as it stands. */
const LONGEST_S = 30;
/** What led to it is read over this long before it, and a trace starts this long before it and runs on this long after. */
const LED_UP_S = 3;
const TRACE_BEFORE_S = 5;
const TRACE_AFTER_S = 1.5;
const TRACE_EVERY_STEPS = 12;
/** A loss of speed in one step no brake makes: a hit. */
const HIT_DROP_MS = 1;
/** The longest a run may take: the race at a crawl, and a margin. */
const SLOWEST_MS = 8;
const LONGEST_MARGIN_S = 120;

interface Row {
  clockS: number;
  along: number;
  kmh: number;
  planKmh: number;
  /** Metres right of the line, and degrees the nose points anticlockwise of it and of the way the car travels. */
  rightM: number;
  offHeadingDeg: number;
  slipDeg: number;
  /** The line's bend here, above zero turning right, and the sideways pull it asks at the car's speed, in g. */
  bend: number;
  bendG: number;
  steer: number;
  wheelsDeg: number;
  throttle: number;
  brake: number;
  /** Metres past the carriageway's edge and past the whole surface's, below zero inside them; null where no road is laid. */
  pastEdgeM: number | null;
  pastSurfaceM: number | null;
  /** What each wheel stands on, by its first letter, and how many are on the ground. */
  surfaces: string;
  wheelsDown: number;
  slopePct: number;
  /** The most any tyre is asked of its grip: past 1 it is sliding. */
  demand: number;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const degrees = (radians: number) => (radians * 180) / Math.PI;

if (CAR !== "" && !isCarId(CAR)) throw new Error(`no car ${CAR}`);
const races = RACES.filter(({ id }) => ONLY === "" || ONLY.split(",").includes(id));
if (races.length === 0) throw new Error(`no race matches --only=${ONLY}`);

await initPhysics();
const roads = readRoads(FOLDER);
let excursions = 0;
for (const race of races) {
  const loaded = loadRace(FOLDER, race.id, roads);
  const car = CAR !== "" && isCarId(CAR) ? CAR : race.car;
  const [place] = race.grid;
  const road = loaded.world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${race.id}: no road at the pole`);
  const drive = new Drive(loaded.world, { ...road, x: place.x, z: place.z, heading: place.heading }, car);
  const tyres = tyresFor(CONDITION);
  drive.condition = CONDITION;
  drive.tyres = tyres;
  const driven = racingLineFor(loaded, car);
  const { line } = driven;
  const racer = racerFor(loaded, driven, car, CONDITION, tyres, { cornerShare: CORNER, brakeShare: BRAKE }, alongOfPlace(line, place.x, place.z), (point) => {
    drive.placeAt(point);
  });
  const { plan } = racer.driver;
  const rows: Row[] = [];
  let open: { startS: number; startRow: number; worstM: number; backS: number; hits: number } | null = null;
  let placements = drive.placements;
  let lastSpeed = 0;
  let hits = 0;
  let recovered = 0;
  console.log(`\n${race.number} ${race.id} in ${car}: ${race.laps} lap${race.laps === 1 ? "" : "s"} of ${(race.lapM / 1000).toFixed(2)} km`);
  for (let step = 0; step < (race.lengthM / SLOWEST_MS + LONGEST_MARGIN_S) / STEP_S; step++) {
    const before = drive.stateAt(1);
    const placed = drive.placements !== placements;
    placements = drive.placements;
    const resetsBefore = racer.record.resets;
    const input = racer.step(before, placed);
    if (racer.finishedS !== null) break;
    drive.step(input);
    const clockS = racer.run.clockS;
    if (clockS < 0) continue;
    const state = drive.stateAt(1);
    const speed = speedOf(state);
    const reset = racer.record.resets !== resetsBefore;
    const hit = !reset && lastSpeed - speed > HIT_DROP_MS;
    if (hit) hits++;
    lastSpeed = speed;
    const [x, , z] = state.position;
    if (reset && RESETS) console.log(`  reset ${racer.record.resets} (${racer.record.lastReset ?? "?"}) at ${clockS.toFixed(1)} s, ${racer.record.along.toFixed(0)} m along, from ${before.position[0].toFixed(1)}, ${before.position[2].toFixed(1)} at ${(speedOf(before) * 3.6).toFixed(0)} km/h`);
    // The nearest place on the line, finer than the driver's own search.
    const along = line.alongNear(racer.driver.along, x, z, 3, 0.25);
    const here = line.at(along);
    const heading = headingOf(state.rotation);
    const sample = Math.max(0, Math.min(plan.bends.length - 1, Math.round(along / ROUTE_STEP_M)));
    const under = loaded.laid.nearest(x, z, heading);
    const offset = under ? (x - under.x) * Math.cos(under.heading) - (z - under.z) * Math.sin(under.heading) : null;
    const treads = drive.player.treads();
    const row: Row = {
      clockS,
      along,
      kmh: speed * 3.6,
      planKmh: plannedSpeedAt(plan, along) * 3.6,
      rightM: (x - here.x) * Math.cos(here.heading) - (z - here.z) * Math.sin(here.heading),
      offHeadingDeg: degrees(wrap(heading - here.heading)),
      slipDeg: speed > 3 ? degrees(wrap(heading - Math.atan2(-state.velocity[0], -state.velocity[2]))) : 0,
      bend: plan.bends[sample],
      bendG: (speed * speed * Math.abs(plan.bends[sample])) / WORLD.gravity,
      steer: input.steer,
      wheelsDeg: degrees(state.steer),
      throttle: input.throttle,
      brake: input.brake,
      pastEdgeM: under && offset !== null ? (offset > 0 ? offset - under.rightM : -offset - under.leftM) : null,
      pastSurfaceM: under && offset !== null ? (offset > 0 ? offset - under.outerRightM : -offset - under.outerLeftM) : null,
      surfaces: drive.player.surfaces().map((surface) => surface[0]).join(""),
      wheelsDown: treads.filter((tread) => tread.rollMS !== 0 || tread.demand !== 0).length,
      slopePct: ((line.at(along + 6).y - line.at(along - 6).y) / 12) * 100,
      demand: Math.max(...treads.map((tread) => tread.demand)),
    };
    rows.push(row);
    if (!open && Math.abs(row.rightM) > START_M && !reset && racer.record.phase === "driving") open = { startS: clockS, startRow: rows.length - 1, worstM: Math.abs(row.rightM), backS: 0, hits: 0 };
    if (open) {
      const excursion = open;
      excursion.worstM = Math.max(excursion.worstM, Math.abs(row.rightM));
      if (hit) excursion.hits++;
      excursion.backS = Math.abs(row.rightM) < BACK_M ? excursion.backS + STEP_S : 0;
      if (reset || excursion.backS > BACK_S || clockS - excursion.startS > LONGEST_S) {
        const start = rows[excursion.startRow];
        const ledUp = rows.slice(Math.max(0, excursion.startRow - Math.round(LED_UP_S / STEP_S)), excursion.startRow + 1);
        const seconds = (matches: (each: Row) => boolean) => (ledUp.filter(matches).length * STEP_S).toFixed(1);
        const most = (read: (each: Row) => number) => Math.max(...ledUp.map(read));
        const bending = Math.abs(start.bend) >= 1e-3;
        const side = !bending ? "on a straight" : start.rightM > 0 === start.bend > 0 ? "to the inside" : "to the outside";
        const outcome = reset ? `reset (${racer.record.lastReset ?? "?"})` : excursion.backS > BACK_S ? "recovered" : `still off after ${LONGEST_S} s`;
        if (!reset) recovered++;
        excursions++;
        console.log(
          `  ${excursion.startS.toFixed(1)} s, ${start.along.toFixed(0)} m along at ${start.kmh.toFixed(0)} km/h (plan ${start.planKmh.toFixed(0)}): ${outcome}, ${excursion.worstM.toFixed(1)} m off at worst, ${excursion.hits} hit${excursion.hits === 1 ? "" : "s"}, ${side} of a ${bending ? `${start.bend > 0 ? "right" : "left"} bend` : "straight"}; before it: ${most((each) => each.kmh - each.planKmh).toFixed(0)} km/h over the plan, the bend asked ${most((each) => each.bendG).toFixed(2)} g, at lock ${seconds((each) => Math.abs(each.steer) >= 0.99)} s, a wheel up ${seconds((each) => each.wheelsDown < 4)} s, past the edge ${seconds((each) => (each.pastEdgeM ?? 0) > 0)} s, nose ${most((each) => Math.abs(each.slipDeg)).toFixed(0)}° off its way, slope ${start.slopePct.toFixed(1)}%`,
        );
        if (DETAIL || DETAIL_AT.some((at) => Math.abs(at - excursion.startS) < 0.5)) {
          const from = Math.max(0, excursion.startRow - Math.round(TRACE_BEFORE_S / STEP_S));
          const metres = (value: number | null) => (value === null ? "    -" : value.toFixed(1).padStart(5));
          for (let at = from; at < Math.min(rows.length, excursion.startRow + Math.round(TRACE_AFTER_S / STEP_S)); at += TRACE_EVERY_STEPS) {
            const each = rows[at];
            console.log(
              `    ${each.clockS.toFixed(1).padStart(6)} s ${each.along.toFixed(0).padStart(6)} m ${each.kmh.toFixed(0).padStart(4)}/${each.planKmh.toFixed(0).padStart(3)} km/h, ${each.rightM.toFixed(2).padStart(6)} m right, nose ${each.offHeadingDeg.toFixed(1).padStart(6)}° off the line ${each.slipDeg.toFixed(1).padStart(6)}° off its way; radius ${(Math.abs(each.bend) > 1e-4 ? (1 / each.bend).toFixed(0) : "-").padStart(5)} m asks ${each.bendG.toFixed(2)} g; steer ${each.steer.toFixed(2).padStart(5)} (${each.wheelsDeg.toFixed(1).padStart(5)}°) throttle ${each.throttle.toFixed(2)} brake ${each.brake.toFixed(2)}; past the edge ${metres(each.pastEdgeM)} the surface ${metres(each.pastSurfaceM)}; on ${each.surfaces}, ${each.wheelsDown} down, asked ${each.demand.toFixed(2)}; slope ${each.slopePct.toFixed(1).padStart(5)}%`,
            );
          }
        }
        open = null;
      }
    }
    // Only what a trace could reach back to is kept.
    if (!open && rows.length > 60 / STEP_S) rows.splice(0, rows.length - Math.round((TRACE_BEFORE_S + LED_UP_S) / STEP_S));
  }
  console.log(`  ${racer.finishedS === null ? "not finished" : `finished in ${racer.finishedS.toFixed(1)} s`}: ${racer.record.resets} reset${racer.record.resets === 1 ? "" : "s"}, ${hits} hit${hits === 1 ? "" : "s"}, ${recovered} excursion${recovered === 1 ? "" : "s"} recovered`);
  drive.dispose();
}
console.log(`\n${excursions} excursion${excursions === 1 ? "" : "s"} over ${races.length} race${races.length === 1 ? "" : "s"}.`);

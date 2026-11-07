// How a car handles at the edges of its grip, measured in the simulation alone on the flat dry test pad
// (`sim/test-pad.ts`): flat out against a wall, launching, stopping, braking into a bend and holding a corner, with
// the driver's aids on and off. Every number is counted in the simulation's own steps, so a run repeats exactly.
//
//   npx tsx src/projects/aland-drive/tools/handling.ts [--car=<id>] [--surface=<surface>]
//
// Run it before and after a change to how a car drives, and compare.

import { ALL_ASSISTS, NO_INPUT, type Assists, type DriveInput } from "../sim/car";
import { CARS, DEFAULT_CAR, isCarId } from "../sim/cars";
import { headingOf, speedOf } from "../sim/car-state";
import { Drive, initPhysics } from "../sim/drive";
import { SURFACES, type Surface } from "../sim/surfaces";
import { PAD_M, padPoint, testPad } from "../sim/test-pad";
import { STEP_S } from "../sim/tuning";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const ASKED = option("car", DEFAULT_CAR);
if (!isCarId(ASKED)) throw new Error(`no car ${ASKED}`);
const CAR = ASKED;
const SURFACE = SURFACES.find((surface: Surface) => surface === option("surface", "asphalt"));
if (!SURFACE) throw new Error(`--surface= takes ${SURFACES.join(", ")}`);

await initPhysics();
const pad = testPad(SURFACE);
const G = 9.81;
const kmh = (ms: number) => ms * 3.6;
const OFF = (...off: (keyof Assists)[]): Assists => ({ ...ALL_ASSISTS, ...Object.fromEntries(off.map((name) => [name, false])) });

function drive(assists: Assists, x = 200, heading = -Math.PI / 2): Drive {
  const made = new Drive(pad, { ...padPoint(x, -PAD_M / 2), heading }, CAR);
  made.assists = assists;
  for (let step = 0; step < 60; step++) made.step(NO_INPUT);
  return made;
}

function upTo(on: Drive, speed: number): void {
  while (speedOf(on.stateAt(1)) < speed) on.step({ ...NO_INPUT, throttle: 1 });
}

const spinOf = (on: Drive, wheel: number) => on.player.treads()[wheel].spinMS;

function wall(assists: Assists): string {
  // Nosed up to the pad's west wall, then flat out for two seconds.
  const on = drive(assists, 20, Math.PI / 2);
  for (let step = 0; step < 600; step++) on.step({ ...NO_INPUT, throttle: 0.3 });
  let topRpm = 0;
  for (let step = 0; step < 240; step++) {
    on.step({ ...NO_INPUT, throttle: 1 });
    topRpm = Math.max(topRpm, on.engine().rpm);
  }
  const spin = Math.max(...[0, 1, 2, 3].map((wheel) => Math.abs(spinOf(on, wheel))));
  const line = `${kmh(speedOf(on.stateAt(1))).toFixed(1)} km/h, gear ${on.engine().gear + 1}, revs ${on.engine().rpm.toFixed(0)} (top ${topRpm.toFixed(0)} of ${CARS[CAR].gearbox.redlineRpm}), fastest tread ${kmh(spin).toFixed(0)} km/h over the road`;
  on.dispose();
  return line;
}

function launch(assists: Assists): string {
  const on = drive(assists);
  let steps = 0;
  let spun = 0;
  while (speedOf(on.stateAt(1)) < 100 / 3.6 && steps < 60 / STEP_S) {
    on.step({ ...NO_INPUT, throttle: 1 });
    steps++;
    spun = Math.max(spun, ...[0, 1, 2, 3].map((wheel) => spinOf(on, wheel)));
  }
  on.dispose();
  return `0-100 km/h ${(steps * STEP_S).toFixed(2)} s, most wheelspin ${kmh(spun).toFixed(0)} km/h`;
}

function stop(assists: Assists): string {
  const on = drive(assists);
  upTo(on, 100 / 3.6);
  const [x, , z] = on.stateAt(1).position;
  let locked = 0;
  for (let step = 0; speedOf(on.stateAt(1)) > 0.3 && step < 30 / STEP_S; step++) {
    on.step({ ...NO_INPUT, brake: 1 });
    if (on.player.treads().some((tread) => tread.spinMS < -0.9 * Math.abs(tread.rollMS) && Math.abs(tread.rollMS) > 3)) locked++;
  }
  const [x2, , z2] = on.stateAt(1).position;
  on.dispose();
  return `stop from 100 km/h in ${Math.hypot(x2 - x, z2 - z).toFixed(1)} m, a wheel locked for ${(locked * STEP_S).toFixed(2)} s`;
}

/** From 120 km/h, a second on the brakes, then this for 1.2 s: how far the car turned. */
function intoBend(assists: Assists, after: Pick<DriveInput, "brake" | "steer">): string {
  const on = drive(assists);
  upTo(on, 120 / 3.6);
  const before = headingOf(on.stateAt(1).rotation);
  for (let step = 0; step < 120; step++) on.step({ ...NO_INPUT, brake: 1 });
  for (let step = 0; step < 144; step++) on.step({ ...NO_INPUT, ...after });
  const turned = headingOf(on.stateAt(1).rotation) - before;
  const line = `brake ${after.brake}, steer ${after.steer}: turned ${((Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) * 180) / Math.PI).toFixed(0)}°, now ${kmh(speedOf(on.stateAt(1))).toFixed(0)} km/h`;
  on.dispose();
  return line;
}

/** Full steer at a speed held by the throttle, for three seconds: the sideways pull it settles at, and whether it spun. */
function corner(assists: Assists, atKmh: number): string {
  const on = drive(assists);
  upTo(on, atKmh / 3.6);
  const pulls: number[] = [];
  let before = on.stateAt(1);
  let worst = 0;
  for (let step = 0; step < 360; step++) {
    const error = atKmh / 3.6 - speedOf(before);
    on.step({ ...NO_INPUT, steer: 1, throttle: Math.max(0, Math.min(1, error * 2)), brake: Math.max(0, Math.min(1, -error * 2)) });
    const after = on.stateAt(1);
    const [ax, , az] = before.velocity;
    const [bx, , bz] = after.velocity;
    const along = Math.hypot(bx, bz);
    pulls.push(Math.abs(((bx - ax) * -bz + (bz - az) * bx) / along / STEP_S));
    const way = Math.atan2(-bx, -bz) - headingOf(after.rotation);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(way), Math.cos(way))));
    before = after;
  }
  on.dispose();
  const settled = pulls.slice(-120).reduce((sum, pull) => sum + pull, 0) / 120;
  return `full steer at ${atKmh} km/h: ${(settled / G).toFixed(2)} g, the nose ${((worst * 180) / Math.PI).toFixed(0)}° off the way it went at worst`;
}

/** At 100 km/h, a quick swerve one way and back and straight again: how far the tail stepped out, and how long until the car ran straight. */
function swerve(assists: Assists): string {
  const on = drive(assists);
  upTo(on, 100 / 3.6);
  let worst = 0;
  let settledAt = 0;
  for (let step = 0; step < 480; step++) {
    const steer = step < 60 ? 1 : step < 120 ? -1 : 0;
    on.step({ ...NO_INPUT, steer, throttle: 0.3 });
    const state = on.stateAt(1);
    const way = Math.atan2(-state.velocity[0], -state.velocity[2]) - headingOf(state.rotation);
    const off = Math.abs(Math.atan2(Math.sin(way), Math.cos(way)));
    worst = Math.max(worst, off);
    if (step >= 120 && (off > 0.02 || Math.abs(state.spin[1]) > 0.05)) settledAt = step + 1;
  }
  on.dispose();
  return `swerve at 100 km/h: the nose ${((worst * 180) / Math.PI).toFixed(0)}° off the way it went at worst, straight ${((Math.max(0, settledAt - 120) * STEP_S)).toFixed(2)} s after the wheel`;
}

const rows: [string, Assists, (assists: Assists) => string][] = [
  ["wall, all aids", ALL_ASSISTS, wall],
  ["wall, no traction control", OFF("traction"), wall],
  ["launch, all aids", ALL_ASSISTS, launch],
  ["launch, no traction control", OFF("traction"), launch],
  ["stop, all aids", ALL_ASSISTS, stop],
  ["stop, no ABS", OFF("abs"), stop],
  ...([[1, 1], [1, 0.5], [0.6, 1], [0, 1]] as const).flatMap(([brake, steer]): [string, Assists, (assists: Assists) => string][] => [
    ["into a bend, all aids", ALL_ASSISTS, (assists) => intoBend(assists, { brake, steer })],
    ["into a bend, no ABS", OFF("abs"), (assists) => intoBend(assists, { brake, steer })],
  ]),
  ...[80, 140].flatMap((atKmh): [string, Assists, (assists: Assists) => string][] => [
    ["corner, all aids", ALL_ASSISTS, (assists) => corner(assists, atKmh)],
    ["corner, no stability", OFF("stability"), (assists) => corner(assists, atKmh)],
  ]),
];
rows.push(["swerve, all aids", ALL_ASSISTS, swerve], ["swerve, no stability", OFF("stability"), swerve]);
console.log(`${CARS[CAR].name} on ${SURFACE}`);
for (const [label, assists, measure] of rows) console.log(`${label.padEnd(28)} ${measure(assists)}`);

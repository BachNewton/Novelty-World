import { beforeAll, describe, expect, it } from "vitest";
import { NO_INPUT, type DriveInput } from "./car";
import type { CarState } from "./car-state";
import { Drive, initPhysics } from "./drive";
import { RECENTRE_M } from "./physics-centre";
import { padPoint, testPad } from "./test-pad";
import { STEP_S } from "./tuning";

/*
 * Rapier's positions are 32-bit floats, so far from Rapier's origin a car's body
 * moves in jumps: out at 22 km a car reversing gently from rest sat still for a
 * second and then lurched off at nearly 1 m/s. The physics centre keeps Rapier's
 * origin near the player's car, and these hold that it does, and that moving it
 * moves nothing in the world.
 */

/** Three tiles east of the origin: the far west of Eckerö is as far out. */
const FAR_WEST_M = 18000;
/** A road on the pad, and the next one north. */
const ROAD_Z = -1080;
const NEXT_ROAD_Z = ROAD_Z - 240;
const SETTLE_STEPS = 60;

beforeAll(initPhysics);

/** Where a car is on each step of a drive, from rest, with how fast it was going after each. */
function track(drive: Drive, input: DriveInput, steps: number, car: { stateAt(share: number): CarState } = drive): CarState[] {
  const states: CarState[] = [];
  for (let step = 0; step < steps; step++) {
    drive.step(input);
    states.push(car.stateAt(1));
  }
  return states;
}

/** How far each step's move along x is from the speed the step ended on: Rapier moves a body by that speed, so on precise ground it is next to nothing. */
const offPace = (states: readonly CarState[]) => states.slice(1).map((state, step) => Math.abs(state.position[0] - states[step].position[0] - state.velocity[0] * STEP_S));

describe("the physics centre", () => {
  it("lets a car creep backwards 22 km out as smoothly as at the origin, step for step the same drive", () => {
    const reverse = (westM: number) => {
      const drive = new Drive(testPad("asphalt", { westM }), padPoint(westM + 4500, ROAD_Z), "kobb");
      track(drive, NO_INPUT, SETTLE_STEPS);
      const states = track(drive, { ...NO_INPUT, brake: 0.05 }, 240);
      drive.dispose();
      return states;
    };
    const home = reverse(0);
    const far = reverse(FAR_WEST_M);
    // Every step moves by its speed, never stuck and then lurching.
    expect(Math.max(...offPace(far))).toBeLessThan(0.0001);
    expect(far[0].position[0] - far[far.length - 1].position[0]).toBeGreaterThan(0.3);
    far.forEach((state, step) => {
      expect(state.position[0] - FAR_WEST_M).toBeCloseTo(home[step].position[0], 6);
      expect(state.velocity[0]).toBeCloseTo(home[step].velocity[0], 9);
    });
  });

  it("moves under the cars without moving anything: across it no car jumps or changes speed, and a parked stand-in stays put", () => {
    const world = testPad("asphalt", { westM: FAR_WEST_M });
    const start = FAR_WEST_M + 200;
    const drive = new Drive(world, padPoint(start, ROAD_Z));
    const other = drive.addCar(padPoint(start, NEXT_ROAD_Z));
    other.input = { ...NO_INPUT, throttle: 1 };
    // Another player's car parked by the road the player drives, where the centre will have moved.
    track(drive, NO_INPUT, SETTLE_STEPS);
    const resting = structuredClone(drive.stateAt(1));
    const parked: CarState = { ...resting, position: [start + 1100, resting.position[1], ROAD_Z - 12] };
    drive.remotes.hear("parked", parked);

    const centres: number[] = [];
    const player: CarState[] = [];
    const racer: CarState[] = [];
    let furthestStandInM = 0;
    while (player.length < 4800 && (player.at(-1)?.position[0] ?? start) < start + RECENTRE_M + 300) {
      drive.step({ ...NO_INPUT, throttle: 1 });
      centres.push(drive.physicsCentre.x);
      player.push(drive.stateAt(1));
      racer.push(other.stateAt(1));
      const standIn = drive.remotes.stateAt("parked", 1).position;
      furthestStandInM = Math.max(furthestStandInM, Math.hypot(standIn[0] - parked.position[0], standIn[2] - parked.position[2]));
    }
    const moves = centres.flatMap((centre, step) => (step > 0 && centre !== centres[step - 1] ? [step] : []));
    expect(moves.length).toBeGreaterThan(0);

    for (const states of [player, racer]) {
      expect(Math.max(...offPace(states))).toBeLessThan(0.0005);
      const speedChange = states.slice(1).map((state, step) => Math.abs(state.velocity[0] - states[step].velocity[0]));
      for (const move of moves) {
        const around = [...speedChange.slice(move - 21, move - 1), ...speedChange.slice(move, move + 20)];
        expect(speedChange[move - 1]).toBeLessThan(Math.max(...around) + 0.01);
      }
    }
    // Still on the ground the whole way: blocks loaded before a move are where they were too.
    for (const { log } of [drive, other]) expect(log.contactLosses + log.airborneSteps).toBe(0);
    expect(furthestStandInM).toBeLessThan(0.001);
    drive.dispose();
  });
});

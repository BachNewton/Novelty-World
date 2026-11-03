import { beforeAll, describe, expect, it } from "vitest";
import { Autopilot } from "./autopilot";
import { NO_INPUT, type DriveInput } from "./car";
import { speedOf, type CarState } from "./car-state";
import { Drive, initPhysics, START_ALONG_M } from "./drive";
import { FIXTURE_TILES, readWorld } from "./read-tile";
import { chainLine } from "./road-net";

const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const route1 = chainLine(tile.roads, 0);

/** 20 Hz, as the game sends, and a tenth of a second on the way, each way. */
const SEND_EVERY_STEPS = 6;
const LATENCY_STEPS = 12;

beforeAll(initPhysics);

/** Two clients, each driving its own car and hearing the other's state late, as over the relay. */
function twoClients(a: Drive, b: Drive, steps: number, inputs: (step: number) => [DriveInput, DriveInput], each?: (step: number) => void) {
  const inFlight: { arrives: number; to: Drive; id: string; state: CarState }[] = [];
  for (let step = 0; step < steps; step++) {
    for (const message of inFlight.filter((m) => m.arrives === step)) message.to.remotes.hear(message.id, message.state);
    const [inputA, inputB] = inputs(step);
    a.step(inputA);
    b.step(inputB);
    if (step % SEND_EVERY_STEPS === 0) {
      inFlight.push({ arrives: step + LATENCY_STEPS, to: b, id: "a", state: structuredClone(a.stateAt(1)) });
      inFlight.push({ arrives: step + LATENCY_STEPS, to: a, id: "b", state: structuredClone(b.stateAt(1)) });
    }
    each?.(step);
  }
}

/** How far along the road's way at the start a car is. */
const ahead = (state: CarState) => {
  const start = route1.at(START_ALONG_M);
  return (state.position[0] - start.x) * -Math.sin(start.heading) + (state.position[2] - start.z) * -Math.cos(start.heading);
};

describe("two players' cars", () => {
  it("hit each other on both clients: the parked car is shoved, the one driving into it is stopped, and nothing is thrown", () => {
    const from = START_ALONG_M;
    const a = new Drive(world, route1.at(from));
    const b = new Drive(world, route1.at(from + 45));
    const driver = new Autopilot(route1, 18, from);
    let topA = 0;
    let topB = 0;
    let highestRise = 0;
    twoClients(a, b, 900, () => [driver.input(a.stateAt(1)), NO_INPUT], () => {
      topA = Math.max(topA, speedOf(a.stateAt(1)));
      topB = Math.max(topB, speedOf(b.stateAt(1)));
      highestRise = Math.max(highestRise, a.stateAt(1).velocity[1], b.stateAt(1).velocity[1]);
    });
    // B's own client moved B: the hit reached the car that was parked.
    expect(topB).toBeGreaterThan(4);
    // Neither car passed through the other, and the hit gave B no more than A brought.
    expect(ahead(a.stateAt(1))).toBeLessThan(ahead(b.stateAt(1)));
    expect(topB).toBeLessThan(topA * 1.3);
    expect(highestRise).toBeLessThan(4);
    for (const drive of [a, b]) expect(drive.log.airborneSteps).toBeLessThan(20);
    a.dispose();
    b.dispose();
  });

  it("a car put where another already is touches nothing until they're apart", () => {
    const a = new Drive(world, route1.at(START_ALONG_M));
    const parked = structuredClone(a.stateAt(1));
    a.remotes.hear("b", parked);
    for (let step = 0; step < 120; step++) a.step(NO_INPUT);
    expect(speedOf(a.stateAt(1))).toBeLessThan(0.5);
    expect(a.remotes.ghost("b")).toBe(true);

    // It drives off, and once clear it's solid.
    const away = route1.at(START_ALONG_M + 30);
    a.remotes.hear("b", { ...parked, position: [away.x, away.y + 0.5, away.z] });
    a.step(NO_INPUT);
    a.step(NO_INPUT);
    expect(a.remotes.ghost("b")).toBe(false);
    a.dispose();
  });
});

import { beforeAll, expect, it } from "vitest";
import { NO_INPUT } from "./car";
import { CAR_IDS } from "./cars";
import { Drive, initPhysics } from "./drive";
import { padPoint, PAD_M, testPad } from "./test-pad";

beforeAll(initPhysics);

it("the handbrake beats the engine: no car pulls away on full throttle with it held", () => {
  const pad = testPad();
  for (const id of CAR_IDS) {
    const drive = new Drive(pad, padPoint(200, -PAD_M / 2), id);
    for (let step = 0; step < 120; step++) drive.step(NO_INPUT);
    const [x, , z] = drive.stateAt(1).position;
    for (let step = 0; step < 240; step++) drive.step({ ...NO_INPUT, throttle: 1, handbrake: true });
    const after = drive.stateAt(1).position;
    expect(Math.hypot(after[0] - x, after[2] - z), id).toBeLessThan(0.05);
    drive.dispose();
  }
});

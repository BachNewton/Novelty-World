import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning";
import { FOG_FAR } from "./world/world";

// The camera follows the drawn frog, which can run ahead of the rules' frog
// by a knock-back while a bonk is drawn, and lag behind it by a jump.
const RUN_AHEAD = TUNING.bonkKnockback * TUNING.depthStep;
const LAG = TUNING.depthStep;

describe("the traffic, seen from the camera", () => {
  it("reappears beyond the fog's far end, where nothing can be seen", () => {
    const nearestCamera = -TUNING.cameraFollow + RUN_AHEAD;
    expect(TUNING.trafficHorizon - nearestCamera).toBeGreaterThan(FOG_FAR);
  });

  it("is recycled only once it is behind the camera", () => {
    const furthestCamera = -TUNING.cameraFollow - LAG;
    expect(-TUNING.recycleBehind).toBeLessThan(furthestCamera);
  });
});

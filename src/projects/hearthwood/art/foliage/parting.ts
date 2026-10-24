import { Vector4 } from "three";
import type { FeatureArt, FeatureFrame } from "../feature-art";

/*
 * Plants part round Elliott: flowers, ferns, heather, bushes and berry
 * bushes bend away from their feet as they walk through, and spring back
 * behind them, swinging a little past upright before they settle. Where
 * Elliott has been is kept as a short trail of steps, each bending the
 * plants round it less as it ages. Trees stand firm, and Elliott high on the
 * broom parts nothing.
 */

/** How many points the trail keeps: where Elliott is, and where they were. */
export const TRAIL_LENGTH = 6;
/** How far Elliott walks before a step is left on the trail, in metres. */
const STEP = 0.45;

/** How bent the plants round a step still are, `age` seconds after it was left: springing back, a little past upright, then still. */
export function recovery(age: number): number {
  return age >= 3 ? 0 : Math.exp(-1.7 * age) * Math.cos(2.4 * age);
}

interface Step {
  x: number;
  y: number;
  z: number;
  age: number;
}

/** The trail moved on a frame: aged, a step left behind when Elliott has gone far enough, and written to the uniforms. */
export function followTrail(trail: Step[], player: FeatureFrame["player"], delta: number, out: Vector4[]): void {
  for (const step of trail) step.age += delta;
  if (player) {
    const last = trail.at(0);
    if (!last || Math.hypot(player.x - last.x, player.z - last.z) >= STEP || Math.abs(player.y - last.y) >= STEP) {
      trail.unshift({ x: player.x, y: player.y, z: player.z, age: 0 });
      trail.length = Math.min(trail.length, TRAIL_LENGTH - 1);
    }
  }
  if (player) out[0].set(player.x, player.y, player.z, 1);
  else out[0].set(0, 0, 0, 0);
  for (let i = 1; i < TRAIL_LENGTH; i++) {
    const step = trail.at(i - 1);
    if (step) out[i].set(step.x, step.y, step.z, recovery(step.age));
    else out[i].set(0, 0, 0, 0);
  }
}

export function partingArt(): FeatureArt {
  return { feature: "plantParting" };
}

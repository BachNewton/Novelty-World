import { Vector4 } from "three";
import { abs, float, length, max, min, positionGeometry, smoothstep, uniformArray, vec2, vec3 } from "three/tsl";
import type { Node, UniformArrayNode } from "three/webgpu";
import type { FeatureArt, FeatureFrame } from "../feature-art";
import { typed } from "../tsl";
import { plantRoot, plantTall } from "./placing";

/*
 * Plants part round Elliott: flowers, ferns, heather, bushes and berry
 * bushes bend away from their feet as they walk through, and spring back
 * behind them, swinging a little past upright before they settle. Where
 * Elliott has been is kept as a short trail of steps, each bending the
 * plants round it less as it ages. Trees stand firm, and Elliott high on the
 * broom parts nothing. It is a position stage, so a parted bush's shadow
 * parts with it.
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

/** A vertex of a plant pushed away from the trail's steps: `position` in the world, the design's own vertex saying how far up the plant it is. */
function parted(position: Node<"vec3">, trail: UniformArrayNode<"vec4">): Node<"vec3"> {
  const root = plantRoot();
  const tall = plantTall();
  // Only what stands under about two metres parts; trees stand firm.
  const small = float(1).sub(smoothstep(1.2, 2.4, tall));
  const here = position.xz;
  let push: Node<"vec2"> = vec2(0);
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const step = typed<"vec4">(trail.element(i));
    const off = here.sub(step.xz);
    const apart = length(off);
    const near = float(1)
      .sub(smoothstep(0.3, tall.mul(0.25).add(0.85), apart))
      .mul(float(1).sub(smoothstep(0.5, 1.3, abs(root.y.sub(step.y)))));
    // Each part of the plant leans away from Elliott by where it is, so a bush they stand in opens round them.
    push = push.add(off.div(max(apart, 0.05)).mul(near.mul(step.w)));
  }
  const how = length(push);
  const unit = push.div(max(how, 1));
  const up = max(positionGeometry.y, 0);
  return position.add(vec3(unit.x, min(how, 1).mul(-0.4), unit.y).mul(tall.mul(0.6).mul(up).mul(up).mul(small)));
}

export function partingArt(): FeatureArt {
  const trail: Step[] = [];
  const points = Array.from({ length: TRAIL_LENGTH }, () => new Vector4());
  const uniforms = uniformArray<"vec4">(points, "vec4");
  return {
    feature: "plantParting",
    stages: [{ kinds: ["foliage"], position: (position) => parted(position, uniforms) }],
    frame: ({ player, delta }) => {
      followTrail(trail, player, Math.min(delta, 0.1), points);
    },
  };
}

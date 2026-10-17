import { Vector4 } from "three";
import type { FeatureArt, FeatureFrame } from "../feature-art";
import { INSTANCE_SHIFT_GLSL } from "./wind";

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

const PARTING_UNIFORMS = {
  /** Each point of the trail (xyz) and how bent the plants round it are (w): the first is where Elliott is. */
  uHwTrail: { value: Array.from({ length: TRAIL_LENGTH }, () => new Vector4()) },
};

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

const PARTING_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 hwRoot = instanceMatrix[3].xyz;
  float hwTall = length(instanceMatrix[1].xyz);
  float hwSmall = 1.0 - smoothstep(1.2, 2.4, hwTall);
  if (hwSmall > 0.0) {
    // Each part of the plant leans away from Elliott by where it is, so a bush they stand in opens round them.
    vec2 hwHere = (instanceMatrix * vec4(position, 1.0)).xz;
    vec2 hwPush = vec2(0.0);
    for (int i = 0; i < ${TRAIL_LENGTH}; i++) {
      vec4 hwStep = uHwTrail[i];
      vec2 hwOff = hwHere - hwStep.xz;
      float hwApart = length(hwOff);
      float hwNear = (1.0 - smoothstep(0.3, 0.85 + 0.25 * hwTall, hwApart)) * (1.0 - smoothstep(0.5, 1.3, abs(hwRoot.y - hwStep.y)));
      hwPush += hwOff / max(hwApart, 0.05) * hwNear * hwStep.w;
    }
    float hwHow = length(hwPush);
    hwPush /= max(hwHow, 1.0);
    float hwUp = max(position.y, 0.0);
    vec3 hwShift = vec3(hwPush.x, -0.4 * min(hwHow, 1.0), hwPush.y) * hwTall * 0.6 * hwUp * hwUp * hwSmall;
    ${INSTANCE_SHIFT_GLSL}
  }
#endif
`;

export function partingArt(): FeatureArt {
  const trail: Step[] = [];
  return {
    feature: "plantParting",
    uniforms: PARTING_UNIFORMS,
    chunks: [{ kinds: ["foliage"], vertexHead: `uniform vec4 uHwTrail[${TRAIL_LENGTH}];`, vertex: PARTING_GLSL }],
    frame: ({ player, delta }) => {
      followTrail(trail, player, Math.min(delta, 0.1), PARTING_UNIFORMS.uHwTrail.value);
    },
  };
}

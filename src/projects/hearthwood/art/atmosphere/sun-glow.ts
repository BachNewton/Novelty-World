import { atan, cameraPosition, dot, exp, float, max, min, pow, sqrt, uniform } from "three/tsl";
import type { Node } from "three/webgpu";
import { liveFeatures } from "../../features";
import { hazeAmount } from "../atmosphere";
import type { FeatureArt, MaterialKind, StageContext } from "../feature-art";
import { colourUniform } from "../tsl";
import { FIRE, updateFire } from "./fire";
import { airDepths, FOG, rayOf, sunThrough } from "./fog";

/*
 * The glow in the air (`sunGlow`): the air shines round the sun, the moon
 * and the fire as much as it is thick. Droplets throw light forward, so
 * looking towards a low sun through mist or rain the air itself is bright
 * with it, the moon wears a halo on a damp night, and the fire stands in a
 * ball of its own light; on a crisp clear day there is hardly any. It is one
 * more term in every material's air, after the fog: a forward-scattering
 * lobe of the key light along the ray, as thick as the fog's own layers say
 * (or the plain haze, with the fog off), and the fire's light scattered
 * along the ray in closed form. No pass, no march.
 */

/** The key light's glow: through the wet air (tight and strong) and the clear air (broad and faint). */
const WET = { g: 0.72, gain: 0.05 } as const;
const CLEAR = { g: 0.35, gain: 0.06 } as const;
/** How much more the fire's glow takes from the air than the sun's: it is seen near, where the air is a few metres deep. */
const FIRE_GAIN = 12;
/** How far along a ray the fire's glow is gathered, in metres. */
const FIRE_REACH = 400;

const glow = {
  /** The key light shining into the air, dimmed as the cloud covers it. */
  key: colourUniform(),
  /** How thick the air is at the fire, per metre. */
  fireAir: uniform(0),
};

/** Forward scattering (Henyey-Greenstein), 1 for light scattered evenly. */
function forward(cosine: Node<"float">, g: number): Node<"float"> {
  return float(1 - g * g).div(pow(float(1 + g * g).sub(cosine.mul(2 * g)), 1.5));
}

/** The fire's light scattered towards the eye along a ray: the integral of an inverse-square light along a line, in closed form. */
function fireAlong(dir: Node<"vec3">, dist: Node<"float">): Node<"vec3"> {
  const toFire = FIRE.position.sub(cameraPosition);
  const along = dot(toFire, dir);
  const off = sqrt(max(dot(toFire, toFire).sub(along.mul(along)), 0.25));
  const end = min(dist, FIRE_REACH);
  const gathered = atan(end.sub(along).div(off)).sub(atan(along.negate().div(off))).div(off);
  return FIRE.light.mul(gathered.mul(glow.fireAir).mul(FIRE_GAIN / (4 * Math.PI)));
}

function glowing(colour: Node<"vec3">, { kind, air }: StageContext): Node<"vec3"> {
  const { point, dist, dir } = rayOf(kind);
  const cosine = dot(dir, air.uHwSunDir);
  let wetShare: Node<"float"> = float(0);
  let clearShare: Node<"float">;
  // Which air it glows in is settled when the material is built: switching the fog rebuilds every material it reaches.
  if (liveFeatures().isOn("fog")) {
    const depths = airDepths(point, dist);
    wetShare = float(1).sub(exp(depths.wet.negate()));
    clearShare = float(1).sub(exp(depths.air.negate()));
  } else {
    clearShare = hazeAmount(air, point);
  }
  const lobe = wetShare.mul(forward(cosine, WET.g)).mul(WET.gain).add(clearShare.mul(forward(cosine, CLEAR.g)).mul(CLEAR.gain));
  const lit = colour.add(glow.key.mul(lobe));
  return kind === "sky" ? lit : lit.add(fireAlong(dir, dist));
}

const KINDS: readonly MaterialKind[] = ["land", "ground", "foliage", "solid", "water", "sky"];

export const SUN_GLOW_ART: FeatureArt = {
  feature: "sunGlow",
  stages: [{ kinds: KINDS, colour: glowing }],
  frame: (frame) => {
    const { atmosphere, weather } = frame;
    glow.key.value.copy(atmosphere.uHwKeyLight.value).multiplyScalar(sunThrough(weather));
    updateFire(frame);
    // The air at the fire: the fog's layers there, or with the fog off the plain haze's.
    const y = FIRE.position.value.y;
    const d = FOG.density.value;
    const l = FOG.layers.value;
    glow.fireAir.value = liveFeatures().isOn("fog")
      ? d.x + d.y * Math.exp(-Math.max(y - l.y, -l.z) / l.z) + d.z * Math.exp(-Math.max(y - l.y, -l.w) / l.w)
      : atmosphere.uHwHazeDensity.value;
  },
};

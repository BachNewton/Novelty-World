import { DoubleSide, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, fract, int, max, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, vec2, vec3 } from "three/tsl";
import type { RoadsideInputs, RoadsideMaterials } from "../roadside";
import { BOAT_PARTS, KIND, PAINT, SAIL_KINDS } from "./mesh";
import "./tokens.css";

/*
 * The instance layout of the roadside kit, so `placeModel` places these models, and
 * the same light and haze. A boat grows out of nothing at the end of its reach, and
 * its versions trade pixels over a band round the swap, as the street kit's do.
 *
 * What's added is the water. A boat rocks as one body: its roll, pitch and heave are
 * worked out from its place and the clock, so every vertex of hull, rig and sail
 * shares them, the near and far versions agree, and nothing runs on the CPU. Rigging
 * ribbons hold a fraction of a pixel's width, so they can't break into dashes, and
 * thin out by the screen pattern before the far version, which has none.
 */

export interface BoatInputs extends RoadsideInputs {
  /** Seconds. It needn't be the clock: a paused game can hold it. */
  time: Node<"float">;
}

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const GROW_SHARE = 0.14;
const SWAP_BAND = 0.1;

/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;
const LINE_PIXELS = 0.42;
const LINE_HALF_M = 0.009;
/** Rigging starts thinning here, as a share of the swap, and has gone by the swap's near edge. */
const LINE_FADE_FROM = 0.3;

/** Radians a second at the two ends of a boat's liveliness. */
const SPEED_STILL = 0.55;
const SPEED_LIVELY = 1.5;
/** Radians of roll, likewise. */
const ROLL_STILL = 0.005;
const ROLL_LIVELY = 0.045;
const PITCH_SHARE = 0.5;
const HEAVE_M = 0.05;
const FLUTTER_M = 0.05;
const FLUTTER_SPEED = 7;

const rollOf = (place: Node<"vec2">) => fract(sin(dot(place, vec2(12.9898, 78.233))).mul(43758.5453));
const screenPattern = () => fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

function paintOf({ linear, sun }: Pick<RoadsideInputs, "linear" | "sun">) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const palette = uniformArray(BOAT_PARTS.map((part) => {
    const paint: { from: string; to?: string; share?: number; gain?: number } = PAINT[part];
    const { from, to = from, share = 0, gain = 1 } = paint;
    return linear(from).lerp(linear(to), share).multiplyScalar(gain);
  }));
  const tint = attribute<"vec4">("tint", "vec4");
  const painted = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  return painted.mul(float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE)));
}

function placedMaterial(inputs: BoatInputs, isNear: boolean): MeshBasicNodeMaterial {
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const tint = attribute<"vec4">("tint", "vec4");
  const kind = round(tint.a.mul(255));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);

  const grown = float(1).sub(smoothstep(reach.y.mul(1 - GROW_SHARE), reach.y, distance));
  const shown = isNear ? distance.lessThan(reach.x.mul(1 + SWAP_BAND)) : distance.greaterThanEqual(reach.x.mul(1 - SWAP_BAND)).and(distance.lessThan(reach.y));
  const size = select(shown, fit.x.mul(grown), float(0));

  const lively = tint.b;
  const clock = inputs.time.mul(mix(float(SPEED_STILL), float(SPEED_LIVELY), lively)).mul(float(0.92).add(roll.mul(0.16))).add(roll.mul(31.4));
  const reachOfRoll = mix(float(ROLL_STILL), float(ROLL_LIVELY), lively);
  const free = select(kind.equal(KIND.fast), float(0), float(1));
  const rolled = sin(clock).mul(reachOfRoll).mul(free);
  const pitched = sin(clock.mul(0.73).add(1.9)).mul(reachOfRoll).mul(PITCH_SHARE).mul(free);
  const heave = sin(clock.mul(0.61).add(0.7)).mul(HEAVE_M).mul(lively.add(0.3)).mul(free);

  const widen = max(float(0), distance.mul(PIXEL_M_PER_M * LINE_PIXELS).sub(LINE_HALF_M));
  const flutter = select(kind.greaterThanEqual(KIND.sail), kind.sub(KIND.sail).div(SAIL_KINDS), float(0)).mul(sin(inputs.time.mul(FLUTTER_SPEED).add(positionGeometry.y.mul(2.3)).add(positionGeometry.z.mul(1.7)).add(roll.mul(6.28)))).mul(FLUTTER_M);
  const local = positionGeometry.add(attribute<"vec3">("lineSide", "vec3").mul(widen));
  const bodyX = local.x.add(flutter).sub(local.y.mul(rolled));
  const bodyY = local.y.add(local.x.mul(rolled)).add(local.z.mul(pitched)).add(heave);
  const bodyZ = local.z.sub(local.y.mul(pitched));
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(bodyX.mul(yawCos).add(bodyZ.mul(yawSin)).mul(size)), place.y.add(bodyY.mul(size)), place.z.add(bodyZ.mul(yawCos).sub(bodyX.mul(yawSin)).mul(size)));
  material.colorNode = inputs.hazed(paintOf(inputs));

  const pattern = screenPattern();
  const swapShare = smoothstep(reach.x.mul(1 - SWAP_BAND), reach.x.mul(1 + SWAP_BAND), distance);
  const isLine = kind.equal(KIND.line).or(kind.equal(KIND.fast));
  const lineLeft = float(1).sub(smoothstep(reach.x.mul(LINE_FADE_FROM), reach.x.mul(1 - SWAP_BAND), distance));
  const traded = isNear ? pattern.greaterThanEqual(swapShare) : pattern.lessThan(swapShare);
  material.maskNode = traded.and(isLine.not().or(pattern.lessThan(lineLeft)));
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all its boats share them and go through the roadside kit's `placeModel`. */
export function boatMaterials(inputs: BoatInputs): RoadsideMaterials {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}

import { Vector3, Vector4, type MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cross, dFdx, dFdy, dot, float, floor, fract, int, mix, normalize, positionGeometry, positionWorld, round, select, sin, smoothstep, uniform, uniformArray, vec3 } from "three/tsl";
import { streetMaterials, type StreetInputs } from "../street";
import { MARINA_PARTS, PAINT } from "./paint";
import "./tokens.css";

/*
 * The street's two materials, so these models grow, dissolve and move exactly as the
 * street's do, with only their paint replaced: this kit's palette, lit as the street
 * is, with no foot shade on what stands in water and upright boards on the near walls.
 */

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;
const BOARD_M = 0.19;
const FLOATS = 1;
const BOARDS = 2;
/** Boards go to their mean by this distance, well before they could shimmer. */
const BOARDS_GONE_M = 90;

function paint({ linear, sun }: Pick<StreetInputs, "linear" | "sun">, isNear: boolean): Node<"vec3"> {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const palette = uniformArray(MARINA_PARTS.map((part) => {
    const { from, to, share, gain, float: floats, boards } = { to: undefined, share: 0, gain: 1, float: false, boards: false, ...PAINT[part] };
    const colour = linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
    return new Vector4(colour.x, colour.y, colour.z, (floats ? FLOATS : 0) + (boards ? BOARDS : 0));
  }));
  const tint = attribute<"vec4">("tint", "vec4");
  const entry = palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec4">;
  const painted = entry.xyz.mul(tint.g.mul(255 / 128));
  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const footed = mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), positionGeometry.y));
  const shaded = painted.mul(lit).mul(select(entry.w.mod(2).greaterThan(0.5), float(1), footed));
  if (!isNear) return shaded;

  const along = positionGeometry.x.add(positionGeometry.z).div(BOARD_M);
  const seam = float(1).sub(smoothstep(float(0.02), float(0.09), abs(fract(along).sub(0.5)).sub(0.5).abs()));
  const tone = fract(sin(dot(vec3(floor(along), 3, 9), vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  const away = float(1).sub(smoothstep(float(BOARDS_GONE_M * 0.4), float(BOARDS_GONE_M), positionWorld.sub(cameraPosition).length()));
  const boarded = shaded.mul(mix(float(1), mix(float(0.9), float(1.08), tone).mul(float(1).sub(seam.mul(0.45))), away));
  return select(entry.w.greaterThan(1.5), boarded, shaded);
}

/** The kit's materials, made once for the game; every model here shares them, through the roadside kit's `placeModel`. */
export function marinaMaterials(inputs: StreetInputs): { near: MeshBasicNodeMaterial; far: MeshBasicNodeMaterial } {
  const { near, far } = streetMaterials(inputs);
  near.colorNode = inputs.hazed(paint(inputs, true));
  far.colorNode = inputs.hazed(paint(inputs, false));
  return { near, far };
}

export type MarinaMaterials = ReturnType<typeof marinaMaterials>;

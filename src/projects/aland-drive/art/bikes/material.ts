import { BufferAttribute, BufferGeometry, Color, Matrix4, MeshBasicNodeMaterial, type Node, type StorageBufferAttribute } from "three/webgpu";
import { attribute, cameraPosition, cos, float, fract, instanceIndex, int, mix, modelWorldMatrix, normalGeometry, positionGeometry, positionWorld, reflect, screenCoordinate, select, sin, smoothstep, storage, uint, uniform, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { BikeMesh } from "./build";
import type { RiderLook } from "./look";
import { PARTS } from "./rig";
import { SLOTS, type Slot } from "./shapes";
import type { BikeSpec } from "./specs";
import { towardsSun, type Sun } from "../sun";

/*
 * One material for a bike and its rider: the world's light, the same sum as the
 * cars', a palette indexed by each face's slot, and the rigid parts moved in the
 * vertex shader from one array of matrices. So a cyclist is one draw call, and
 * its pose and colours are numbers changing. A crowd reads the same numbers from
 * a list per rider, so every rider on one bike is one draw call.
 */

const AMBIENT = 0.6;
const SUN_SHARE = 0.62;
const SPECULAR_POWER = 90;
const LOW_SHADE = 0.72;

const GLOSS: Record<Slot, number> = {
  frame: 0.5,
  accent: 0.5,
  tyre: 0.04,
  metal: 0.9,
  dark: 0.2,
  saddle: 0.15,
  bag: 0.05,
  basket: 0.05,
  lamp: 0.8,
  skin: 0.08,
  hair: 0.1,
  top: 0,
  bottom: 0,
  shoe: 0.1,
  helmet: 0.5,
};

export function bikeGeometry(mesh: BikeMesh): BufferGeometry {
  const tags = new Float32Array(mesh.triangles * 9);
  mesh.surfaces.forEach((slot, vertex) => {
    tags.set([mesh.parts[vertex], slot, GLOSS[SLOTS[slot]]], vertex * 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("bikeTag", new BufferAttribute(tags, 3));
  return geometry;
}

const token = (name: string): Color => themeColor(`--color-aland-drive-${name}`);

export interface BikeMaterialOptions {
  sun: Sun;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

interface Surface {
  /** The face's normal in the scene's frame, unnormalised. */
  normal: Node<"vec3">;
  base: Node<"vec3">;
  gloss: Node<"float">;
  /** Above the road, in the bike's own frame. */
  height: Node<"float">;
}

/** The light on a bike and its rider: one sum for a single cyclist and a crowd, so the two look the same. */
function shaded({ sun, hazed }: BikeMaterialOptions, { normal: unnormalised, base, gloss, height }: Surface): Node<"vec3"> {
  const toSun = towardsSun(sun);
  const sky = uniform(token("sky"));
  const sunColour = uniform(token("sun"));

  const normal = unnormalised.normalize();
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const ray = reflect(toCamera.negate(), normal);
  const lowShade = mix(float(LOW_SHADE), float(1), smoothstep(float(0), float(0.7), height));
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const fresnel = float(1).sub(normal.dot(toCamera).max(0)).pow(4).mul(gloss).mul(0.6);
  const surface = mix(base.mul(lit), sky.mul(ray.y.max(0).mul(0.5).add(0.5)), fresnel);
  const specular = sunColour.mul(ray.dot(toSun).max(0).pow(SPECULAR_POWER)).mul(gloss.mul(0.7));
  const finished: Node<"vec3"> = vec3(surface.add(specular));
  return hazed ? hazed(finished) : finished;
}

/** A bike's own slots, the same whoever rides it: its paint, then what every bike shares. */
export const bikeSlots = (spec: BikeSpec): [Slot, string][] => [
  ["frame", spec.paint],
  ["accent", spec.accent],
  ["tyre", "bike-tyre"],
  ["metal", "bike-metal"],
  ["dark", "bike-dark"],
  ["saddle", "bike-saddle"],
  ["bag", "bike-bag"],
  ["basket", "bike-basket"],
  ["lamp", "bike-lamp"],
];

/** The rider's slots, which follow the bike's in `SLOTS`. */
export const RIDER_SLOTS = SLOTS.slice(SLOTS.indexOf("skin"));

/** A look's token for each of `RIDER_SLOTS`. */
export function riderTokens(look: RiderLook): string[] {
  const of: Partial<Record<Slot, string>> = { skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, shoe: look.shoe, helmet: look.helmetColour };
  return RIDER_SLOTS.map((slot) => {
    const name = of[slot];
    if (name === undefined) throw new Error(`a rider's look has no colour for ${slot}`);
    return name;
  });
}

export function bikeMaterial(options: BikeMaterialOptions) {
  const matrices = PARTS.map(() => new Matrix4());
  const partMatrices = uniformArray<"mat4">(matrices, "mat4");
  const palette = SLOTS.map(() => new Color());
  const paletteColours = uniformArray<"vec3">(palette);

  const tag = attribute<"vec3">("bikeTag", "vec3");
  const placed = partMatrices.element(int(tag.x));
  const position = placed.mul(vec4(positionGeometry, 1)).xyz;
  const normalInModel = placed.mul(vec4(normalGeometry, 0)).xyz;

  const material = new MeshBasicNodeMaterial();
  material.positionNode = position;
  material.colorNode = shaded(options, {
    normal: varying(modelWorldMatrix.mul(vec4(normalInModel, 0)).xyz),
    base: varying(paletteColours.element(int(tag.y))),
    gloss: varying(tag.z),
    height: varying(position.y),
  });

  return {
    material,
    /** The rig's matrices, in the order of `PARTS`. */
    setPose(pose: number[][]) {
      pose.forEach((values, at) => matrices[at].fromArray(values));
    },
    setSlot(slot: Slot, tokenName: string) {
      palette[SLOTS.indexOf(slot)].copy(token(tokenName));
    },
  };
}

/** A crowd rider's rows: each part's matrix as its four columns, in the order of `PARTS`, then its place (x, y, z, yaw), then its colours. */
export const PLACE_ROW = PARTS.length * 4;
export const ROWS_A_RIDER = PLACE_ROW + 1 + RIDER_SLOTS.length;
/** How much of the swap, and of the reach, the two versions take to dissolve across: the world cars' share. */
export const DISSOLVE_SHARE = 0.15;

export interface CrowdTierOptions extends BikeMaterialOptions {
  spec: BikeSpec;
  /** `ROWS_A_RIDER` rows of four numbers for each rider on the list. */
  rows: StorageBufferAttribute;
  tier: "near" | "far";
  swapM: number;
  reachM: number;
}

/**
 * Every rider on one bike, on one list and one draw call: each rider's pose, place and colours read from `rows` by
 * its instance, and shaded by the single bike's own sum. The near version shows short of the swap and the far one from
 * where the swap's band starts; they meet in a dither where each keeps the pixels the other drops, so a rider never
 * pops, and the far one dissolves the same way over the last of the reach.
 */
export function crowdBikeMaterial(options: CrowdTierOptions) {
  const { spec, rows, tier, swapM, reachM } = options;
  const palette = SLOTS.map(() => new Color());
  for (const [slot, tokenName] of bikeSlots(spec)) palette[SLOTS.indexOf(slot)].copy(token(tokenName));
  const paletteColours = uniformArray<"vec3">(palette);

  const riders = storage(rows, "vec4", rows.count).toReadOnly();
  const first = instanceIndex.mul(ROWS_A_RIDER).toVar();
  const tag = attribute<"vec3">("bikeTag", "vec3");
  const partRow = first.add(uint(tag.x).mul(4)).toVar();
  const column = (at: number) => riders.element(partRow.add(at));
  const local = column(0).mul(positionGeometry.x).add(column(1).mul(positionGeometry.y)).add(column(2).mul(positionGeometry.z)).add(column(3)).xyz.toVar();
  const normalInBike = column(0).mul(normalGeometry.x).add(column(1).mul(normalGeometry.y)).add(column(2).mul(normalGeometry.z)).xyz;
  const place = riders.element(first.add(PLACE_ROW)).toVar();
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const turned = (v: Node<"vec3">) => vec3(v.x.mul(yawCos).add(v.z.mul(yawSin)), v.y, v.z.mul(yawCos).sub(v.x.mul(yawSin)));
  const firstRiderSlot = SLOTS.indexOf(RIDER_SLOTS[0]);
  const riderColour = riders.element(first.add(PLACE_ROW + 1).add(uint(tag.y.sub(firstRiderSlot).max(0)))).xyz;

  const distance = varying(place.xz.sub(cameraPosition.xz).length());
  // A uniform rather than a constant, so every bike's lists, each at its own swap, are one shader program.
  const swap = uniform(swapM);
  const fade = smoothstep(swap.mul(1 - DISSOLVE_SHARE), swap, distance);
  const gone = smoothstep(float(reachM * (1 - DISSOLVE_SHARE)), float(reachM), distance);
  const noise = fract(fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const material = new MeshBasicNodeMaterial();
  material.positionNode = place.xyz.add(turned(local));
  material.colorNode = shaded(options, {
    normal: varying(turned(normalInBike)),
    base: varying(select(tag.y.greaterThan(firstRiderSlot - 0.5), riderColour, paletteColours.element(int(tag.y)))),
    gloss: varying(tag.z),
    height: varying(local.y),
  });
  material.opacityNode = select(tier === "near" ? fade.lessThanEqual(noise) : fade.greaterThan(noise).and(gone.lessThanEqual(noise)), float(1), float(0));
  material.alphaTestNode = float(0.5);
  return material;
}

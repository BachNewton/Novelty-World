import { DoubleSide, Mesh, MeshBasicNodeMaterial, type Node, type StorageBufferAttribute } from "three/webgpu";
import { attribute, cameraPosition, cos, dot, float, fract, int, max, mix, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, storage, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../car-volume";
import type { RoadsideInputs } from "../roadside/material";
import type { Crowd } from "./crowd";
import { KNEE_FOLD, KNEE_REST, LIFT_LEAD, THIGH_LEAN, THIGH_SWING } from "./gait";
import { PARTS } from "./parts";
import { DRIVES, ROCK_MAX_DEGREES, ROCK_MAX_RATE, type Drive } from "./soup";
import "./tokens.css";
import { flatNormal } from "../flat-normal";
import { towardsSun } from "../sun";

/*
 * The light and haze of every other object, on a body that moves in the shader: a
 * vertex knows the joints it turns about, and each figure its phase. The walk is a
 * few sines of one clock, so a figure costs the CPU nothing however many walk.
 *
 * A near figure gives way to its far outline by a screen pattern, as the street kit's
 * objects do, and the outline grows out of nothing at the edge of its reach.
 *
 * A baked crowd's figures carry their place and gait on every vertex. A walking
 * crowd's carry only their slot, and read where they are now and how far through
 * a stride from two small lists rewritten each frame.
 */

export interface PeopleInputs extends RoadsideInputs {
  /** Seconds, for what moves. A paused game can hold it. */
  time: Node<"float">;
}

/** Where the near figure gives way to the outline, and where the outline ends. */
export const PEOPLE_SWAP_M = 34;
export const PEOPLE_REACH_M = 200;
const SWAP_BAND = 0.14;
const GROW_SHARE = 0.14;

const AMBIENT = 0.7;
const SUN_SHARE = 0.46;
const FOOT_SHADE = 0.8;
const FOOT_M = 0.5;

const SHADOW_STRENGTH = 0.42;
const SHADOW_LIFT_M = 0.03;
/** A shadow's patch falls this far from the feet, away from the sun. */
const SHADOW_DRIFT_M = 0.14;

const ROCK_GATE_RATE = 0.17;
const RIGHT_PHASE = Math.PI;

const driveIs = (drive: Node<"float">, wanted: Drive) => drive.equal(DRIVES.indexOf(wanted));
const pattern = () => fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));


/** Turns a point about a pivot on x: a limb hanging down goes forward for a positive angle. */
function swing(point: Node<"vec3">, pivot: Node<"vec3">, angle: Node<"float">): Node<"vec3"> {
  const from = point.sub(pivot);
  const [c, s] = [cos(angle), sin(angle)];
  return vec3(from.x, from.y.mul(c).add(from.z.mul(s)), from.z.mul(c).sub(from.y.mul(s))).add(pivot);
}

function aroundY(point: Node<"vec3">, pivot: Node<"vec3">, angle: Node<"float">): Node<"vec3"> {
  const from = point.sub(pivot);
  const [c, s] = [cos(angle), sin(angle)];
  return vec3(from.x.mul(c).add(from.z.mul(s)), from.y, from.z.mul(c).sub(from.x.mul(s))).add(pivot);
}

function aroundZ(point: Node<"vec3">, pivot: Node<"vec3">, angle: Node<"float">): Node<"vec3"> {
  const from = point.sub(pivot);
  const [c, s] = [cos(angle), sin(angle)];
  return vec3(from.x.mul(c).sub(from.y.mul(s)), from.x.mul(s).add(from.y.mul(c)), from.z).add(pivot);
}

/** Where a figure stands, (x, y, z, yaw), and its gait: the phase of its stride, strides a second, and the stride's share of an adult's full one. */
interface FigureSource {
  place: Node<"vec4">;
  gait: Node<"vec3">;
}

const baked = (): FigureSource => ({ place: attribute<"vec4">("place", "vec4"), gait: attribute<"vec3">("gait", "vec3") });

// A figure's pixels read its place too, for how far it stands, so its slot is made whole in the vertex stage, where the
// attribute is exact: blended across a triangle it reached some pixels a hair under on Nvidia, which cut to the slot
// before, and a walker's pixels each took another's distance and dissolved into dots.
const slotOf = () => varying(int(round(attribute<"float">("slot", "float"))));

/** A walking crowd's figures, by their slot in its lists of places and gaits. */
function listed(places: StorageBufferAttribute, gaits: StorageBufferAttribute): FigureSource {
  const slot = slotOf();
  return { place: storage(places, "vec4", places.count).toReadOnly().element(slot), gait: storage(gaits, "vec4", gaits.count).toReadOnly().element(slot).xyz };
}

/** A figure's own coordinates, moved by its rig for this moment. */
function moved(time: Node<"float">, gait: Node<"vec3">): Node<"vec3"> {
  const rig = attribute<"vec4">("rig", "vec4");
  const inner = attribute<"vec3">("inner", "vec3");
  const outer = attribute<"vec3">("outer", "vec3");
  const drive = round(rig.r.mul(255));
  const [phase, rate, stride] = [gait.x, gait.y, gait.z];

  const step = time.mul(rate).add(phase);
  const isLeg = driveIs(drive, "leg-left").or(driveIs(drive, "leg-right"));
  const isArm = driveIs(drive, "arm-left").or(driveIs(drive, "arm-right"));
  const opposite = driveIs(drive, "leg-right").or(driveIs(drive, "arm-right"));
  // An arm swings with the opposite leg, so an arm's own side is half a turn from its leg's.
  const beat = step.add(select(isArm, select(opposite, float(0), float(RIGHT_PHASE)), select(opposite, float(RIGHT_PHASE), float(0))));
  const s = sin(beat);
  const lifted = max(cos(beat.add(LIFT_LEAD)), float(0));
  const thigh = s.mul(THIGH_SWING).add(THIGH_LEAN);
  const knee = lifted.mul(lifted).mul(KNEE_FOLD).add(KNEE_REST).negate();
  const shoulder = s.mul(0.36);
  const elbow = s.mul(0.16).add(0.24);
  const upper = select(isLeg, thigh, select(isArm, shoulder, float(0))).mul(stride);
  const isLower = rig.g.greaterThan(0.5).and(isLeg.or(isArm));
  const lower = select(isLower, select(isLeg, knee, elbow).mul(stride), float(0));

  const gate = select(rig.a.greaterThan(0.5), smoothstep(float(0.15), float(0.75), sin(time.mul(rig.b.mul(ROCK_MAX_RATE)).mul(ROCK_GATE_RATE).add(phase.mul(2.7)))), float(1));
  const rock = rig.g.mul((ROCK_MAX_DEGREES * Math.PI) / 180).mul(sin(time.mul(rig.b.mul(ROCK_MAX_RATE)).add(phase))).mul(gate);

  const rocked = aroundZ(aroundY(swing(positionGeometry, inner, select(driveIs(drive, "rock-x"), rock, float(0))), inner, select(driveIs(drive, "rock-y"), rock, float(0))), inner, select(driveIs(drive, "rock-z"), rock, float(0)));
  const walked = swing(swing(rocked, outer, lower), inner, upper);

  const stepTwice = step.mul(2);
  const bob = cos(stepTwice).sub(1).mul(0.018).mul(stride);
  const sway = sin(step).mul(0.012).mul(stride);
  return walked.add(vec3(sway, bob, float(0)));
}

function figureMaterial(inputs: PeopleInputs, isNear: boolean, { place, gait }: FigureSource): MeshBasicNodeMaterial {
  const tint = attribute<"vec4">("tint", "vec4");
  const distance = place.xz.sub(cameraPosition.xz).length();

  const share = smoothstep(float(PEOPLE_SWAP_M * (1 - SWAP_BAND)), float(PEOPLE_SWAP_M * (1 + SWAP_BAND)), distance);
  const grown = float(1).sub(smoothstep(float(PEOPLE_REACH_M * (1 - GROW_SHARE)), float(PEOPLE_REACH_M), distance));
  const shown = isNear ? distance.lessThan(PEOPLE_SWAP_M * (1 + SWAP_BAND)) : distance.greaterThanEqual(PEOPLE_SWAP_M * (1 - SWAP_BAND)).and(distance.lessThan(PEOPLE_REACH_M));
  const size = select(shown, grown, float(0));

  const local = moved(inputs.time, gait);
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const material = new MeshBasicNodeMaterial();
  material.name = isNear ? "people-near" : "people-far";
  material.positionNode = vec3(place.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), place.y.add(local.y.mul(size)), place.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));

  const palette = uniformArray(PARTS.map((part) => inputs.linear(part)));
  const painted = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  const normal = flatNormal();
  const lit = float(AMBIENT).add(normal.dot(towardsSun(inputs.sun)).max(0).mul(SUN_SHARE));
  const grounded = mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), positionWorld.y.sub(place.y)));
  material.colorNode = inputs.hazed(painted.mul(lit.mul(grounded)));
  material.maskNode = (isNear ? pattern().greaterThanEqual(share) : pattern().lessThan(share)).and(outsideCar());
  material.side = DoubleSide;
  return material;
}

/** A shadow's middle on the ground, and its corner's reach across and along the body as two (x, z) ways. */
interface ShadowSource {
  middle: Node<"vec3">;
  spread: Node<"vec4">;
  place: Node<"vec4">;
}

const bakedShadow = (): ShadowSource => ({ middle: positionGeometry, spread: attribute<"vec4">("spread", "vec4"), place: attribute<"vec4">("place", "vec4") });

/** A walking crowd's shadows: each corner's slot, and its patch's offset from the feet and size, turned by where the figure faces now. */
function listedShadow(places: StorageBufferAttribute): ShadowSource {
  const place = storage(places, "vec4", places.count).toReadOnly().element(slotOf());
  const shape = attribute<"vec4">("shape", "vec4");
  const [c, s] = [cos(place.w), sin(place.w)];
  const middle = place.xyz.add(vec3(shape.x.mul(c).add(shape.y.mul(s)), 0, shape.y.mul(c).sub(shape.x.mul(s))));
  return { middle, spread: vec4(c.mul(shape.z), s.mul(shape.z).negate(), s.mul(shape.w), c.mul(shape.w)), place };
}

function shadowMaterial({ sun, colour }: PeopleInputs, { middle, spread, place }: ShadowSource): MeshBasicNodeMaterial {
  const corner = attribute<"vec2">("corner", "vec2");
  const toSun = towardsSun(sun);
  const away = vec2(toSun.x, toSun.z).negate().normalize().mul(SHADOW_DRIFT_M);
  const material = new MeshBasicNodeMaterial();
  material.name = "people-shadow";
  material.positionNode = middle.add(vec3(spread.x.mul(corner.x).add(spread.z.mul(corner.y)).add(away.x), SHADOW_LIFT_M, spread.y.mul(corner.x).add(spread.w.mul(corner.y)).add(away.y)));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const fade = float(1).sub(smoothstep(float(PEOPLE_REACH_M * (1 - GROW_SHARE)), float(PEOPLE_REACH_M), distance));
  const edge = float(1).sub(corner.dot(corner)).max(0);
  // The sun's length is its strength, so the shadow goes as the sun does.
  material.colorNode = vec4(colour("edge").mul(0.3), edge.mul(edge).mul(SHADOW_STRENGTH).mul(fade).mul(toSun.length().min(1)));
  material.transparent = true;
  material.side = DoubleSide;
  material.depthWrite = false;
  return material;
}

/** The kit's materials, made once for the game; every crowd shares them. */
export function peopleMaterials(inputs: PeopleInputs) {
  return { near: figureMaterial(inputs, true, baked()), far: figureMaterial(inputs, false, baked()), shadow: shadowMaterial(inputs, bakedShadow()) };
}

/** A walking crowd's materials, reading each figure's place and gait from its slot in the two lists. */
export function walkingMaterials(inputs: PeopleInputs, places: StorageBufferAttribute, gaits: StorageBufferAttribute) {
  return { near: figureMaterial(inputs, true, listed(places, gaits)), far: figureMaterial(inputs, false, listed(places, gaits)), shadow: shadowMaterial(inputs, listedShadow(places)) };
}

export type PeopleMaterials = ReturnType<typeof peopleMaterials>;

/** A baked crowd's three meshes, to add to the scene and then leave alone. */
export function crowdMeshes(crowd: Crowd, materials: PeopleMaterials): Mesh[] {
  const meshes = [new Mesh(crowd.shadow, materials.shadow), new Mesh(crowd.near, materials.near), new Mesh(crowd.far, materials.far)];
  for (const mesh of meshes) mesh.frustumCulled = false;
  return meshes;
}

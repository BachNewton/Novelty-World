import { DoubleSide, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, fract, int, max, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, vec2, vec3, vec4 } from "three/tsl";
import type { RoadsideInputs } from "../roadside/material";
import "../cars/tokens.css";
import type { Crowd } from "./crowd";
import { PARTS } from "./parts";
import { DRIVES, ROCK_MAX_DEGREES, ROCK_MAX_RATE, type Drive } from "./soup";
import "./tokens.css";

/*
 * The light and haze of every other object, on a body that moves in the shader: a
 * vertex knows the joints it turns about, and each figure its phase. The walk is a
 * few sines of one clock, so a figure costs the CPU nothing however many walk.
 *
 * A near figure gives way to its far outline by a screen pattern, as the street kit's
 * objects do, and the outline grows out of nothing at the edge of its reach.
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

function toSunOf({ azimuthDeg, elevationDeg }: RoadsideInputs["sun"]) {
  const [azimuth, elevation] = [(azimuthDeg * Math.PI) / 180, (elevationDeg * Math.PI) / 180];
  return new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
}

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

/** A figure's own coordinates, moved by its rig for this moment. */
function moved(time: Node<"float">): Node<"vec3"> {
  const rig = attribute<"vec4">("rig", "vec4");
  const inner = attribute<"vec3">("inner", "vec3");
  const outer = attribute<"vec3">("outer", "vec3");
  const gait = attribute<"vec3">("gait", "vec3");
  const drive = round(rig.r.mul(255));
  const [phase, rate, stride] = [gait.x, gait.y, gait.z];

  const step = time.mul(rate).add(phase);
  const isLeg = driveIs(drive, "leg-left").or(driveIs(drive, "leg-right"));
  const isArm = driveIs(drive, "arm-left").or(driveIs(drive, "arm-right"));
  const opposite = driveIs(drive, "leg-right").or(driveIs(drive, "arm-right"));
  // An arm swings with the opposite leg, so an arm's own side is half a turn from its leg's.
  const beat = step.add(select(isArm, select(opposite, float(0), float(RIGHT_PHASE)), select(opposite, float(RIGHT_PHASE), float(0))));
  const s = sin(beat);
  const lifted = max(cos(beat.add(0.5)), float(0));
  const thigh = s.mul(0.36).add(0.03);
  const knee = lifted.mul(lifted).mul(0.78).add(0.1).negate();
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

function figureMaterial(inputs: PeopleInputs, isNear: boolean): MeshBasicNodeMaterial {
  const place = attribute<"vec4">("place", "vec4");
  const tint = attribute<"vec4">("tint", "vec4");
  const distance = place.xz.sub(cameraPosition.xz).length();

  const share = smoothstep(float(PEOPLE_SWAP_M * (1 - SWAP_BAND)), float(PEOPLE_SWAP_M * (1 + SWAP_BAND)), distance);
  const grown = float(1).sub(smoothstep(float(PEOPLE_REACH_M * (1 - GROW_SHARE)), float(PEOPLE_REACH_M), distance));
  const shown = isNear ? distance.lessThan(PEOPLE_SWAP_M * (1 + SWAP_BAND)) : distance.greaterThanEqual(PEOPLE_SWAP_M * (1 - SWAP_BAND)).and(distance.lessThan(PEOPLE_REACH_M));
  const size = select(shown, grown, float(0));

  const local = moved(inputs.time);
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), place.y.add(local.y.mul(size)), place.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));

  const palette = uniformArray(PARTS.map((part) => inputs.linear(part)));
  const painted = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(uniform(toSunOf(inputs.sun))).max(0).mul(SUN_SHARE));
  const grounded = mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), positionWorld.y.sub(place.y)));
  material.colorNode = inputs.hazed(painted.mul(lit.mul(grounded)));
  material.maskNode = isNear ? pattern().greaterThanEqual(share) : pattern().lessThan(share);
  material.side = DoubleSide;
  return material;
}

function shadowMaterial({ sun, colour }: PeopleInputs): MeshBasicNodeMaterial {
  const corner = attribute<"vec2">("corner", "vec2");
  const spread = attribute<"vec4">("spread", "vec4");
  const place = attribute<"vec4">("place", "vec4");
  const toSun = toSunOf(sun);
  const away = vec2(-toSun.x, -toSun.z).normalize().mul(SHADOW_DRIFT_M);
  const material = new MeshBasicNodeMaterial();
  material.positionNode = positionGeometry.add(vec3(spread.x.mul(corner.x).add(spread.z.mul(corner.y)).add(away.x), SHADOW_LIFT_M, spread.y.mul(corner.x).add(spread.w.mul(corner.y)).add(away.y)));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const fade = float(1).sub(smoothstep(float(PEOPLE_REACH_M * (1 - GROW_SHARE)), float(PEOPLE_REACH_M), distance));
  const edge = float(1).sub(corner.dot(corner)).max(0);
  material.colorNode = vec4(colour("edge").mul(0.3), edge.mul(edge).mul(SHADOW_STRENGTH).mul(fade));
  material.transparent = true;
  material.side = DoubleSide;
  material.depthWrite = false;
  return material;
}

/** The kit's materials, made once for the game; every crowd shares them. */
export function peopleMaterials(inputs: PeopleInputs) {
  return { near: figureMaterial(inputs, true), far: figureMaterial(inputs, false), shadow: shadowMaterial(inputs) };
}

export type PeopleMaterials = ReturnType<typeof peopleMaterials>;

/** A baked crowd's three meshes, to add to the scene and then leave alone. */
export function crowdMeshes(crowd: Crowd, materials: PeopleMaterials): Mesh[] {
  const meshes = [new Mesh(crowd.shadow, materials.shadow), new Mesh(crowd.near, materials.near), new Mesh(crowd.far, materials.far)];
  for (const mesh of meshes) mesh.frustumCulled = false;
  return meshes;
}

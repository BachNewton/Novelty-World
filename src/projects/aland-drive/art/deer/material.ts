import { DoubleSide, MeshBasicNodeMaterial, Vector4, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, float, floor, fract, fwidth, int, max, mix, positionGeometry, positionWorld, round, select, sin, smoothstep, uniform, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../car-volume";
import { seedOf, unitOf } from "../hash";
import { facetLight, footShade, screenPattern, type RoadsideInputs } from "../roadside/material";
import { towardsSun } from "../sun";
import { GAIT_ROWS, gaitTable } from "./gaits";
import { bodyCentre, DRIVES, type DeerKind, type Detail } from "./shape";

/*
 * A roe deer's material: the gaits are worked out here, per vertex, from its rest
 * pose, the joints each vertex carries, and four rows a deer writes to its list:
 * where it stands, which gait it's in and how far through the cycle, how it looks
 * (its head's turn, its coat, its antlers and spots) and its size. So a herd costs
 * the CPU a few numbers a deer a frame however it moves. Between two gaits it
 * blends, each worked out at the same point in the cycle.
 *
 * A near deer gives way to its far one by a screen pattern, and the far one
 * dissolves at the edge of its reach.
 */

export interface DeerInputs extends RoadsideInputs {
  /** Seconds, for the head's own wandering while it stands. A paused game can hold it. */
  time: Node<"float">;
}

/** The band the two versions trade pixels over, as a share either side of the swap, and the share of the reach the far one dissolves over. */
export const SWAP_BAND = 0.12;
export const LEAVE_SHARE = 0.15;

/** A kid's spots: their spacing and size, in metres. */
const SPOT_CELL_M = 0.045;
const SPOT_RADIUS_M = 0.014;
/** The share of skin a cut through the balls covers, on average: a ball's mean cross-section over its cell's face. */
const SPOT_MEAN = ((2 / 3) * Math.PI * SPOT_RADIUS_M * SPOT_RADIUS_M) / (SPOT_CELL_M * SPOT_CELL_M);

const SHADOW_STRENGTH = 0.4;
const SHADOW_LIFT_M = 0.03;

/** Turns a point about a pivot on x: a limb hanging down goes forward, and a part ahead of the pivot goes up, for a positive angle. */
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

const TAU = 2 * Math.PI;

/** What a gait asks of one vertex's part at a point in the cycle. */
function poseOf(table: ReturnType<typeof uniformArray>, gait: Node<"float">, cycle: Node<"float">, leg: Node<"int">) {
  const row = (index: number) => table.element(int(round(gait)).mul(GAIT_ROWS).add(index)) as unknown as Node<"vec4">;
  const [shape, offsets, body, carriage, own] = [row(0), row(1), row(2), row(3), row(4)];
  const isFront = leg.lessThan(2);
  const offset = select(leg.equal(0), offsets.x, select(leg.equal(1), offsets.y, select(leg.equal(2), offsets.z, offsets.w)));
  const phase = fract(cycle.sub(offset).add(1));
  const stance = shape.x;
  const onGround = phase.lessThan(stance);
  const planted = phase.div(max(stance, float(0.001)));
  const off = phase.sub(stance).div(max(float(1).sub(stance), float(0.001))).clamp(0, 1);
  const eased = off.mul(off).mul(float(3).sub(off.mul(2)));
  const upper = shape.y.mul(select(onGround, float(1).sub(planted.mul(2)), eased.mul(2).sub(1)));
  const fold = select(isFront, shape.z.negate(), shape.w).mul(select(onGround, float(0), sin(off.mul(Math.PI))));
  const twice = sin(cycle.mul(2 * TAU));
  const rise = body.y.mul(max(cos(cycle.sub(body.z).mul(TAU)), float(0)).pow(2)).sub(body.x.mul(cos(cycle.mul(2 * TAU)).mul(0.5).add(0.5)));
  return {
    upper,
    fold,
    rise,
    pitch: body.w.mul(cos(cycle.sub(carriage.x).mul(TAU))),
    neck: carriage.y.add(carriage.z.mul(twice)),
    head: carriage.w.sub(carriage.z.mul(0.6).mul(twice)),
    wander: own.x,
  };
}

/** A deer's own coordinates, posed for this moment. */
function posed(kind: DeerKind, time: Node<"float">): Node<"vec3"> {
  const joints = attribute<"vec4">("joints", "vec4");
  const outer = attribute<"vec3">("outer", "vec3");
  const gait = attribute<"vec4">("deerGait", "vec4");
  const look = attribute<"vec4">("deerLook", "vec4");
  const size = attribute<"vec4">("deerBody", "vec4");
  const code = round(joints.w);
  const drive = floor(code.div(2));
  const isLower = code.sub(drive.mul(2)).greaterThan(0.5);
  const isLeg = drive.greaterThan(0.5).and(drive.lessThan(DRIVES.indexOf("neck") - 0.5));
  const isNeck = drive.equal(DRIVES.indexOf("neck"));
  const leg = int(drive).sub(1);

  const table = uniformArray(gaitTable().map(([x, y, z, w]) => new Vector4(x, y, z, w)));
  const now = poseOf(table, gait.x, gait.y, leg);
  const before = poseOf(table, gait.z, gait.y, leg);
  const share = gait.w;
  const blend = (key: keyof typeof now) => mix(now[key], before[key], share);
  const inner = joints.xyz;

  const legged = swing(swing(positionGeometry, outer, select(isLower, blend("fold"), float(0))), inner, blend("upper"));
  const wandering = sin(time.mul(0.45).add(size.y)).mul(0.5).add(sin(time.mul(0.17).add(size.y.mul(2.3))).mul(0.3)).mul(blend("wander"));
  const headed = aroundY(swing(swing(positionGeometry, outer, select(isLower, blend("head"), float(0))), inner, blend("neck")), inner, look.x.add(wandering));
  // A buck's antlers grow from nothing at the poll, and fold there when cast.
  const paint = attribute<"vec4">("paint", "vec4");
  const isAntler = paint.x.add(paint.y).add(paint.z).lessThan(0.5);
  const grown = select(isAntler, outer.add(headed.sub(outer).mul(look.z)), headed);
  const parted = select(isLeg, legged, select(isNeck, grown, positionGeometry));

  const centre = bodyCentre(kind);
  const pitched = swing(parted, vec3(...centre), blend("pitch"));
  return pitched.add(vec3(0, blend("rise"), 0)).mul(size.x);
}

/**
 * A kid's spots on its back and flanks: balls jittered in cells of its rest pose, so wherever the skin cuts one it
 * shows a round spot however the skin slopes. They fade to their mean once they're finer than a pixel.
 */
function spotted(isNear: boolean, kind: DeerKind) {
  const rest = positionGeometry;
  const centreY = bodyCentre(kind)[1];
  const onBack = smoothstep(float(centreY - 0.02), float(centreY + 0.04), rest.y).mul(float(1).sub(smoothstep(float(0.2), float(0.28), abs(rest.z.add(0.04)))));
  if (!isNear) return onBack.mul(SPOT_MEAN);
  const cell = floor(rest.div(SPOT_CELL_M));
  const seed = seedOf(cell.x, cell.y, cell.z);
  const middle = cell.add(vec3(unitOf(seed, 1), unitOf(seed, 2), unitOf(seed, 3)).mul(0.5).add(0.25)).mul(SPOT_CELL_M);
  const pixel = max(max(fwidth(rest.x), fwidth(rest.y)), fwidth(rest.z));
  const spot = float(1).sub(smoothstep(float(SPOT_RADIUS_M).sub(pixel), float(SPOT_RADIUS_M).add(pixel), rest.sub(middle).length()));
  return mix(spot, float(SPOT_MEAN), smoothstep(float(0.004), float(0.012), pixel)).mul(onBack);
}

export function deerMaterial(inputs: DeerInputs, kind: DeerKind, detail: Detail, swapM: number, reachM: number): MeshBasicNodeMaterial {
  const isNear = detail === "near";
  const place = attribute<"vec4">("deerPlace", "vec4");
  const look = attribute<"vec4">("deerLook", "vec4");
  const paint = attribute<"vec4">("paint", "vec4");
  const swap = uniform(swapM);
  const distance = place.xz.sub(cameraPosition.xz).length();
  const shown = isNear ? distance.lessThan(swap.mul(1 + SWAP_BAND)) : distance.greaterThanEqual(swap.mul(1 - SWAP_BAND)).and(distance.lessThan(reachM));

  const local = posed(kind, inputs.time).mul(select(shown, float(1), float(0)));
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const material = new MeshBasicNodeMaterial();
  material.name = "deer";
  material.positionNode = vec3(place.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin))), place.y.add(local.y), place.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin))));

  const share = varying(smoothstep(swap.mul(1 - SWAP_BAND), swap.mul(1 + SWAP_BAND), distance));
  const leave = varying(float(1).sub(smoothstep(float(reachM * (1 - LEAVE_SHARE)), float(reachM), distance)));
  const dither = screenPattern();
  material.maskNode = (isNear ? dither.greaterThanEqual(share) : dither.lessThan(share.min(leave))).and(outsideCar());

  const { linear } = inputs;
  const token = (name: string) => {
    const { x, y, z } = linear(`deer-${name}`);
    return vec3(x, y, z);
  };
  const seasons = varying(look.yzw);
  const winter = seasons.x;
  const coat = mix(token("summer"), token("winter"), winter);
  const pale = mix(token("pale-summer"), token("pale-winter"), winter);
  const antler = mix(token("velvet"), token("antler"), smoothstep(float(0.97), float(1), seasons.y));
  const rest = float(1).sub(paint.x).sub(paint.y).sub(paint.z).max(0);
  const spots = kind === "kid" ? spotted(isNear, kind).mul(seasons.z).mul(paint.x) : float(0);
  const furred = mix(coat, pale, spots);
  const base = furred.mul(paint.x).add(pale.mul(paint.y)).add(token("black").mul(paint.z)).add(antler.mul(rest)).mul(paint.w.mul(2));

  const { lit } = facetLight(inputs.sun);
  material.colorNode = inputs.hazed(base.mul(lit).mul(footShade(positionWorld.y.sub(place.y))));
  material.side = DoubleSide;
  return material;
}

/** A soft patch of shade on the ground under each deer, its size in its body row, gone as the sun goes. */
export function deerShadowMaterial(inputs: DeerInputs, reachM: number): MeshBasicNodeMaterial {
  const place = attribute<"vec4">("deerPlace", "vec4");
  const body = attribute<"vec4">("deerBody", "vec4");
  const toSun = towardsSun(inputs.sun);
  const away = vec2(toSun.x, toSun.z).negate().normalize().mul(0.12);
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const [x, z] = [positionGeometry.x.mul(body.z), positionGeometry.z.mul(body.w.mul(0.55))];
  const material = new MeshBasicNodeMaterial();
  material.name = "deer-shadow";
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin))).add(away.x), place.y.add(SHADOW_LIFT_M), place.z.add(z.mul(yawCos).sub(x.mul(yawSin))).add(away.y));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const fade = float(1).sub(smoothstep(float(reachM * (1 - LEAVE_SHARE)), float(reachM), distance));
  const corner = positionGeometry.xz;
  const edge = float(1).sub(corner.dot(corner)).max(0);
  material.colorNode = vec4(inputs.colour("edge").mul(0.3), edge.mul(edge).mul(SHADOW_STRENGTH).mul(fade).mul(toSun.length().min(1)));
  material.transparent = true;
  material.side = DoubleSide;
  material.depthWrite = false;
  return material;
}

export type DeerMaterial = ReturnType<typeof deerMaterial>;

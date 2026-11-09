import { curve } from "../curve";
import { groundY, type CarSpec } from "../build";
import type { Cabin } from "../body";
import { interiorOf, type InteriorStyle, type WheelKind } from "./style";

/*
 * Where everything in a cockpit goes, worked out from the car's shell and cabin:
 * the driver's eye, the dash under the windscreen, the wheel at arm's length, the
 * instruments where the eye sees them through the wheel, and the walls, floor and
 * roof the cabin's light falls past. Heights here are metres above the road, as
 * in a car's spec; the builder adds the car's `ground` to make them its own y.
 */

export interface Spot {
  x: number;
  h: number;
  z: number;
}

export interface CockpitFrame {
  style: InteriorStyle;
  cabin: Cabin;
  /** The road's y in the car's own frame. */
  ground: number;
  open: boolean;
  cowl: { z: number; h: number };
  header: { z: number; h: number };
  floorH: number;
  cushionH: number;
  /** The front seats' z, the rear seats' if it has them, and the cabin's back: the cabin's own, moved back where an open car's opening needs. */
  seatZ: number;
  rearSeatZ: number | undefined;
  endZ: number;
  eye: Spot;
  /** The dash: the top under the windscreen, its rear lip, and its face down to where the knees go. */
  dash: { frontZ: number; topH: number; rearZ: number; lowZ: number; lowH: number };
  wheel: { centre: Spot; tilt: number; radius: number; kind: WheelKind };
  /** The instruments' face: its middle, the way it faces (z and h), and its size. */
  cluster: { centre: Spot; facing: readonly [z: number, h: number]; width: number; height: number };
  /** The side wall's x at a z: the shell's at the belt, where the glass starts, and the door card's. */
  beltX: (z: number) => number;
  glassX: (z: number) => number;
  cardX: (z: number) => number;
  belt: (z: number) => number;
  /** The silhouette's height at z: the roof's outside along the middle. */
  top: (z: number) => number;
  /** The roof's outside at x across and z along, falling off from the middle by its crown. */
  roofAt: (x: number, z: number) => number;
  /** An open car's cockpit opening, from the front of it to the back. */
  opening: readonly [from: number, to: number] | null;
  /** Where the roof covers the cabin, if it has one. */
  roofZ: readonly [from: number, to: number] | null;
}

/** How far in from the outside the shell's inner skin lies. */
export const SKIN_M = 0.015;
/** From the eye to the top of the head and a little room. */
const HEADROOM_M = 0.11;
/** The eye above the seat's cushion, sitting. */
const SITTING_EYE_M = 0.64;
/** The eye above the bottom of the windscreen, at least, to see the road over the dash. */
const OVER_COWL_M = 0.26;

const WHEEL_RADIUS: Record<WheelKind, number> = { round: 0.185, flat: 0.18, rally: 0.175, classic: 0.205, yoke: 0.18 };

/** The shell's own rule for how far a wheel's flare pushes the side out (`flareAt` in `body.ts`). */
function flareOf(spec: CarSpec["body"], z: number) {
  const reach = (spec.wheelRadiusM + spec.archClearM) * 1.05;
  return spec.flareM * Math.max(...spec.axleZ.map((axle) => Math.exp(-(((z - axle) / reach) ** 4))));
}

/** The silhouette's top at z: the highest stretch over it. */
function topOf(spec: CarSpec["body"]) {
  const points = spec.silhouette;
  return (z: number) => {
    let best = -Infinity;
    for (let at = 0; at + 1 < points.length; at++) {
      const [a, b] = [points[at], points[at + 1]];
      const [low, high] = a.z < b.z ? [a, b] : [b, a];
      if (z < low.z || z > high.z || high.z === low.z) continue;
      best = Math.max(best, low.h + ((high.h - low.h) * (z - low.z)) / (high.z - low.z));
    }
    return best;
  };
}

export function cockpitFrame(spec: CarSpec): CockpitFrame {
  const { body } = spec;
  const cabin = body.cabin;
  if (!cabin) throw new Error(`${spec.name} has no cabin to sit in`);
  const style = interiorOf(spec);
  const [belt, halfWidth, railWidth, crown] = [curve(body.belt), curve(body.halfWidth), curve(body.railWidth), curve(body.crown)];
  const top = topOf(body);
  const screenAt = body.silhouette.findIndex((point) => point.band === "screen");
  if (screenAt < 0) throw new Error(`${spec.name} has no windscreen`);
  const cowl = { z: body.silhouette[screenAt].z, h: body.silhouette[screenAt].h };
  const [headerZ, headerH] = body.screenTop ?? [body.silhouette[screenAt + 1].z, body.silhouette[screenAt + 1].h];
  const header = { z: headerZ, h: headerH };
  const open = body.silhouette.some((point) => point.bed === true && point.z > header.z && point.z < cabin.seatZ + 0.6);
  // An open car's body closes over the front of the cockpit as far as its opening, where the dash's lip has to be.
  const firstOpen = open ? body.silhouette.findIndex((point) => point.bed === true && point.z > header.z) : -1;
  const opening = firstOpen < 0 ? null : body.silhouette[firstOpen].z;
  const lastOpen = firstOpen < 0 ? -1 : body.silhouette.findIndex((point, at) => at > firstOpen && point.bed !== true);
  const openingEnd = lastOpen < 0 ? null : body.silhouette[lastOpen].z;

  const beltX = (z: number) => halfWidth(z) - 0.018 + flareOf(body, z) * 0.35;
  const glassX = (z: number) => beltX(z) - 0.014;
  const cardX = (z: number) => beltX(z) - 0.04;

  // Behind an opening, the wheel goes past the lip and the driver at arm's length past that.
  const seatZ = Math.max(cabin.seatZ, opening === null ? -Infinity : opening + 0.62);
  const moved = seatZ - cabin.seatZ;
  const eyeZ = seatZ + 0.02 + style.eye[2];
  const roofLimit = open ? header.h - 0.07 : top(eyeZ) - SKIN_M - HEADROOM_M;
  const lowCushion = Math.min(cabin.floorH + 0.28, cowl.h - 0.32);
  const eyeH = Math.min(Math.max(lowCushion + SITTING_EYE_M, cowl.h + OVER_COWL_M), roofLimit) + style.eye[1];
  const cushionH = Math.max(eyeH - SITTING_EYE_M, cabin.floorH + 0.1);
  const eye: Spot = { x: -cabin.seatX + style.eye[0], h: eyeH, z: eyeZ };

  const tall = cowl.h > 1.15;
  const radius = WHEEL_RADIUS[style.wheel];
  const tilt = ((tall ? 34 : 22) * Math.PI) / 180;
  const wheelCentre: Spot = { x: eye.x, h: eyeH - (tall ? 0.42 : 0.37), z: eyeZ - (tall ? 0.48 : 0.5) };

  const frontZ = cowl.z + 0.05;
  const topH = opening === null ? cowl.h - 0.03 : Math.min(cowl.h - 0.03, top(opening - 0.02) - 0.03);
  const rearZ = opening === null ? Math.max(frontZ + 0.22, Math.min(cowl.z + 0.62, wheelCentre.z - 0.16)) : Math.max(frontZ + 0.22, opening - 0.004);
  const lowZ = rearZ + 0.07;
  const lowH = Math.min(Math.max(cushionH + 0.22, topH - 0.28), topH - 0.08);

  // The instruments sit on the dash's face where the eye sees them through the top of the wheel. One big rev counter
  // sits higher in the wheel's opening, so the column under it never crosses its face.
  const reach = style.gauges === "tacho" ? 0.62 : 0.45;
  const through = { z: wheelCentre.z - Math.sin(tilt) * radius * reach, h: wheelCentre.h + Math.cos(tilt) * radius * reach };
  const lip = { z: rearZ, h: topH - 0.03 };
  const [faceZ, faceH] = [lowZ - lip.z, lowH - lip.h];
  const sight = { z: through.z - eyeZ, h: through.h - eyeH };
  // Where the eye's line through the wheel meets the dash's face, as a share down the face.
  const denominator = sight.z * faceH - sight.h * faceZ;
  const down = Math.abs(denominator) < 1e-9 ? 0.5 : ((lip.h - eyeH) * sight.z - (lip.z - eyeZ) * sight.h) / -denominator;
  const width = style.gauges === "race" ? 0.27 : style.gauges === "digital" ? 0.36 : 0.34;
  const height = style.gauges === "digital" ? 0.12 : 0.13;
  const faceLength = Math.hypot(faceZ, faceH);
  const share = Math.min(Math.max(down, (height * 0.3) / faceLength), 1 - (height * 0.3) / faceLength);
  const facing = [-faceH / faceLength, faceZ / faceLength] as const;
  const proud = 0.03;
  const clusterCentre: Spot = { x: eye.x, h: lip.h + faceH * share + facing[1] * proud, z: lip.z + faceZ * share + facing[0] * proud };
  // Under an open car's scuttle, which falls away towards the sides, the dials sit flush in the dash's face with no hood,
  // and the wheel drops to keep the eye's line to them through its top.
  if (opening !== null) {
    const outer = (Math.abs(eye.x) + width / 2 + 0.03) / railWidth(opening);
    clusterCentre.h = Math.min(clusterCentre.h, top(opening - 0.03) - crown(opening) * Math.min(1, outer * outer) - height / 2 - 0.02);
    const lineAt = eyeH + ((wheelCentre.z - eyeZ) * (clusterCentre.h - eyeH)) / (clusterCentre.z - eyeZ);
    wheelCentre.h = Math.min(wheelCentre.h, lineAt - radius * 0.45 * Math.cos(tilt));
  }

  // Rear seats moved back with the front ones stay only if they still sit in the opening.
  const movedRear = cabin.rearSeatZ === undefined ? undefined : cabin.rearSeatZ + moved;
  const rearSeatZ = movedRear !== undefined && openingEnd !== null && movedRear + 0.35 > openingEnd ? undefined : movedRear;

  const roofEnd = (() => {
    const highest = Math.max(...body.silhouette.map((point) => point.h));
    let end = header.z;
    for (let z = header.z; z < cabin.endZ + moved + 1.5; z += 0.02) if (top(z) > highest - 0.12) end = z;
    return end;
  })();

  return {
    style,
    cabin,
    ground: groundY(spec),
    open,
    cowl,
    header,
    floorH: cabin.floorH,
    cushionH,
    seatZ,
    rearSeatZ,
    endZ: Math.max(cabin.endZ, rearSeatZ === undefined ? seatZ + 0.4 : rearSeatZ + 0.4),
    opening: opening === null || openingEnd === null ? null : [opening, openingEnd],
    eye,
    dash: { frontZ, topH, rearZ, lowZ, lowH },
    wheel: { centre: wheelCentre, tilt, radius, kind: style.wheel },
    cluster: { centre: clusterCentre, facing, width, height },
    beltX,
    glassX,
    cardX,
    belt,
    top,
    roofAt: (x, z) => top(z) - crown(z) * Math.min(1, (x / railWidth(z)) ** 2),
    roofZ: open ? null : [header.z, roofEnd],
  };
}

/** The cabin's walls, roof and dash as the few planes its light is shaded by, in the car's own frame. */
export interface CabinShade {
  /** The roof's underside: y, its z from and to, and its half width; a half width of 0 where there is none. */
  roof: readonly [y: number, fromZ: number, toZ: number, halfX: number];
  /** The sides: x, the belt's y below which a door stands, the rail's y above which the roof's edge does. */
  sides: readonly [x: number, beltY: number, railY: number, unused: number];
  /** The bulkhead under the windscreen and the cabin's back: z, and the y below which each stands. */
  ends: readonly [frontZ: number, frontY: number, rearZ: number, rearY: number];
  /** The dash's top: y, and the z it reaches back to; and the floor's y. */
  dash: readonly [y: number, rearZ: number, floorY: number, unused: number];
}

export function cabinShade(frame: CockpitFrame): CabinShade {
  const { ground, eye, roofZ, cowl, endZ, dash } = frame;
  const z = eye.z;
  const railY = frame.top(z) - 0.08 + ground;
  return {
    roof: roofZ ? [frame.top(z) - SKIN_M + ground, roofZ[0], roofZ[1], frame.glassX(z) - 0.12] : [0, 0, 0, 0],
    sides: [frame.beltX(z), frame.belt(z) + ground, roofZ ? railY : 99, 0],
    ends: [cowl.z, cowl.h + ground, endZ, frame.belt(endZ) + 0.04 + ground],
    dash: [dash.topH + ground, dash.rearZ, frame.floorH + ground, 0],
  };
}

/**
 * How much of the sky a point in the cabin sees past the shade's planes, from 0 to 1, along a direction: whether the
 * line from it meets the roof, a door, the bulkhead, the cabin's back or the dash's top first. The shader asks the same
 * of the sun; the builder asks it of many directions to bake how open each corner is.
 */
export function openTowards(shade: CabinShade, point: readonly [number, number, number], towards: readonly [number, number, number]): boolean {
  const [x, y, z] = point;
  const [dx, dy, dz] = towards;
  const [roofY, roofFrom, roofTo, roofHalf] = shade.roof;
  if (dy > 1e-6 && roofHalf > 0 && y < roofY) {
    const along = (roofY - y) / dy;
    const [hx, hz] = [x + dx * along, z + dz * along];
    if (Math.abs(hx) < roofHalf && hz > roofFrom && hz < roofTo) return false;
  }
  const [sideX, beltY, railY] = shade.sides;
  if (Math.abs(dx) > 1e-6) {
    const along = (Math.sign(dx) * sideX - x) / dx;
    const hy = y + dy * along;
    if (along > 0 && (hy < beltY || hy > railY)) return false;
  }
  const [frontZ, frontY, rearZ, rearY] = shade.ends;
  if (dz < -1e-6 && z > frontZ) {
    if (y + (dy * (frontZ - z)) / dz < frontY) return false;
  }
  if (dz > 1e-6 && z < rearZ) {
    if (y + (dy * (rearZ - z)) / dz < rearY) return false;
  }
  const [dashY, dashRearZ] = shade.dash;
  if (dy > 1e-6 && y < dashY - 0.005 && z < dashRearZ) {
    if (z + (dz * (dashY - y)) / dy < dashRearZ) return false;
  }
  return dy > -0.05;
}

/** Directions spread over a sphere, for baking: the same every time. */
const SPHERE = Array.from({ length: 64 }, (_, at) => {
  const y = 1 - ((at + 0.5) / 64) * 2;
  const around = at * Math.PI * (3 - Math.sqrt(5));
  const flat = Math.sqrt(1 - y * y);
  return [Math.cos(around) * flat, y, Math.sin(around) * flat] as const;
});

/** How open a point facing `normal` is to the sky, weighed by how square each direction meets it. */
export function opennessAt(shade: CabinShade, point: readonly [number, number, number], normal: readonly [number, number, number]): number {
  let seen = 0;
  let total = 0;
  for (const direction of SPHERE) {
    const facing = direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2];
    if (facing <= 0) continue;
    total += facing;
    if (openTowards(shade, point, direction)) seen += facing;
  }
  return total === 0 ? 0 : seen / total;
}

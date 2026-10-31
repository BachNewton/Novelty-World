import type { V3 } from "../roadside/mesh";
import { lerp } from "./hull";
import type { BoatMesh, BoatPart } from "./mesh";

/*
 * Sails and rigs. A sail is a sheet between a luff and a chord that changes with
 * height, so a jib, a Bermudan main, a gaff, a lug or a sprit are all one shape with
 * different corners: a triangle's chord runs out to nothing at the head, a gaff's to
 * the peak. Its near version is cut in panels with a camber and a twist; its far
 * version is one flat outline.
 *
 * Sailing, `lee` is the side the wind blows to: 1 is +x, so the boom and the jib lie
 * out that way and the boat heels to it.
 */

export type SailColour = "white" | "cream" | "tan" | "laminate" | "red" | "blue";
export type CoverColour = "navy" | "green" | "red" | "grey";

export const sailPart = (colour: SailColour): BoatPart => `sail-${colour}`;
export const coverPart = (colour: CoverColour): BoatPart => `cover-${colour}`;

export interface Sail {
  tack: V3;
  /** The top of the luff. */
  head: V3;
  /** From the tack to the clew. */
  foot: V3;
  /** From the head to the peak; none for a triangular sail. */
  gaff?: V3;
  rows: number;
  columns: number;
  /** The depth of the curve, as a share of the chord. */
  camber: number;
  /** Radians the top of the sail falls off to leeward of the bottom. */
  twist: number;
  /** Metres the leech bows out past straight, at its middle. */
  roachM: number;
  lee: number;
  part: BoatPart;
}

const NONE: V3 = [0, 0, 0];

function turned([x, y, z]: V3, radians: number): V3 {
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return [x * cos - z * sin, y, x * sin + z * cos];
}

/** The sail's corners, by rows up it and columns back from the luff. */
export function sailCorners({ tack, head, foot, gaff = NONE, rows, columns, camber, twist, roachM, lee }: Sail): V3[][] {
  return Array.from({ length: rows + 1 }, (_, row) => {
    const up = row / rows;
    const luff: V3 = [lerp(tack[0], head[0], up), lerp(tack[1], head[1], up), lerp(tack[2], head[2], up)];
    const plain: V3 = [lerp(foot[0], gaff[0], up), lerp(foot[1], gaff[1], up), lerp(foot[2], gaff[2], up)];
    const straight = Math.hypot(plain[0], plain[1], plain[2]);
    const roach = straight === 0 ? 1 : 1 + (roachM * Math.sin(up * Math.PI)) / straight;
    const chord = turned([plain[0] * roach, plain[1] * roach, plain[2] * roach], -twist * up * lee);
    const length = Math.hypot(chord[0], chord[2]);
    return Array.from({ length: columns + 1 }, (__, column) => {
      const back = column / columns;
      const belly = camber * length * Math.sin(Math.PI * back ** 0.75);
      return [luff[0] + chord[0] * back + lee * belly, luff[1] + chord[1] * back, luff[2] + chord[2] * back];
    });
  });
}

/** A sail's near version: panels across it, the leech alive. */
export function nearSail(mesh: BoatMesh, sail: Sail): BoatMesh {
  return mesh.sheet(sailCorners(sail), sail.part, (row) => (row % 2 === 0 ? 1 : 0.955), (row, column) => (row === 0 ? 0 : (column / sail.columns) * 0.8));
}

/** A sail's far version, one flat outline. */
export function farSail(mesh: BoatMesh, sail: Sail): BoatMesh {
  const { tack, head, foot, gaff = NONE, part } = sail;
  const clew: V3 = [tack[0] + foot[0], tack[1] + foot[1], tack[2] + foot[2]];
  const peak: V3 = [head[0] + gaff[0], head[1] + gaff[1], head[2] + gaff[2]];
  return mesh.face(gaff === NONE ? [tack, clew, head] : [tack, clew, peak, head], part);
}

/** The way a boom lies when it's out `degrees` from the centreline, `length` long, aft. */
export function boomOut(length: number, degrees: number, lee: number, droopM = 0): V3 {
  const radians = (degrees * Math.PI) / 180;
  return [lee * Math.sin(radians) * length, -droopM, -Math.cos(radians) * length];
}

export interface BermudanRig {
  mastZ: number;
  /** Where the mast comes through the deck, and its top. */
  footY: number;
  topY: number;
  mastRadius: number;
  /** Height of the gooseneck, and the boom's length. */
  boomY: number;
  boomM: number;
  /** Where the forestay reaches the mast, and comes to the deck. */
  hounceY: number;
  stem: V3;
  /** Foot of the backstay; none for a boat without one. */
  stern: V3 | null;
  /** Where the shrouds come to the deck. */
  chainplate: { x: number; y: number; z: number };
  /** Heights of the spreaders, with their half-spans. */
  spreaders: readonly (readonly [y: number, halfM: number])[];
  mast: BoatPart;
  /** Headsail's clew from the stem, close-hauled, as a vector. */
  jibFoot: V3;
  jibHeadY: number;
}

/** Mast, boom, standing rigging and the running lines that show. */
export function nearBermudan(mesh: BoatMesh, rig: BermudanRig, boom: V3): BoatMesh {
  const { mastZ, footY, topY, mastRadius, boomY, hounceY, stem, stern, chainplate, spreaders, mast } = rig;
  const top: V3 = [0, topY, mastZ];
  mesh.tube([0, footY, mastZ], top, mastRadius, 5, { radiusTo: mastRadius * 0.55, cap: true }, mast);
  mesh.tube([0, boomY, mastZ - 0.05], [boom[0], boomY + boom[1], mastZ + boom[2]], mastRadius * 0.62, 4, { radiusTo: mastRadius * 0.5, cap: true }, mast);
  mesh.line([0, hounceY, mastZ], stem);
  if (stern !== null) mesh.line(top, stern);
  for (const side of [-1, 1]) {
    const foot: V3 = [side * chainplate.x, chainplate.y, chainplate.z];
    let from = foot;
    for (const [y, half] of spreaders) {
      const tip: V3 = [side * half, y, mastZ];
      mesh.tube([0, y, mastZ], tip, 0.018, 3, { radiusTo: 0.012 }, mast);
      mesh.line(from, tip);
      from = tip;
    }
    mesh.line(from, [0, spreaders.length > 0 ? hounceY : topY, mastZ]);
    if (spreaders.length > 0) mesh.line(foot, [0, spreaders[0][0], mastZ]);
  }
  return mesh;
}

/** The far spar: a mast, as a crossed pair of narrow faces. */
export function farMast(mesh: BoatMesh, z: number, footY: number, topY: number, radius: number, part: BoatPart): BoatMesh {
  return mesh
    .face([[-radius, footY, z], [radius, footY, z], [radius * 0.6, topY, z], [-radius * 0.6, topY, z]], part)
    .face([[0, footY, z - radius], [0, footY, z + radius], [0, topY, z + radius * 0.6], [0, topY, z - radius * 0.6]], part);
}

/** A mainsail flaked on its boom under a cover: a tapered bag, fat at the mast. */
export function sailCover(mesh: BoatMesh, mastZ: number, boomY: number, boomM: number, radius: number, part: BoatPart, sides = 5): BoatMesh {
  const y = boomY + radius * 0.7;
  return mesh
    .tube([0, y, mastZ - 0.1], [0, y + radius * 0.1, mastZ - boomM * 0.5], radius * 1.25, sides, { radiusTo: radius }, part)
    .tube([0, y + radius * 0.1, mastZ - boomM * 0.5], [0, y - radius * 0.1, mastZ - boomM * 0.92], radius, sides, { radiusTo: radius * 0.55, cap: true }, part);
}

/** A headsail rolled on its forestay, with its sacrificial strip. */
export function rolledJib(mesh: BoatMesh, from: V3, to: V3, strip: BoatPart): BoatMesh {
  const at = (share: number): V3 => [lerp(from[0], to[0], share), lerp(from[1], to[1], share), lerp(from[2], to[2], share)];
  return mesh.tube(at(0.03), at(0.9), 0.07, 5, { radiusTo: 0.025, cap: true }, strip);
}

/** A spray dodger over a companionway: a canvas hood on hoops, its window dark. `z` is its forward end, on the coachroof. */
export function dodger(mesh: BoatMesh, z: number, baseY: number, halfM: number, tallM: number, longM: number, part: BoatPart): BoatMesh {
  const front: V3[] = [[-halfM, baseY, z], [-halfM * 0.8, baseY + tallM * 0.75, z - longM * 0.25], [-halfM * 0.5, baseY + tallM, z - longM * 0.5], [halfM * 0.5, baseY + tallM, z - longM * 0.5], [halfM * 0.8, baseY + tallM * 0.75, z - longM * 0.25], [halfM, baseY, z]];
  mesh.face(front, part, 1.02);
  mesh.face([[-halfM * 0.72, baseY + tallM * 0.42, z - longM * 0.13 + 0.02], [-halfM * 0.5, baseY + tallM * 0.82, z - longM * 0.34], [halfM * 0.5, baseY + tallM * 0.82, z - longM * 0.34], [halfM * 0.72, baseY + tallM * 0.42, z - longM * 0.13 + 0.02]], "glass");
  for (const side of [-1, 1]) {
    mesh.face([[side * halfM, baseY, z], [side * halfM * 0.5, baseY + tallM, z - longM * 0.5], [side * halfM * 0.5, baseY + tallM * 0.92, z - longM], [side * halfM, baseY, z - longM]], part, 0.94);
  }
  mesh.face([[-halfM * 0.5, baseY + tallM, z - longM * 0.5], [halfM * 0.5, baseY + tallM, z - longM * 0.5], [halfM * 0.5, baseY + tallM * 0.92, z - longM], [-halfM * 0.5, baseY + tallM * 0.92, z - longM]], part, 1.04);
  return mesh;
}

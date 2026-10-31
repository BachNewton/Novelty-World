import { abs, cos, dFdx, dFdy, dot, float, floor, fract, fwidth, max, min, mix, select, sin, smoothstep, texture, vec2, vec3 } from "three/tsl";
import type { Node, Texture } from "three/webgpu";

/*
 * The ground of a town, from a tile's baked surface image (`bake_surface.py`) over
 * the aerial photo, which between buildings is smeared nearest-ground filler. Red,
 * green and blue are signed distances to one bit each of a class, so every edge is
 * ruled and sharp however close the camera is. Alpha is the way the paving runs.
 *
 * Every pattern is worked out in metres from the pixel's place and fades by the size
 * of a pixel on the ground, so it can't shimmer: a joint goes into its surface's
 * average tone, and past `FADE` the whole thing goes back to the photo.
 */

/** Bits of a class: red, green, blue. These match `bake_surface.py`. */
export const CLASS = { none: 0b000, bed: 0b011, lawn: 0b010, gravel: 0b100, slab: 0b110, tarmac: 0b101, cobble: 0b111 } as const;
const RANGE_M = [4, 4, 16] as const;

const FADE = [320, 760] as const;
const DETAIL_FADE = [40, 150] as const;
/** Square, so a street and the one across it lay one lattice: see `_snapped` in the bake. */
const SLAB_M = 0.6;
const JOINT_M = 0.005;
const SETT_LONG_M = 0.17;
const SETT_WIDE_M = 0.12;
const SETT_JOINT_M = 0.012;
const BAY_WIDE_M = 2.6;
const BAY_DEEP_M = 5;
const AISLE_M = 6;
const BAY_LINE_M = 0.06;
const BAY_INSET_M = 0.35;
const EDGING_M = 0.13;
const EDGING_STONE_M = 0.9;
const CONTACT_M = 0.25;
/** A footway's tarmac: paler than a road's, with no traffic to darken it. */
const WALKED_TARMAC = 1.22;
const COARSE_M = 5.3;
const FINE_M = 1.37;
const DRIFT_M = 11.3;
const PHOTO_LIGHT = { hard: 0.3, lawn: 0.55 } as const;
const PHOTO_MIDDLE = { hard: 0.26, lawn: 0.075 } as const;

type Colour = (name: string) => Node<"vec3">;

export interface TownInput {
  /** World x and z of the pixel. */
  place: Node<"vec2">;
  toCamera: Node<"float">;
  /** The tile's surface image, filtered. */
  mask: Node<"vec4">;
  /** That image's alpha at the nearest texel, 0 to 1: a direction can't be filtered. */
  angle: Node<"float">;
  /** What the land already is: everything beyond a town, and all of it far off. */
  ground: Node<"vec3">;
  /** The photo in linear light, blurred to a few metres, so its streaks are gone and its big shadows stay. */
  photoSoft: Node<"vec3">;
  colour: Colour;
  detail: Texture;
}

const hash = (cell: Node<"vec2">) => {
  const mixed = fract(vec3(cell.x, cell.y, cell.x).mul(0.1031));
  const stirred = mixed.add(dot(mixed, mixed.yzx.add(33.33)));
  return fract(stirred.x.add(stirred.y).mul(stirred.z));
};

const metres = (value: Node<"float">, reach: number) => value.mul(255).sub(127.5).div(127.5).mul(reach);
const edgeShare = (distance: Node<"float">) => {
  const blur = fwidth(distance).max(0.012);
  return smoothstep(blur.negate(), blur, distance);
};
const fadeBy = (pixel: Node<"float">, from: number, to: number) => float(1).sub(smoothstep(float(from), float(to), pixel));
const fromJointOf = (at: Node<"float">, size: number) => float(0.5).sub(abs(fract(at).sub(0.5))).mul(size);

interface Run {
  /** Metres along and across the way the paving runs. */
  u: Node<"float">;
  v: Node<"float">;
  /** The size of a pixel on the ground, along each. */
  pixelU: Node<"float">;
  pixelV: Node<"float">;
  tone: Node<"vec4">;
  colour: Colour;
  shown: Node<"float">;
}

/** A pixel's place on axes at an angle, with pixel sizes taken from the place, so they don't jump where the direction does. */
function runOf(place: Node<"vec2">, angle: Node<"float">) {
  const turn = angle.mul(Math.PI);
  // The bake's angle is in (east, north), and the scene's z is south.
  const [c, s] = [cos(turn), sin(turn).negate()];
  const [dx, dy] = [dFdx(place), dFdy(place)];
  return {
    u: place.x.mul(c).add(place.y.mul(s)),
    v: place.y.mul(c).sub(place.x.mul(s)),
    pixelU: abs(dx.x.mul(c).add(dx.y.mul(s))).add(abs(dy.x.mul(c).add(dy.y.mul(s)))),
    pixelV: abs(dx.y.mul(c).sub(dx.x.mul(s))).add(abs(dy.y.mul(c).sub(dy.x.mul(s)))),
  };
}

/** Concrete flags, each its own shade, with a thin sunk joint. */
function slabs({ u, v, pixelU, pixelV, tone, colour, shown }: Run): Node<"vec3"> {
  const [cellU, cellV] = [u.div(SLAB_M), v.div(SLAB_M)];
  const fromEnd = fromJointOf(cellU, SLAB_M);
  const fromSide = fromJointOf(cellV, SLAB_M);
  const pixel = max(pixelU, pixelV);
  const joint = max(float(1).sub(smoothstep(float(JOINT_M), float(JOINT_M).add(pixelU), fromEnd)), float(1).sub(smoothstep(float(JOINT_M), float(JOINT_M).add(pixelV), fromSide))).mul(fadeBy(pixel, 0.02, 0.09));
  const roll = hash(vec2(floor(cellU), floor(cellV)));
  const shaded = mix(colour("town-slab"), colour("town-slab-pale"), mix(float(0.5), roll.mul(0.5).add(0.25), fadeBy(pixel, 0.06, 0.25)));
  const stained = shaded.mul(float(1).add(tone.a.sub(0.5).mul(0.22)).add(tone.g.sub(0.5).mul(0.16).mul(shown)));
  return mix(stained, colour("town-joint"), joint.mul(0.55));
}

/** Granite setts in courses, each a low dome of its own stone. */
function setts({ u, v, pixelU, pixelV, tone, colour, shown }: Run): Node<"vec3"> {
  const row = floor(v.div(SETT_WIDE_M));
  const along = u.div(SETT_LONG_M).add(fract(row.mul(0.618)));
  const fromJoint = min(fromJointOf(along, SETT_LONG_M), fromJointOf(v.div(SETT_WIDE_M), SETT_WIDE_M));
  const pixel = max(pixelU, pixelV);
  const near = fadeBy(pixel, 0.008, 0.035);
  const roll = hash(vec2(floor(along), row));
  const stone = mix(colour("town-sett"), colour("town-sett-warm"), mix(float(0.25), smoothstep(float(0.5), float(0.95), roll).mul(0.55), near));
  const dome = float(0.8).add(smoothstep(float(0), float(0.045), fromJoint).mul(0.3));
  const tumbled = stone.mul(mix(float(0.96), dome.mul(float(0.9).add(roll.mul(0.2))), near)).mul(float(1).add(tone.a.sub(0.5).mul(0.2)).add(tone.g.sub(0.5).mul(0.14).mul(shown)));
  return mix(tumbled, colour("town-joint"), float(1).sub(smoothstep(float(SETT_JOINT_M), float(SETT_JOINT_M).add(pixel), fromJoint)).mul(near).mul(0.6));
}

/** Sealed tarmac, with white bay lines in rows round the lot, read from the lot's own distance field. */
function tarmac({ u, v, pixelU, tone, colour, shown }: Run, fromEdge: Node<"float">): Node<"vec3"> {
  const asphalt = colour("surface-asphalt").mul(float(1).add(tone.g.sub(0.5).mul(0.3).mul(shown)).add(tone.a.sub(0.5).mul(0.22)));
  // The distance's slope on the lot's axes: a row runs only along an edge that lies with the lot.
  const [dx, dy] = [dFdx(fromEdge), dFdy(fromEdge)];
  const [ux, uy, vx, vy] = [dFdx(u), dFdy(u), dFdx(v), dFdy(v)];
  const det = ux.mul(vy).sub(vx.mul(uy));
  const alongSlope = abs(dx.mul(vy).sub(vx.mul(dy)).div(det));
  const acrossSlope = abs(ux.mul(dy).sub(dx.mul(uy)).div(det));
  const period = BAY_DEEP_M * 2 + AISLE_M;
  const inPeriod = fract(fromEdge.div(period)).mul(period);
  const firstRow = smoothstep(float(BAY_INSET_M), float(BAY_INSET_M + 0.05), inPeriod).mul(float(1).sub(smoothstep(float(BAY_DEEP_M - 0.05), float(BAY_DEEP_M), inPeriod)));
  const secondRow = smoothstep(float(BAY_DEEP_M + AISLE_M), float(BAY_DEEP_M + AISLE_M + 0.05), inPeriod);
  const onBay = firstRow.add(secondRow).min(1).mul(smoothstep(float(1.8), float(3.2), acrossSlope.div(alongSlope.max(0.001))));
  const fromLine = fromJointOf(u.div(BAY_WIDE_M), BAY_WIDE_M);
  const paint = float(1).sub(smoothstep(float(BAY_LINE_M), float(BAY_LINE_M).add(pixelU.mul(1.5)), fromLine));
  // A line under a pixel across goes to a share of itself rather than breaking into dashes.
  const lineLeft = min(float(1), float(BAY_LINE_M * 2).div(pixelU.max(0.001)));
  const worn = smoothstep(float(0.3), float(0.5), tone.g.mul(0.5).add(tone.a.mul(0.5))).mul(0.35).add(0.65);
  return mix(asphalt, colour("road-paint"), paint.mul(onBay).mul(worn).mul(lineLeft).mul(fadeBy(pixelU, 0.2, 0.7)));
}

function gravelled(tone: Node<"vec4">, fineTone: Node<"vec4">, drift: Node<"float">, colour: Colour, shown: Node<"float">): Node<"vec3"> {
  const stones = fineTone.g.sub(0.5).mul(0.85).add(tone.g.sub(0.5).mul(0.5)).mul(shown);
  return mix(colour("town-yard"), colour("surface-gravel"), smoothstep(float(0.4), float(0.65), drift)).mul(float(1).add(stones));
}

function lawned(tone: Node<"vec4">, fineTone: Node<"vec4">, drift: Node<"float">, colour: Colour, shown: Node<"float">): Node<"vec3"> {
  const blades = fineTone.r.sub(0.5).mul(0.6).add(tone.r.sub(0.5).mul(0.4)).mul(shown);
  const dry = smoothstep(float(0.35), float(0.8), drift.mul(0.7).add(tone.a.mul(0.3)));
  return mix(colour("town-lawn"), colour("town-lawn-dry"), dry.mul(0.35)).mul(float(1).add(blades));
}

const luminance = (color: Node<"vec3">) => dot(color, vec3(0.2126, 0.7152, 0.0722));

/** The colour of the town's ground at this pixel, over whatever `ground` is. */
export function townGround({ place, toCamera, mask, angle, ground, photoSoft, colour, detail }: TownInput): Node<"vec3"> {
  const shown = float(1).sub(smoothstep(float(DETAIL_FADE[0]), float(DETAIL_FADE[1]), toCamera));
  const near = float(1).sub(smoothstep(float(FADE[0]), float(FADE[1]), toCamera));
  const tone = texture(detail, place.div(COARSE_M).add(vec2(0.61, 0.17)));
  const fineTone = texture(detail, place.div(FINE_M).add(vec2(0.13, 0.57)));
  const drift = texture(detail, place.div(DRIFT_M)).a;

  const [red, green, blue] = [metres(mask.r, RANGE_M[0]), metres(mask.g, RANGE_M[1]), metres(mask.b, RANGE_M[2])];
  // Grass against gravel has no ruled edge: where red and green turn together, the line wanders.
  const wander = tone.a.sub(0.5).mul(1.4).add(fineTone.r.sub(0.5).mul(0.3)).mul(float(1).sub(smoothstep(float(0.4), float(1.6), max(abs(green), abs(red)))));
  const [hard, leafy, tarred] = [edgeShare(red.add(wander)), edgeShare(green.sub(wander)), edgeShare(blue)];
  const [notHard, notLeafy, notTarred] = [float(1).sub(hard), float(1).sub(leafy), float(1).sub(tarred)];
  const lawnShare = notHard.mul(leafy).mul(notTarred);
  const bedShare = notHard.mul(leafy).mul(tarred);
  const gravelShare = hard.mul(notLeafy).mul(notTarred);
  const slabShare = hard.mul(leafy).mul(notTarred);
  const tarmacShare = hard.mul(notLeafy).mul(tarred);
  const settShare = hard.mul(leafy).mul(tarred);

  const axes = runOf(place, angle);
  const run: Run = { ...axes, tone, colour, shown };
  const hardLot = slabs(run).mul(slabShare).add(setts(run).mul(settShare)).add(tarmac(run, blue).mul(tarmacShare)).add(gravelled(tone, fineTone, drift, colour, shown).mul(gravelShare));
  const greenLot = lawned(tone, fineTone, drift, colour, shown).mul(lawnShare).add(colour("town-bed").mul(float(1).add(fineTone.a.sub(0.5).mul(0.7))).mul(bedShare));

  // Light from the photo, kept broad: the shade of a big tree stays, the filler's streaks don't.
  const measured = luminance(photoSoft);
  const lawnLight = mix(float(1), measured.div(PHOTO_MIDDLE.lawn).clamp(0.5, 1.15), PHOTO_LIGHT.lawn);
  const hardLight = mix(float(1), measured.div(PHOTO_MIDDLE.hard).clamp(0.55, 1.1), PHOTO_LIGHT.hard);
  const lit = hardLot.mul(hardLight).add(greenLot.mul(lawnLight));

  // A stone edging on the hard side of a line with something softer, and its contact shadow on the other.
  const onHard = hard.mul(max(leafy, tarred));
  const blur = fwidth(red).max(0.012);
  const edging = float(1).sub(smoothstep(float(EDGING_M).sub(blur), float(EDGING_M).add(blur), red)).mul(onHard).mul(fadeBy(axes.pixelV, 0.1, 0.45));
  const fromStone = fromJointOf(axes.u.div(EDGING_STONE_M), EDGING_STONE_M);
  const stoneJoint = float(1).sub(smoothstep(float(0.006), float(0.014).add(axes.pixelU), fromStone)).mul(0.4).mul(shown);
  const kerbStone = colour("surface-kerb").mul(float(1).add(fineTone.b.sub(0.5).mul(0.22))).mul(float(1).sub(stoneJoint));
  const contact = float(1).sub(smoothstep(float(0), float(CONTACT_M), red.negate().max(0))).mul(notHard).mul(smoothstep(float(0.5), float(1), abs(green)));
  const edged = mix(lit.mul(float(1).sub(contact.mul(0.28))), kerbStone, edging);

  const classed = lawnShare.add(bedShare).add(gravelShare).add(slabShare).add(tarmacShare).add(settShare);
  return mix(ground, edged.add(ground.mul(float(1).sub(classed))), near);
}

export interface RibbonInput {
  place: Node<"vec2">;
  toCamera: Node<"float">;
  /** The surface image's angle here, so paving runs straight on from the terrain's. */
  angle: Node<"float">;
  /** The class's three bits, red, green, blue, from `townRibbonBits`. */
  bits: Node<"vec3">;
  /** What the road's own dress drew. */
  carriageway: Node<"vec3">;
  colour: Colour;
  detail: Texture;
}

/** A street or path's own surface, on its ribbon, on the same lattice as the terrain's paving beside it. */
export function townRibbon({ place, toCamera, angle, bits, carriageway, colour, detail }: RibbonInput): { carriageway: Node<"vec3">; claimed: Node<"float"> } {
  const shown = float(1).sub(smoothstep(float(DETAIL_FADE[0]), float(DETAIL_FADE[1]), toCamera));
  const tone = texture(detail, place.div(COARSE_M).add(vec2(0.61, 0.17)));
  const fineTone = texture(detail, place.div(FINE_M).add(vec2(0.13, 0.57)));
  const [isR, isG, isB] = [bits.r.greaterThan(0.5), bits.g.greaterThan(0.5), bits.b.greaterThan(0.5)];
  const run: Run = { ...runOf(place, angle), tone, colour, shown };
  const paved = select(isB, setts(run), slabs(run));
  const soft = select(isG, lawned(tone, fineTone, tone.a, colour, shown), select(isB, tarmac(run, float(0)).mul(WALKED_TARMAC), gravelled(tone, fineTone, tone.a, colour, shown)));
  const claimed = select(isR.or(isG), float(1), float(0));
  return { carriageway: mix(carriageway, select(isR.and(isG), paved, soft), claimed), claimed };
}

/** Each ribbon vertex's class as three floats, from a class per section. They interpolate, and a shader's test at a half makes a clean change between sections. */
export function townRibbonBits(classes: Uint8Array, ringPoints: number): Float32Array {
  const bits = new Float32Array(classes.length * ringPoints * 3);
  classes.forEach((surface, section) => {
    for (let point = 0; point < ringPoints; point++) {
      bits.set([(surface >> 2) & 1, (surface >> 1) & 1, surface & 1], (section * ringPoints + point) * 3);
    }
  });
  return bits;
}

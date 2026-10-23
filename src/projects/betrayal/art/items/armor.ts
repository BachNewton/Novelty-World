import * as THREE from "three";
import { sculpt, smoothMin, type Solid, type Vec3 } from "../forms";
import { figureParts } from "../figure-parts";
import { bandAt, CHEST_MIDDLE, middleOf, outIn, SECTION_POWER, type ChestFit } from "../explorers/figure";
import { SHINES } from "../shine";
import { assembled, piece, taper, taperedTo, wornModel } from "./item";

/*
 * The Armor (item): a knight's polished steel cuirass, a breastplate and a
 * backplate buckled together at the waist, worn over the explorer's own
 * clothes, rows of dark rivets along its edges and lames across its belly.
 * Its one-second read is a bright steel chest, a ridge down its front
 * catching the light and its rolled edges glinting, on a figure whose shoulders,
 * sleeves and legs still wear their own colours: the plates leave the
 * shoulders bare and the sides open under the arms, so the clothing that
 * tells one explorer from another stays in view. No other card is worn on
 * the chest.
 *
 * It is sculpted once, round a reference torso (Professor Longfellow's), and
 * stretched to each figure's (`taperedTo`): as wide, as deep and as tall as
 * their torso between the waist, the chest and the neck.
 */

/** The torso it is sculpted round: Longfellow's, as his coat's fit measures it. */
const REFERENCE: ChestFit = {
  waist: { y: 0.08, halfWidth: 0.145, back: -0.113, front: 0.123 },
  chest: { y: 0.28, halfWidth: 0.168, back: -0.126, front: 0.128 },
  neck: { y: 0.44, halfWidth: 0.168, back: -0.098, front: 0.113 },
};

/** How the plates stand off the torso, in metres at the reference: the gap under them, their thickness, the ridge down the front, the rolled edges. */
const PLATE = { gap: 0.007, thick: 0.008, ridge: 0.007, roll: 0.004, rollWidth: 0.012, round: 0.004 };
/** How far round the torso the plates reach to either side, as a share of its half-width: under the arms, and where the armholes curve in to keep between the shoulders. */
const SIDES = 0.96;
const ARMHOLE = 0.06;
/** Where the plates end: the hem a little below the waist's band, the neckline scooped in front and less behind. */
const HEM = 0.01;
const SCOOP = { front: 0.035, back: 0.015, across: 0.06 };
/** The lames across the breastplate's belly: grooves, each this deep and wide, so it reads as plate, not a bib. */
const LAMES = { at: [0.035, 0.075], deep: 0.0028, wide: 0.0035 };
/** The leather straps buckling the plates together at each side: from the waist's band up, and how far onto each plate they reach. */
const STRAP = { low: 0.012, high: 0.042, onto: 0.025, thick: 0.005 };

/** A rounded intersection: the larger of two distances, its corner eased over `round`. */
const meet = (a: number, b: number, round = PLATE.round) => -smoothMin(-a, -b, round);

/** How far round the torso the plates reach to either side at a height, as a share of its half-width: under the arms,
 *  curving in above the chest to keep between the shoulders. */
function reachAt(y: number): number {
  const chest = REFERENCE.chest;
  const t = THREE.MathUtils.clamp((y - chest.y) / (REFERENCE.neck.y - chest.y), 0, 1);
  const middle = CHEST_MIDDLE.chest + (CHEST_MIDDLE.neck - CHEST_MIDDLE.chest) * t - 0.08;
  const curve = THREE.MathUtils.smoothstep(y, chest.y - ARMHOLE, chest.y);
  return SIDES + (middle - SIDES) * curve;
}

/** Where a point is about the torso at its height: how far out from its surface (radially), how far round it to the
 *  side (the share of its half-width it would lie at, brought onto the section), and whether it is in front. */
function about(x: number, y: number, z: number) {
  const band = bandAt(REFERENCE, y);
  const { centre } = middleOf(band);
  const out = Math.max(outIn(band, x, z), 1e-6);
  const radius = Math.hypot(x, z - centre);
  return { off: radius * (1 - 1 / out), round: Math.abs(x) / band.halfWidth / out, width: band.halfWidth, front: z > centre };
}

const BOUNDS: Pick<Solid, "min" | "max"> = { min: [-0.2, REFERENCE.waist.y - HEM - 0.02, -0.16], max: [0.2, REFERENCE.neck.y + 0.02, 0.17] };

/** How far inside a plate's outline a point is (negative inside): its sides, cut square to the plate, its neckline, its hem. */
function outline(x: number, y: number, { round, width, front }: ReturnType<typeof about>): number {
  const scoop = (front ? SCOOP.front : SCOOP.back) * Math.max(0, 1 - (x / SCOOP.across) ** 2);
  return meet(meet((round - reachAt(y)) * width, y - (REFERENCE.neck.y - scoop)), REFERENCE.waist.y - HEM - y);
}

/** The two plates: a shell standing off the torso, thicker along a ridge down the breastplate's middle and at its rolled
 *  edges, with lames grooved across its belly. */
const plates: Solid = {
  ...BOUNDS,
  distance: (x, y, z) => {
    const place = about(x, y, z);
    const edge = outline(x, y, place);
    const ridge = place.front && y < REFERENCE.neck.y - SCOOP.front ? PLATE.ridge * Math.max(0, 1 - Math.abs(x) / 0.026) ** 2 : 0;
    const rolled = PLATE.roll * (1 - THREE.MathUtils.smoothstep(-edge, 0, PLATE.rollWidth));
    const grooved = place.front ? Math.max(0, ...LAMES.at.map((at) => LAMES.deep * (1 - (Math.abs(y - REFERENCE.waist.y - at) / LAMES.wide) ** 2))) : 0;
    const outside = PLATE.gap + PLATE.thick + ridge + rolled - grooved;
    return meet(Math.max(place.off - outside, PLATE.gap - place.off), edge);
  },
};

/** The straps at each side: a band across the open side under each arm, onto the edges of both plates, over them. */
const straps: Solid = {
  ...BOUNDS,
  distance: (x, y, z) => {
    const place = about(x, y, z);
    const lifted = PLATE.gap + PLATE.thick + PLATE.roll;
    const low = REFERENCE.waist.y + STRAP.low;
    const high = REFERENCE.waist.y + STRAP.high;
    return Math.max(place.off - lifted - STRAP.thick, lifted - 0.002 - place.off, low - y, y - high, (reachAt(y) - place.round) * place.width - STRAP.onto);
  },
};

/** Where each strap's end lies on a plate: the joints the clipping check allows. */
const STRAP_ENDS: Vec3[] = [-1, 1].flatMap((side) => {
  const y = REFERENCE.waist.y + (STRAP.low + STRAP.high) / 2;
  const band = bandAt(REFERENCE, y);
  const { centre, depth } = middleOf(band);
  const share = reachAt(y) - STRAP.onto / 2 / band.halfWidth;
  const across = (1 - share ** SECTION_POWER) ** (1 / SECTION_POWER);
  return [1, -1].map((facing): Vec3 => [side * share * band.halfWidth, y, centre + facing * depth * across]);
});

/** Rivets along the hem and the neckline, a row of dark heads just in from each edge: how far apart, how far in, how big. */
const RIVETS = { apart: 0.03, in: 0.011, radius: 0.0036 };

/** Where the rivets are painted: inside a rivet's head (negative), or not. */
function rivets(x: number, y: number, z: number): number {
  const { front } = about(x, y, z);
  const scoop = (front ? SCOOP.front : SCOOP.back) * Math.max(0, 1 - (x / SCOOP.across) ** 2);
  const along = (x / RIVETS.apart - Math.round(x / RIVETS.apart)) * RIVETS.apart;
  const hem = y - (REFERENCE.waist.y - HEM) - RIVETS.in;
  const top = REFERENCE.neck.y - scoop - y - RIVETS.in;
  const nearest = Math.min(Math.abs(hem), REFERENCE.chest.y < y ? Math.abs(top) : Infinity);
  return Math.hypot(along, nearest) - RIVETS.radius;
}

const PARTS = figureParts("item:armor", () => ({
  steel: sculpt().add(plates, "stoneLight").paint(rivets, "ash").geometry(0.0045),
  leather: sculpt().add(straps, "woodMid").geometry(0.003),
}));

/** The cuirass fitted to a torso, in its part's frame. */
function cuirass(fit: ChestFit): THREE.Group {
  const parts = PARTS.get();
  const steel = piece(taperedTo(parts.steel, REFERENCE, fit), "armor plates", SHINES.silver);
  const leather = piece(taperedTo(parts.leather, REFERENCE, fit), "armor straps");
  const { warp } = taper(REFERENCE, fit);
  const radius = 0.04 * (fit.chest.halfWidth / REFERENCE.chest.halfWidth);
  return assembled(
    "armor",
    [steel, leather],
    STRAP_ENDS.map((end) => ({ between: [steel, leather], at: [...warp(...end)], radius })),
  );
}

export const ARMOR = wornModel({
  card: "armor",
  parts: [PARTS],
  worn: {
    slot: "chest",
    reference: REFERENCE,
    build: cuirass,
    // What lies on the chest (a scarf's ends, a pack and its straps) is lifted out over the plates.
    lifts: (fit) => {
      const { centre, depth } = middleOf(fit.chest);
      const scale = fit.chest.halfWidth / REFERENCE.chest.halfWidth;
      const proud = (PLATE.gap + PLATE.thick + PLATE.roll + 0.004) * scale;
      return { about: new THREE.Vector3(0, 0, centre), scale: new THREE.Vector3(1 + proud / fit.chest.halfWidth, 1, 1 + proud / depth) };
    },
  },
  // On the floor it stands upright, as armour stands on display: a cuirass lying on its back reads as a shell.
  plate: { lie: new THREE.Euler(0, 0, 0), spin: 0.5 },
});

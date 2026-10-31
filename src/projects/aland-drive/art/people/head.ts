import type { FigureSpec, HairStyle } from "./figure";
import type { Part } from "./parts";
import type { Posed } from "./poses";
import { inFrame, pitched, type Body, type Frame, type V3 } from "./skeleton";
import { ringIn, type Rig, type Ring, type Soup } from "./soup";

/*
 * A head, its hair and its hat, all fitted to one skull.
 *
 * Hair is a mass laid on the skull's own surface, one column at each of eight bearings
 * round the head. A style says how far down each column runs, which is its hairline,
 * and how far the mass stands proud. So hair can't sit off the skull, the crown can't
 * spike, and the face stays open because no column is ever asked to cross it.
 *
 * What hangs past the neck is pinned to the chest at its lower end and to the head at
 * its upper, so it lies on the back in every pose and stretches a little as the head
 * turns, instead of swinging through the shoulders.
 *
 * Heights are in metres on a nominal adult's head, from the chin: `headScale` sizes
 * them and `headWide` narrows or broadens them across.
 */

/** Height, half width, half depth and forward shift of the skull's rings. */
const SKULL_RINGS: readonly (readonly [number, number, number, number])[] = [
  [0.004, 0.034, 0.038, 0.022],
  [0.04, 0.056, 0.069, 0.018],
  [0.095, 0.075, 0.092, 0.006],
  [0.155, 0.079, 0.098, 0],
  [0.2, 0.058, 0.072, -0.004],
];
const SKULL_TOP = 0.222;
const HEAD_SIDES = 7;

/** A column of eight stands this far out at least: the flats between columns then still clear the skull's seven corners. */
export const CLEAR = 1.085;
/** Where the crown's first row runs, level all round, so the top reads as a dome and not a gable. */
const CROWN_Y = 0.222;
const CROWN_TOP_Y = 0.24;
/** The skull's widest ring, which the dome rounds over from, and where a hanging style stops following the jaw in. */
const DOME_FROM_Y = 0.155;
const DOME_UP_M = 0.085;
const JAW_Y = 0.095;

/** Bearings from the nose, towards the figure's left. */
const BEARINGS = [22.5, 67.5, 112.5, 157.5] as const;

type Hairline = readonly [front: number, temple: number, ear: number, nape: number];

interface Mass {
  hairline: Hairline;
  /** The right side's, where it differs. */
  hairlineRight?: Hairline;
  /** How far it stands off the skull; a right-hand figure where the sides differ. */
  liftM: number;
  liftRightM?: number;
  /** An uneven surface, turn and turn about, for curls. */
  bumpM?: number;
  /** Hangs straight past the jaw rather than following the skull in. */
  hangs?: boolean;
  /** Where the crown sits, across the head. */
  crownX?: number;
  /** Bald on top: the mass starts here, not at a crown. */
  starts?: Hairline;
  /** Its lower edge turns back in under itself, for a style seen from below. */
  lip?: boolean;
}

const CROP: Mass = { hairline: [0.178, 0.13, 0.09, 0.076], liftM: 0.005 };

const MASSES: Record<Exclude<HairStyle, "bald">, Mass> = {
  crop: CROP,
  "side-part": { hairline: [0.19, 0.145, 0.092, 0.076], hairlineRight: [0.158, 0.118, 0.09, 0.076], liftM: 0.005, liftRightM: 0.01, crownX: 0.012 },
  curly: { hairline: [0.166, 0.116, 0.082, 0.066], liftM: 0.015, bumpM: 0.0038 },
  set: { hairline: [0.172, 0.104, 0.074, 0.058], liftM: 0.012, bumpM: 0.0015 },
  receding: { hairline: [0.17, 0.112, 0.082, 0.07], starts: [0.17, 0.148, 0.158, 0.168], liftM: 0.004 },
  bob: { hairline: [0.178, 0.105, 0.02, 0.03], liftM: 0.009, hangs: true, lip: true },
  long: { hairline: [0.182, 0.11, 0.045, 0.05], liftM: 0.008, hangs: true },
  ponytail: { hairline: [0.178, 0.13, 0.092, 0.08], liftM: 0.005 },
  bun: { hairline: [0.178, 0.13, 0.092, 0.08], liftM: 0.005 },
};

/** Just proud of the skin: the clean top edge of a mass round a bald crown. */
const SCALP_EDGE_M = 0.001;
/** Under the skin: where a mass goes to vanish, along a bare scalp. */
const SCALP_LIFT_M = -0.022;

const HAT_LINES = { none: Infinity, cap: 0.16, "sun-hat": 0.168, helmet: 0.135 } as const;
const ROWS = [0, 0.5, 1] as const;
/** Under a hat a mass runs straight from its band: a row part way down would leave skin between them. */
const COVERED_ROWS = [0, 1] as const;
const LIP_INSET = 0.82;


const massOf = (style: HairStyle): Mass | undefined => (style === "bald" ? undefined : MASSES[style]);

export function drawHead(soup: Soup, frame: Frame, body: Body, { skin, hair: style, hat }: FigureSpec) {
  const s = body.headScale;
  const rings = SKULL_RINGS.map(([y, x, z, shift]) => ringIn(frame, y * s, x * s * body.headWide, z * s, shift * s));
  soup.loft(rings, skin, { sides: HEAD_SIDES, turn: 0, capStart: true });
  // Hair or a hat hides the crown, so only a bare head pays for one.
  if (hat === "none" && (style === "bald" || style === "receding")) soup.tip(rings[rings.length - 1], inFrame(frame, 0, SKULL_TOP * s, -0.004 * s), skin, HEAD_SIDES, 0);
}

/** The skull's half width, half depth and forward shift at a height, rounded over at the top for hair to lie on. */
function skullAt(y: number): readonly [number, number, number] {
  if (y >= DOME_FROM_Y) {
    const round = Math.sqrt(Math.max(0, 1 - ((y - DOME_FROM_Y) / DOME_UP_M) ** 2));
    return [0.079 * round, 0.098 * round, -0.002];
  }
  const upper = SKULL_RINGS.findIndex(([ringY]) => ringY >= y);
  if (upper <= 0) return [SKULL_RINGS[0][1], SKULL_RINGS[0][2], SKULL_RINGS[0][3]];
  const [from, to] = [SKULL_RINGS[upper - 1], SKULL_RINGS[upper]];
  const share = (y - from[0]) / (to[0] - from[0]);
  return [from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share, from[3] + (to[3] - from[3]) * share];
}

/** A point on the mass at a bearing and height, in the head's frame before scaling. */
function surface(bearingDeg: number, y: number, liftM: number, hangs: boolean, wide: number): V3 {
  const [halfWide, halfDeep, shift] = skullAt(hangs ? Math.max(y, JAW_Y) : y);
  const bearing = (bearingDeg * Math.PI) / 180;
  return [Math.sin(bearing) * (halfWide * CLEAR * wide + liftM), y, shift + Math.cos(bearing) * (halfDeep * CLEAR + liftM)];
}

function mass(soup: Soup, frame: Frame, body: Body, { hairline, hairlineRight = hairline, liftM, liftRightM = liftM, bumpM = 0, hangs = false, crownX = 0, starts, lip = false }: Mass, hatLine: number, part: Part) {
  const s = body.headScale;
  const wide = body.headWide;
  const column = (bearing: number, edge: number, start: number | undefined, lift: number) => ({ bearing, edge, start: start ?? CROWN_Y, lift: start !== undefined && start - edge < 0.01 ? SCALP_LIFT_M : lift });
  const columns = [...BEARINGS.map((bearing, at) => column(bearing, hairline[at], starts?.[at], liftM)), ...[...BEARINGS].reverse().map((bearing, at) => column(-bearing, hairlineRight[3 - at], starts?.[3 - at], liftRightM))];
  const placed = (at: V3): V3 => inFrame(frame, at[0] * s, at[1] * s, at[2] * s);
  const covered = hatLine !== Infinity;
  const row = (share: number, index: number) =>
    columns.map(({ bearing, edge, start, lift }, at) => {
      const bump = ((at + index) % 2 === 0 ? 1 : -1) * bumpM;
      return placed(surface(bearing, Math.min(start + (edge - start) * share, hatLine), lift + bump, hangs, wide));
    });
  const under = columns.map(({ bearing, edge, lift }) => {
    const y = Math.min(edge, hatLine);
    const [x, , z] = surface(bearing, y, lift, hangs, wide);
    return placed([x * LIP_INSET, y + 0.006, z * LIP_INSET]);
  });
  const rows = (covered ? COVERED_ROWS : ROWS).map((share, index) => row(share, index));
  if (!covered && starts === undefined) soup.fan(placed([crownX, CROWN_TOP_Y + liftM, -0.002]), rows[0], part);
  if (!covered && starts !== undefined) rows[0] = columns.map(({ bearing, start, lift }) => placed(surface(bearing, start, Math.min(lift, SCALP_EDGE_M), false, wide)));
  soup.bands(lip && !covered ? [...rows, under] : rows, part);
}

/** Long hair down the back: the head holds its top, the chest the rest. */
function drape(soup: Soup, { head, chest }: Posed, body: Body, part: Part, headRig: Rig, chestRig: Rig) {
  const s = body.headScale;
  const chestUp = body.shoulderUp - body.waistUp;
  const clear = 0.03 * body.scale;
  const back = body.chestZ - 0.012;
  const rings: (Ring & { rig: Rig })[] = [
    { ...ringIn(head, 0.1 * s, 0.078 * s * body.headWide, 0.05 * s, -0.052 * s), rig: headRig },
    { ...ringIn(chest, chestUp * 1.04, body.shoulderX * 0.46, 0.02, -(body.shoulderZ + clear)), rig: chestRig },
    { ...ringIn(chest, chestUp * 0.56, body.shoulderX * 0.42, 0.016, -(back + clear)), rig: chestRig },
  ];
  soup.strand(rings, inFrame(chest, 0, chestUp * 0.52, -(back + clear)), part, 5);
}

function ponytail(soup: Soup, { head, chest }: Posed, body: Body, part: Part, headRig: Rig, chestRig: Rig) {
  const s = body.headScale;
  const chestUp = body.shoulderUp - body.waistUp;
  const rings: (Ring & { rig: Rig })[] = [
    { ...ringIn(head, 0.125 * s, 0.03 * s, 0.03 * s, -0.098 * s), rig: headRig },
    { ...ringIn(head, 0.045 * s, 0.03 * s, 0.026 * s, -0.128 * s), rig: headRig },
    { ...ringIn(chest, chestUp * 1.06, 0.026 * s, 0.022 * s, -(body.shoulderZ + 0.03 * body.scale)), rig: chestRig },
  ];
  soup.strand(rings, inFrame(chest, 0, chestUp * 0.98, -(body.shoulderZ + 0.03 * body.scale)), part, 4);
}

function bun(soup: Soup, frame: Frame, body: Body, part: Part) {
  const s = body.headScale;
  const tilted = pitched({ ...frame, at: inFrame(frame, 0, 0.196 * s, -0.062 * s) }, -0.8);
  const rings = [ringIn(tilted, 0, 0.03 * s, 0.03 * s), ringIn(tilted, 0.03 * s, 0.046 * s, 0.046 * s), ringIn(tilted, 0.062 * s, 0.03 * s, 0.03 * s)];
  soup.loft(rings, part, { sides: 5 });
  soup.tip(rings[2], inFrame(tilted, 0, 0.078 * s, 0), part, 5);
}

/** All of a person's hair, whatever hat is on it. */
export function drawHair(soup: Soup, pose: Posed, body: Body, spec: FigureSpec, headRig: Rig, chestRig: Rig) {
  const { hair: style, hat, hairColour: part } = spec;
  const fitted = massOf(style);
  if (fitted === undefined) return;
  soup.rigged(headRig, () => {
    mass(soup, pose.head, body, fitted, HAT_LINES[hat], part);
    if (style === "bun" && hat === "none") bun(soup, pose.head, body, part);
  });
  if (style === "long") drape(soup, pose, body, part, headRig, chestRig);
  if (style === "ponytail") ponytail(soup, pose, body, part, headRig, chestRig);
}

export function drawHat(soup: Soup, frame: Frame, body: Body, { hat: kind, hair: style, colours }: FigureSpec) {
  const s = body.headScale;
  const wide = body.headWide;
  const room = Math.max(0, (massOf(style)?.liftM ?? 0) + (massOf(style)?.bumpM ?? 0) - 0.005);
  const ring = (y: number, x: number, z: number, shift: number) => ringIn(frame, y * s, (x + room) * s * wide, (z + room) * s, shift * s);
  if (kind === "cap") {
    const y = HAT_LINES.cap;
    soup.loft([ring(y, 0.09, 0.11, -0.004), ring(0.21, 0.08, 0.098, -0.006), ring(0.245, 0.032, 0.04, -0.008)], colours.hat, { sides: 7, turn: 0, capEnd: true });
    const front = 0.104 + room;
    const [left, right, tipLeft, tipRight] = [inFrame(frame, 0.076 * wide * s, (y + 0.004) * s, 0.07 * s), inFrame(frame, -0.076 * wide * s, (y + 0.004) * s, 0.07 * s), inFrame(frame, 0.056 * s, (y - 0.016) * s, (front + 0.075) * s), inFrame(frame, -0.056 * s, (y - 0.016) * s, (front + 0.075) * s)];
    soup.quad(left, right, tipRight, tipLeft, colours.hat, 0.9);
  } else if (kind === "sun-hat") {
    const top = ring(0.215, 0.092, 0.104, -0.006);
    soup.loft([ring(HAT_LINES["sun-hat"] - 0.014, 0.2, 0.21, -0.004), ring(HAT_LINES["sun-hat"], 0.1, 0.114, -0.004), top], ["straw", colours.hat], { sides: 7, turn: 0 });
    soup.tip(top, inFrame(frame, 0, 0.246 * s, -0.008 * s), "straw", 7, 0);
  } else if (kind === "helmet") {
    soup.loft([ring(HAT_LINES.helmet, 0.094, 0.116, -0.008), ring(0.2, 0.092, 0.118, -0.012), ring(0.255, 0.05, 0.078, -0.016)], colours.hat, { sides: 7, turn: 0, capEnd: true });
  }
}

/** What a far outline's crown is painted, and whether hair shows behind it. */
export function farHair({ hair: style, hat, hairColour, skin, colours }: FigureSpec): { crown: Part; hangs: boolean } {
  const bare = style === "bald" || style === "receding";
  const crown: Part = hat === "none" ? (bare ? skin : hairColour) : hat === "sun-hat" ? "straw" : colours.hat;
  return { crown, hangs: style === "long" };
}

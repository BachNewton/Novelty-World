import { BoatMesh, finished, type BoatPart } from "../../boats/mesh";
import type { RoadsideModel } from "../../roadside/models";
import type { V3 } from "../../roadside/mesh";
import { CAR_DECK, CAR_DECK_GLASS, CAR_DECK_PANES, PASSERELLE_END, SHELL_DOOR } from "./plan";

/*
 * The visiting superyacht, invented: a modern 72 m motor yacht of the kind that calls at Mariehamn in summer, a dark
 * navy hull with a plumb bow, four white decks stepping back towards the stern under dark glass, and teak where a deck
 * shows. The car deck is the lower deck aft of the guest cabins, its windows the long panes low in the hull, its door
 * the shell door on the quay side with a passerelle down to the quay.
 *
 * A boat of the boats kit: drawn with `boatMaterials` (or `yachtMaterials`, which lights its glass at night) and placed
 * by the roadside's `placeModel`. Bow along +x, the quay side +z (its starboard), y up from the water: the dealership
 * frame, whose street side is +z, so the room and the site read it as they read a building.
 */

const STERN_X = -34;
const HALF_BEAM = 6.3;

const MAIN_DECK_Y = 4;
const BULWARK_Y = 4.9;
/** The bulwark runs from the main deck house forward; aft of it the deck is open, with rails. */
const BULWARK_FROM_X = -22;
const BULWARK_THICK = 0.18;

interface Level {
  y: number;
  /** Where this level's stem is, along +x. */
  to: number;
  beam: number;
  /** Whether the sheer rises towards the bow here: the deck and bulwark do, the waterline doesn't. */
  sheer: boolean;
}

const LEVELS: readonly Level[] = [
  { y: -1, to: 31.5, beam: 0.8, sheer: false },
  { y: 0.05, to: 33.4, beam: 0.9, sheer: false },
  { y: 0.4, to: 33.7, beam: 0.92, sheer: false },
  { y: 1.9, to: 35, beam: 0.985, sheer: false },
  { y: MAIN_DECK_Y, to: 35.8, beam: 1, sheer: true },
  { y: BULWARK_Y, to: 36.2, beam: 1, sheer: true },
];
const BANDS: readonly BoatPart[] = ["boot", "gelcoat", "navy", "navy", "navy"];
const BULWARK_FROM = (BULWARK_FROM_X - STERN_X) / (LEVELS[5].to - STERN_X);
const SHEER_RISE_M = 0.8;

/** Plan fullness: share of the length from the stern, share of the beam. Full aft, a long parallel middle, a fine entry. */
const PLAN: readonly (readonly [at: number, beam: number])[] = [[0, 0.9], [0.06, 0.98], [0.2, 1], [0.55, 1], [0.7, 0.95], [0.8, 0.86], [0.88, 0.7], [0.94, 0.48], [0.98, 0.22], [1, 0]];

const NEAR_STATIONS = [0, 0.04, 0.12, BULWARK_FROM, 0.25, 0.4, 0.55, 0.65, 0.73, 0.8, 0.86, 0.9, 0.935, 0.96, 0.98, 0.993, 1];
const FAR_STATIONS = [0, BULWARK_FROM, 0.55, 0.8, 0.9, 0.96, 1];

function fullness(share: number) {
  const after = PLAN.findIndex(([at]) => at >= share);
  if (after <= 0) return PLAN[Math.max(after, 0)][1];
  const [[fromAt, from], [toAt, to]] = [PLAN[after - 1], PLAN[after]];
  return from + ((to - from) * (share - fromAt)) / (toAt - fromAt);
}

const sternOf = (level: Level) => (level.y < 0 ? STERN_X + 1.2 : STERN_X);

function hullPoint(level: Level, share: number, side: number, inset = 0): V3 {
  const rise = level.sheer ? share ** 6 * SHEER_RISE_M : 0;
  const half = Math.max(0, HALF_BEAM * level.beam * fullness(share) - inset);
  return [sternOf(level) + (level.to - sternOf(level)) * share, level.y + rise, side * half];
}

/** A strip of hull between two levels and two stations, ending in a point at the stem. */
function band(into: BoatMesh, low: Level, high: Level, a: number, b: number, side: number, part: BoatPart, inset = 0, shade = 1) {
  const corners = [hullPoint(low, a, side, inset), hullPoint(low, b, side, inset), hullPoint(high, b, side, inset), hullPoint(high, a, side, inset)];
  into.face(b === 1 ? [corners[0], corners[1], corners[3]] : corners, part, shade);
}

function hull(into: BoatMesh, stations: readonly number[], bands: readonly BoatPart[]) {
  const bulwark = bands.length - 1;
  for (let station = 0; station + 1 < stations.length; station++) {
    const [a, b] = [stations[station], stations[station + 1]];
    for (const side of [-1, 1]) {
      bands.forEach((part, at) => {
        if (at < bulwark || a >= BULWARK_FROM) band(into, LEVELS[at], LEVELS[at + 1], a, b, side, part, 0, side > 0 ? 1 : 0.94);
      });
    }
  }
  // The transom, flat and upright, the navy carried round it up to the open aft deck.
  bands.slice(0, bulwark).forEach((part, at) => {
    const [low, high] = [LEVELS[at], LEVELS[at + 1]];
    into.face([hullPoint(low, 0, -1), hullPoint(low, 0, 1), hullPoint(high, 0, 1), hullPoint(high, 0, -1)], part, 0.86);
  });
}

/** The bulwark's inside and its teak cap from the house forward, and the main deck, open aft: what shows from the quay and the upper decks. */
function bulwarkAndDeck(into: BoatMesh, stations: readonly number[]) {
  const [deck, top] = [LEVELS[4], LEVELS[5]];
  const inner = stations.filter((share) => share < 0.97);
  for (let station = 0; station + 1 < inner.length; station++) {
    const [a, b] = [inner[station], inner[station + 1]];
    const walled = a >= BULWARK_FROM;
    const inset = walled ? BULWARK_THICK : 0;
    if (walled) {
      for (const side of [-1, 1]) {
        band(into, deck, top, a, b, side, "gelcoat", BULWARK_THICK, 0.9);
        into.face([hullPoint(top, a, side), hullPoint(top, b, side), hullPoint(top, b, side, BULWARK_THICK), hullPoint(top, a, side, BULWARK_THICK)], "varnish", 1.05);
      }
    }
    into.face([hullPoint(deck, a, -1, inset), hullPoint(deck, b, -1, inset), hullPoint(deck, b, 1, inset), hullPoint(deck, a, 1, inset)], "teak", 1.02);
  }
  // The bulwark's aft ends, and the bow, where its two insides meet.
  for (const side of [-1, 1]) into.face([hullPoint(deck, BULWARK_FROM, side), hullPoint(top, BULWARK_FROM, side), hullPoint(top, BULWARK_FROM, side, BULWARK_THICK), hullPoint(deck, BULWARK_FROM, side, BULWARK_THICK)], "gelcoat", 0.95);
  const last = inner[inner.length - 1];
  into.face([hullPoint(deck, last, -1, BULWARK_THICK), hullPoint(top, last, -1, BULWARK_THICK), hullPoint(top, last, 1, BULWARK_THICK), hullPoint(deck, last, 1, BULWARK_THICK)], "gelcoat", 0.9);
  into.face([hullPoint(top, last, -1), hullPoint(top, 1, 0), hullPoint(top, last, 1)], "varnish", 1.05);
  into.face([hullPoint(top, last, -1, BULWARK_THICK), hullPoint(top, last, -1), hullPoint(top, last, 1), hullPoint(top, last, 1, BULWARK_THICK)], "varnish", 1.05);
}

/** The stern: a teak swim platform low over the water, the beach club's glass in the transom, and rails round the open aft deck. */
function stern(into: BoatMesh, near: boolean) {
  const [low, high, half] = [0.35, 0.75, HALF_BEAM * 0.8];
  into.box([STERN_X - 2.8, low, -half], [STERN_X + 0.05, high, half], "navy", { open: true, shade: 0.9 });
  into.face([[STERN_X - 2.75, high + 0.012, -half + 0.05], [STERN_X - 2.75, high + 0.012, half - 0.05], [STERN_X, high + 0.012, half - 0.05], [STERN_X, high + 0.012, -half + 0.05]], "teak", 1.05);
  const glass = STERN_X - LIFT;
  into.face([[glass, 1.15, -2.6], [glass, 1.15, 2.6], [glass, 3, 2.6], [glass, 3, -2.6]], "glass", 0.95);
  if (near) for (const z of [-0.87, 0.87]) into.face([[glass - LIFT, 1.15, z - 0.06], [glass - LIFT, 1.15, z + 0.06], [glass - LIFT, 3, z + 0.06], [glass - LIFT, 3, z - 0.06]], "alu", 1);
  if (!near) return;
  const deck = LEVELS[4];
  const railY = MAIN_DECK_Y + 1;
  for (const side of [-1, 1]) {
    const edge = (share: number): V3 => {
      const [x, y, z] = hullPoint(deck, share, side, 0.08);
      return [x, y + 1, z];
    };
    const shares = NEAR_STATIONS.filter((share) => share <= BULWARK_FROM);
    for (let at = 0; at + 1 < shares.length; at++) into.line(edge(shares[at]), edge(shares[at + 1]), "alu");
    for (const share of shares) {
      const [x, , z] = edge(share);
      into.line([x, railY, z], [x, MAIN_DECK_Y, z], "alu");
    }
  }
  const [x, , z] = hullPoint(deck, 0, 1, 0.08);
  into.line([x + 0.08, railY, -z], [x + 0.08, railY, z], "alu");
}

/** How far the hull's side is from the middle at a point along it and a height: where a pane or a door lies on it. */
function hullHalfAt(x: number, y: number): number {
  const level = LEVELS.findIndex((candidate) => candidate.y >= y);
  const [low, high] = [LEVELS[Math.max(level - 1, 0)], LEVELS[Math.max(level, 0)]];
  const halfOf = (lv: Level) => HALF_BEAM * lv.beam * fullness(Math.min(1, Math.max(0, (x - sternOf(lv)) / (lv.to - sternOf(lv)))));
  const share = high.y === low.y ? 0 : (y - low.y) / (high.y - low.y);
  return halfOf(low) + (halfOf(high) - halfOf(low)) * share;
}

const LIFT = 0.03;

/** A flat patch laid on the hull's side, both sides unless `side` is given: a pane, a seam, a door. */
function onHull(into: BoatMesh, fromX: number, toX: number, lowY: number, highY: number, part: BoatPart, lift = LIFT, sides: readonly number[] = [-1, 1]) {
  for (const side of sides) {
    const at = (x: number, y: number): V3 => [x, y, side * (hullHalfAt(x, y) + lift)];
    into.face([at(fromX, lowY), at(toX, lowY), at(toX, highY), at(fromX, highY)], part, side > 0 ? 1.05 : 0.95);
  }
}

function hullDetail(into: BoatMesh, near: boolean) {
  for (const [from, to] of near ? CAR_DECK_PANES : [[CAR_DECK_PANES[0][0], CAR_DECK_PANES[CAR_DECK_PANES.length - 1][1]] as const]) {
    onHull(into, from, to, CAR_DECK_GLASS.lowY, CAR_DECK_GLASS.highY, "glass");
    if (!near) continue;
    const [low, high, frame] = [CAR_DECK_GLASS.lowY, CAR_DECK_GLASS.highY, 0.07];
    onHull(into, from - frame, to + frame, low - frame, low, "alu", LIFT * 2);
    onHull(into, from - frame, to + frame, high, high + frame, "alu", LIFT * 2);
    onHull(into, from - frame, from, low, high, "alu", LIFT * 2);
    onHull(into, to, to + frame, low, high, "alu", LIFT * 2);
  }
  // The guest cabins' windows forward, a row of small panes that gives the hull its size.
  if (near) for (let x = 10; x + 1.4 < 27; x += 2.3) onHull(into, x, x + 1.4, 2.35, 2.95, "glass");
  else onHull(into, 10, 26.7, 2.4, 2.9, "glass");
  // A polished steel cove line along the hull, under the deck's edge.
  onHull(into, STERN_X + 0.4, 33.6, 3.55, 3.7, "alu", LIFT);
  // The shell door on the quay side, open: the dark of the car deck behind its frame.
  const { fromX, toX, highY } = SHELL_DOOR;
  onHull(into, fromX, toX, CAR_DECK.floorY, highY, "spar-black", LIFT, [1]);
  if (near) {
    onHull(into, fromX - 0.12, fromX, CAR_DECK.floorY, highY + 0.12, "alu", LIFT * 2, [1]);
    onHull(into, toX, toX + 0.12, CAR_DECK.floorY, highY + 0.12, "alu", LIFT * 2, [1]);
    onHull(into, fromX, toX, highY, highY + 0.12, "alu", LIFT * 2, [1]);
  }
}

/** The passerelle from the shell door's sill to the quay: a teak plank with a steel rail each side and a foot where it lands. */
function passerelle(into: BoatMesh, near: boolean) {
  const middle = (SHELL_DOOR.fromX + SHELL_DOOR.toX) / 2;
  const [x0, x1] = [middle - 0.65, middle + 0.65];
  const startZ = hullHalfAt(middle, CAR_DECK.floorY) + LIFT;
  const [startY, endY] = [CAR_DECK.floorY + 0.05, PASSERELLE_END.y];
  const endZ = PASSERELLE_END.z;
  const thick = 0.12;
  into.face([[x0, startY, startZ], [x0, endY, endZ], [x1, endY, endZ], [x1, startY, startZ]], "teak", 1.05);
  for (const x of [x0, x1]) into.face([[x, startY - thick, startZ], [x, endY - thick, endZ], [x, endY, endZ], [x, startY, startZ]], "alu", 0.9);
  into.face([[x0, startY - thick, startZ], [x1, startY - thick, startZ], [x1, endY - thick, endZ], [x0, endY - thick, endZ]], "alu", 0.7);
  into.box([x0 - 0.15, endY - 0.8, endZ - 0.3], [x1 + 0.15, endY - thick, endZ + 0.35], "alu", { open: true, shade: 0.85 });
  if (!near) return;
  for (const x of [x0, x1]) {
    for (const [z, y] of [[startZ + 0.4, startY], [(startZ + endZ) / 2, (startY + endY) / 2], [endZ - 0.3, endY]] as const) into.line([x, y, z], [x, y + 1, z], "alu");
    into.line([x, startY + 1, startZ + 0.4], [x, endY + 1, endZ - 0.3], "alu");
  }
}

interface House {
  /** Its aft end and its front at the foot, along +x. */
  from: number;
  to: number;
  half: number;
  low: number;
  high: number;
  /** How far the front leans back at the top: a raked front. */
  rake: number;
  /** Its windows' foot and head above its floor. */
  glass: readonly [number, number];
}

/** The decks' houses, bottom up: each narrower and shorter, stepping back towards the stern under the deck above. */
const HOUSES: readonly House[] = [
  { from: -22, to: 21, half: 5.3, low: MAIN_DECK_Y, high: 7.3, rake: 1.8, glass: [0.9, 2.8] },
  { from: -15, to: 16.5, half: 5, low: 7.3, high: 10.3, rake: 2.2, glass: [0.8, 2.6] },
  { from: -6, to: 13, half: 4.6, low: 10.3, high: 13.2, rake: 2.4, glass: [0.9, 2.5] },
];

/** The decks over the houses, each a slab with teak on top that shades the deck below: its aft end, front, and half width. */
const SLABS: readonly { from: number; to: number; half: number; y: number }[] = [
  { from: -27.5, to: 21.2, half: 6.05, y: 7.3 },
  { from: -21, to: 16.8, half: 5.7, y: 10.3 },
  { from: -11, to: 13.4, half: 5.1, y: 13.2 },
];
const SLAB_THICK = 0.28;
const ROUND_STEPS = 4;
const NOSE = 0.55;

/** A house's outline at a height: square aft, its front tapering to a short flat nose, leaning back with height. */
function houseOutline({ from, to, half, low, high, rake }: House, y: number): V3[] {
  const front = to - (rake * (y - low)) / (high - low);
  const taper = 3.2;
  return [[from, y, -half], [front - taper, y, -half], [front, y, -half * NOSE], [front, y, half * NOSE], [front - taper, y, half], [from, y, half]];
}

function house(into: BoatMesh, spec: House, near: boolean) {
  const [foot, head] = [houseOutline(spec, spec.low), houseOutline(spec, spec.high)];
  foot.forEach((corner, at) => {
    const next = (at + 1) % foot.length;
    const shade = at === 5 ? 0.84 : at === 2 ? 1.04 : corner[2] < 0 && foot[next][2] < 0 ? 0.94 : 1;
    into.face([corner, foot[next], head[next], head[at]], "gelcoat", shade);
  });
  // The glass: a band down each side and round the raked front, laid a touch proud of the wall.
  const [glassLow, glassHigh] = [spec.low + spec.glass[0], spec.low + spec.glass[1]];
  const [low, high] = [houseOutline(spec, glassLow), houseOutline(spec, glassHigh)];
  const proud = (corner: V3, out: V3): V3 => [corner[0] + out[0] * LIFT, corner[1], corner[2] + out[2] * LIFT];
  const outward = (a: V3, b: V3): V3 => {
    const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
    const length = Math.hypot(dx, dz);
    return [dz / length, 0, -dx / length];
  };
  // Sides (0 and 4), the two angled cheeks (1 and 3) and the nose (2); the aft end (5) is the saloon's doors, below.
  for (const edge of [0, 1, 2, 3, 4]) {
    const next = edge + 1;
    const out = outward(low[edge], low[next]);
    const inset = edge === 0 || edge === 4 ? 1.2 : 0;
    const along = (corner: V3, toward: V3, metres: number): V3 => {
      const [dx, dz] = [toward[0] - corner[0], toward[2] - corner[2]];
      const length = Math.hypot(dx, dz);
      return [corner[0] + (dx / length) * metres, corner[1], corner[2] + (dz / length) * metres];
    };
    const [a, b, c, d] = edge === 0 ? [along(low[0], low[1], inset), low[1], high[1], along(high[0], high[1], inset)] : edge === 4 ? [low[4], along(low[5], low[4], inset), along(high[5], high[4], inset), high[4]] : [low[edge], low[next], high[next], high[edge]];
    into.face([proud(a, out), proud(b, out), proud(c, out), proud(d, out)], "glass", 1);
    if (near && (edge === 0 || edge === 4)) {
      // White mullions every few metres, standing proud of the glass: what makes a band of glass read as windows.
      const span = Math.abs(b[0] - a[0]);
      const count = Math.round(span / 4.2);
      for (let mullion = 1; mullion < count; mullion++) {
        const x = Math.min(a[0], b[0]) + (span * mullion) / count;
        const z = a[2];
        into.face([[x - 0.09, glassLow, z + out[2] * LIFT * 2], [x + 0.09, glassLow, z + out[2] * LIFT * 2], [x + 0.09, glassHigh, z + out[2] * LIFT * 2], [x - 0.09, glassHigh, z + out[2] * LIFT * 2]], "gelcoat", 1);
      }
    }
  }
  // The aft end: glass doors onto the deck behind, across all but a strip of white either side.
  const aft = spec.from - LIFT;
  into.face([[aft, spec.low + 0.1, -spec.half + 0.9], [aft, spec.low + 0.1, spec.half - 0.9], [aft, spec.high - 0.35, spec.half - 0.9], [aft, spec.high - 0.35, -spec.half + 0.9]], "glass", 0.9);
}

function slab(into: BoatMesh, { from, to, half, y }: (typeof SLABS)[number]) {
  const top = y + SLAB_THICK;
  const taper = 3.4;
  // The aft corners swept round, as a yacht's overhangs are.
  const round = Math.min(2.4, half * 0.45);
  const arc = (centreZ: number, sign: number, reverse: boolean): V3[] => {
    const points = Array.from({ length: ROUND_STEPS + 1 }, (_, step): V3 => {
      const angle = (step / ROUND_STEPS) * (Math.PI / 2);
      return [from + round - round * Math.cos(angle), 0, centreZ + sign * round * Math.sin(angle)];
    });
    return reverse ? points.reverse() : points;
  };
  const outline: V3[] = [...arc(-half + round, -1, false), [to - taper, 0, -half], [to, 0, -half * NOSE], [to, 0, half * NOSE], [to - taper, 0, half], ...arc(half - round, 1, true)];
  outline.forEach((corner, at) => {
    const next = outline[(at + 1) % outline.length];
    into.face([[corner[0], y, corner[2]], [next[0], y, next[2]], [next[0], top, next[2]], [corner[0], top, corner[2]]], "gelcoat", next[0] < from + round ? 0.88 : 1.02);
  });
  const level = (height: number) => outline.map(([x, , z]): V3 => [x, height, z]);
  into.face(level(y), "gelcoat", 0.72);
  // Teak inset on top, a hair above the slab.
  const inset = (corner: V3): V3 => [Math.min(Math.max(corner[0], from + 0.12), to - 0.12), top + 0.012, Math.sign(corner[2]) * Math.max(0, Math.abs(corner[2]) - 0.12)];
  into.face(level(top).map(inset), "teak", 1.04);
}

/** Rails round the open decks aft, as ribbons the material holds at a pixel's width. */
function rails(into: BoatMesh) {
  for (const { from, half, y } of SLABS) {
    const top = y + SLAB_THICK + 1;
    // Round the open deck, from the house standing on the slab (or the hardtop's posts on the sun deck) aft, round the
    // swept corners and across.
    const end = HOUSES.find((candidate) => candidate.low === y)?.from ?? HARDTOP.from;
    const [inner, round] = [half - 0.1, Math.min(2.4, half * 0.45) - 0.1];
    const corner = (side: number) =>
      Array.from({ length: ROUND_STEPS + 1 }, (_, step): V3 => {
        const angle = (step / ROUND_STEPS) * (Math.PI / 2);
        return [from + 0.1 + round - round * Math.sin(angle), top, side * (inner - round + round * Math.cos(angle))];
      });
    const path: V3[] = [[end, top, -inner], ...corner(-1), ...corner(1).reverse(), [end, top, inner]];
    for (let at = 0; at + 1 < path.length; at++) into.line(path[at], path[at + 1], "alu");
    for (const side of [-1, 1]) for (let x = from + round + 0.1; x < end; x += 3) into.line([x, top, side * inner], [x, top - 1, side * inner], "alu");
  }
}

const HARDTOP = { from: -4.5, to: 9.5, half: 4.3 } as const;

/** The sun deck's hardtop on its four posts, and the mast over it with its radomes. */
function hardtopAndMast(into: BoatMesh, near: boolean) {
  const deck = SLABS[2].y + SLAB_THICK;
  const [roofLow, roofHigh] = [deck + 2.6, deck + 2.9];
  const { from, to, half } = HARDTOP;
  into.box([from, roofLow, -half], [to, roofHigh, half], "gelcoat", { shadeTop: 1.05 });
  into.face([[from, roofLow - 0.01, -half], [to, roofLow - 0.01, -half], [to, roofLow - 0.01, half], [from, roofLow - 0.01, half]], "gelcoat", 0.7);
  for (const x of [from + 1, to - 1.5]) for (const z of [-half + 0.5, half - 0.5]) into.box([x - 0.12, deck, z - 0.12], [x + 0.12, roofLow, z + 0.12], "gelcoat", { open: true, shade: 0.9 });
  const sides = near ? 8 : 4;
  into.tube([5.5, roofHigh, 0], [4.6, roofHigh + 4.8, 0], 0.32, sides, { radiusTo: 0.14 }, "gelcoat");
  into.beam([4.9, roofHigh + 3, -1.8], [4.9, roofHigh + 3, 1.8], 0.16, 0.16, "gelcoat");
  if (!near) return;
  for (const z of [-1.5, 1.5]) into.tube([4.9, roofHigh + 3.08, z], [4.9, roofHigh + 3.6, z], 0.3, 8, { cap: true }, "gelcoat");
  into.tube([2, roofHigh, 0], [2, roofHigh + 0.7, 0], 0.55, 10, { cap: true, radiusTo: 0.45 }, "gelcoat");
}

const SWAP_M = 450;
const REACH_M = 10000;

/** The yacht: near under 3,000 triangles and far under 500, swapping where the LOD check measured it. */
export function buildYacht(): RoadsideModel {
  const near = new BoatMesh();
  hull(near, NEAR_STATIONS, BANDS);
  bulwarkAndDeck(near, NEAR_STATIONS);
  hullDetail(near, true);
  passerelle(near, true);
  stern(near, true);
  for (const spec of SLABS) slab(near, spec);
  for (const spec of HOUSES) house(near, spec, true);
  rails(near);
  hardtopAndMast(near, true);

  const far = new BoatMesh();
  hull(far, FAR_STATIONS, BANDS);
  bulwarkAndDeck(far, FAR_STATIONS);
  hullDetail(far, false);
  passerelle(far, false);
  stern(far, false);
  for (const spec of SLABS) slab(far, spec);
  for (const spec of HOUSES) house(far, spec, false);
  hardtopAndMast(far, false);
  return finished({ near, far, swapM: SWAP_M, reachM: REACH_M, rock: 0 });
}

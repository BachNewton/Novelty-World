import type { V3 } from "../roadside/mesh";
import type { Placement } from "../roadside/material";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel, type TownPart } from "./paint";

/*
 * A Baltic car ferry, invented, with no real line's name or colours. What makes one and not a cruise ship: a blunt,
 * flared bow on a high slab side, with hull, car decks and passenger decks stacked flush, one above the other, and
 * little step in the superstructure until the terraces aft. Cars go in through the stern door and the bow visor.
 * Bow along +x, y up from the water.
 */

/** The landmark's position, unchanged: the north quay, where the 2025 photo has the ferry berth. */
export const FERRY_BERTH = { east: 107096, north: 6682850, baseM: 0.1, bearingDeg: 180.5 } as const;

const BOW = 88;
const STERN = -88;
const HALF_BEAM = 14;

/** Hull levels from the water up. Each runs from the stern to its own stem, so a raked stem comes from where they end. */
const LEVELS: readonly { y: number; to: number; beam: number }[] = [
  { y: -1.2, to: 74, beam: 0.9 },
  { y: 1.3, to: 80, beam: 0.95 },
  { y: 9.6, to: 85, beam: 0.995 },
  { y: 14.2, to: 87, beam: 1 },
  { y: 19, to: BOW, beam: 1 },
];
const BANDS: readonly TownPart[] = ["ferry-boot", "ferry-hull", "ferry-hull", "ferry-white"];
/** From here forward the dark hull climbs to the rail: a high, shouldered bow. */
const BOW_SHOULDER = 0.78;
/** Plan fullness: share of the length from the stern, share of the beam. A blunt, full bow, not a liner's knife. */
const PLAN: readonly (readonly [at: number, beam: number])[] = [[0, 0.97], [0.02, 1], [0.7, 1], [0.8, 0.98], [0.86, 0.93], [0.91, 0.84], [0.95, 0.7], [0.985, 0.44], [1, 0]];
const PLAN_FAR: typeof PLAN = [[0, 0.96], [0.66, 1], [0.86, 0.86], [0.96, 0.54], [1, 0]];

const DECK_M = 2.9;
const BASE_DECK_M = 19;
/** Passenger decks, bottom up: a box with a flat front, and two terraces at the very end. */
const DECKS: readonly { from: number; to: number; half: number }[] = [
  { from: -74, to: 58, half: 13.9 },
  { from: -74, to: 58, half: 13.9 },
  { from: -74, to: 58, half: 13.9 },
  { from: -72, to: 57, half: 13.9 },
  { from: -60, to: 56, half: 13.6 },
  { from: -48, to: 54, half: 13.2 },
];
const NOSE_M = 2.5;
const SUPER_TOP_M = BASE_DECK_M + DECKS.length * DECK_M;

function fullness(plan: typeof PLAN, share: number) {
  const after = plan.findIndex(([at]) => at >= share);
  if (after <= 0) return plan[Math.max(after, 0)][1];
  const [[fromAt, from], [toAt, to]] = [plan[after - 1], plan[after]];
  return from + ((to - from) * (share - fromAt)) / (toAt - fromAt);
}

function hullPoint(level: number, share: number, side: number, plan: typeof PLAN): V3 {
  const { y, to, beam } = LEVELS[level];
  const bow = level === LEVELS.length - 1 ? share ** 8 * 2.4 : 0;
  return [STERN + (to - STERN) * share, y + bow, side * HALF_BEAM * beam * fullness(plan, share)];
}

function hull(into: TownPainted, shares: readonly number[], plan: typeof PLAN): TownPainted {
  for (let station = 0; station + 1 < shares.length; station++) {
    const [a, b] = [shares[station], shares[station + 1]];
    for (const side of [-1, 1]) {
      BANDS.forEach((paint, band) => {
        const shown = a >= BOW_SHOULDER ? (band === 0 ? "ferry-boot" : "ferry-hull") : paint;
        into.face([hullPoint(band, a, side, plan), hullPoint(band, b, side, plan), hullPoint(band + 1, b, side, plan), hullPoint(band + 1, a, side, plan)], shown, side > 0 ? 1 : 0.95);
      });
    }
  }
  // The transom: flat, as a ship with a stern door has.
  BANDS.forEach((paint, band) => {
    into.face([hullPoint(band, 0, -1, plan), hullPoint(band, 0, 1, plan), hullPoint(band + 1, 0, 1, plan), hullPoint(band + 1, 0, -1, plan)], paint, 0.9);
  });
  return into;
}

const SIDE_LIFT = 0.04;

/** A strip along a slab side, on both sides. */
function strip(into: TownPainted, from: number, to: number, low: number, high: number, half: number, part: TownPart, shade = 1): TownPainted {
  for (const side of [-1, 1]) {
    const z = side * (half + SIDE_LIFT);
    into.face([[from, low, z], [to, low, z], [to, high, z], [from, high, z]], part, side > 0 ? shade : shade * 0.95);
  }
  return into;
}

/** The car-deck ports and the sealed side above the boot-top: what says this hull carries cars. */
function hullDetail(into: TownPainted): TownPainted {
  const half = HALF_BEAM * 0.998;
  for (let port = 0; port < 13; port++) {
    const x = STERN + 10 + port * 10.5;
    strip(into, x, x + 6.4, 10.6, 12.8, half, "ferry-steel");
  }
  // The stern door, and the visor's seam at the bow.
  const z = STERN - 0.05;
  into
    .face([[z, 10, -7.5], [z, 10, 7.5], [z, 16.5, 7.5], [z, 16.5, -7.5]], "ferry-shade")
    .face([[z - 0.02, 12.6, -7.1], [z - 0.02, 12.6, 7.1], [z - 0.02, 12.8, 7.1], [z - 0.02, 12.8, -7.1]], "ferry-steel");
  for (const side of [-1, 1]) {
    const [low, high] = [hullPoint(2, 0.915, side, PLAN), hullPoint(3, 0.915, side, PLAN)];
    const nudge = side * 0.05;
    into.face([[low[0], low[1], low[2] + nudge], [low[0] + 0.3, low[1], low[2] + nudge], [high[0] + 0.3, high[1], high[2] + nudge], [high[0], high[1], high[2] + nudge]], "ferry-steel");
    const anchor = hullPoint(2, 0.945, side, PLAN);
    into.face([[anchor[0] - 1.2, 8.2, anchor[2] + nudge], [anchor[0] + 0.6, 8.2, anchor[2] + nudge], [anchor[0] + 0.4, 9.4, anchor[2] + nudge], [anchor[0] - 1, 9.4, anchor[2] + nudge]], "ferry-steel");
  }
  return into;
}

function storey(into: TownPainted, { from, to, half }: (typeof DECKS)[number], low: number, windows: boolean): TownPainted {
  const high = low + DECK_M;
  const nose = to + NOSE_M;
  const narrow = half * 0.82;
  const outline: readonly (readonly [number, number])[] = [[from, -half], [to, -half], [nose, -narrow], [nose, narrow], [to, half], [from, half]];
  outline.forEach(([ax, az], at) => {
    const [bx, bz] = outline[(at + 1) % outline.length];
    const shade = at === 3 ? 1.02 : at === 5 ? 0.9 : az < 0 && bz < 0 ? 0.95 : 1;
    into.face([[ax, low, az], [bx, low, bz], [bx, high, bz], [ax, high, az]], "ferry-white", shade);
  });
  into.face([[from, high, -half], [to, high, -half], [nose, high, -narrow], [nose, high, narrow], [to, high, half], [from, high, half]], "ferry-deck", 1.04);
  if (!windows) return into;
  const [glassLow, glassHigh] = [low + 1.05, low + 2.2];
  for (const side of [-1, 1]) {
    const lift = (z: number) => z + side * SIDE_LIFT;
    into
      .face([[to, glassLow, lift(side * half)], [nose, glassLow, lift(side * narrow)], [nose, glassHigh, lift(side * narrow)], [to, glassHigh, lift(side * half)]], "ferry-glass", 1.05);
  }
  into.face([[nose + SIDE_LIFT, glassLow, -narrow], [nose + SIDE_LIFT, glassLow, narrow], [nose + SIDE_LIFT, glassHigh, narrow], [nose + SIDE_LIFT, glassHigh, -narrow]], "ferry-glass", 1.05);
  return into;
}

/** Long panoramic windows low down, where the restaurants are, then rows of cabin windows, each its own: they give the ship her size. */
function deckWindows(into: TownPainted, { from, to, half }: (typeof DECKS)[number], low: number, deck: number): TownPainted {
  const inset = from + 4;
  if (deck === 0 || deck === 1) {
    for (let x = inset; x + 7 < to; x += 8) strip(into, x, x + 7, low + 0.7, low + 2.3, half, "ferry-glass");
  } else if (deck === 2 || deck === 3) {
    for (let x = inset; x + 1.3 < to; x += 3.1) strip(into, x, x + 1.5, low + 1.1, low + 2, half, "ferry-glass");
  } else {
    for (let x = inset; x + 5.6 < to; x += 6) strip(into, x, x + 5.6, low + 1, low + 2.2, half, "ferry-glass");
  }
  return into;
}

const LIFEBOATS = 5;

function lifeboat(into: TownPainted, x: number, y: number, side: number): TownPainted {
  const z = side * 14.6;
  const [wide, long] = [1.5, 4.8];
  const [inner, outer] = [z - wide, z + wide];
  return into
    .box([x - long, y, Math.min(inner, outer)], [x + long, y + 1.3, Math.max(inner, outer)], "ferry-lifeboat", { shadeTop: 1.12, shade: 0.98 })
    .box([x - long * 0.7, y + 1.3, Math.min(inner, outer) + 0.4], [x + long * 0.7, y + 2, Math.max(inner, outer) - 0.4], "ferry-white", { open: true, shadeTop: 1.05 })
    .beam([x - long * 0.8, y + 2.2, side * 13.3], [x - long * 0.8, y + 2.2, side * 14.6], 0.3, 0.3, "ferry-steel")
    .beam([x + long * 0.8, y + 2.2, side * 13.3], [x + long * 0.8, y + 2.2, side * 14.6], 0.3, 0.3, "ferry-steel");
}

function funnel(into: TownPainted, sections: boolean): TownPainted {
  const [x, foot, tall] = [-34, SUPER_TOP_M - DECK_M, 15];
  const rake = 3.2;
  const outline = (y: number, scale: number): V3[] => {
    const back = x - ((y - foot) / tall) * rake;
    return [[back + 10 * scale, y, 0], [back + 7 * scale, y, 6.5 * scale], [back - 10 * scale, y, 6.5 * scale], [back - 11 * scale, y, 0], [back - 10 * scale, y, -6.5 * scale], [back + 7 * scale, y, -6.5 * scale]];
  };
  const band = (low: number, high: number, part: TownPart, scaleLow = 1, scaleHigh = 1) => {
    const [a, b] = [outline(low, scaleLow), outline(high, scaleHigh)];
    a.forEach((corner, at) => {
      const next = (at + 1) % a.length;
      into.face([corner, a[next], b[next], b[at]], part, at === 0 ? 1.05 : at === 3 ? 0.9 : at < 3 ? 1 : 0.95);
    });
  };
  band(foot, foot + tall * 0.86, "ferry-funnel");
  band(foot + tall * 0.86, foot + tall, "ferry-funnel-top");
  into.face(outline(foot + tall, 1), "ferry-funnel-top", 0.7);
  if (sections) {
    const top = foot + tall;
    for (const z of [-2.2, 2.2]) into.tube([x - rake - 2, top - 1, z], [x - rake - 2.6, top + 2.2, z], 0.7, 6, { cap: true }, "ferry-steel");
  }
  return into;
}

function bridgeAndMast(into: TownPainted): TownPainted {
  const [low, high] = [SUPER_TOP_M, SUPER_TOP_M + 3];
  into
    .box([40, low, -14.9], [54, high, 14.9], "ferry-white", { open: true, shadeTop: 1.05 })
    .face([[54.04, low + 1, -14.7], [54.04, low + 1, 14.7], [54.04, high - 0.3, 14.7], [54.04, high - 0.3, -14.7]], "ferry-glass", 1.1);
  strip(into, 41, 54, low + 1, high - 0.3, 14.9, "ferry-glass");
  for (const x of [-6, 6, 18, 28]) into.box([x, low, -4], [x + 5, low + 1.6, 4], "ferry-shade", { open: true, shadeTop: 1.05 });
  return into
    .tube([44, high, 0], [42, high + 11, 0], 0.32, 5, { radiusTo: 0.12 }, "ferry-steel")
    .beam([43, high + 6, -2.4], [43, high + 6, 2.4], 0.16, 0.16, "ferry-steel")
    .box([46, high, -3.5], [49, high + 2.2, 3.5], "ferry-white", { open: true, shadeTop: 1.05 });
}

/** Rails round the terraces, where the white ends and a deck shows: one thin line reads as a whole deck's railing. */
function terraces(into: TownPainted): TownPainted {
  DECKS.forEach(({ from, half }, deck) => {
    const y = BASE_DECK_M + (deck + 1) * DECK_M;
    const end = deck + 1 < DECKS.length ? DECKS[deck + 1].from : from;
    if (end <= from) return;
    for (const side of [-1, 1]) into.beam([from, y + 1.1, side * half], [end, y + 1.1, side * half], 0.08, 0.08, "ferry-steel");
    into.beam([from, y + 1.1, -half], [from, y + 1.1, half], 0.08, 0.08, "ferry-steel");
  });
  return into;
}

const BOW_DECK_Y_M = 19.2;

function foredeck(into: TownPainted): TownPainted {
  const inside = [0.74, 0.8, 0.86, 0.91, 0.95, 0.98];
  const edge = (share: number, side: number): V3 => {
    const point = hullPoint(LEVELS.length - 1, share, side, PLAN);
    return [point[0], BOW_DECK_Y_M + share ** 8 * 2, point[2] * 0.97];
  };
  for (let at = 0; at + 1 < inside.length; at++) into.face([edge(inside[at], -1), edge(inside[at + 1], -1), edge(inside[at + 1], 1), edge(inside[at], 1)], "ferry-deck");
  // Winches and a breakwater: a working foredeck, not a promenade.
  into
    .box([64, BOW_DECK_Y_M, -6], [65, BOW_DECK_Y_M + 2, 6], "ferry-white", { open: true })
    .box([70, BOW_DECK_Y_M, -3.5], [73, BOW_DECK_Y_M + 1.3, -1.5], "ferry-steel", { open: true })
    .box([70, BOW_DECK_Y_M, 1.5], [73, BOW_DECK_Y_M + 1.3, 3.5], "ferry-steel", { open: true });
  return into;
}

const SWAP_M = 900;
const REACH_M = 12000;

/** The ship: near under 4,000 triangles, far under 300, trading pixels at 900 m. Goes at `ferryPlace()` through `townMaterials`. */
export function buildBalticFerry(): RoadsideModel {
  const near = hull(new TownPainted(), [0, 0.1, 0.3, 0.5, 0.66, 0.72, 0.76, 0.8, 0.84, 0.87, 0.9, 0.925, 0.95, 0.97, 0.985, 1], PLAN);
  hullDetail(near);
  foredeck(near);
  DECKS.forEach((deck, at) => {
    const low = BASE_DECK_M + at * DECK_M;
    storey(near, deck, low, true);
    deckWindows(near, deck, low, at);
  });
  bridgeAndMast(near);
  terraces(near);
  funnel(near, true);
  for (const side of [-1, 1]) {
    for (let boat = 0; boat < LIFEBOATS; boat++) lifeboat(near, -36 + boat * 15, BASE_DECK_M + 4 * DECK_M + 0.5, side);
  }

  const far = hull(new TownPainted(), [0, 0.66, 0.86, 0.96, 1], PLAN_FAR);
  const bands = [DECKS[0], DECKS[4], DECKS[5]];
  bands.forEach((deck, at) => {
    const [low, count] = [BASE_DECK_M + [0, 4, 5][at] * DECK_M, [4, 1, 1][at]];
    for (let step = 0; step < count; step++) strip(far, deck.from + 4, deck.to, low + step * DECK_M + 1, low + step * DECK_M + 2.1, deck.half, "ferry-glass");
    far.box([deck.from, low, -deck.half], [deck.to + NOSE_M * 0.6, low + count * DECK_M, deck.half], "ferry-white", { open: true, shade: 0.98, shadeTop: 1.04 });
  });
  far.box([40, SUPER_TOP_M, -14.9], [54, SUPER_TOP_M + 3, 14.9], "ferry-white", { open: true, shadeTop: 1.05 });
  strip(far, 41, 54, SUPER_TOP_M + 1, SUPER_TOP_M + 2.7, 14.9, "ferry-glass");
  strip(far, STERN + 8, 52, 10.6, 12.8, HALF_BEAM, "ferry-steel");
  funnel(far, false);
  return townModel(near, far, SWAP_M, REACH_M);
}

const WORLD_ORIGIN = { east: 110000, north: 6690000 } as const;

/** A model's +x laid along a compass bearing, on the scene's axes. */
export const yawForBearing = (bearingDeg: number) => {
  const bearing = (bearingDeg * Math.PI) / 180;
  return Math.atan2(Math.cos(bearing), Math.sin(bearing));
};

/** ETRS-TM35FIN metres to the scene, east +x and north -z, from the world's one origin. */
export const sceneOf = (east: number, north: number) => ({ x: east - WORLD_ORIGIN.east, z: WORLD_ORIGIN.north - north });

/** The ferry's one placement. */
export function ferryPlace(): Placement {
  return { ...sceneOf(FERRY_BERTH.east, FERRY_BERTH.north), y: FERRY_BERTH.baseM, yaw: yawForBearing(FERRY_BERTH.bearingDeg) };
}

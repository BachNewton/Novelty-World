import { createBuilder, flat, headed, type MeshBuilder, type Vec2, type Vec3 } from "./kit";
import { createHull, lookup } from "./hull";
import type { Landmark } from "./landmark";

/*
 * Pommern, the steel four-masted barque at Västerhamn. Modelled along +x, bow forward, x = 0 at mid-length, y = 0 at sea
 * level, then turned to the bearing she lies on. The hull is lofted from stations; decks, houses, spars and a simplified
 * set of rigging go on it. Spar heights and places along the hull are the laser's, her length and bearing OSM's.
 */

const LENGTH = 94;
const STERN = -LENGTH / 2;
const BOW = LENGTH / 2;
const HALF_BEAM = 6.6;
const BEARING_DEG = 159.7;
const WATERLINE_BELOW = -0.6;
const BOOT_TOP = 2.6;
const MAIN_DECK = 5.5;
const RAISED_DECK = 8.3;
const BRIDGE_DECK = 7.5;
const POOP_END = -31;
const FORECASTLE_START = 31.5;
const BRIDGE = [-11, 7] as const;

const SQUARE_MASTS = [31, 9, -13];
const JIGGER = -33;
const MAST_TOP = 51.7;
const JIGGER_TOP = 44;
const LOWER_TOP = 20.5;
const TOPMAST_TOP = 34;
/** (height, length) of each yard on a square-rigged mast. */
const YARDS: readonly Vec2[] = [
  [19, 28],
  [26, 25],
  [27.6, 23.5],
  [40.8, 19],
  [42.1, 17.5],
];
/** How far the yards are braced round: the 2013 laser and the 2025 photo agree, with the starboard arms aft. */
const BRACE_RAD = (36 * Math.PI) / 180;
const YARD_AXIS: Vec3 = [-Math.sin(BRACE_RAD), 0, Math.cos(BRACE_RAD)];
const BOWSPRIT_TIP: Vec3 = [BOW + 13, 16.5, 0];
const BOWSPRIT_FOOT: Vec3 = [BOW - 3, 8.6, 0];
const ROPE = 0.075;
const WIRE = 0.06;

/** Share of full beam along the hull, 0 at the stern's end and 1 at the stem. */
const BEAM_SHARE: readonly Vec2[] = [
  [0, 0.34],
  [0.03, 0.64],
  [0.07, 0.83],
  [0.13, 0.95],
  [0.22, 1],
  [0.6, 1],
  [0.72, 0.96],
  [0.82, 0.82],
  [0.9, 0.58],
  [0.96, 0.28],
  [0.995, 0.03],
  [1, 0],
];
/** Rail height above water along the same scale. */
const SHEER: readonly Vec2[] = [
  [0, 9.3],
  [0.08, 9],
  [0.17, 8.2],
  [0.27, 7.2],
  [0.5, 6.7],
  [0.72, 7.2],
  [0.83, 8.2],
  [0.95, 9.3],
  [1, 9.9],
];
/** The hull's ends at the water, boot top and rail: a raked stem, and a counter stern that overhangs the water. */
const HULL = createHull({
  halfBeam: HALF_BEAM,
  beamShare: BEAM_SHARE,
  sheer: SHEER,
  levels: [
    { y: WATERLINE_BELOW, from: STERN + 5.5, to: BOW - 3.5, beam: 0.93, sharpen: 1.5 },
    { y: BOOT_TOP, from: STERN + 2.2, to: BOW - 2, beam: 0.985 },
    { y: 0, from: STERN, to: BOW, beam: 1 },
  ],
});
const hullPoint = HULL.point;

const deckAt = (x: number) => (x < POOP_END || x > FORECASTLE_START ? RAISED_DECK : MAIN_DECK);

function capRail(mesh: MeshBuilder, stations: number) {
  const paint = flat("ship-teak");
  for (let station = 0; station < stations; station++) {
    const a = station / stations;
    const b = (station + 1) / stations;
    for (const side of [-1, 1]) {
      const inset = (point: Vec3, by: number): Vec3 => [point[0], point[1], point[2] * by];
      const outerA = hullPoint(2, a, side);
      const outerB = hullPoint(2, b, side);
      mesh.quad(outerA, outerB, inset(outerB, 0.96), inset(outerA, 0.96), paint);
      const inner = (point: Vec3): Vec3 => [point[0], Math.min(point[1], deckAt(point[0])), point[2] * 0.96];
      mesh.quad(inset(outerA, 0.96), inset(outerB, 0.96), inner(outerB), inner(outerA), flat("deck-house"));
    }
  }
}

/** A white rail on posts along a line of deck. */
function railing(mesh: MeshBuilder, points: readonly Vec3[], postEveryM: number) {
  const white = flat("hull-white");
  const rise: Vec3 = [0, 1.05, 0];
  points.slice(1).forEach((end, at) => {
    const start = points[at];
    const lifted = (point: Vec3): Vec3 => [point[0], point[1] + rise[1], point[2]];
    mesh.line(lifted(start), lifted(end), 0.09, white);
    const span = Math.hypot(end[0] - start[0], end[2] - start[2]);
    const posts = Math.max(1, Math.round(span / postEveryM));
    for (let post = 0; post <= posts; post++) {
      const share = post / posts;
      const foot: Vec3 = [start[0] + (end[0] - start[0]) * share, start[1], start[2] + (end[2] - start[2]) * share];
      mesh.line(foot, lifted(foot), 0.07, white);
    }
  });
}

function houses(mesh: MeshBuilder) {
  const white = flat("deck-house");
  const teak = flat("ship-teak");
  const wood = flat("deck-wood");
  const glass = flat("glass");

  // The break of the poop and of the forecastle.
  for (const [x, top] of [[POOP_END, RAISED_DECK], [FORECASTLE_START, RAISED_DECK]] as const) {
    const share = (x - STERN) / LENGTH;
    const half = HALF_BEAM * lookup(BEAM_SHARE, share) * 0.97;
    mesh.wall([x, -half], [x, half], MAIN_DECK, top, white);
  }

  // Poop house, chart house, and the wheel behind them.
  mesh.box([-37, 9.5, 0], [10, 2.4, 6], teak, 0, flat("deck-house"));
  mesh.box([-37, 10.8, 0], [10.6, 0.15, 6.6], flat("deck-house"));
  for (let pane = 0; pane < 4; pane++) {
    for (const side of [-1, 1]) mesh.box([-40.5 + pane * 2.4, 9.8, side * 3.03], [1, 0.8, 0.05], glass);
  }

  // The midship house, under its bridge deck, with a long deck house on it.
  mesh.box([(BRIDGE[0] + BRIDGE[1]) / 2, (MAIN_DECK + BRIDGE_DECK) / 2, 0], [BRIDGE[1] - BRIDGE[0], BRIDGE_DECK - MAIN_DECK, 11.2], white, 0, wood);
  mesh.box([-2, BRIDGE_DECK + 1.1, 0], [11, 2.2, 5], white, 0, teak);
  for (let pane = 0; pane < 5; pane++) {
    for (const side of [-1, 1]) mesh.box([-6.5 + pane * 2.2, BRIDGE_DECK + 1.2, side * 2.53], [0.9, 0.8, 0.05], glass);
  }

  // The fore deck house.
  mesh.box([23, 6.9, 0], [9, 2.8, 6.4], white, 0, teak);
  for (let pane = 0; pane < 3; pane++) {
    for (const side of [-1, 1]) mesh.box([20 + pane * 3, 7.1, side * 3.23], [0.9, 0.8, 0.05], glass);
  }
  mesh.box([-21, 6.3, 0], [5, 1.6, 4], teak, 0, white);

  // Lifeboats on the bridge deck.
  for (const side of [-1, 1]) {
    for (const x of [-9, 3.5]) lifeboat(mesh, x, side * 4.3);
  }

  // Ventilators.
  const vents: readonly Vec3[] = [[14, 5.5, 3], [14, 5.5, -3], [-17, 5.5, 2.5], [-17, 5.5, -2.5], [-26, 5.5, 3], [-26, 5.5, -3], [36, 8.3, 2.5], [36, 8.3, -2.5]];
  for (const vent of vents) {
    mesh.tube(vent, [vent[0], vent[1] + 2, vent[2]], 0.28, 0.28, 6, white);
    mesh.tube([vent[0], vent[1] + 2, vent[2]], [vent[0] + 0.45, vent[1] + 2.5, vent[2]], 0.3, 0.42, 6, flat("deck-house"));
    mesh.tube([vent[0] + 0.25, vent[1] + 2.3, vent[2]], [vent[0] + 0.5, vent[1] + 2.55, vent[2]], 0.33, 0.33, 6, flat("mast-dark"));
  }
  // Capstans on the forecastle, and the anchors at her bow.
  for (const x of [38, 41]) mesh.tube([x, 8.3, 0], [x, 9.3, 0], 0.5, 0.4, 8, flat("mast-dark"));
  for (const side of [-1, 1]) {
    mesh.tube([37.6, 7, side * 3.9], [36.6, 3.7, side * 4.05], 0.16, 0.16, 4, flat("mast-dark"));
    mesh.tube([35.9, 3.8, side * 4.05], [37.4, 3.4, side * 4.05], 0.16, 0.12, 4, flat("mast-dark"));
  }

  railing(mesh, [[POOP_END, RAISED_DECK, -5.9], [POOP_END, RAISED_DECK, 5.9]], 2.4);
  railing(mesh, [[FORECASTLE_START, RAISED_DECK, -5.9], [FORECASTLE_START, RAISED_DECK, 5.9]], 2.4);
  railing(mesh, [[BRIDGE[0], BRIDGE_DECK, 5.6], [BRIDGE[1], BRIDGE_DECK, 5.6]], 2.4);
  railing(mesh, [[BRIDGE[0], BRIDGE_DECK, -5.6], [BRIDGE[1], BRIDGE_DECK, -5.6]], 2.4);
  for (const side of [-1, 1]) {
    const rail = (share: number): Vec3 => {
      const point = hullPoint(2, share, side);
      return [point[0], Math.max(point[1], RAISED_DECK + 0.6), point[2] * 0.97];
    };
    railing(mesh, [rail(0.02), rail(0.07), rail(0.12), rail(0.17)], 2.6);
    railing(mesh, [rail(0.84), rail(0.89), rail(0.94)], 2.6);
  }
}

function lifeboat(mesh: MeshBuilder, x: number, z: number) {
  const white = flat("hull-white");
  const length = 7;
  const y = BRIDGE_DECK + 1.1;
  const half = 0.95;
  const at = (share: number, width: number, height: number): Vec3 => [x + (share - 0.5) * length, y + height, z + width];
  const shares = [0, 0.2, 0.8, 1];
  const widths = [0.02, half, half, 0.02];
  for (let part = 0; part < 3; part++) {
    for (const side of [-1, 1]) {
      mesh.quad(at(shares[part], side * widths[part] * 0.5, 0), at(shares[part + 1], side * widths[part + 1] * 0.5, 0), at(shares[part + 1], side * widths[part + 1], 0.8), at(shares[part], side * widths[part], 0.8), white);
    }
    mesh.quad(at(shares[part], -widths[part], 0.8), at(shares[part + 1], -widths[part + 1], 0.8), at(shares[part + 1], widths[part + 1], 0.8), at(shares[part], widths[part], 0.8), flat("wire-pale"));
  }
  for (const end of [0.1, 0.9]) mesh.tube(at(end, 0, -1.1), at(end, Math.sign(z) * 0.2, 1.9), 0.06, 0.06, 4, flat("mast-dark"));
}

/** A mast's three spars, in the buff-and-white they're painted, with their dark heads. */
function mast(mesh: MeshBuilder, x: number, top: number, sides: number, foot = MAIN_DECK) {
  const cream = flat("mast-cream");
  const white = flat("hull-white");
  const dark = flat("mast-dark");
  mesh.tube([x, foot, 0], [x, LOWER_TOP + 1.5, 0], 0.46, 0.34, sides, white);
  mesh.tube([x + 0.5, LOWER_TOP - 0.8, 0], [x + 0.5, TOPMAST_TOP + 1.2, 0], 0.27, 0.19, sides, cream);
  const headFoot = top - 5.5;
  mesh.tube([x + 0.5, TOPMAST_TOP - 1, 0], [x + 0.5, headFoot, 0], 0.17, 0.1, sides, cream);
  mesh.tube([x + 0.5, headFoot, 0], [x + 0.5, top, 0], 0.1, 0.04, sides, dark);
}

function tops(mesh: MeshBuilder, x: number) {
  const dark = flat("mast-dark");
  mesh.box([x + 0.1, LOWER_TOP, 0], [3.4, 0.22, 4.6], flat("mast-cream"));
  mesh.box([x + 0.5, TOPMAST_TOP, 0], [0.5, 0.18, 3.6], dark);
  mesh.box([x - 0.2, TOPMAST_TOP - 0.3, 0], [1.6, 0.18, 0.4], dark);
}

function yard(mesh: MeshBuilder, x: number, y: number, length: number, sides: number, stoutest: number) {
  const cream = flat("mast-cream");
  const centre: Vec3 = [x + 0.95, y, 0];
  const end = (share: number): Vec3 => [centre[0] + YARD_AXIS[0] * length * share, y, centre[2] + YARD_AXIS[2] * length * share];
  mesh.tube(centre, end(0.5), stoutest, stoutest * 0.4, sides, cream);
  mesh.tube(centre, end(-0.5), stoutest, stoutest * 0.4, sides, cream);
}

function jiggerGear(mesh: MeshBuilder) {
  const cream = flat("mast-cream");
  const rigging = flat("rigging");
  const gaffEnd: Vec3 = [JIGGER - 11, 31, 0];
  const boomEnd: Vec3 = [JIGGER - 14.5, 12.5, 0];
  mesh.tube([JIGGER, 23, 0], gaffEnd, 0.17, 0.08, 6, cream);
  mesh.tube([JIGGER, 11, 0], boomEnd, 0.2, 0.1, 6, cream);
  mesh.line([JIGGER, 34, 0], gaffEnd, ROPE, rigging);
  mesh.line(gaffEnd, boomEnd, ROPE, rigging);
  mesh.line([JIGGER, 18, 0], boomEnd, ROPE, rigging);
}

function bowsprit(mesh: MeshBuilder) {
  const white = flat("hull-white");
  const cream = flat("mast-cream");
  const middle: Vec3 = [BOWSPRIT_FOOT[0] + (BOWSPRIT_TIP[0] - BOWSPRIT_FOOT[0]) * 0.6, BOWSPRIT_FOOT[1] + (BOWSPRIT_TIP[1] - BOWSPRIT_FOOT[1]) * 0.6, 0];
  mesh.tube(BOWSPRIT_FOOT, middle, 0.48, 0.3, 8, white);
  mesh.tube(middle, BOWSPRIT_TIP, 0.3, 0.09, 8, cream);
}

function shrouds(mesh: MeshBuilder, x: number, rungsEvery: number) {
  const rope = flat("rigging");
  for (const side of [-1, 1]) {
    const share = (x - STERN) / LENGTH;
    const edge = HALF_BEAM * lookup(BEAM_SHARE, share) * 1.02;
    const y = lookup(SHEER, share) + 0.1;
    const feet: Vec3[] = [];
    for (let shroud = 0; shroud < 5; shroud++) {
      const foot: Vec3 = [x - 0.6 - shroud * 0.85, y, side * edge];
      feet.push(foot);
      mesh.line(foot, [x, LOWER_TOP, side * 0.8], WIRE, rope);
    }
    // Rungs across the shrouds, far enough apart to read as ratlines rather than a grey sheet.
    const front = feet[0];
    const back = feet[feet.length - 1];
    for (let rung = 1; rung * rungsEvery < LOWER_TOP - y - 2; rung++) {
      const share2 = (rung * rungsEvery) / (LOWER_TOP - y);
      const on = (foot: Vec3): Vec3 => [foot[0] + (x - foot[0]) * share2, foot[1] + (LOWER_TOP - foot[1]) * share2, foot[2] + (side * 0.8 - foot[2]) * share2];
      mesh.line(on(front), on(back), 0.04, rope);
    }
    for (let shroud = 0; shroud < 3; shroud++) mesh.line([x - 0.5 - shroud * 0.5, LOWER_TOP, side * 2.2], [x + 0.5, TOPMAST_TOP, side * 0.5], WIRE, rope);
    // Backstays, from the rail behind the shrouds to the topmast and topgallant heads.
    mesh.line([x - 6, y, side * edge], [x + 0.5, TOPMAST_TOP, side * 0.3], WIRE, rope);
    mesh.line([x - 7, y, side * edge], [x + 0.5, TOPMAST_TOP + 7, side * 0.15], WIRE, rope);
    mesh.line([x - 8, y, side * edge], [x + 0.5, 45.5, side * 0.1], WIRE, rope);
  }
}

function running(mesh: MeshBuilder, x: number) {
  const rope = flat("rigging");
  const wire = flat("wire-pale");
  for (const [y, length] of YARDS) {
    for (const end of [-0.5, 0.5]) {
      const arm: Vec3 = [x + 0.95 + YARD_AXIS[0] * length * end, y, YARD_AXIS[2] * length * end];
      mesh.line(arm, [x + 0.6, y + 4, 0], 0.05, wire);
    }
  }
  for (const [y, length] of [YARDS[0], YARDS[1]]) {
    for (const end of [-0.5, 0.5]) {
      const arm: Vec3 = [x + 0.95 + YARD_AXIS[0] * length * end, y, YARD_AXIS[2] * length * end];
      mesh.line(arm, [x - 19, y - 8, end * 12.5], 0.05, rope);
    }
  }
}

function stays(mesh: MeshBuilder) {
  const rope = flat("rigging");
  const masts = [...SQUARE_MASTS, JIGGER].sort((a, b) => b - a);
  for (let at = 0; at + 1 < masts.length; at++) {
    const fore = masts[at];
    const aft = masts[at + 1];
    const aftTop = aft === JIGGER ? JIGGER_TOP : MAST_TOP;
    mesh.line([aft, LOWER_TOP, 0], [fore, 7, 0], ROPE, rope);
    mesh.line([aft + 0.5, TOPMAST_TOP, 0], [fore, LOWER_TOP + 0.5, 0], ROPE, rope);
    mesh.line([aft + 0.5, aftTop - 7, 0], [fore + 0.5, TOPMAST_TOP, 0], ROPE, rope);
    mesh.line([aft + 0.5, aftTop - 1, 0], [fore + 0.5, 42, 0], ROPE, rope);
  }
  const fore = SQUARE_MASTS[0];
  const along = (share: number): Vec3 => [BOWSPRIT_FOOT[0] + (BOWSPRIT_TIP[0] - BOWSPRIT_FOOT[0]) * share, BOWSPRIT_FOOT[1] + (BOWSPRIT_TIP[1] - BOWSPRIT_FOOT[1]) * share, 0];
  mesh.line([fore, LOWER_TOP, 0], along(0.3), ROPE, rope);
  mesh.line([fore, LOWER_TOP + 0.5, 0], [BOW - 1, 9.8, 0], ROPE, rope);
  mesh.line([fore + 0.5, TOPMAST_TOP, 0], along(0.62), ROPE, rope);
  mesh.line([fore + 0.5, 38, 0], along(0.8), ROPE, rope);
  mesh.line([fore + 0.5, 46, 0], along(0.92), ROPE, rope);
  mesh.line([fore + 0.5, 51, 0], BOWSPRIT_TIP, ROPE, rope);
  // Under the bowsprit: the bobstays to her stem, the guys to her bows.
  mesh.line(along(0.92), [BOW - 2.5, 2.4, 0], ROPE, rope);
  mesh.line(along(0.6), [BOW - 2.2, 3.4, 0], ROPE, rope);
  for (const side of [-1, 1]) {
    mesh.line(along(0.92), [BOW - 8, 8.8, side * 2.8], ROPE, rope);
    mesh.line(along(0.6), [BOW - 8, 8.8, side * 2.6], ROPE, rope);
  }
}

/** Gold scrollwork along her bows. */
function bowStripe(mesh: MeshBuilder) {
  const gold = flat("hull-gold");
  for (const side of [-1, 1]) {
    for (let step = 0; step < 6; step++) {
      const a = 0.9 + step * 0.015;
      const b = a + 0.015;
      const under = (share: number): Vec3 => {
        const point = hullPoint(2, share, side);
        return [point[0], point[1] - 1.1, point[2] * 1.015];
      };
      const over = (share: number): Vec3 => {
        const point = under(share);
        return [point[0], point[1] + 0.3, point[2]];
      };
      mesh.quad(under(a), under(b), over(b), over(a), gold);
    }
  }
}

/** Her name, on both bows, in a blocky hand of strokes on a three-by-five grid. */
const NAME_STROKES: readonly (readonly number[])[] = [
  [0, 0, 0, 4, 0, 4, 2, 4, 2, 4, 2, 2, 2, 2, 0, 2],
  [0, 0, 2, 0, 2, 0, 2, 4, 2, 4, 0, 4, 0, 4, 0, 0],
  [0, 0, 0, 4, 0, 4, 1, 2, 1, 2, 2, 4, 2, 4, 2, 0],
  [0, 0, 0, 4, 0, 4, 1, 2, 1, 2, 2, 4, 2, 4, 2, 0],
  [0, 0, 0, 4, 0, 4, 2, 4, 0, 2, 2, 2, 0, 0, 2, 0],
  [0, 0, 0, 4, 0, 4, 2, 4, 2, 4, 2, 2, 2, 2, 0, 2, 1, 2, 2, 0],
  [0, 0, 0, 4, 0, 4, 2, 0, 2, 0, 2, 4],
];

function hullName(mesh: MeshBuilder) {
  const white = flat("hull-white");
  const cell = 0.11;
  const letter = 0.95;
  NAME_STROKES.forEach((strokes, at) => {
    for (const side of [-1, 1]) {
      const reading = side === 1 ? 6 - at : at;
      const anchorShare = 0.815 + reading * 0.0125;
      const anchor = hullPoint(2, anchorShare, side);
      const y = lookup(SHEER, anchorShare) - 2.2;
      const z = (hullPoint(1, anchorShare, side)[2] + anchor[2]) / 2 + side * 0.03;
      for (let stroke = 0; stroke + 3 < strokes.length; stroke += 4) {
        const flip = (grid: number) => (side === 1 ? 2 - grid : grid);
        const a: Vec3 = [anchor[0] + (flip(strokes[stroke]) * letter) / 2, y + strokes[stroke + 1] * cell * 2.2, z];
        const b: Vec3 = [anchor[0] + (flip(strokes[stroke + 2]) * letter) / 2, y + strokes[stroke + 3] * cell * 2.2, z];
        const up: Vec3 = a[1] === b[1] ? [0, cell, 0] : [cell, 0, 0];
        mesh.quad(a, b, [b[0] + up[0], b[1] + up[1], b[2]], [a[0] + up[0], a[1] + up[1], a[2]], white);
      }
    }
  });
}

function portholes(mesh: MeshBuilder) {
  const glass = flat("glass-sky");
  const half = 0.17;
  for (const side of [-1, 1]) {
    for (let hole = 0; hole < 26; hole++) {
      const share = 0.09 + hole * 0.033;
      const point = hullPoint(1, share, side);
      const rail = hullPoint(2, share, side);
      const y = lookup(SHEER, share) - 2.3;
      const z = point[2] + (rail[2] - point[2]) * 0.6 + side * 0.04;
      if (share > 0.8 && share < 0.92) continue;
      mesh.quad([point[0] - half, y - half, z], [point[0] + half, y - half, z], [point[0] + half, y + half, z], [point[0] - half, y + half, z], glass);
    }
  }
}

function nearModel() {
  const mesh = createBuilder(headed(BEARING_DEG));
  const stations = 34;
  HULL.skin(mesh, stations, [flat("hull-white"), flat("hull-black")], flat("wire-pale"));
  capRail(mesh, stations);
  HULL.deck(mesh, POOP_END, FORECASTLE_START, MAIN_DECK, flat("deck-wood"));
  HULL.deck(mesh, STERN + 1.2, POOP_END, RAISED_DECK, flat("deck-wood"), 6);
  HULL.deck(mesh, FORECASTLE_START, BOW - 3.5, RAISED_DECK, flat("deck-wood"), 8);
  portholes(mesh);
  houses(mesh);
  bowStripe(mesh);
  hullName(mesh);
  for (const x of SQUARE_MASTS) {
    mast(mesh, x, MAST_TOP, 8);
    tops(mesh, x);
    YARDS.forEach(([y, length], at) => {
      yard(mesh, x, y, length, 6, at === 0 ? 0.3 : 0.23);
    });
    shrouds(mesh, x, 1.3);
    running(mesh, x);
  }
  mast(mesh, JIGGER, JIGGER_TOP, 8, RAISED_DECK);
  tops(mesh, JIGGER);
  shrouds(mesh, JIGGER, 1.3);
  jiggerGear(mesh);
  bowsprit(mesh);
  stays(mesh);
  return mesh.done();
}

/** Far off she's a hull and a cross of spars. */
function farModel() {
  const mesh = createBuilder(headed(BEARING_DEG));
  HULL.skin(mesh, 10, [flat("hull-white"), flat("hull-black")]);
  HULL.deck(mesh, STERN + 2, BOW - 3.5, MAIN_DECK + 1, flat("deck-wood"), 3);
  const cream = flat("mast-cream");
  for (const x of [...SQUARE_MASTS, JIGGER]) mesh.tube([x, MAIN_DECK, 0], [x, x === JIGGER ? JIGGER_TOP : MAST_TOP, 0], 0.5, 0.12, 3, cream);
  for (const x of SQUARE_MASTS) {
    for (const at of [0, 2, 4]) yard(mesh, x, YARDS[at][0], YARDS[at][1], 3, 0.28);
  }
  mesh.tube(BOWSPRIT_FOOT, BOWSPRIT_TIP, 0.45, 0.14, 3, cream);
  return mesh.done();
}

export function buildPommern(): Landmark {
  return { id: "pommern", name: "Pommern", east: 107041, north: 6683323.5, baseM: 0.1, near: nearModel(), far: farModel(), farFromM: 900 };
}

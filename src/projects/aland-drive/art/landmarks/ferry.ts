import { createHull } from "./hull";
import { createBuilder, flat, headed, type MeshBuilder, type Paint } from "./kit";
import type { Landmark } from "./landmark";

/*
 * A generic Baltic cruise ferry, invented, with no real line's name or colours, for scale at Västerhamn: about 176 m
 * long and 28 m wide with twelve decks of cabins stepped back to a funnel aft. It lies at the north quay, where the
 * 2025 photo has the ferry berth.
 */

const LENGTH = 176;
const BOW = LENGTH / 2;
const STERN = -BOW;
const HALF_BEAM = 14;
const BEARING_DEG = 180.5;
const FREEBOARD = 13;

const HULL = createHull({
  halfBeam: HALF_BEAM,
  beamShare: [[0, 0.82], [0.02, 0.96], [0.08, 1], [0.66, 1], [0.78, 0.9], [0.88, 0.68], [0.95, 0.38], [0.99, 0.08], [1, 0]],
  sheer: [[0, FREEBOARD], [0.7, FREEBOARD], [0.86, FREEBOARD + 1.2], [1, FREEBOARD + 3]],
  levels: [
    { y: -0.5, from: STERN + 2, to: BOW - 9, beam: 0.97 },
    { y: 3.2, from: STERN + 1, to: BOW - 6.5, beam: 0.99 },
    { y: 8.5, from: STERN, to: BOW - 3, beam: 1 },
    { y: 0, from: STERN, to: BOW, beam: 1 },
  ],
});

/** Decks of cabins: the plan between `from` and `to`, narrowing at the bow. */
function storey(mesh: MeshBuilder, from: number, to: number, half: number, low: number, high: number, wall: Paint, windows: Paint | null) {
  const nose = to + half * 0.9;
  const outline = [[from, -half], [to, -half], [nose, -half * 0.3], [nose, half * 0.3], [to, half], [from, half]] as const;
  mesh.extrude(outline, low, high, wall, flat("deck-house"));
  if (!windows) return;
  const y = (low + high) / 2 + 0.2;
  const tall = (high - low) * 0.3;
  for (const side of [-1, 1]) {
    mesh.quad([from + 2, y - tall / 2, side * (half + 0.03)], [to, y - tall / 2, side * (half + 0.03)], [to, y + tall / 2, side * (half + 0.03)], [from + 2, y + tall / 2, side * (half + 0.03)], windows);
    mesh.quad([to, y - tall / 2, side * (half + 0.03)], [nose, y - tall / 2, side * (half * 0.3 + 0.03)], [nose, y + tall / 2, side * (half * 0.3 + 0.03)], [to, y + tall / 2, side * (half + 0.03)], windows);
  }
  mesh.quad([nose + 0.03, y - tall / 2, -half * 0.3], [nose + 0.03, y - tall / 2, half * 0.3], [nose + 0.03, y + tall / 2, half * 0.3], [nose + 0.03, y + tall / 2, -half * 0.3], windows);
}

function superstructure(mesh: MeshBuilder, detail: boolean) {
  const white = flat("ferry");
  const glass = flat("glass");
  const deckHeight = 2.9;
  const decks = [
    { from: -82, to: 54, half: 13.6 },
    { from: -82, to: 54, half: 13.6 },
    { from: -82, to: 53, half: 13.6 },
    { from: -80, to: 52, half: 13.6 },
    { from: -76, to: 51, half: 13.6 },
    { from: -70, to: 50, half: 13.4 },
    { from: -60, to: 46, half: 13 },
    { from: -56, to: 40, half: 12 },
  ];
  decks.forEach(({ from, to, half }, at) => {
    const low = FREEBOARD + at * deckHeight;
    storey(mesh, from, to, half, low, low + deckHeight, white, detail ? glass : null);
  });
  const roof = FREEBOARD + decks.length * deckHeight;

  // The bridge, wide as the ship, and its wings.
  mesh.box([32, roof + 1.5, 0], [10, 3, 28], white, 0, flat("deck-house"));
  mesh.box([37.1, roof + 1.7, 0], [0.1, 1.5, 27], glass);
}

function funnel(mesh: MeshBuilder) {
  const roof = FREEBOARD + 8 * 2.9;
  for (const side of [-1, 1]) {
    mesh.box([-35, roof + 5.5, side * 4.6], [15, 11, 2.6], flat("ferry-funnel"), 0, flat("hull-black"));
    mesh.box([-35, roof + 10.2, side * 4.62], [15.1, 1.6, 2.64], flat("ferry-blue"), 0, flat("hull-black"));
  }
  mesh.box([-20, roof + 2.2, 0], [10, 4.4, 9], flat("ferry"), 0, flat("deck-house"));
  mesh.tube([18, roof, 0], [18, roof + 9, 0], 0.4, 0.15, 6, flat("ferry"));
}

function hullPaint(mesh: MeshBuilder, stations: number) {
  HULL.skin(mesh, stations, [flat("ferry-red"), flat("ferry-blue"), flat("ferry")]);
  HULL.deck(mesh, STERN + 1, BOW - 12, FREEBOARD, flat("deck-house"), 8);
  // A stripe sweeping along her side, and a car deck's ribbon of ports.
  for (const side of [-1, 1]) {
    for (let station = 0; station < stations; station++) {
      const a = station / stations;
      const b = (station + 1) / stations;
      const low = (share: number) => HULL.point(2, share, side);
      const high = (share: number) => HULL.point(3, share, side);
      const on = (share: number, up: number) => {
        const p = low(share);
        const q = high(share);
        const y = p[1] + (q[1] - p[1]) * up;
        return [p[0] + (q[0] - p[0]) * up, y, p[2] * 1.002] as const;
      };
      if (a > 0.05 && b < 0.84) mesh.quad(on(a, 0.45), on(b, 0.45), on(b, 0.62), on(a, 0.62), flat("glass"));
    }
  }
}

export function buildFerry(): Landmark {
  const near = createBuilder(headed(BEARING_DEG));
  hullPaint(near, 24);
  superstructure(near, true);
  funnel(near);

  const far = createBuilder(headed(BEARING_DEG));
  HULL.skin(far, 8, [flat("ferry-red"), flat("ferry-blue"), flat("ferry")]);
  far.box([-14, 25, 0], [136, 24, 27], flat("ferry"), 0, flat("deck-house"));
  far.box([-35, 42, 0], [15, 11, 11], flat("ferry-funnel"));

  return { id: "ferry", name: "Ferry at Västerhamn", east: 107096, north: 6682850, baseM: 0.1, near: near.done(), far: far.done(), farFromM: 900 };
}

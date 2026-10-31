import { createHull } from "./hull";
import { createBuilder, flat, headed, type MeshBuilder } from "./kit";
import type { Landmark } from "./landmark";

/*
 * F.P. von Knorring, the 1928 Dutch river passenger ship moored as a restaurant in Österhamn: a long low black hull with
 * a high bow and a thin red boot line, a white cabin run with square windows, a dark glazed upper saloon aft, a funnel
 * and one mast. Length and bearing are OSM's and the 2025 photo's; deck heights are the laser's.
 */

const LENGTH = 46;
const BOW = LENGTH / 2;
const STERN = -BOW;
const BEARING_DEG = 250.9;
const DECK = 1.8;
const CABIN = { from: -16, to: 13, half: 3.2, top: 4.1 };
const UPPER = { from: -15.5, to: -4, half: 2.9, top: 6.2 };
const MAST_X = 6;
const MAST_TOP = 13;

const HULL = createHull({
  halfBeam: 4.1,
  beamShare: [[0, 0.5], [0.04, 0.78], [0.12, 0.96], [0.2, 1], [0.66, 1], [0.8, 0.86], [0.9, 0.56], [0.97, 0.2], [1, 0]],
  sheer: [[0, 2.6], [0.15, 2.3], [0.5, 2.2], [0.75, 2.7], [1, 4]],
  levels: [
    { y: -0.5, from: STERN + 2.5, to: BOW - 1.2, beam: 0.95, sharpen: 1.3 },
    { y: 0.35, from: STERN + 1, to: BOW - 0.9, beam: 0.98 },
    { y: 0, from: STERN, to: BOW, beam: 1 },
  ],
});

function ribbon(mesh: MeshBuilder, from: number, to: number, half: number, low: number, high: number, panes: number) {
  const glass = flat("glass");
  const pitch = (to - from) / panes;
  for (let pane = 0; pane < panes; pane++) {
    const x = from + (pane + 0.5) * pitch;
    for (const side of [-1, 1]) mesh.box([x, (low + high) / 2, side * (half + 0.02)], [pitch * 0.68, high - low, 0.05], glass);
  }
}

function cabins(mesh: MeshBuilder) {
  const white = flat("hull-white");
  const roof = flat("deck-wood");
  mesh.box([(CABIN.from + CABIN.to) / 2, (DECK + CABIN.top) / 2, 0], [CABIN.to - CABIN.from, CABIN.top - DECK, CABIN.half * 2], white, 0, roof);
  ribbon(mesh, CABIN.from + 0.8, CABIN.to - 0.8, CABIN.half, 2.65, 3.45, 13);
  mesh.box([(CABIN.from + CABIN.to) / 2, CABIN.top + 0.05, 0], [CABIN.to - CABIN.from + 0.8, 0.12, CABIN.half * 2 + 0.7], flat("hull-black"));

  const dark = flat("hull-black", 1.5);
  mesh.box([(UPPER.from + UPPER.to) / 2, (CABIN.top + UPPER.top) / 2, 0], [UPPER.to - UPPER.from, UPPER.top - CABIN.top, UPPER.half * 2], dark, 0, flat("hull-black"));
  ribbon(mesh, UPPER.from + 0.4, UPPER.to - 0.4, UPPER.half, 4.6, 5.7, 7);
  mesh.box([(UPPER.from + UPPER.to) / 2, UPPER.top + 0.06, 0], [UPPER.to - UPPER.from + 1, 0.12, UPPER.half * 2 + 0.8], flat("hull-white"));

  // The stern saloon, on the deck behind the cabins, glazed all round.
  mesh.box([-19, (DECK + 4) / 2, 0], [5.4, 2.2, 6.4], dark, 0, flat("hull-black"));
  ribbon(mesh, -21.4, -16.6, 3.2, 2.5, 3.7, 3);

  // The funnel and its white band, and the mast with its crosstree.
  const funnelX = -7.5;
  mesh.tube([funnelX, UPPER.top, 0], [funnelX, UPPER.top + 1.5, 0], 0.62, 0.62, 10, flat("hull-black"));
  mesh.tube([funnelX, UPPER.top + 0.55, 0], [funnelX, UPPER.top + 1, 0], 0.64, 0.64, 10, flat("hull-white"));
  mesh.tube([MAST_X, CABIN.top, 0], [MAST_X, MAST_TOP, 0], 0.16, 0.06, 8, flat("mast-dark"));
  mesh.box([MAST_X, 9.3, 0], [0.12, 0.12, 2.3], flat("mast-dark"));
  const rope = flat("rigging");
  mesh.line([MAST_X, MAST_TOP - 0.3, 0], [BOW - 0.8, 4.1, 0], 0.04, rope);
  mesh.line([MAST_X, MAST_TOP - 0.3, 0], [STERN + 1, 2.8, 0], 0.04, rope);
  for (const side of [-1, 1]) mesh.line([MAST_X, 9.3, 0], [MAST_X - 1, 2.3, side * 3.9], 0.04, rope);
}

function foredeck(mesh: MeshBuilder) {
  const white = flat("hull-white");
  for (const side of [-1, 1]) {
    for (let post = 0; post <= 7; post++) {
      const share = 0.8 + post * 0.022;
      const point = HULL.point(2, share, side);
      mesh.line(point, [point[0], point[1] + 0.9, point[2]], 0.05, white);
      if (post < 7) {
        const next = HULL.point(2, share + 0.022, side);
        mesh.line([point[0], point[1] + 0.9, point[2]], [next[0], next[1] + 0.9, next[2]], 0.05, white);
      }
    }
  }
}

export function buildVonKnorring(): Landmark {
  const near = createBuilder(headed(BEARING_DEG));
  const bands = [flat("hull-red"), flat("hull-black")];
  HULL.skin(near, 22, bands);
  HULL.deck(near, STERN + 1, BOW - 2.4, DECK, flat("deck-wood"), 10);
  cabins(near);
  foredeck(near);

  const far = createBuilder(headed(BEARING_DEG));
  HULL.skin(far, 6, bands);
  far.box([-1.5, 3, 0], [29, 2.3, 6.4], flat("hull-white"));
  far.box([-10, 5.2, 0], [11.5, 2.1, 5.8], flat("hull-black"));
  far.tube([MAST_X, 4, 0], [MAST_X, MAST_TOP, 0], 0.2, 0.08, 3, flat("mast-dark"));

  return { id: "von-knorring", name: "F.P. von Knorring", east: 108303, north: 6683347, baseM: 0.13, near: near.done(), far: far.done(), farFromM: 500 };
}

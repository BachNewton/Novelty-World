import { Model } from "./mesh";
import type { RoadsideModel } from "./models";

/*
 * The things sized to fit: road bridges, harbour piers and pontoons. Each runs along
 * +x from its origin. A bridge's y 0 is the road's surface, which the road's own
 * ribbon draws, so a bridge has no surface of its own to fight it. A pier's and a
 * pontoon's y 0 is the water.
 */

const STRUCTURE_REACH_M = 1400;
const STRUCTURE_SWAP_M = 220;

export interface BridgeSize {
  /** End to end, along the road. */
  spanM: number;
  /** The road's width between the kerbs. */
  widthM: number;
  /** From the road down to the water or the ground, at the middle. */
  dropM: number;
}

const DECK_DEEP_M = 0.8;
const KERB_WIDE_M = 0.4;
const KERB_TALL_M = 0.18;
const LONGEST_BAY_M = 16;
const RAIL_BAY_M = 2.4;
const RAIL_TALL_M = 1.1;
/** How far a pier goes on below the surface it stands in. */
const FOOTING_M = 1.5;
const ABUTMENT_TOP_M = 0.4;
const ABUTMENT_LEAN_M = 1.2;
const ABUTMENT_WING_M = 3;

export function buildBridge({ spanM, widthM, dropM }: BridgeSize): RoadsideModel {
  const halfWide = widthM / 2 + KERB_WIDE_M;
  const bays = Math.max(1, Math.ceil(spanM / LONGEST_BAY_M));
  const piers = Array.from({ length: bays - 1 }, (_, pier) => ((pier + 1) / bays) * spanM);
  const pierBottom = -dropM - FOOTING_M;
  const narrow = Math.min(1.2, halfWide * 0.3);

  const deck = (into: Model) =>
    into
      .face([[0, -0.02, halfWide], [spanM, -0.02, halfWide], [spanM, -0.3, halfWide], [0, -0.3, halfWide]], "concrete", 1.05)
      .face([[spanM, -0.02, -halfWide], [0, -0.02, -halfWide], [0, -0.3, -halfWide], [spanM, -0.3, -halfWide]], "concrete", 1.05)
      .face([[0, -0.3, halfWide], [spanM, -0.3, halfWide], [spanM, -DECK_DEEP_M, halfWide - narrow], [0, -DECK_DEEP_M, halfWide - narrow]], "concrete-dark", 0.85)
      .face([[spanM, -0.3, -halfWide], [0, -0.3, -halfWide], [0, -DECK_DEEP_M, -halfWide + narrow], [spanM, -DECK_DEEP_M, -halfWide + narrow]], "concrete-dark", 0.85)
      .face([[0, -DECK_DEEP_M, halfWide - narrow], [spanM, -DECK_DEEP_M, halfWide - narrow], [spanM, -DECK_DEEP_M, -halfWide + narrow], [0, -DECK_DEEP_M, -halfWide + narrow]], "concrete-dark", 0.6)
      .face([[0, -0.02, halfWide], [spanM, -0.02, halfWide], [spanM, -0.02, -halfWide], [0, -0.02, -halfWide]], "concrete", 0.9);

  const near = deck(new Model());
  const far = deck(new Model());
  for (const side of [-1, 1]) {
    const middle = side * (widthM / 2 + KERB_WIDE_M / 2);
    near.box([0, -0.02, middle - KERB_WIDE_M / 2], [spanM, KERB_TALL_M, middle + KERB_WIDE_M / 2], "concrete", { open: true, shadeTop: 1.1 });
    const railZ = side * (widthM / 2 + KERB_WIDE_M - 0.1);
    near.beam([0, RAIL_TALL_M, railZ], [spanM, RAIL_TALL_M, railZ], 0.1, 0.07, "rail-steel", 1, 1.15);
    near.beam([0, 0.62, railZ], [spanM, 0.62, railZ], 0.05, 0.05, "rail-steel", 0.9);
    const posts = Math.round(spanM / RAIL_BAY_M);
    for (let post = 0; post <= posts; post++) {
      const x = (post / posts) * spanM;
      near.beam([x, KERB_TALL_M, railZ], [x, RAIL_TALL_M, railZ], 0.08, 0.05, "rail-steel", 0.95);
    }
    far.beam([0, 0.75, railZ], [spanM, 0.75, railZ], 0.08, 0.7, "rail-steel", 0.8);
  }
  for (const x of piers) {
    near.box([x - 0.45, -DECK_DEEP_M - 0.55, -halfWide * 0.85], [x + 0.45, -DECK_DEEP_M, halfWide * 0.85], "concrete");
    for (const side of [-0.55, 0.55]) near.tube([x, pierBottom, side * halfWide], [x, -DECK_DEEP_M - 0.55, side * halfWide], 0.42, 6, {}, "concrete");
    far.box([x - 0.4, pierBottom, -halfWide * 0.75], [x + 0.4, -DECK_DEEP_M, halfWide * 0.75], "concrete", { open: true });
  }
  // Abutments lean back into the bank, and a wing each side holds the bank in.
  for (const [end, way] of [[0, -1], [spanM, 1]] as const) {
    const [top, foot] = [end + way * ABUTMENT_TOP_M, end - way * ABUTMENT_LEAN_M];
    for (const into of [near, far]) {
      into.face([[top, -0.02, -halfWide], [top, -0.02, halfWide], [foot, pierBottom, halfWide], [foot, pierBottom, -halfWide]], "concrete-dark", 0.92);
      for (const side of [-halfWide, halfWide]) into.face([[end + way * ABUTMENT_WING_M, -0.02, side], [foot, -0.02, side], [foot, pierBottom, side]], "concrete-dark", 0.8);
    }
  }
  return { near: near.build(), far: far.build(), swapM: STRUCTURE_SWAP_M, reachM: STRUCTURE_REACH_M };
}

export interface HarbourSize {
  lengthM: number;
  widthM: number;
}

const PIER_DECK_M = 0.95;
const PLANK_BAY_M = 0.55;
const PILE_BAY_M = 3.2;
/** How far piles go under the water. There's no sea bed in the data, and the sea plane hides them. */
const PILE_DEPTH_M = 1.2;

/** Bands of boards across a deck, each a little different, so a timber deck reads as boards with no texture. */
function boards(into: Model, lengthM: number, widthM: number, y: number): Model {
  const bays = Math.round(lengthM / PLANK_BAY_M);
  for (let bay = 0; bay < bays; bay++) {
    const [from, to] = [(bay / bays) * lengthM, ((bay + 1) / bays) * lengthM];
    into.face([[from, y, widthM / 2], [to, y, widthM / 2], [to, y, -widthM / 2], [from, y, -widthM / 2]], bay % 3 === 1 ? "pier-wood" : "pier-wood-pale", 0.96 + ((bay * 5) % 7) * 0.016);
  }
  return into;
}

function deckEdges(into: Model, lengthM: number, widthM: number, y: number, deep: number): Model {
  for (const z of [-widthM / 2, widthM / 2]) into.beam([0, y - deep / 2, z], [lengthM, y - deep / 2, z], 0.14, deep, "pier-wood", 0.72, 0.9);
  return into.face([[lengthM, y - deep, widthM / 2], [lengthM, y - deep, -widthM / 2], [lengthM, y, -widthM / 2], [lengthM, y, widthM / 2]], "pier-wood", 0.75);
}

/** A timber pier on pairs of piles, from the shore out. */
export function buildPier({ lengthM, widthM }: HarbourSize): RoadsideModel {
  const near = deckEdges(boards(new Model(), lengthM, widthM, PIER_DECK_M), lengthM, widthM, PIER_DECK_M, 0.24);
  const piles = Math.max(1, Math.round(lengthM / PILE_BAY_M));
  const pileAt = (pile: number) => Math.min((pile / piles) * lengthM, lengthM - 0.1);
  for (let pile = 0; pile <= piles; pile++) {
    const x = pileAt(pile);
    const atEnd = pile === piles;
    near.beam([x, PIER_DECK_M - 0.3, -widthM / 2], [x, PIER_DECK_M - 0.3, widthM / 2], 0.16, 0.16, "pier-wood", 0.7);
    for (const z of [-widthM / 2, widthM / 2]) near.tube([x, -PILE_DEPTH_M, z], [x, atEnd ? PIER_DECK_M + 0.55 : PIER_DECK_M - 0.1, z], 0.13, 4, { cap: atEnd, shadeFrom: 0.5, shadeTo: 1 }, "pile-wood");
  }
  const far = deckEdges(new Model().face([[0, PIER_DECK_M, widthM / 2], [lengthM, PIER_DECK_M, widthM / 2], [lengthM, PIER_DECK_M, -widthM / 2], [0, PIER_DECK_M, -widthM / 2]], "pier-wood-pale"), lengthM, widthM, PIER_DECK_M, 0.5);
  for (let pile = 0; pile <= piles; pile += 2) {
    const x = pileAt(pile);
    far.face([[x, 0, -widthM / 2], [x, 0, widthM / 2], [x, PIER_DECK_M, widthM / 2], [x, PIER_DECK_M, -widthM / 2]], "pile-wood", 0.6);
  }
  return { near: near.build(), far: far.build(), swapM: STRUCTURE_SWAP_M, reachM: STRUCTURE_REACH_M };
}

const PONTOON_DECK_M = 0.42;
const GUIDE_PILE_TALL_M = 2.2;
const CLEAT_BAY_M = 4;

/** A floating timber pontoon: a dark hull, boards on top, cleats, and guide piles that hold it in place. */
export function buildPontoon({ lengthM, widthM }: HarbourSize): RoadsideModel {
  const hull = (into: Model) => into.box([0, -0.25, -widthM / 2], [lengthM, PONTOON_DECK_M - 0.04, widthM / 2], "pontoon-hull", { open: true, shade: 0.9 });
  const near = deckEdges(boards(hull(new Model()), lengthM, widthM, PONTOON_DECK_M), lengthM, widthM, PONTOON_DECK_M, 0.1);
  const cleats = Math.max(1, Math.floor(lengthM / CLEAT_BAY_M));
  for (let cleat = 0; cleat <= cleats; cleat++) {
    const x = 0.4 + (cleat / cleats) * (lengthM - 0.8);
    for (const z of [-widthM / 2 + 0.14, widthM / 2 - 0.14]) near.beam([x - 0.13, PONTOON_DECK_M + 0.06, z], [x + 0.13, PONTOON_DECK_M + 0.06, z], 0.06, 0.05, "steel-band", 1, 1.2);
  }
  for (const x of [lengthM * 0.15, lengthM * 0.85]) near.tube([x, -PILE_DEPTH_M, widthM / 2 + 0.2], [x, GUIDE_PILE_TALL_M, widthM / 2 + 0.2], 0.12, 5, { cap: true, shadeFrom: 0.5, shadeTo: 1.05 }, "pile-wood");
  const far = hull(new Model()).face([[0, PONTOON_DECK_M, widthM / 2], [lengthM, PONTOON_DECK_M, widthM / 2], [lengthM, PONTOON_DECK_M, -widthM / 2], [0, PONTOON_DECK_M, -widthM / 2]], "pier-wood-pale");
  return { near: near.build(), far: far.build(), swapM: STRUCTURE_SWAP_M, reachM: STRUCTURE_REACH_M };
}

/** A short boarded ramp with a rail, from a shore or pier down to a pontoon. Shear it to the drop. */
export function buildGangway(lengthM: number): RoadsideModel {
  const half = 0.6;
  const near = boards(new Model(), lengthM, half * 2, 0.04);
  for (const z of [-half, half]) {
    near.beam([0, 0, z], [lengthM, 0, z], 0.08, 0.14, "pier-wood", 0.8);
    near.beam([0, 1, z], [lengthM, 1, z], 0.05, 0.05, "rail-steel");
    for (const x of [0.05, lengthM / 2, lengthM - 0.05]) near.beam([x, 0, z], [x, 1, z], 0.04, 0.04, "rail-steel");
  }
  return { near: near.build(), far: null, swapM: STRUCTURE_SWAP_M, reachM: STRUCTURE_SWAP_M };
}

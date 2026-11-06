import { seeded, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, streetModel, type Motion, type StreetPart } from "./paint";

/*
 * The verge's dressing, placed by the thousand. Every blade is one opaque triangle,
 * a card cut to its own shape: no alpha, so no overdraw of empty card, nothing to
 * sort and no alpha test to shimmer, the forest's reason too. A clump's far version
 * is the near one simplified, gone by its reach; where it swaps is the LOD check's.
 */

const SINK_M = 0.1;
const VERGE_SWAP_M = 34;
const VERGE_REACH_M = 110;

/** What's tall bends, what's short hardly moves. */
const bends: Motion = (_, [, y]) => ({ kind: "leaf", metres: Math.max(0, y) * 0.09 });

/** A tall blade: wide at the foot, bent over at the tip. */
function blade(into: Painted, random: () => number, reach: number, tall: number, part: StreetPart): Painted {
  const turn = random() * 6.283;
  const at = random() * reach;
  const foot: V3 = [Math.cos(turn) * at, -SINK_M, Math.sin(turn) * at];
  const lean = 0.12 + random() * 0.34;
  const tip: V3 = [foot[0] + Math.cos(turn) * lean * tall, tall * (0.8 + random() * 0.3), foot[2] + Math.sin(turn) * lean * tall];
  const wide = 0.035 + random() * 0.035;
  const [sideX, sideZ] = [-Math.sin(turn) * wide, Math.cos(turn) * wide];
  return into.face([[foot[0] - sideX, foot[1], foot[2] - sideZ], [foot[0] + sideX, foot[1], foot[2] + sideZ], tip], part, 0.82 + random() * 0.36);
}

/**
 * A tuft's outline from afar: three points, never a solid block, on two cards crossed so it stands seen from any side,
 * as the near tuft does; the middle one may take a paint of its own.
 */
function farCard(tall: number, wide: number, part: StreetPart, middle = part): Painted {
  const card = new Painted();
  for (const turned of [false, true]) {
    const at = (across: number, up: number): V3 => (turned ? [0, up, across] : [across, up, 0]);
    for (const [x, height, lean] of [[-wide * 0.6, 0.78, -0.4], [0, 1, 0.1], [wide * 0.6, 0.86, 0.5]]) {
      card.face([at(x - wide * 0.55, -SINK_M), at(x + wide * 0.55, -SINK_M), at(x + lean * wide, tall * height)], x === 0 ? middle : part, 0.92);
    }
  }
  return card;
}

/** Where a flower card's heads stand, across as a share of the clump's spread and up as a share of its height, as the near clump's stems hold them. */
const CARD_HEADS = [
  [-1, 0.8],
  [-0.35, 0.98],
  [0.4, 0.9],
  [1, 0.76],
] as const;
/** A flower clump's leaves at its foot, across as a share of its spread and up as a share of its height. */
const CARD_LEAVES = [
  [-0.35, 0.5],
  [0, 0.58],
  [0.35, 0.46],
] as const;

/**
 * A clump of flowers with heads from afar: the near clump simplified, a low tuft of leaves with flat heads held up
 * above it on stems, as wide and as high as the near heads, never green points with a fleck on each. It's two cards
 * crossed, so a clump seen side on still stands there. `spread` is how far out from the middle the heads reach.
 * Leaves, stems and heads that cross each stand their own `LAYER_M` off the card, or they'd fight for its plane.
 */
function headsCard(tall: number, spread: number, petal: StreetPart, size: number): Painted {
  const card = new Painted();
  for (const turned of [false, true]) {
    const at = (across: number, up: number, layer: number): V3 => (turned ? [layer * LAYER_M, up, across] : [across, up, layer * LAYER_M]);
    // The outer leaves don't reach each other, so only the middle one needs a layer of its own.
    CARD_LEAVES.forEach(([x, height], leaf) => card.face([at((x - 0.3) * spread, -SINK_M, leaf % 2), at((x + 0.3) * spread, -SINK_M, leaf % 2), at(x * 1.4 * spread, height * tall, leaf % 2)], "stem", 0.92));
    const stemLayer = 2;
    CARD_HEADS.forEach(([x, height], index) => {
      const [across, up] = [x * spread, height * tall];
      card.face([at(across * 0.4 - 0.012, tall * 0.3, stemLayer + (index % 2)), at(across * 0.4 + 0.012, tall * 0.3, stemLayer + (index % 2)), at(across, up, stemLayer + (index % 2))], "stem");
      card.face([at(across - size, up, stemLayer + 2), at(across, up - size * 0.35, stemLayer + 2), at(across + size, up, stemLayer + 2), at(across, up + size * 0.45, stemLayer + 2)], petal, 1.05);
    });
  }
  return card;
}

/** How far apart a flower card's crossing parts stand. */
const LAYER_M = 0.01;

/** How far a flower's heads reach from its middle: the near clump's stems lean out to this. */
const HEADS_SPREAD_M = 0.2;

const GRASS_BLADES = 16;

/** A tuft of tall grass, seeded so a few versions make a verge. */
export function buildGrassTuft(seed = 3, tallM = 0.75): RoadsideModel {
  const random = seeded(seed);
  const near = new Painted();
  for (let index = 0; index < GRASS_BLADES; index++) blade(near, random, 0.2, tallM * (0.55 + random() * 0.55), index % 3 === 0 ? "grass-pale" : "grass");
  return streetModel(near, farCard(tallM * 0.8, 0.3, "grass", "grass-pale"), VERGE_SWAP_M, VERGE_REACH_M, bends);
}

/** A stand of timothy gone to seed: thin stalks with a dark head, above a few blades. */
export function buildSeedGrass(seed = 11): RoadsideModel {
  const random = seeded(seed);
  const near = new Painted();
  for (let index = 0; index < 9; index++) blade(near, random, 0.16, 0.55, "grass");
  for (let stalk = 0; stalk < 5; stalk++) {
    const [x, z] = [(random() - 0.5) * 0.3, (random() - 0.5) * 0.3];
    const tall = 0.85 + random() * 0.35;
    const [tipX, tipZ] = [x + (random() - 0.5) * 0.22, z + (random() - 0.5) * 0.22];
    near.face([[x - 0.012, -SINK_M, z], [x + 0.012, -SINK_M, z], [tipX, tall, tipZ]], "grass-pale");
    near.face([[tipX - 0.016, tall - 0.16, tipZ], [tipX + 0.016, tall - 0.16, tipZ], [tipX, tall + 0.03, tipZ]], "grass-seed");
  }
  return streetModel(near, farCard(0.7, 0.2, "grass-pale"), VERGE_SWAP_M, VERGE_REACH_M, bends);
}

export type Wildflower = "daisy" | "buttercup" | "lupine" | "fireweed" | "cow-parsley";

/** A small head of petals facing up and out: a diamond seen from most ways. */
function head(into: Painted, at: V3, size: number, part: StreetPart): Painted {
  const [x, y, z] = at;
  return into
    .face([[x - size, y, z], [x, y + size * 0.55, z + size * 0.3], [x + size, y, z], [x, y - size * 0.45, z - size * 0.3]], part, 1.05)
    .face([[x, y, z - size], [x + size * 0.3, y + size * 0.55, z], [x, y, z + size], [x - size * 0.3, y - size * 0.45, z]], part, 0.92);
}

function stems(into: Painted, random: () => number, count: number, tall: number, spread: number): V3[] {
  return Array.from({ length: count }, () => {
    const [x, z] = [(random() - 0.5) * spread, (random() - 0.5) * spread];
    const top: V3 = [x * 1.7, tall * (0.72 + random() * 0.38), z * 1.7];
    into.face([[x - 0.014, -SINK_M, z], [x + 0.014, -SINK_M, z], top], "stem");
    return top;
  });
}

/** A few of the flower's leaves at the foot of a clump, so it stands in green rather than on bare stems. */
function foot(into: Painted, random: () => number, tall: number): Painted {
  for (let index = 0; index < 7; index++) blade(into, random, 0.14, tall, "stem");
  return into;
}

interface Flower {
  petal: StreetPart;
  tallM: number;
  stems: number;
  size: number;
}

/** Upright buds up a spire, overlapping and each turned its own way, narrowing to the tip: a cone would be a solid party hat. */
const SPIRE_BUDS = 8;

const DAISIES: Record<"daisy" | "buttercup", Flower> = {
  daisy: { petal: "petal-white", tallM: 0.62, stems: 6, size: 0.055 },
  buttercup: { petal: "petal-yellow", tallM: 0.55, stems: 7, size: 0.034 },
};

/** A clump of a roadside flower. Lupine and fireweed are the tall spires of a Finnish June; the rest stand in the grass. */
export function buildWildflowers(kind: Wildflower, seed = 5): RoadsideModel {
  const random = seeded(seed);
  const near = new Painted();
  if (kind === "daisy" || kind === "buttercup") {
    const { petal, tallM, stems: count, size } = DAISIES[kind];
    foot(near, random, tallM * 0.55);
    for (const top of stems(near, random, count, tallM, 0.26)) {
      head(near, top, size, petal);
      if (kind === "daisy") near.face([[top[0] - 0.014, top[1] + 0.014, top[2]], [top[0] + 0.014, top[1] + 0.014, top[2]], [top[0], top[1] + 0.03, top[2]]], "flower-eye");
    }
    return streetModel(near, headsCard(tallM, HEADS_SPREAD_M, petal, size), VERGE_SWAP_M, VERGE_REACH_M, bends);
  }
  if (kind === "cow-parsley") {
    foot(near, random, 0.5);
    for (const top of stems(near, random, 5, 1.05, 0.26)) {
      head(near, top, 0.075 + random() * 0.025, "petal-white");
    }
    return streetModel(near, headsCard(1.05, HEADS_SPREAD_M * 0.75, "petal-white", 0.11), VERGE_SWAP_M, VERGE_REACH_M, bends);
  }
  const part = kind === "lupine" ? "petal-lupine" : "petal-fireweed";
  const tall = kind === "lupine" ? 1 : 1.2;
  foot(near, random, tall * 0.5);
  // The far clump is the near one simplified: fewer leaves at its foot, and each spire, on its own stem where the near
  // one stands, a spindle of its colour as wide and as tall as its buds reach, crossed so it stands seen from any side.
  const far = new Painted();
  const farRandom = seeded(seed + 101);
  for (let leaf = 0; leaf < 4; leaf++) blade(far, farRandom, 0.14, tall * 0.5, "stem");
  for (const top of stems(near, random, 3, tall * 0.68, 0.3)) {
    const spire = tall * (0.3 + random() * 0.1);
    const reach = spire * ((SPIRE_BUDS - 1) / SPIRE_BUDS) + (spire / SPIRE_BUDS) * 1.7;
    const [x, z] = [top[0] / 1.7, top[2] / 1.7];
    far.face([[x - 0.014, -SINK_M, z], [x + 0.014, -SINK_M, z], top], "stem");
    for (const [acrossX, acrossZ] of [
      [0.036, 0],
      [0, 0.036],
    ]) {
      far.face([[top[0], top[1] - 0.02, top[2]], [top[0] + acrossX, top[1] + reach * 0.22, top[2] + acrossZ], [top[0], top[1] + reach, top[2]], [top[0] - acrossX, top[1] + reach * 0.22, top[2] - acrossZ]], part);
    }
    near.face([[top[0] - 0.01, top[1] - 0.02, top[2]], [top[0] + 0.01, top[1] - 0.02, top[2]], [top[0], top[1] + spire, top[2]]], "stem");
    for (let bud = 0; bud < SPIRE_BUDS; bud++) {
      const share = bud / SPIRE_BUDS;
      const turn = bud * 2.4;
      const wide = 0.036 * (1 - share * 0.7);
      const [sideX, sideZ] = [Math.cos(turn) * wide, Math.sin(turn) * wide];
      const [x, y, z] = [top[0] + sideZ * 0.5, top[1] + spire * share, top[2] - sideX * 0.5];
      const high = (spire / SPIRE_BUDS) * 1.7;
      near.face([[x, y, z], [x + sideX, y + high * 0.45, z + sideZ], [x, y + high, z], [x - sideX, y + high * 0.45, z - sideZ]], part, bud % 2 === 0 ? 1.1 : 0.9);
    }
  }
  return streetModel(near, far, VERGE_SWAP_M, VERGE_REACH_M, bends);
}

import { seeded, type V3 } from "../roadside/mesh";
import type { Placement } from "../roadside/material";
import type { RoadsideModel } from "../roadside/models";
import { yawAlong, type LinePoint } from "../street/place";
import { TownPainted, townModel, type TownMotion } from "./paint";

/*
 * A marina as a few models and a list of places: a length of pontoon, a yacht in two hull colours and a motor launch,
 * each near and far, so every marina on the island shares a handful of draw calls. A boat's size comes from its
 * placement's scale, and its rocking from its place, so a row of one model doesn't read as one model. Far off a boat
 * is a hull and a mast, which is what a marina is from across the water. The boats' origin is on the water, bow along +x.
 */

/** A length of pontoon, stretched by its placement to meet the next. */
export const MARINA_SECTION_M = 8;
const DECK_Y_M = 0.42;
const DECK_WIDE_M = 2.2;
const BOAT_SWAP_M = 75;
const BOAT_REACH_M = 1400;

/** The boats rock about their waterline, a mast's head most. */
const rocking: TownMotion = (_, [, y]) => ({ kind: "hull", metres: Math.max(0, y) * 0.02 });

/** A section of floating walkway, with a pair of finger pontoons and a guide pile. */
export function buildMarinaDeck(): RoadsideModel {
  const half = DECK_WIDE_M / 2;
  const near = new TownPainted()
    .box([0, -0.25, -half], [MARINA_SECTION_M, DECK_Y_M - 0.03, half], "float-dark", { open: true, shade: 0.9 })
    .face([[0, DECK_Y_M, half], [MARINA_SECTION_M, DECK_Y_M, half], [MARINA_SECTION_M, DECK_Y_M, -half], [0, DECK_Y_M, -half]], "deck-boards", 1.05)
    .tube([MARINA_SECTION_M / 2, -0.8, half + 0.18], [MARINA_SECTION_M / 2, 2.1, half + 0.18], 0.1, 4, { cap: true }, "post-wood");
  for (const side of [-1, 1]) {
    const [root, tip] = [side * half, side * (half + 5.2)];
    near
      .face([[1.7, DECK_Y_M - 0.04, root], [2.3, DECK_Y_M - 0.04, root], [2.3, DECK_Y_M - 0.04, tip], [1.7, DECK_Y_M - 0.04, tip]], "deck-boards", 0.98)
      .face([[1.7, 0.1, tip], [2.3, 0.1, tip], [2.3, DECK_Y_M - 0.04, tip], [1.7, DECK_Y_M - 0.04, tip]], "float-dark");
  }
  const far = new TownPainted().face([[0, DECK_Y_M, half], [MARINA_SECTION_M, DECK_Y_M, half], [MARINA_SECTION_M, DECK_Y_M, -half], [0, DECK_Y_M, -half]], "deck-boards");
  return townModel(near, far, 150, 1400);
}

type Plan = readonly (readonly [x: number, half: number])[];

/** A hull's half-beam at stations from stern to stem. */
const YACHT_PLAN: Plan = [[-4.1, 1.05], [-1.6, 1.46], [0.8, 1.42], [2.8, 0.8], [4.3, 0]];
const LAUNCH_PLAN: Plan = [[-3, 1.15], [0, 1.28], [1.8, 0.95], [3.2, 0]];
const SHEER_M = 0.82;
const MAST_M = 12;

function hullSkin(into: TownPainted, plan: Plan, side: "boat-white" | "boat-navy", sheer: number, keel: number): TownPainted {
  const rise = (half: number) => sheer + (half === 0 ? 0.3 : 0);
  for (let station = 0; station + 1 < plan.length; station++) {
    const [[ax, aHalf], [bx, bHalf]] = [plan[station], plan[station + 1]];
    for (const way of [-1, 1]) {
      into
        .face([[ax, sheer, way * aHalf], [bx, rise(bHalf), way * bHalf], [bx, -0.1, way * bHalf * 0.8], [ax, -0.1, way * aHalf * 0.8]], side, way > 0 ? 1 : 0.95)
        .face([[ax, -0.1, way * aHalf * 0.8], [bx, -0.1, way * bHalf * 0.8], [bx, keel, 0], [ax, keel, 0]], "boat-under");
    }
    into.face([[ax, sheer, aHalf], [bx, rise(bHalf), bHalf], [bx, rise(bHalf), -bHalf], [ax, sheer, -aHalf]], "boat-deck", 1.05);
  }
  const [x, half] = plan[0];
  return into.face([[x, sheer, half], [x, sheer, -half], [x, -0.1, -half * 0.8], [x, -0.1, half * 0.8]], side, 0.88);
}

/** A moored yacht of about 8.5 m at scale 1, its sail under a cover. */
export function buildMooredYacht(hull: "boat-white" | "boat-navy" = "boat-white"): RoadsideModel {
  const mastHead: V3 = [0.5, MAST_M, 0];
  const near = hullSkin(new TownPainted(), YACHT_PLAN, hull, SHEER_M, -0.45)
    .box([-1.1, SHEER_M - 0.05, -0.85], [1.8, SHEER_M + 0.42, 0.85], "boat-white", { open: true, shadeTop: 1.1 })
    .face([[-1.11, SHEER_M + 0.16, 0.86], [1.5, SHEER_M + 0.16, 0.86], [1.5, SHEER_M + 0.32, 0.86], [-1.11, SHEER_M + 0.32, 0.86]], "boat-glass")
    .face([[-1.11, SHEER_M + 0.16, -0.86], [1.5, SHEER_M + 0.16, -0.86], [1.5, SHEER_M + 0.32, -0.86], [-1.11, SHEER_M + 0.32, -0.86]], "boat-glass")
    .tube([0.5, SHEER_M + 0.4, 0], mastHead, 0.06, 4, { radiusTo: 0.035 }, "mast")
    .tube([0.3, 2.3, 0], [-3.2, 2.35, 0], 0.13, 3, { radiusTo: 0.08, cap: true }, "sail-cover")
    .beam(mastHead, [4.2, 1.1, 0], 0.014, 0.014, "frame-dark")
    .beam(mastHead, [-3.9, 0.9, 0], 0.014, 0.014, "frame-dark");
  const far = new TownPainted()
    .face([[-4.1, SHEER_M, 1.1], [1, SHEER_M, 1.3], [4.3, SHEER_M + 0.2, 0], [1, SHEER_M, -1.3], [-4.1, SHEER_M, -1.1]], "boat-white", 1.05)
    .face([[-4.1, SHEER_M, 1.1], [1, SHEER_M, 1.3], [1, 0, 1], [-4.1, 0, 0.9]], hull)
    .face([[-4.1, SHEER_M, -1.1], [1, SHEER_M, -1.3], [1, 0, -1], [-4.1, 0, -0.9]], hull)
    .face([[1, SHEER_M, 1.3], [4.3, SHEER_M + 0.2, 0], [1, 0, 1]], hull)
    .face([[1, SHEER_M, -1.3], [4.3, SHEER_M + 0.2, 0], [1, 0, -1]], hull)
    .tube([0.5, 0.8, 0], mastHead, 0.09, 3, { radiusTo: 0.05 }, "mast");
  return townModel(near, far, BOAT_SWAP_M, BOAT_REACH_M, rocking);
}

/** A moored motor launch of about 6 m: a low hull with a wheelhouse and no mast. */
export function buildMooredLaunch(): RoadsideModel {
  const near = hullSkin(new TownPainted(), LAUNCH_PLAN, "boat-white", 0.75, -0.3)
    .box([-1, 0.75, -0.8], [0.9, 1.55, 0.8], "boat-white", { open: true, shadeTop: 1.1 })
    .face([[0.91, 1.05, -0.72], [0.91, 1.05, 0.72], [0.91, 1.46, 0.72], [0.91, 1.46, -0.72]], "boat-glass")
    .face([[-0.9, 1.05, 0.81], [0.8, 1.05, 0.81], [0.8, 1.46, 0.81], [-0.9, 1.46, 0.81]], "boat-glass")
    .face([[-0.9, 1.05, -0.81], [0.8, 1.05, -0.81], [0.8, 1.46, -0.81], [-0.9, 1.46, -0.81]], "boat-glass");
  const far = new TownPainted()
    .face([[-3, 0.75, 1.1], [1, 0.75, 1.2], [3.2, 0.85, 0], [1, 0.75, -1.2], [-3, 0.75, -1.1]], "boat-white", 1.05)
    .box([-1, 0.6, -0.8], [0.9, 1.5, 0.8], "boat-white", { open: true, shadeTop: 1.1 });
  return townModel(near, far, BOAT_SWAP_M, 700, rocking);
}

/** A marina's places along a pier's line. */
export interface MarinaRow {
  deck: Placement[];
  yachts: Placement[];
  navyYachts: Placement[];
  launches: Placement[];
}

export interface MarinaRowSpec {
  /** A berth's width along the pier. */
  berthM: number;
  /** The share of berths taken: a marina's `capacity` over what its pier lengths could hold. */
  fill: number;
  /** The water's height. */
  seaY: number;
  /** A floating pier carries a deck; a fixed one, already in the world as a pier, doesn't. */
  deck: boolean;
  seed: number;
}

/** How long a pier's line is, for working a marina's `fill` out from its `capacity`. */
export const lineLengthM = (line: readonly LinePoint[]) => line.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - line[index].x, point.z - line[index].z), 0);

/** Boats moored down both sides of a pier's line, sterns to it, and the sections of its deck: seeded, so the same pier always holds the same boats. */
export function marinaRow(line: readonly LinePoint[], { berthM, fill, seaY, deck, seed }: MarinaRowSpec): MarinaRow {
  const random = seeded(seed);
  const row: MarinaRow = { deck: [], yachts: [], navyYachts: [], launches: [] };
  for (let at = 0; at + 1 < line.length; at++) {
    const [a, b] = [line[at], line[at + 1]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < MARINA_SECTION_M / 2) continue;
    const [dx, dz] = [(b.x - a.x) / length, (b.z - a.z) / length];
    if (deck) {
      const sections = Math.max(1, Math.round(length / MARINA_SECTION_M));
      for (let section = 0; section < sections; section++) {
        const along = (section / sections) * length;
        row.deck.push({ x: a.x + dx * along, y: seaY, z: a.z + dz * along, yaw: yawAlong(dx, dz), stretch: length / sections / MARINA_SECTION_M });
      }
    }
    const berths = Math.floor(length / berthM);
    for (let berth = 0; berth < berths; berth++) {
      for (const side of [-1, 1]) {
        const [taken, kind, size, drift] = [random(), random(), random(), random()];
        if (taken > fill) continue;
        const along = (berth + 0.5) * berthM;
        const launch = kind < 0.22;
        const scale = launch ? 0.85 + size * 0.4 : 0.8 + size * 0.5;
        const out = DECK_WIDE_M / 2 + 0.7 + (launch ? 3.2 : 4.3) * scale;
        const [ox, oz] = [-dz * side, dx * side];
        const place: Placement = { x: a.x + dx * along + ox * out, y: seaY, z: a.z + dz * along + oz * out, yaw: yawAlong(ox, oz) + (drift - 0.5) * 0.1, scale };
        (launch ? row.launches : kind < 0.34 ? row.navyYachts : row.yachts).push(place);
      }
    }
  }
  return row;
}

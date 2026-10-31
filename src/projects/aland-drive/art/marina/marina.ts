import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { FLAGS } from "../street/flags";
import { coachroof, YACHT_STATIONS, yachtHull } from "./hull";
import { farShed, Marked, marinaModel, type GableShed, type MarinaPart, type Motion } from "./paint";

/*
 * A marina, to dress the kit's existing piers and pontoons (`buildPontoon`,
 * `buildGangway`, `buildPier` in the roadside kit), which it doesn't repeat. A deck's
 * height matches their pontoon's, so fingers come off one level.
 */

export const PONTOON_DECK_M = 0.42;
export const FINGER_LONG_M = 8;

const SHED_SWAP_M = 150;
const SHED_REACH_M = 1100;

/** A finger pontoon off a main pontoon, along +x: tapered, with cleats and a post at its tip. Its origin is on the water at its root. */
export function buildFingerPontoon(): RoadsideModel {
  const long = FINGER_LONG_M;
  const [root, tip] = [0.6, 0.38];
  const half = (x: number) => root + (tip - root) * (x / long);
  const near = new Marked();
  const strips = 8;
  for (let strip = 0; strip < strips; strip++) {
    const [from, to] = [(strip / strips) * long, ((strip + 1) / strips) * long];
    near.face([[from, PONTOON_DECK_M, half(from)], [to, PONTOON_DECK_M, half(to)], [to, PONTOON_DECK_M, -half(to)], [from, PONTOON_DECK_M, -half(from)]], strip % 3 === 1 ? "deck" : "deck-pale", 0.97 + ((strip * 5) % 7) * 0.012);
  }
  for (const side of [-1, 1]) {
    near.face([[0, PONTOON_DECK_M, side * root], [long, PONTOON_DECK_M, side * tip], [long, -0.15, side * tip], [0, -0.15, side * root]], "float-hull", 0.85);
    near.beam([1.2, PONTOON_DECK_M + 0.05, side * (half(1.2) - 0.1)], [1.5, PONTOON_DECK_M + 0.05, side * (half(1.5) - 0.1)], 0.06, 0.05, "galvanised", 1, 1.2);
    near.beam([long - 1, PONTOON_DECK_M + 0.05, side * (half(long - 1) - 0.1)], [long - 0.7, PONTOON_DECK_M + 0.05, side * (half(long - 0.7) - 0.1)], 0.06, 0.05, "galvanised", 1, 1.2);
    near.beam([3.5, PONTOON_DECK_M - 0.12, side * (half(3.5) + 0.03)], [6, PONTOON_DECK_M - 0.12, side * (half(6) + 0.03)], 0.06, 0.14, "fender");
  }
  near.face([[long, PONTOON_DECK_M, tip], [long, PONTOON_DECK_M, -tip], [long, -0.15, -tip], [long, -0.15, tip]], "float-hull", 0.9);
  near.tube([long + 0.16, -1.2, 0], [long + 0.16, 2.6, 0], 0.11, 5, { shadeFrom: 0.55, shadeTo: 1 }, "pile").tube([long + 0.16, 2.6, 0], [long + 0.16, 2.8, 0], 0.11, 5, { cap: true }, "pile-top");
  const far = new Marked()
    .face([[0, PONTOON_DECK_M, root], [long, PONTOON_DECK_M, tip], [long, PONTOON_DECK_M, -tip], [0, PONTOON_DECK_M, -root]], "deck-pale")
    .beam([long + 0.16, -0.2, 0], [long + 0.16, 2.8, 0], 0.2, 0.2, "pile");
  return marinaModel(near, far, 90, 600);
}

/** The locked gate at the head of a marina's gangway: a steel frame across +x, mesh wings to stop a walk round it, and a keypad. Its origin is on the deck. */
export function buildWalkwayGate(): RoadsideModel {
  const [wide, tall] = [1.2, 2.1];
  const near = new Marked();
  for (const z of [-wide / 2, wide / 2]) near.beam([0, 0, z], [0, tall, z], 0.08, 0.08, "steel");
  near.beam([0, tall, -wide / 2], [0, tall, wide / 2], 0.08, 0.08, "steel");
  // The leaf, slightly open, and its bars.
  const hinge: V3 = [0, 0, -wide / 2 + 0.05];
  const open = 0.32;
  const leaf = (out: number, up: number): V3 => [hinge[0] + Math.sin(open) * out, up, hinge[2] + Math.cos(open) * out];
  const span = wide - 0.1;
  for (const up of [0.1, 0.95, 1.95]) near.beam(leaf(0, up), leaf(span, up), 0.04, 0.05, "galvanised");
  near.beam(leaf(span, 0.1), leaf(span, 1.95), 0.04, 0.05, "galvanised");
  for (let bar = 1; bar < 4; bar++) near.beam(leaf((span * bar) / 4, 0.1), leaf((span * bar) / 4, 1.95), 0.018, 0.018, "galvanised");
  // Wings that lean out over the water.
  for (const side of [-1, 1]) {
    const z0 = side * (wide / 2);
    const z1 = side * (wide / 2 + 0.9);
    near.face([[0, 0.1, z0], [0, 1.9, z0], [0, 1.9, z1], [0, 0.1, z0 + side * 0.4]], "net", 0.8);
    near.beam([0, 1.9, z0], [0, 1.9, z1], 0.04, 0.04, "steel");
    near.beam([0, 0.1, z0 + side * 0.4], [0, 1.9, z1], 0.04, 0.04, "steel");
  }
  near.box([-0.05, 1.05, wide / 2 + 0.05], [0.05, 1.3, wide / 2 + 0.16], "pedestal-cap");
  const far = new Marked().beam([0, 1.05, -wide / 2], [0, 1.05, wide / 2], 0.08, 2.1, "steel", 0.7);
  return marinaModel(near, far, 40, 300);
}

export type PedestalKind = "power" | "water";

/** A service pedestal on a pontoon: `power` has its sockets behind a lid and a lamp, `water` its tap and hose. */
export function buildServicePedestal(kind: PedestalKind): RoadsideModel {
  const tall = kind === "power" ? 1.15 : 0.9;
  const near = new Marked()
    .tube([0, 0, 0], [0, tall - 0.3, 0], 0.11, 6, { shadeFrom: 0.85, shadeTo: 1 }, "pale-plastic")
    .tube([0, tall - 0.3, 0], [0, tall, 0], 0.15, 6, { radiusTo: 0.13, cap: true, shadeFrom: 1, shadeTo: 1.1 }, kind === "power" ? "pedestal-cap" : "pale-plastic");
  if (kind === "power") {
    near.tube([0, tall, 0], [0, tall + 0.1, 0], 0.07, 5, { radiusTo: 0.06, cap: true }, "mark-lens");
    near.box([0.12, tall - 0.24, -0.09], [0.17, tall - 0.06, 0.09], "mark-yellow", { open: true });
    near.box([-0.17, tall - 0.24, -0.09], [-0.12, tall - 0.06, 0.09], "sign-blue", { open: true });
  } else {
    near.tube([0, tall - 0.2, 0], [0.26, tall - 0.2, 0], 0.025, 4, { cap: true }, "brass").tube([0.26, tall - 0.2, 0], [0.26, tall - 0.3, 0], 0.025, 4, {}, "brass");
    near.tube([0, tall + 0.02, 0], [0, tall + 0.06, 0], 0.05, 5, { cap: true }, "sign-blue");
    near.hoop([0, tall - 0.42, 0.14], 0.11, 6, 0.024, "pedestal-cap", "xy");
  }
  return marinaModel(near, null, 110, 130);
}

const HUT: GableShed = { x: [-2.4, 2.4], z: [-1.7, 1.7], eaves: 2.45, ridge: 3.5, foot: 0.2, overhang: 0.3, walls: "red-boards", roof: "roof-dark", fascia: "trim" };

/** The harbour master's hut: small, red with white trim, windows on the water side (+z), a porch and an office door on the land side, on a low plinth. */
export function buildHarbourHut(): RoadsideModel {
  const near = new Marked().box([-2.5, -0.3, -1.8], [2.5, 0.2, 1.8], "concrete", { open: true }).shed(HUT);
  for (const x of [-1.4, 0, 1.4]) near.window([x, 1, 1.71], 1, 1.05, "z");
  near.window([2.41, 1, 0.5], 0.9, 1.05, "x");
  near.window([-2.41, 1, 0.5], 0.9, 1.05, "x");
  // Corner boards.
  for (const [x, z] of [[-2.4, 1.7], [2.4, 1.7], [-2.4, -1.7], [2.4, -1.7]] as const) near.box([x - 0.07, 0.2, z - 0.07], [x + 0.07, 2.65, z + 0.07], "trim", { open: true });
  near.face([[-0.5, 0.2, -1.71], [0.5, 0.2, -1.71], [0.5, 2.2, -1.71], [-0.5, 2.2, -1.71]], "door", 0.9);
  near.face([[1, 1.1, -1.71], [1.9, 1.1, -1.71], [1.9, 2.1, -1.71], [1, 2.1, -1.71]], "glass");
  // The porch's roof, steps and an aerial.
  near.box([-0.9, 0, -2.5], [0.9, 0.2, -1.8], "concrete", { open: true });
  near.face([[-1, 2.55, -1.75], [1, 2.55, -1.75], [1, 2.35, -2.6], [-1, 2.35, -2.6]], "roof-dark", 0.95);
  for (const x of [-0.9, 0.9]) near.beam([x, 0.2, -2.5], [x, 2.38, -2.5], 0.08, 0.08, "trim");
  near.tube([1.6, 3.2, 0], [1.6, 6.2, 0], 0.025, 3, {}, "galvanised");
  const far = farShed(HUT).box([-2.5, -0.3, -1.8], [2.5, 0.2, 1.8], "concrete", { open: true }).face([[-1.9, 1, 1.71], [1.9, 1, 1.71], [1.9, 2.05, 1.71], [-1.9, 2.05, 1.71]], "glass");
  return marinaModel(near, far, SHED_SWAP_M, SHED_REACH_M);
}

/** A fuel berth: a heavy pontoon, along +x, with a dispenser under a small canopy, a hose, oil absorbent box, and a yellow hazard edge. Its origin is on the water. */
export function buildFuelBerth(): RoadsideModel {
  const [long, half] = [10, 1.6];
  const near = new Marked()
    .box([0, -0.3, -half], [long, PONTOON_DECK_M - 0.02, half], "float-hull", { open: true, shade: 0.85 })
    .face([[0, PONTOON_DECK_M, half], [long, PONTOON_DECK_M, half], [long, PONTOON_DECK_M, -half], [0, PONTOON_DECK_M, -half]], "deck-pale");
  near.face([[0.3, PONTOON_DECK_M + 0.005, half - 0.1], [long - 0.3, PONTOON_DECK_M + 0.005, half - 0.1], [long - 0.3, PONTOON_DECK_M + 0.005, half - 0.25], [0.3, PONTOON_DECK_M + 0.005, half - 0.25]], "mark-yellow");
  const deck = PONTOON_DECK_M;
  // Two dispensers.
  for (const x of [3, 7]) {
    near.box([x - 0.35, deck, -0.3], [x + 0.35, deck + 1.75, 0.3], "pale-plastic", { open: true, shadeTop: 1.05 });
    near.face([[x - 0.3, deck + 1.05, 0.305], [x + 0.3, deck + 1.05, 0.305], [x + 0.3, deck + 1.6, 0.305], [x - 0.3, deck + 1.6, 0.305]], "glass");
    near.face([[x - 0.33, deck + 0.2, 0.305], [x + 0.33, deck + 0.2, 0.305], [x + 0.33, deck + 0.5, 0.305], [x - 0.33, deck + 0.5, 0.305]], x === 3 ? "mark-green" : "mark-black");
    near.beam([x + 0.36, deck + 1.3, 0.1], [x + 0.55, deck + 0.3, 0.45], 0.03, 0.03, "tyre");
    near.beam([x + 0.55, deck + 0.3, 0.45], [x + 0.38, deck + 0.95, 0.31], 0.03, 0.03, "tyre");
  }
  // The canopy.
  for (const [x, z] of [[1.2, -0.9], [8.8, -0.9]] as const) near.beam([x, deck, z], [x, deck + 3, z], 0.12, 0.12, "pale-plastic");
  near.box([0.6, deck + 3, -1.5], [9.4, deck + 3.35, 1.2], "sign-blue", { shade: 0.95, shadeTop: 1.1 });
  near.face([[0.6, deck + 3.1, 1.205], [9.4, deck + 3.1, 1.205], [9.4, deck + 3.2, 1.205], [0.6, deck + 3.2, 1.205]], "sign-white");
  // A locker for absorbent, and a life ring on a post.
  near.box([4.5, deck, -1.45], [5.6, deck + 0.7, -0.75], "float-orange", { open: true, shadeTop: 1.1 });
  near.hoop([9.4, deck + 1, 1.45], 0.3, 6, 0.08, "float-orange", "xy");
  near.beam([9.4, deck, 1.42], [9.4, deck + 1.4, 1.42], 0.05, 0.05, "steel");
  // Guide piles.
  for (const x of [1, long - 1]) near.tube([x, -1.2, -half - 0.2], [x, 3.2, -half - 0.2], 0.14, 5, { cap: true, shadeFrom: 0.55, shadeTo: 1 }, "pile");
  const far = new Marked()
    .box([0, -0.3, -half], [long, deck, half], "deck-pale", { open: true })
    .box([2.6, deck, -0.3], [7.4, deck + 1.75, 0.3], "pale-plastic", { open: true })
    .box([0.6, deck + 3, -1.5], [9.4, deck + 3.35, 1.2], "sign-blue", { open: true })
    .beam([1.2, deck, -0.9], [1.2, deck + 3, -0.9], 0.14, 0.14, "pale-plastic")
    .beam([8.8, deck, -0.9], [8.8, deck + 3, -0.9], 0.14, 0.14, "pale-plastic");
  return marinaModel(near, far, SHED_SWAP_M, SHED_REACH_M);
}

/** A dinghy, keel up, at a height on a rack, bow +x: three faces of hull and a transom. */
function upturnedDinghy(into: Marked, x: number, y: number, z: number, part: MarinaPart): Marked {
  const [long, half, depth] = [1.3, 0.62, 0.42];
  return into
    .face([[x - long, y, z - half], [x + long * 0.5, y, z - half * 0.92], [x + long, y + 0.06, z], [x + long * 0.5, y + depth, z - 0.12], [x - long, y + depth, z - 0.12]], part, 0.82)
    .face([[x - long, y, z + half], [x + long * 0.5, y, z + half * 0.92], [x + long, y + 0.06, z], [x + long * 0.5, y + depth, z + 0.12], [x - long, y + depth, z + 0.12]], part, 1)
    .face([[x - long, y + depth, z - 0.12], [x + long * 0.5, y + depth, z - 0.12], [x + long, y + 0.06, z], [x + long * 0.5, y + depth, z + 0.12], [x - long, y + depth, z + 0.12]], part, 1.1)
    .face([[x - long, y, z - half], [x - long, y, z + half], [x - long, y + depth, z + 0.12], [x - long, y + depth, z - 0.12]], part, 0.88);
}

/** A two-tier timber rack of sailing dinghies, each upturned on bearers, hulls along +x. */
export function buildDinghyRack(): RoadsideModel {
  const near = new Marked();
  for (const z of [-1.8, 0, 1.8]) {
    for (const x of [-1, 1]) near.beam([x, 0, z], [x, 1.5, z], 0.09, 0.09, "stickers");
    for (const y of [0.42, 1.2]) near.beam([-1.2, y, z], [1.2, y, z], 0.05, 0.09, "stickers", 0.95, 1.08);
  }
  near.beam([-1, 1.5, -1.9], [-1, 1.5, 1.9], 0.08, 0.08, "stickers");
  near.beam([1, 1.5, -1.9], [1, 1.5, 1.9], 0.08, 0.08, "stickers");
  const paints: readonly MarinaPart[] = ["hull-white", "sign-blue", "float-orange", "hull-white"];
  ([[0.47, -0.9], [0.47, 0.9], [1.25, -0.9], [1.25, 0.9]] as const).forEach(([y, z], index) => upturnedDinghy(near, 0, y, z, paints[index]));
  const far = new Marked().box([-1.3, 0, -1.8], [1.3, 1.7, 1.8], "stickers", { open: true, shade: 0.85 });
  return marinaModel(near, far, 60, 500);
}

export const SLIPWAY_LONG_M = 24;
const SLIP_TOP_M = 1.3;
const SLIP_FOOT_M = -1.6;
const slipY = (x: number) => SLIP_TOP_M + ((SLIP_FOOT_M - SLIP_TOP_M) * x) / SLIPWAY_LONG_M;

/** A railed slipway: a concrete ramp with two rails on sleepers, running down along +x into the water. Its y 0 is the water, so it meets the shore where the ramp is 1.3 m up. */
export function buildSlipway(): RoadsideModel {
  const long = SLIPWAY_LONG_M;
  const half = 2.6;
  const near = new Marked().face([[0, slipY(0), half], [long, slipY(long), half], [long, slipY(long), -half], [0, slipY(0), -half]], "concrete-wet");
  for (const side of [-1, 1]) {
    near.beam([0, slipY(0) + 0.1, side * 1.1], [long, slipY(long) + 0.1, side * 1.1], 0.09, 0.14, "rail", 0.9, 1.25);
    near.face([[0, slipY(0), side * half], [long, slipY(long), side * half], [long, slipY(long) - 0.5, side * half], [0, slipY(0) - 0.5, side * half]], "concrete-wet", 0.7);
  }
  const sleepers = 14;
  for (let sleeper = 0; sleeper < sleepers; sleeper++) {
    const x = ((sleeper + 0.5) / sleepers) * long;
    near.box([x - 0.12, slipY(x), -1.5], [x + 0.12, slipY(x) + 0.07, 1.5], "sleeper", { open: true });
  }
  // The winch's post at the head.
  near.box([-1.6, slipY(0), -0.5], [-0.6, slipY(0) + 0.9, 0.5], "steel", { open: true, shadeTop: 1.2 });
  near.tube([-1.1, slipY(0) + 1.1, -0.4], [-1.1, slipY(0) + 1.1, 0.4], 0.26, 6, { cap: true }, "iron-rust");
  near.beam([-1.1, slipY(0) + 0.9, 0], [-0.8, slipY(0) + 0.28, 0], 0.03, 0.03, "iron");
  near.beam([-0.8, slipY(0) + 0.28, 0], [6, slipY(6) + 0.2, 0], 0.025, 0.025, "iron");
  const far = new Marked().face([[0, slipY(0), half], [long, slipY(long), half], [long, slipY(long), -half], [0, slipY(0), -half]], "concrete-wet");
  for (const side of [-1, 1]) far.face([[0, slipY(0) + 0.15, side * 1.1], [long, slipY(long) + 0.15, side * 1.1], [long, slipY(long) + 0.15, side * 1.2], [0, slipY(0) + 0.15, side * 1.2]], "rail");
  return marinaModel(near, far, 110, 900);
}

export type TrolleyKind = "rail" | "launching";

/** `rail`: a steel slip trolley with flanged wheels for the slipway's 2.2 m gauge and bunks for a keel boat. `launching`: a small boat's two-wheeled trolley with its drawbar. */
export function buildBoatTrolley(kind: TrolleyKind): RoadsideModel {
  const near = new Marked();
  if (kind === "rail") {
    const [long, gauge] = [3.4, 1.1];
    for (const z of [-gauge, gauge]) near.beam([-long, 0.5, z], [long, 0.5, z], 0.14, 0.18, "lift-dark", 0.9, 1.1);
    for (const x of [-long, 0, long]) near.beam([x, 0.6, -gauge - 0.1], [x, 0.6, gauge + 0.1], 0.14, 0.14, "lift-dark", 0.9, 1.1);
    for (const x of [-2.4, 2.4]) {
      for (const z of [-gauge, gauge]) near.wheel([x, 0.26, z], 0.26, 0.12, "iron-rust");
      for (const side of [-1, 1]) {
        near.beam([x, 0.6, side * gauge], [x, 1.7, side * 0.75], 0.09, 0.09, "steel");
        near.box([x - 0.3, 1.7, side * 0.75 - 0.08], [x + 0.3, 1.78, side * 0.75 + 0.08], "tyre");
      }
    }
    near.box([-1.5, 0.68, -0.2], [1.5, 0.82, 0.2], "sleeper", { open: true });
    const far = new Marked().box([-long, 0.3, -gauge], [long, 0.7, gauge], "lift-dark", { open: true }).beam([-2.4, 1.2, 0], [2.4, 1.2, 0], 0.12, 1.1, "steel", 0.8);
    return marinaModel(near, far, 60, 400);
  }
  for (const z of [-0.6, 0.6]) {
    near.wheel([0, 0.2, z], 0.2, 0.09);
    near.beam([-1, 0.45, z * 0.75], [1.1, 0.45, z * 0.75], 0.05, 0.05, "galvanised");
    near.beam([0, 0.2, z], [0, 0.45, z * 0.75], 0.05, 0.05, "galvanised");
  }
  near.beam([1.1, 0.45, -0.45], [2.2, 0.55, 0], 0.05, 0.05, "galvanised").beam([1.1, 0.45, 0.45], [2.2, 0.55, 0], 0.05, 0.05, "galvanised");
  near.beam([0, 0.2, -0.6], [0, 0.2, 0.6], 0.05, 0.05, "galvanised");
  for (const x of [-0.7, 0.8]) near.beam([x, 0.5, -0.5], [x, 0.5, 0.5], 0.09, 0.08, "tyre");
  near.tube([2.2, 0.55, 0], [2.2, 0.9, 0], 0.025, 3, {}, "galvanised");
  return marinaModel(near, null, 45, 60);
}

/** A boat hoist: a blue portal on four wheels that straddles a dock, with two slings under a boat, engine box at one leg. Bow would be +x; the slings hang across z. */
export function buildTravelLift(): RoadsideModel {
  const [long, half, tall] = [4.6, 3.4, 8.6];
  const near = new Marked();
  for (const x of [-long, long]) {
    for (const z of [-half, half]) {
      near.wheel([x, 0.55, z], 0.55, 0.42);
      near.tube([x, 1.3, z], [x, tall - 0.3, z], 0.26, 4, { radiusTo: 0.2 }, "lift");
      near.box([x - 0.5, 0.9, z - 0.3], [x + 0.5, 1.3, z + 0.3], "lift", { shadeTop: 1.1 });
    }
    near.box([x - 0.32, tall - 0.3, -half - 0.3], [x + 0.32, tall + 0.3, half + 0.3], "lift", { shade: 0.95, shadeTop: 1.12 });
    near.beam([x, tall - 2.4, -half], [x, tall - 0.35, -half + 1.8], 0.12, 0.12, "lift", 0.9);
    near.beam([x, tall - 2.4, half], [x, tall - 0.35, half - 1.8], 0.12, 0.12, "lift", 0.9);
  }
  // Long girders down each side, low.
  for (const side of [-1, 1]) {
    near.box([-long, 1.3, side * half - 0.24], [long, 1.95, side * half + 0.24], "lift", { shade: 0.92, shadeTop: 1.1 });
    near.box([-long, tall - 0.2, side * half - 0.2], [long, tall + 0.2, side * half + 0.2], "lift", { shade: 0.92, shadeTop: 1.1 });
  }
  // The engine house and the seat.
  near.box([-1.6, 2, half - 0.5], [1.6, 3.5, half + 0.8], "lift-dark", { shadeTop: 1.2 });
  near.box([0.2, 3.5, half - 0.2], [1.4, 4.5, half + 0.7], "pale-plastic", { open: true, shadeTop: 1.1 });
  near.face([[0.2, 3.7, half + 0.705], [1.4, 3.7, half + 0.705], [1.4, 4.35, half + 0.705], [0.2, 4.35, half + 0.705]], "glass");
  // Two slings hang from their blocks under the top beams.
  for (const x of [-long * 0.45, long * 0.45]) {
    near.beam([x, tall + 0.2, -half + 0.5], [x, tall + 0.2, half - 0.5], 0.22, 0.26, "lift-dark", 1, 1.2);
    for (const side of [-1, 1]) {
      const z = side * (half - 0.9);
      near.box([x - 0.16, tall - 0.5, z - 0.16], [x + 0.16, tall, z + 0.16], "mark-yellow");
      near.beam([x, tall - 0.5, z], [x, 3.4, z], 0.03, 0.03, "iron");
      near.beam([x, 3.4, z], [x, 1.25, side * 1.5], 0.16, 0.02, "sling");
      near.beam([x, 1.25, side * 1.5], [x, 0.85, side * 0.7], 0.16, 0.02, "sling");
    }
    near.beam([x, 0.85, -0.7], [x, 0.85, 0.7], 0.16, 0.02, "sling");
  }
  const far = new Marked();
  for (const side of [-1, 1]) {
    far.box([-long, tall - 0.2, side * half - 0.2], [long, tall + 0.2, side * half + 0.2], "lift", { open: true });
    far.box([-long, 1.2, side * half - 0.24], [long, 1.95, side * half + 0.24], "lift", { open: true });
    for (const x of [-long, long]) far.beam([x, 0, side * half], [x, tall, side * half], 0.5, 0.5, "lift");
  }
  for (const x of [-long, long]) far.box([x - 0.32, tall - 0.3, -half], [x + 0.32, tall + 0.3, half], "lift", { open: true });
  far.box([-1.6, 2, half - 0.5], [1.6, 4.5, half + 0.8], "lift-dark", { open: true });
  return marinaModel(near, far, SHED_SWAP_M, SHED_REACH_M);
}

/** A block font of just the letters a guest harbour's sign asks for, each five rows of three cells. */
const LETTERS: Record<string, readonly string[]> = {
  G: ["###", "#..", "#.#", "#.#", "###"],
  Ä: ["#.#", "...", "###", "#.#", "#.#"],
  S: ["###", "#..", "###", "..#", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  A: ["###", "#.#", "###", "#.#", "#.#"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
};

function lettering(into: Marked, word: string, left: number, bottom: number, cell: number, z: number, part: MarinaPart): Marked {
  [...word].forEach((letter, index) => {
    LETTERS[letter].forEach((row, line) => {
      const y = bottom + (4 - line) * cell;
      for (const run of row.matchAll(/#+/g)) {
        const [from, to] = [left + (index * 4 + run.index) * cell, left + (index * 4 + run.index + run[0].length) * cell];
        into.face([[from, y, z], [to, y, z], [to, y + cell, z], [from, y + cell, z]], part);
      }
    });
  });
  return into;
}

/** An anchor drawn in flat strips, its ring at the top: the sign's mark for a guest harbour. */
function anchorGlyph(into: Marked, x: number, y: number, size: number, z: number, part: MarinaPart): Marked {
  const at = (ax: number, ay: number): V3 => [x + ax * size, y + ay * size, z];
  const strip = (a: readonly [number, number], b: readonly [number, number], wide: number) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(dx, dy);
    const [ox, oy] = [(-dy / length) * wide, (dx / length) * wide];
    into.face([at(a[0] + ox, a[1] + oy), at(b[0] + ox, b[1] + oy), at(b[0] - ox, b[1] - oy), at(a[0] - ox, a[1] - oy)], part);
  };
  strip([0, -0.5], [0, 0.42], 0.05);
  strip([-0.26, 0.28], [0.26, 0.28], 0.04);
  strip([-0.06, 0.48], [0.06, 0.48], 0.04);
  strip([-0.42, -0.2], [0, -0.5], 0.05);
  strip([0.42, -0.2], [0, -0.5], 0.05);
  return into;
}

/** A guest-harbour board with no business's name: a blue plate with an anchor and GÄSTHAMN in white, on two posts. Its front faces +z. */
export function buildGuestHarbourSign(): RoadsideModel {
  const [wide, tall, bottom] = [3, 1.1, 1.35];
  const near = new Marked();
  for (const x of [-wide / 2 + 0.2, wide / 2 - 0.2]) near.beam([x, 0, -0.06], [x, bottom + tall, -0.06], 0.1, 0.1, "steel");
  near.box([-wide / 2, bottom, -0.03], [wide / 2, bottom + tall, 0], "sign-blue", { shade: 0.95 });
  near.box([-wide / 2 + 0.02, bottom + 0.02, 0.002], [wide / 2 - 0.02, bottom + 0.05, 0.004], "sign-white", { open: true });
  anchorGlyph(near, -wide / 2 + 0.42, bottom + tall / 2 + 0.02, 0.8, 0.006, "sign-white");
  lettering(near, "GÄSTHAMN", -wide / 2 + 0.88, bottom + 0.34, 0.058, 0.006, "sign-white");
  const far = new Marked().face([[-wide / 2, bottom, 0], [wide / 2, bottom, 0], [wide / 2, bottom + tall, 0], [-wide / 2, bottom + tall, 0]], "sign-blue").beam([0, 0, -0.06], [0, bottom, -0.06], 0.2, 0.1, "steel");
  return marinaModel(near, far, 80, 500);
}

const MAST_TALL_M = 11;
const YARD_M = 7.2;
const GAFF_LONG_M = 2.1;
const FLAG_HIGH_M = 0.95;
const flutter: Motion = (part, [x]) => (part.startsWith("flag") ? { kind: "cloth", metres: Math.min(0.2, (-x - GAFF_LONG_M) * 0.14) } : { kind: "still" });

/** A yacht club's mast: a white pole with a cross-yard and a gaff, stayed to the ground, wearing the Åland flag at the gaff, whose peak is aft (-x). The law's proportions, from the street's `FLAGS`. */
export function buildFlagMast(): RoadsideModel {
  const near = new Marked()
    .box([-0.45, 0, -0.45], [0.45, 0.28, 0.45], "concrete", { open: true })
    .tube([0, 0, 0], [0, MAST_TALL_M, 0], 0.1, 6, { radiusTo: 0.05, cap: true }, "trim")
    .tube([0, MAST_TALL_M, 0], [0, MAST_TALL_M + 0.1, 0], 0.075, 5, { radiusTo: 0.075, cap: true }, "brass");
  near.tube([0, YARD_M, -1.7], [0, YARD_M, 1.7], 0.035, 4, { cap: true }, "trim");
  const gaffEnd: V3 = [-GAFF_LONG_M, YARD_M + 1.7, 0];
  near.tube([0, YARD_M + 0.35, 0], gaffEnd, 0.03, 4, { cap: true }, "trim");
  for (const side of [-1, 1]) {
    near.beam([0, MAST_TALL_M * 0.9, 0], [0, YARD_M, side * 1.7], 0.012, 0.012, "steel");
    near.beam([0, YARD_M, side * 1.7], [side * 0.1, 0.1, side * 2.4], 0.012, 0.012, "steel");
  }
  near.beam([0, MAST_TALL_M * 0.9, 0], [3.2, 0.1, 0], 0.012, 0.012, "steel");
  near.beam(gaffEnd, [0, YARD_M - 0.5, 0], 0.01, 0.01, "steel");
  // The flag, hanging from the gaff's peak: rectangles at the law's edges, hoist at the gaff.
  const { fly, hoist } = FLAGS.aland;
  const unit = FLAG_HIGH_M / hoist[hoist.length - 1];
  const foot = gaffEnd[1] - 0.08 - FLAG_HIGH_M;
  for (let column = 0; column + 1 < fly.length; column++) {
    for (let row = 0; row + 1 < hoist.length; row++) {
      const part = FLAGS.aland.field(column, row) as Extract<MarinaPart, `flag-${string}`>;
      const [a, b] = [gaffEnd[0] - fly[column] * unit - 0.02, gaffEnd[0] - fly[column + 1] * unit - 0.02];
      const [c, d] = [foot + hoist[row] * unit, foot + hoist[row + 1] * unit];
      near.face([[a, c, 0], [b, c, 0], [b, d, 0], [a, d, 0]], part);
    }
  }
  const far = new Marked()
    .beam([0, 0, 0], [0, MAST_TALL_M, 0], 0.16, 0.16, "trim")
    .beam([0, YARD_M, -1.7], [0, YARD_M, 1.7], 0.06, 0.06, "trim")
    .face([[gaffEnd[0], foot, 0], [gaffEnd[0] - 1.45, foot, 0], [gaffEnd[0] - 1.45, foot + FLAG_HIGH_M, 0], [gaffEnd[0], foot + FLAG_HIGH_M, 0]], "flag-ax-blue");
  return marinaModel(near, far, 130, 900, flutter);
}

function cradle(into: Marked): Marked {
  const [x0, x1, z] = [-1.8, 1.8, 1.05];
  for (const side of [-1, 1]) {
    into.beam([x0, 0.08, side * z], [x1, 0.08, side * z], 0.1, 0.14, "lift-dark", 0.9, 1.1);
    for (const x of [-1.5, 1.4]) {
      into.beam([x, 0.1, side * z], [x, 1.45, side * 1.15], 0.07, 0.07, "lift-dark");
      into.beam([x, 1.45, side * 1.15], [x * 0.92, 1.85, side * 1.2], 0.05, 0.05, "galvanised");
      into.box([x * 0.92 - 0.14, 1.85, side * 1.2 - 0.14], [x * 0.92 + 0.14, 1.9, side * 1.2 + 0.14], "tyre");
      into.beam([0, 0.1, side * z], [x, 1.1, side * 1.13], 0.05, 0.05, "lift-dark", 0.9);
    }
  }
  for (const x of [x0, x1]) into.beam([x, 0.08, -z], [x, 0.08, z], 0.1, 0.14, "lift-dark", 0.9, 1.1);
  return into;
}

const STATION_THIRDS = [YACHT_STATIONS[0], YACHT_STATIONS[2], YACHT_STATIONS[4], YACHT_STATIONS[5]];

/** A steel yard cradle, its keel blocks and pads waiting for a hull. A boat stands in it with its keel's bottom on the ground and its bilges on the pads, about 1.9 m up and 1.2 m out. */
export function buildCradle(): RoadsideModel {
  return marinaModel(cradle(new Marked()), new Marked().box([-1.8, 0, -1.05], [1.8, 1.5, 1.05], "lift-dark", { open: true, shade: 0.7 }), 70, 500);
}

/** A 9 m yacht on the hard, in its cradle, mast out, as boats stand ashore all winter and under repair in summer. Bow along +x. */
export function buildBoatInCradle(): RoadsideModel {
  const hull = coachroof(yachtHull(new Marked(), YACHT_STATIONS, { topsides: "hull-white", below: "antifoul" }, true));
  const near = cradle(hull);
  near.beam([-3.7, 3.3, 0], [-1.2, 3.1, 0], 0.03, 0.03, "galvanised");
  const far = yachtHull(new Marked(), STATION_THIRDS, { topsides: "hull-white", below: "antifoul" }, false).box([-1.3, 2.74, -0.95], [2, 3.25, 0.95], "hull-white", { open: true });
  return marinaModel(near, far, 110, 800);
}

export type WinterCover = "tarp-blue" | "tarp-green" | "shrink";

const coverSway: Motion = (part, [, y]) => (part === "tarp-blue" || part === "tarp-green" ? { kind: "cloth", metres: Math.max(0, y - 3) * 0.008 } : { kind: "still" });

/** A yacht laid up: on `tarp` covers a timber ridge frame runs bow to stern with a tarpaulin tented over it, lashed down under the hull; `shrink` is a white wrap in one tight skin to the rub rail. */
export function buildBoatWinterCover(cover: WinterCover): RoadsideModel {
  const build = (detail: boolean) => {
    const into = cradle(yachtHull(new Marked(), detail ? YACHT_STATIONS : STATION_THIRDS, { topsides: "hull-white", below: "antifoul" }, detail));
    const ridge = cover === "shrink" ? 4.5 : 4.75;
    const stations = detail ? YACHT_STATIONS : STATION_THIRDS;
    for (const side of [-1, 1]) {
      for (let station = 0; station + 1 < stations.length; station++) {
        const [ax, aDeck, aSheer] = stations[station];
        const [bx, bDeck, bSheer] = stations[station + 1];
        const crown = (x: number) => ridge - Math.abs(x + 0.5) * 0.13;
        const shade = (side > 0 ? 1.04 : 0.88) * (station % 2 === 0 ? 1 : 0.95);
        into.face([[ax, crown(ax), 0], [bx, crown(bx), 0], [bx, bSheer - (cover === "shrink" ? 0.02 : 0.28), side * (bDeck + 0.04)], [ax, aSheer - (cover === "shrink" ? 0.02 : 0.28), side * (aDeck + 0.04)]], cover, shade);
      }
    }
    const [x, deck, sheer] = stations[0];
    into.face([[x, ridge - Math.abs(x + 0.5) * 0.13, 0], [x, sheer - 0.1, deck], [x, sheer - 0.1, -deck]], cover, 0.85);
    return into;
  };
  const near = build(true);
  if (cover !== "shrink") {
    // Lashings under the hull, tarp to tarp.
    for (const x of [-3, -1, 1, 3]) near.beam([x, 2.2, -1.45 + Math.abs(x) * 0.12], [x, 1.4, 0], 0.015, 0.015, "lashing").beam([x, 2.2, 1.45 - Math.abs(x) * 0.12], [x, 1.4, 0], 0.015, 0.015, "lashing");
    near.beam([-4.9, 3.6, 0], [-4.5, 4.1, 0], 0.08, 0.08, "stickers").beam([5, 2.9, 0], [4.8, 3.2, 0], 0.08, 0.08, "stickers");
  }
  return marinaModel(near, build(false), 110, 800, coverSway);
}

/** A boatyard's rack of unstepped masts: three trestles carrying four masts on their sides, spreaders and wires tied along them. Masts along +x. */
export function buildMastRack(): RoadsideModel {
  const long = 12;
  const near = new Marked();
  for (const x of [-long * 0.42, 0, long * 0.42]) {
    for (const z of [-1.3, 1.3]) near.beam([x, 0, z], [x, 2, z * 0.7], 0.1, 0.1, "stickers");
    for (const y of [0.9, 1.5]) near.beam([x, y, -1.2], [x, y, 1.2], 0.09, 0.12, "stickers", 0.95, 1.08);
  }
  const masts: readonly (readonly [number, number, number, MarinaPart])[] = [[1, -0.5, 0.09, "spar"], [1, 0.45, 0.08, "spar"], [1.6, -0.3, 0.075, "galvanised"], [1.6, 0.6, 0.085, "oak"]];
  for (const [y, z, radius, part] of masts) near.tube([-long / 2, y + radius, z], [long / 2, y + radius, z], radius, 5, { radiusTo: radius * 0.6, cap: true }, part);
  near.beam([1.5, 1.2, -0.75], [1.5, 1.2, -0.25], 0.03, 0.03, "galvanised");
  near.beam([1.5, 1.8, 0.35], [1.5, 1.8, 0.85], 0.03, 0.03, "galvanised");
  near.beam([-long / 2 + 0.5, 1.17, -0.42], [long / 2 - 1, 1.17, -0.42], 0.02, 0.02, "steel");
  const far = new Marked().box([-long / 2, 0.9, -0.7], [long / 2, 1.7, 0.7], "spar", { open: true, shade: 0.85 });
  return marinaModel(near, far, 60, 500);
}

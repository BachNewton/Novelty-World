import { seeded, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel } from "./paint";

/*
 * Town lighting and what hangs on a wall. The rural lamp is 9 m of galvanised pole with an arm over the road; a town's
 * is a dark post half that high with its lantern on top, so a street reads as a town's before a house does.
 */

const SINK_M = 0.5;
const LANTERN_SIDES = 6;

/** A dark cast post-top lamp: a stepped base, a slim shaft, a collar and a six-sided lantern under a little roof. */
export function buildTownLamp(): RoadsideModel {
  const tall = 4.4;
  const [lanternFoot, lanternHead] = [tall, tall + 0.5];
  const near = new TownPainted()
    .tube([0, -SINK_M, 0], [0, 0.32, 0], 0.15, LANTERN_SIDES, { radiusTo: 0.125, shadeFrom: 0.85 }, "lamp-iron")
    .tube([0, 0.32, 0], [0, 0.42, 0], 0.125, LANTERN_SIDES, { radiusTo: 0.085 }, "lamp-iron")
    .tube([0, 0.42, 0], [0, tall - 0.2, 0], 0.075, LANTERN_SIDES, { radiusTo: 0.05 }, "lamp-iron")
    .tube([0, tall - 0.2, 0], [0, tall - 0.14, 0], 0.09, LANTERN_SIDES, {}, "lamp-iron")
    .tube([0, tall - 0.14, 0], [0, lanternFoot, 0], 0.045, LANTERN_SIDES, { radiusTo: 0.12 }, "lamp-iron")
    .tube([0, lanternFoot, 0], [0, lanternHead, 0], 0.12, LANTERN_SIDES, { radiusTo: 0.2, shadeFrom: 1.05, shadeTo: 1.2 }, "lamp-glass")
    .tube([0, lanternHead, 0], [0, lanternHead + 0.03, 0], 0.235, LANTERN_SIDES, {}, "lamp-roof")
    .tube([0, lanternHead + 0.03, 0], [0, lanternHead + 0.21, 0], 0.235, LANTERN_SIDES, { radiusTo: 0.035, cap: true, shadeTo: 1.2 }, "lamp-roof")
    .spike([0, lanternHead + 0.21, 0], [0, lanternHead + 0.34, 0], 0.03, "lamp-roof");
  const far = new TownPainted()
    .tube([0, -SINK_M, 0], [0, lanternFoot, 0], 0.11, 3, { radiusTo: 0.06 }, "lamp-iron")
    .tube([0, lanternFoot, 0], [0, lanternHead, 0], 0.16, 3, { radiusTo: 0.2 }, "lamp-glass")
    .tube([0, lanternHead, 0], [0, lanternHead + 0.2, 0], 0.26, 3, { radiusTo: 0.03, cap: true }, "lamp-roof");
  return townModel(near, far, 90, 650);
}

/**
 * A wall lantern on a scrolled bracket, its origin on the wall at the bracket's height, reaching out along +z.
 * A small add-on: no far version, gone by 120 m.
 */
export function buildHangingLamp(): RoadsideModel {
  const out = 0.58;
  const hook: V3 = [0, -0.02, out];
  const near = new TownPainted()
    .box([-0.07, -0.26, -0.02], [0.07, 0.08, 0.02], "lamp-iron", { open: true })
    .beam([0, 0, 0], hook, 0.03, 0.03, "lamp-iron")
    .beam([0, -0.22, 0.01], [0, -0.03, out * 0.62], 0.02, 0.02, "lamp-iron")
    .beam(hook, [0, -0.16, out], 0.015, 0.015, "lamp-iron")
    .tube([0, -0.16, out], [0, -0.23, out], 0.015, 4, { radiusTo: 0.15, shadeFrom: 1, shadeTo: 0.9 }, "lamp-roof")
    .tube([0, -0.23, out], [0, -0.26, out], 0.15, 4, { radiusTo: 0.12 }, "lamp-roof")
    .tube([0, -0.26, out], [0, -0.54, out], 0.12, 4, { radiusTo: 0.085, shadeFrom: 1.15, shadeTo: 1.05 }, "lamp-glass")
    .tube([0, -0.54, out], [0, -0.58, out], 0.085, 4, { radiusTo: 0.03, cap: true }, "lamp-iron");
  return townModel(near, null, 120, 120);
}

const BOX_WIDE_M = 1.1;
const BLOOMS = 9;

/** A painted window box, flowers in it, its origin on the wall under the sill, reaching out along +z. A box and a coloured hump far off. */
export function buildWindowBox(bloom: "bloom-red" | "bloom-white" = "bloom-red", seed = 3): RoadsideModel {
  const half = BOX_WIDE_M / 2;
  const [deep, tall] = [0.2, 0.17];
  const near = new TownPainted()
    .box([-half, -tall, 0.01], [half, 0, deep], "box-white", { shade: 0.98, shadeTop: 1.08 })
    .beam([-half * 0.7, -tall - 0.03, 0.02], [-half * 0.7, -tall - 0.03, deep], 0.03, 0.03, "lamp-iron")
    .beam([half * 0.7, -tall - 0.03, 0.02], [half * 0.7, -tall - 0.03, deep], 0.03, 0.03, "lamp-iron");
  const ridge = (x: number, y: number): V3 => [x, y, deep * 0.45];
  const front = (x: number, y: number): V3 => [x, y, deep + 0.05];
  const stops = [-half, -half * 0.5, 0, half * 0.5, half];
  const heights = [0.03, 0.17, 0.2, 0.16, 0.03];
  for (let bay = 0; bay < stops.length - 1; bay++) {
    const [a, b, ya, yb] = [stops[bay], stops[bay + 1], heights[bay], heights[bay + 1]];
    near
      .face([front(a, 0.01), front(b, 0.01), ridge(b, yb), ridge(a, ya)], bay % 2 === 0 ? "leaf" : "leaf-lit", 1)
      .face([[a, 0.01, 0.02], [b, 0.01, 0.02], ridge(b, yb), ridge(a, ya)], "leaf", 0.85);
  }
  const random = seeded(seed);
  for (let flower = 0; flower < BLOOMS; flower++) {
    const x = -half + 0.08 + (flower / (BLOOMS - 1)) * (BOX_WIDE_M - 0.16);
    const [y, z] = [0.06 + random() * 0.14, deep * 0.5 + 0.03 + random() * 0.09];
    near.face([[x - 0.05, y, z], [x, y + 0.045, z + 0.01], [x + 0.05, y, z], [x, y - 0.045, z + 0.01]], bloom, 1.05);
  }
  const far = new TownPainted()
    .box([-half, -tall, 0], [half, 0, deep], "box-white", { open: true })
    .face([[-half, 0, deep + 0.03], [half, 0, deep + 0.03], [half * 0.8, 0.18, deep * 0.5], [-half * 0.8, 0.18, deep * 0.5]], bloom);
  return townModel(near, far, 40, 160);
}

import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, streetModel, type Motion } from "./paint";

/*
 * Harbour fittings. The bollard and the crane stand on a quay, their origin on it.
 * The boat's origin is on the water, bow along +x.
 */

/** A cast-iron mooring bollard: a waisted post under a mushroom head. */
export function buildBollard(): RoadsideModel {
  const near = new Painted()
    .tube([0, -0.1, 0], [0, 0.06, 0], 0.27, 7, { radiusTo: 0.2, shadeFrom: 0.8 }, "bollard")
    .tube([0, 0.06, 0], [0, 0.42, 0], 0.17, 7, { radiusTo: 0.15 }, "bollard")
    .tube([0, 0.42, 0], [0, 0.52, 0], 0.15, 7, { radiusTo: 0.24, shadeFrom: 0.8 }, "bollard")
    .tube([0, 0.52, 0], [0, 0.58, 0], 0.24, 7, { radiusTo: 0.16, cap: true, shadeFrom: 1.1, shadeTo: 1.25 }, "bollard-cap");
  const far = new Painted().tube([0, -0.1, 0], [0, 0.56, 0], 0.2, 3, { radiusTo: 0.2, cap: true }, "bollard");
  return streetModel(near, far, 40, 240);
}

const CRANE_SWAP_M = 170;
const CRANE_REACH_M = 1400;

/** A small quay crane for lifting boats: a slewing pillar, a cab, a tapered jib out along +x, a stay, and its hook. */
export function buildHarbourCrane(): RoadsideModel {
  const [pillar, deck] = [4.6, 5.2];
  const [jibLong, jibRise] = [11, 3.1];
  const root: V3 = [0.5, deck + 0.5, 0];
  const tip: V3 = [root[0] + jibLong, root[1] + jibRise, 0];
  const mastTop: V3 = [-0.1, deck + 4.2, 0];
  const backEnd: V3 = [-2.9, deck + 0.75, 0];
  const hook: V3 = [tip[0] - 0.05, deck - 2.1, 0];

  const near = new Painted()
    .tube([0, -0.4, 0], [0, 0.45, 0], 1.25, 8, { radiusTo: 1, shadeFrom: 0.85, cap: true }, "concrete")
    .tube([0, 0.45, 0], [0, pillar, 0], 0.5, 8, { radiusTo: 0.42, shadeFrom: 0.92, shadeTo: 1.02 }, "crane-yellow")
    .tube([0, pillar, 0], [0, pillar + 0.16, 0], 0.76, 8, { cap: true, shadeFrom: 0.8, shadeTo: 1 }, "crane-dark")
    .box([-1.2, deck - 0.4, -0.95], [0.9, deck + 0.2, 0.95], "crane-yellow", { shadeTop: 1.1, shade: 0.92 })
    // The cab, its window looking along the jib.
    .box([0.05, deck + 0.2, 0.15], [1.5, deck + 1.9, 0.95], "crane-yellow", { shade: 0.98, shadeTop: 1.1 })
    .face([[1.502, deck + 1, 0.22], [1.502, deck + 1.72, 0.22], [1.502, deck + 1.72, 0.88], [1.502, deck + 1, 0.88]], "crane-glass", 1.15)
    .face([[0.2, deck + 1, 0.952], [1.4, deck + 1, 0.952], [1.4, deck + 1.72, 0.952], [0.2, deck + 1.72, 0.952]], "crane-glass", 1.1)
    // The machine house and counterweight, behind.
    .box([-2.6, deck + 0.2, -0.85], [-0.2, deck + 1.35, 0.15], "crane-yellow", { shade: 0.9, shadeTop: 1.1 })
    .box([-3.25, deck - 0.2, -0.9], [-2.6, deck + 1, 0.9], "crane-dark", { shadeTop: 1.3 })
    // The A-frame the stays pull on.
    .beam([-0.9, deck + 0.3, 0.72], mastTop, 0.2, 0.2, "crane-yellow", 0.95)
    .beam([-0.9, deck + 0.3, -0.72], mastTop, 0.2, 0.2, "crane-yellow", 0.95)
    .beam([0.3, deck + 0.3, -0.45], mastTop, 0.15, 0.15, "crane-yellow", 0.92)
    // A box jib that tapers to its tip, with a yellow bottom chord and a darker top.
    .tube(root, tip, 0.34, 4, { radiusTo: 0.15, shadeFrom: 0.95, shadeTo: 1.05 }, "crane-yellow")
    .beam(mastTop, [root[0] + jibLong * 0.58, root[1] + jibRise * 0.58, 0], 0.045, 0.045, "crane-dark")
    .beam(mastTop, backEnd, 0.045, 0.045, "crane-dark")
    .beam([tip[0] - 0.05, tip[1] - 0.1, 0.03], hook, 0.022, 0.022, "crane-dark")
    .beam([tip[0] - 0.05, tip[1] - 0.1, -0.03], hook, 0.022, 0.022, "crane-dark")
    .box([hook[0] - 0.13, hook[1] - 0.34, -0.1], [hook[0] + 0.13, hook[1], 0.1], "crane-yellow", { shade: 0.92 })
    .tube([hook[0], hook[1] - 0.34, 0], [hook[0], hook[1] - 0.55, 0], 0.035, 4, { radiusTo: 0.016 }, "crane-dark");
  for (let band = 1; band < 5; band++) {
    const share = band / 5;
    const at: V3 = [root[0] + jibLong * share, root[1] + jibRise * share, 0];
    near.tube([at[0] - 0.06, at[1], at[2]], [at[0] + 0.06, at[1] + 0.02, at[2]], 0.33 - 0.19 * share + 0.02, 4, {}, "crane-dark");
  }
  const far = new Painted()
    .tube([0, -0.4, 0], [0, pillar, 0], 0.6, 3, { radiusTo: 0.42 }, "crane-yellow")
    .box([-3.25, deck - 0.3, -0.9], [1.5, deck + 1.8, 0.92], "crane-yellow", { open: true, shadeTop: 1.1, shade: 0.95 })
    .tube(root, tip, 0.34, 3, { radiusTo: 0.17 }, "crane-yellow")
    .beam(mastTop, [root[0] + jibLong * 0.58, root[1] + jibRise * 0.58, 0], 0.06, 0.06, "crane-dark")
    .tube([0.3, deck, 0], mastTop, 0.18, 3, {}, "crane-yellow")
    .beam(tip, hook, 0.04, 0.04, "crane-dark");
  return streetModel(near, far, CRANE_SWAP_M, CRANE_REACH_M);
}

/** A hull's stations, stern to bow: along, half-beam at the deck, the sheer's height, half-beam at the chine, the chine's height, and the keel's. */
const STATIONS: readonly (readonly [x: number, deck: number, sheer: number, chine: number, chineY: number, keel: number])[] = [
  [-4.1, 1.05, 0.72, 0.9, 0.12, -0.05],
  [-3, 1.32, 0.68, 1.12, 0.02, -0.25],
  [-1.6, 1.48, 0.67, 1.2, -0.08, -0.38],
  [0, 1.5, 0.71, 1.15, -0.1, -0.42],
  [1.6, 1.32, 0.8, 0.9, -0.04, -0.36],
  [3, 0.82, 0.93, 0.46, 0.08, -0.2],
  [4.25, 0.04, 1.08, 0.02, 0.5, 0.42],
];

const MAST_M = 11.2;
const BOAT_SWAP_M = 150;
const BOAT_REACH_M = 1400;

function hull(into: Painted, stations: readonly (typeof STATIONS)[number][]): Painted {
  for (const side of [-1, 1]) {
    for (let station = 0; station + 1 < stations.length; station++) {
      const [ax, aDeck, aSheer, aChine, aChineY, aKeel] = stations[station];
      const [bx, bDeck, bSheer, bChine, bChineY, bKeel] = stations[station + 1];
      const top = 0.1;
      const lerp = (a: number, b: number, share: number) => a + (b - a) * share;
      into
        .face([[ax, aSheer, side * aDeck], [bx, bSheer, side * bDeck], [bx, bSheer - top, side * lerp(bDeck, bChine, 0.12)], [ax, aSheer - top, side * lerp(aDeck, aChine, 0.12)]], "hull-stripe")
        .face([[ax, aSheer - top, side * lerp(aDeck, aChine, 0.12)], [bx, bSheer - top, side * lerp(bDeck, bChine, 0.12)], [bx, bChineY, side * bChine], [ax, aChineY, side * aChine]], "hull-white", side > 0 ? 1 : 0.94)
        .face([[ax, aChineY, side * aChine], [bx, bChineY, side * bChine], [bx, bKeel, 0], [ax, aKeel, 0]], "hull-under")
        .face([[ax, aSheer, side * aDeck], [bx, bSheer, side * bDeck], [bx, bSheer + 0.01, 0], [ax, aSheer + 0.01, 0]], "deck", 1.05);
    }
  }
  const [x, deck, sheer, chine, chineY, keel] = stations[0];
  return into.face([[x, sheer, deck], [x, sheer, -deck], [x, chineY, -chine], [x, keel, 0], [x, chineY, chine]], "hull-white", 0.9);
}

/** The boat rocks about its waterline: the mast's top moves most. */
const rocking: Motion = (_, [, y]) => ({ kind: "hull", metres: Math.max(0, y) * 0.022 });

/** A moored sailing boat of about 8.5 m, sail furled on the boom under its cover. */
export function buildSailboat(): RoadsideModel {
  const mastFoot: V3 = [0.7, 1.3, 0];
  const mastTop: V3 = [0.7, MAST_M, 0];
  const bow: V3 = [4.15, 1.12, 0];
  const stern: V3 = [-3.95, 0.82, 0];
  const boomEnd: V3 = [-3, 2.2, 0];
  const near = hull(new Painted(), STATIONS)
    // Coachroof, and the cockpit behind it.
    .box([-1.2, 0.7, -0.92], [1.9, 1.28, 0.92], "cabin", { open: true, shadeTop: 1.1 })
    .face([[-1.21, 0.9, 0.93], [1.6, 0.9, 0.93], [1.6, 1.12, 0.93], [-1.21, 1.12, 0.93]], "camera-glass")
    .face([[-1.21, 0.9, -0.93], [1.6, 0.9, -0.93], [1.6, 1.12, -0.93], [-1.21, 1.12, -0.93]], "camera-glass")
    .face([[-3.1, 0.74, -0.9], [-1.25, 0.74, -0.9], [-1.25, 0.74, 0.9], [-3.1, 0.74, 0.9]], "bench-wood", 0.8)
    .tube(mastFoot, mastTop, 0.075, 5, { radiusTo: 0.045, cap: true }, "spar")
    .tube([0.68, 2.1, 0], boomEnd, 0.05, 4, { cap: true }, "spar")
    .tube([0.3, 2.28, 0], [-2.8, 2.3, 0], 0.13, 4, { radiusTo: 0.09, cap: true, shadeFrom: 1.05 }, "sail-cover")
    .tube([-3.55, 0.72, 0.4], [-3.55, 1.45, 0.4], 0.018, 3, {}, "rigging")
    .tube([-3.55, 0.72, -0.4], [-3.55, 1.45, -0.4], 0.018, 3, {}, "rigging")
    .beam([-3.55, 1.45, -0.4], [-3.55, 1.45, 0.4], 0.03, 0.03, "rigging")
    .beam(mastTop, bow, 0.016, 0.016, "rigging")
    .beam(mastTop, stern, 0.016, 0.016, "rigging")
    .beam(mastTop, [0.65, 0.72, 1.42], 0.016, 0.016, "rigging")
    .beam(mastTop, [0.65, 0.72, -1.42], 0.016, 0.016, "rigging");
  const farStations = [STATIONS[0], STATIONS[3], STATIONS[6]];
  const far = hull(new Painted(), farStations)
    .box([-1.2, 0.7, -0.92], [1.9, 1.28, 0.92], "cabin", { open: true, shadeTop: 1.1 })
    .tube(mastFoot, mastTop, 0.09, 3, { radiusTo: 0.05 }, "spar")
    .tube([0.68, 2.25, 0], boomEnd, 0.11, 3, {}, "sail-cover");
  return streetModel(near, far, BOAT_SWAP_M, BOAT_REACH_M, rocking);
}

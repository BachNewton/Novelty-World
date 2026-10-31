import type { RoadsideModel } from "../roadside/models";
import { farShed, Marked, marinaModel, TAU, type GableShed } from "./paint";

/*
 * The fishing shore, beside identity's `buildFishingHut`, `buildDryingNets` and
 * `buildNetHeap`: the catch's boxes, a smokehouse, and the floats that mark a net.
 */

/** A stack of plastic fish boxes, the top one open with ice in it. */
export function buildFishBoxes(): RoadsideModel {
  const [wide, deep, tall] = [0.4, 0.3, 0.2];
  const near = new Marked();
  ([[0, 0, 0, "box-blue"], [0, 0, 1, "box-blue"], [0.86, 0.04, 0, "box-grey"], [0.86, 0.04, 1, "box-blue"], [0.86, 0.04, 2, "box-grey"], [0.42, -0.72, 0, "box-blue"]] as const).forEach(([x, z, level, part]) => {
    const y = level * tall;
    near.box([x - wide, y, z - deep], [x + wide, y + tall - 0.015, z + deep], part, { open: true, shadeTop: 0.72 });
    near.box([x - wide - 0.018, y + tall - 0.03, z - deep - 0.018], [x + wide + 0.018, y + tall, z + deep + 0.018], part, { open: true, shadeTop: 0.72 });
  });
  near.face([[0.42 - wide + 0.03, 0.17, -0.72 - deep + 0.03], [0.42 + wide - 0.03, 0.17, -0.72 - deep + 0.03], [0.42 + wide - 0.03, 0.18, -0.72 + deep - 0.03], [0.42 - wide + 0.03, 0.18, -0.72 + deep - 0.03]], "ice");
  return marinaModel(near, null, 110, 130);
}

const SMOKEHOUSE: GableShed = { x: [-1.6, 1.6], z: [-1.3, 1.3], eaves: 2, ridge: 3.1, foot: 0.25, walls: "tar-boards", roof: "roof-under", fascia: "plank-tarred" };

/** A small smokehouse: a sooted tarred hut on a stone footing, a firebox hatch, a vent in the ridge, split alder stacked by the wall. */
export function buildSmokehouse(): RoadsideModel {
  const near = new Marked().box([-1.75, 0, -1.45], [1.75, 0.25, 1.45], "stone-dark", { open: true }).shed(SMOKEHOUSE);
  near.face([[-0.5, 0.3, 1.31], [0.5, 0.3, 1.31], [0.5, 2, 1.31], [-0.5, 2, 1.31]], "door");
  near.face([[1.61, 0.3, -0.4], [1.61, 0.3, 0.4], [1.61, 0.95, 0.4], [1.61, 0.95, -0.4]], "iron");
  near.box([-0.3, 3.05, -0.3], [0.3, 3.5, 0.3], "plank-tarred", { open: true });
  near.tube([0, 3.5, 0], [0, 3.8, 0], 0.5, 4, { radiusTo: 0.04, shadeFrom: 0.8, shadeTo: 1 }, "roof-under");
  for (let log = 0; log < 7; log++) {
    const [z, y] = [log < 4 ? -1 + log * 0.3 : -0.85 + (log - 4) * 0.3, log < 4 ? 0.13 : 0.37];
    near.beam([-2.6, y, z], [-1.8, y, z], 0.22, 0.2, "oak", 1, 1.05);
    near.face([[-2.601, y - 0.1, z - 0.11], [-2.601, y - 0.1, z + 0.11], [-2.601, y + 0.1, z + 0.11], [-2.601, y + 0.1, z - 0.11]], "new-timber-end");
  }
  return marinaModel(near, farShed(SMOKEHOUSE), 100, 800);
}

/** Floats by the wall: a heap of cork-line floats and a net marker's flag pole, on the shore. */
export function buildFloatHeap(): RoadsideModel {
  const near = new Marked();
  ([[0, 0.14, 0, "float-orange"], [0.34, 0.14, 0.1, "float-white"], [-0.3, 0.14, 0.18, "float-orange"], [0.14, 0.4, 0.16, "float-white"]] as const).forEach(([x, y, z, part]) => near.lathe([x, y - 0.14, z], [[0, 0.03], [0.1, 0.14], [0.3, 0.12], [0.38, 0.02]], 5, part));
  near.beam([-0.55, 0, -0.1], [0.9, 2.5, -0.25], 0.04, 0.04, "stickers");
  near.face([[0.76, 2.26, -0.24], [1.14, 2.08, -0.24], [0.95, 1.78, -0.24], [0.6, 1.98, -0.24]], "float-orange");
  near.beam([-0.5, 0.03, -0.45], [0.5, 0.03, -0.5], 0.05, 0.05, "rope");
  return marinaModel(near, null, 90, 110);
}

/** A net-marker float out on the water: a pole through a white float, an orange flag. Its origin is on the water. */
export function buildNetMarker(): RoadsideModel {
  const near = new Marked()
    .lathe([0, -0.06, 0], [[0, 0.05], [0.08, 0.18], [0.2, 0.18], [0.3, 0.05]], 6, "float-white")
    .tube([0, -0.2, 0], [0, 1.9, 0], 0.016, 3, {}, "mark-black");
  const way = TAU / 8;
  near.face([[0, 1.9, 0], [Math.cos(way) * 0.45, 1.8, Math.sin(way) * 0.05], [Math.cos(way) * 0.45, 1.5, Math.sin(way) * 0.05], [0, 1.55, 0]], "float-orange");
  return marinaModel(near, null, 150, 180, (part, [x]) => (part === "float-orange" ? { kind: "cloth", metres: x * 0.14 } : { kind: "hull", metres: 0.02 }));
}

import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { HALF_PI, Marked, marinaModel, TAU, type MarinaPart } from "./paint";

/*
 * What a seafaring town keeps by its quays. Mariehamn's anchors from the barque Plus and
 * Degerby's stock anchor are on OSM (see `places.ts`); these are the kinds, not those
 * objects.
 */

const MONUMENT_SWAP_M = 70;
const MONUMENT_REACH_M = 500;

function plinth(into: Marked, wide: number, deep: number, tall: number, part: MarinaPart = "concrete"): Marked {
  return into.box([-wide / 2, 0, -deep / 2], [wide / 2, tall, deep / 2], part, { open: true, shadeTop: 1.08 });
}

function chainRun(into: Marked, from: V3, to: V3, links: number): void {
  for (let link = 0; link < links; link++) {
    const [a, b] = [link / links, (link + 0.7) / links];
    const at = (share: number): V3 => [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share];
    into.beam(at(a), at(b), link % 2 === 0 ? 0.1 : 0.04, link % 2 === 0 ? 0.04 : 0.1, "iron-rust");
  }
}

export type AnchorKind = "admiralty" | "stockless";

/** An anchor stood as a monument on a plinth, with a run of chain. `admiralty` has its long shank and iron stock, across the arms; `stockless` is a modern ship's, with arms that pivot in a head. In the plane of +x, stock across z. */
export function buildAnchorMonument(kind: AnchorKind): RoadsideModel {
  const base = 0.35;
  const near = plinth(new Marked(), kind === "admiralty" ? 3.6 : 3, 1.8, base);
  near.box([-1.5, base, -0.55], [1.5, base + 0.1, 0.55], "stone-pink", { open: true, shadeTop: 1.1 });
  const crown = base + 0.42;
  if (kind === "admiralty") {
    const top = crown + 3.6;
    near.tube([0, crown, 0], [0, top, 0], 0.13, 6, { radiusTo: 0.09 }, "iron");
    near.tube([0, top - 0.42, -1.5], [0, top - 0.42, 1.5], 0.07, 6, { cap: true, radiusTo: 0.05 }, "iron");
    near.hoop([0, top + 0.18, 0], 0.26, 8, 0.06, "iron", "xy");
    for (const side of [-1, 1]) {
      const [elbow, tip]: [V3, V3] = [[side * 0.78, crown + 0.08, 0], [side * 1.32, crown + 0.92, 0]];
      near.tube([0, crown - 0.05, 0], elbow, 0.12, 5, { radiusTo: 0.1 }, "iron").tube(elbow, tip, 0.1, 5, { radiusTo: 0.05 }, "iron");
      // The palm, broad across the arm.
      near.face([[side * 1, crown + 0.42, -0.33], [side * 1.4, crown + 1.02, 0], [side * 1, crown + 0.42, 0.33], [side * 0.84, crown + 0.26, 0]], "iron-rust", side > 0 ? 1 : 0.86);
      near.spike(tip, [side * 1.42, crown + 1.12, 0], 0.05, "iron");
    }
    chainRun(near, [0.1, top + 0.0, 0.05], [1.4, base + 0.08, 0.35], 9);
  } else {
    const top = crown + 2.5;
    near.box([-0.2, crown + 0.16, -0.26], [0.2, crown + 0.8, 0.26], "iron", { shade: 0.95 });
    near.beam([0, crown + 0.7, 0], [0, top, 0], 0.26, 0.2, "iron");
    near.hoop([0, top + 0.16, 0], 0.22, 8, 0.07, "iron", "xy");
    for (const side of [-1, 1]) {
      near.face([[side * 0.15, crown + 0.2, -0.22], [side * 1.05, crown + 0.02, -0.32], [side * 1.24, crown + 1.02, -0.05], [side * 1.04, crown + 1.02, -0.05], [side * 0.26, crown + 0.76, -0.2]], "iron", 0.92 + side * 0.05);
      near.face([[side * 0.15, crown + 0.2, 0.22], [side * 1.05, crown + 0.02, 0.32], [side * 1.24, crown + 1.02, 0.05], [side * 1.04, crown + 1.02, 0.05], [side * 0.26, crown + 0.76, 0.2]], "iron", 0.98 + side * 0.05);
    }
    chainRun(near, [0, top + 0.02, 0.08], [1.2, base + 0.08, 0.3], 8);
  }
  const far = plinth(new Marked(), 3, 1.5, base).beam([0, base, 0], [0, crown + 3, 0], 0.24, 0.24, "iron").beam([-1.1, crown + 0.2, 0], [1.1, crown + 0.2, 0], 0.26, 0.5, "iron");
  return marinaModel(near, far, MONUMENT_SWAP_M, MONUMENT_REACH_M);
}

/** A ship's propeller as a monument: four bronze blades on a hub, tilted up on a stone base and a stub of shaft. It faces +z. */
export function buildPropellerMonument(): RoadsideModel {
  const near = plinth(new Marked(), 2.8, 1.5, 0.5, "stone-grey");
  const hub: V3 = [0, 2.75, 0];
  near.tube([0, 2.75, -0.8], [0, 2.75, 0], 0.26, 6, {}, "iron");
  near.tube([0, 2.75, -0.5], [0, 2.75, 0.42], 0.42, 8, { radiusTo: 0.28, cap: true, shadeFrom: 0.9, shadeTo: 1.05 }, "bronze");
  near.tube([0, 2.75, -0.6], [0, 0.5, -0.6], 0.2, 4, { radiusTo: 0.32 }, "stone-dark");
  const blades = 4;
  for (let blade = 0; blade < blades; blade++) {
    const angle = HALF_PI * 0.5 + (blade / blades) * TAU;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const at = (out: number, across: number, pitch: number): V3 => [hub[0] + c * out - s * across, hub[1] + s * out + c * across, pitch];
    // Two faces of a raked, skewed blade with a fold along its middle.
    const [root, midLead, midTrail, tipLead, tipTrail, tip] = [at(0.3, 0, 0.05), at(1.15, 0.5, 0.3), at(1.15, -0.32, -0.26), at(1.95, 0.42, 0.2), at(1.95, -0.1, -0.1), at(2.3, 0.22, 0.08)];
    near.face([root, midLead, tipLead, tip], "bronze", 1.08);
    near.face([root, tip, tipTrail, midTrail], "bronze", 0.86);
  }
  const far = plinth(new Marked(), 2.8, 1.5, 0.5, "stone-grey").tube([0, 2.75, -0.2], [0, 2.75, 0.3], 0.42, 4, { cap: true }, "bronze");
  for (let blade = 0; blade < 4; blade++) {
    const angle = HALF_PI * 0.5 + (blade / 4) * TAU;
    far.spike([Math.cos(angle) * 0.3, 2.75 + Math.sin(angle) * 0.3, 0], [Math.cos(angle) * 2.3, 2.75 + Math.sin(angle) * 2.3, 0], 0.4, "bronze");
  }
  return marinaModel(near, far, MONUMENT_SWAP_M, MONUMENT_REACH_M);
}

/** A museum yard's naval gun: a cast-iron muzzle-loader on a timber truck carriage, four small wheels, muzzle along +x. */
export function buildCannon(): RoadsideModel {
  const near = new Marked();
  for (const z of [-0.33, 0.33]) {
    near.face([[-0.95, 0.18, z], [0.75, 0.18, z], [0.75, 0.62, z], [0.2, 0.62, z], [0.1, 0.48, z], [-0.35, 0.48, z], [-0.45, 0.36, z], [-0.95, 0.36, z]], "oak", z > 0 ? 1 : 0.86);
    near.face([[-0.95, 0.18, z + 0.1], [0.75, 0.18, z + 0.1], [0.75, 0.62, z + 0.1], [0.2, 0.62, z + 0.1], [0.1, 0.48, z + 0.1], [-0.35, 0.48, z + 0.1], [-0.45, 0.36, z + 0.1], [-0.95, 0.36, z + 0.1]], "oak", z > 0 ? 1 : 0.86);
  }
  for (const x of [-0.65, 0.5]) {
    near.tube([x, 0.2, -0.55], [x, 0.2, 0.55], 0.05, 4, { cap: true }, "iron");
    for (const z of [-0.48, 0.48]) near.wheel([x, 0.21, z], x > 0 ? 0.21 : 0.17, 0.1, "oak");
  }
  near.box([-0.2, 0.42, -0.3], [0.65, 0.5, 0.3], "plank-tarred", { open: true });
  const axis = (x: number): V3 => [x, 0.74 + (x + 1.15) * 0.04, 0];
  near.tube(axis(-1), axis(-0.15), 0.2, 8, { radiusTo: 0.18, shadeFrom: 0.9, shadeTo: 1.05 }, "iron")
    .tube(axis(-0.15), axis(0.45), 0.17, 8, { radiusTo: 0.15 }, "iron")
    .tube(axis(0.45), axis(1.5), 0.135, 8, { radiusTo: 0.115 }, "iron")
    .tube(axis(1.5), axis(1.62), 0.14, 8, { radiusTo: 0.135, cap: true }, "iron")
    .tube(axis(-1.0), axis(-1.08), 0.2, 6, { radiusTo: 0.1, cap: true }, "iron")
    .spike(axis(-1.08), axis(-1.24), 0.07, "iron");
  near.tube([0, axis(0)[1], -0.36], [0, axis(0)[1], 0.36], 0.07, 5, { cap: true }, "iron");
  const far = new Marked().box([-0.95, 0.05, -0.42], [0.75, 0.6, 0.42], "oak", { open: true }).tube(axis(-1), axis(1.6), 0.2, 3, { radiusTo: 0.14 }, "iron");
  return marinaModel(near, far, MONUMENT_SWAP_M, MONUMENT_REACH_M);
}

/** A ship's figurehead kept on a post: a draped woman leaning forward into the sea, painted white and gold with a blue sash, on her stem-piece. No ship's in particular. She looks along +x. */
export function buildFigurehead(): RoadsideModel {
  const lean = 0.42;
  const axisAt = (up: number): V3 => [up * lean, 1.05 + up, 0];
  const near = plinth(new Marked(), 1.1, 1, 0.3, "stone-grey");
  near.box([-0.4, 0.3, -0.22], [0.3, 1.15, 0.22], "plank-tarred", { shadeTop: 1.05 });
  // Scroll and gilt under her.
  near.tube([-0.35, 1.1, 0], [0.1, 1.2, 0], 0.24, 6, { radiusTo: 0.2, cap: true }, "figure-gold");
  const sections: readonly (readonly [up: number, wide: number, deep: number, part: MarinaPart])[] = [
    [0.05, 0.26, 0.2, "figure-white"], [0.45, 0.28, 0.21, "figure-white"], [0.72, 0.22, 0.17, "figure-blue"], [0.86, 0.23, 0.18, "figure-white"], [1.08, 0.29, 0.22, "figure-white"], [1.26, 0.24, 0.15, "figure-skin"],
  ];
  for (let section = 0; section + 1 < sections.length; section++) {
    const [[fromUp, fromWide, fromDeep, part], [toUp, toWide, toDeep]] = [sections[section], sections[section + 1]];
    const sides = 6;
    for (let side = 0; side < sides; side++) {
      const point = (up: number, wide: number, deep: number, index: number): V3 => {
        const angle = (index / sides) * TAU;
        const [x, y, z] = axisAt(up);
        return [x + Math.cos(angle) * deep, y - Math.cos(angle) * deep * lean, z + Math.sin(angle) * wide];
      };
      near.face([point(fromUp, fromWide, fromDeep, side), point(fromUp, fromWide, fromDeep, side + 1), point(toUp, toWide, toDeep, side + 1), point(toUp, toWide, toDeep, side)], part, 0.84 + 0.2 * Math.cos(((side + 0.5) / sides) * TAU));
    }
  }
  const neck = axisAt(1.26);
  const head: V3 = [neck[0] + 0.06, neck[1] + 0.27, 0];
  near.tube(neck, head, 0.055, 5, {}, "figure-skin");
  near.lathe([head[0], head[1], 0], [[0, 0.07], [0.09, 0.115], [0.21, 0.09], [0.28, 0.01]], 6, "figure-skin");
  // Hair falling back, and a gold band.
  near.tube([head[0] - 0.05, head[1] + 0.22, 0], [head[0] - 0.42, head[1] - 0.25, 0], 0.11, 5, { radiusTo: 0.05 }, "figure-gold");
  near.hoop([head[0], head[1] + 0.17, 0], 0.112, 6, 0.018, "figure-gold", "xz");
  // Arms folded to the breast.
  for (const side of [-1, 1]) {
    const shoulder: V3 = [neck[0] - 0.08, neck[1] - 0.08, side * 0.27];
    const elbow: V3 = [neck[0] - 0.05, neck[1] - 0.43, side * 0.33];
    near.tube(shoulder, elbow, 0.07, 4, { radiusTo: 0.055 }, "figure-white").tube(elbow, [neck[0] + 0.2, neck[1] - 0.3, side * 0.05], 0.052, 4, { radiusTo: 0.035 }, "figure-skin");
  }
  const far = plinth(new Marked(), 1.1, 1, 0.3, "stone-grey").box([-0.4, 0.3, -0.22], [0.3, 1.15, 0.22], "plank-tarred", { open: true }).tube(axisAt(0), axisAt(1.5), 0.26, 3, { radiusTo: 0.1, cap: true }, "figure-white");
  return marinaModel(near, far, 40, MONUMENT_REACH_M - 200);
}

/** A hanging ship's-wheel sign outside a chandler or a museum: a post and bracket, and a spoked wheel with its handles. Its face looks along +z. */
export function buildWheelSign(): RoadsideModel {
  const near = new Marked().beam([0, 0, -0.05], [0, 3.3, -0.05], 0.1, 0.1, "steel");
  near.beam([0, 3.1, -0.05], [1.3, 3.1, -0.05], 0.05, 0.05, "steel").beam([0, 2.5, -0.05], [0.9, 3.1, -0.05], 0.03, 0.03, "steel");
  const hub: V3 = [0.85, 2.3, 0];
  for (const x of [0.46, 1.24]) near.beam([x, 3.1, -0.05], [x, 2.75, -0.05], 0.015, 0.015, "iron");
  near.hoop(hub, 0.55, 8, 0.07, "oak");
  near.tube([hub[0], hub[1], -0.06], [hub[0], hub[1], 0.06], 0.1, 6, { cap: true }, "brass");
  for (let spoke = 0; spoke < 8; spoke++) {
    const angle = (spoke / 8) * TAU;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    near.beam([hub[0] + c * 0.09, hub[1] + s * 0.09, 0], [hub[0] + c * 0.5, hub[1] + s * 0.5, 0], 0.045, 0.03, "oak");
    near.tube([hub[0] + c * 0.56, hub[1] + s * 0.56, 0], [hub[0] + c * 0.71, hub[1] + s * 0.71, 0], 0.03, 4, { radiusTo: 0.018, cap: true }, "oak");
  }
  const far = new Marked().beam([0, 0, -0.05], [0, 3.3, -0.05], 0.1, 0.1, "steel").tube([hub[0], hub[1], -0.03], [hub[0], hub[1], 0.03], 0.62, 6, { cap: true }, "oak");
  return marinaModel(near, far, 50, 300);
}

/** A mooring ring set in a stone quay's top: a block let into the edge, a staple, and an iron ring lying on it. Its +z is out over the water. */
export function buildMooringRing(): RoadsideModel {
  const near = new Marked()
    .box([-0.32, -0.25, -0.3], [0.32, 0.03, 0.26], "stone-grey", { open: true, shadeTop: 1.1 })
    .beam([-0.1, 0.03, 0], [-0.1, 0.13, 0], 0.05, 0.05, "iron").beam([0.1, 0.03, 0], [0.1, 0.13, 0], 0.05, 0.05, "iron").beam([-0.12, 0.13, 0], [0.12, 0.13, 0], 0.05, 0.05, "iron");
  near.hoop([0, 0.07, 0.19], 0.18, 8, 0.035, "iron-rust", "xz");
  return marinaModel(near, null, 45, 60);
}

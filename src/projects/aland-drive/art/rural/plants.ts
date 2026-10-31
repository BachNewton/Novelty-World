import type { RoadsideModel } from "../roadside/index";
import { seeded, type V3 } from "../roadside/mesh";
import { finished, ringed, RuralMesh, type RuralPart } from "./mesh";

/*
 * What grows between the trees and the shore. Bushes and junipers are in metres; a
 * birch, like the roadside pine, is one unit tall, to be scaled by the tree's height.
 */

/** A rounded mass of leaf: a narrow underside, a wide belly and a domed top, dark below and light above. */
function blob(mesh: RuralMesh, centre: V3, wide: number, tall: number, sides: number, random: () => number, part: RuralPart): RuralMesh {
  const turn = random() * 6.283;
  const reaches = Array.from({ length: sides }, () => 0.82 + random() * 0.36);
  const ring = (up: number, share: number, twist: number) => Array.from({ length: sides }, (_, side): V3 => {
    const angle = turn + twist + (side / sides) * 6.283;
    return [centre[0] + Math.cos(angle) * wide * share * reaches[side], centre[1] + tall * up + (random() - 0.5) * tall * 0.1, centre[2] + Math.sin(angle) * wide * share * reaches[side]];
  });
  const { corners, triangles } = ringed([ring(-0.5, 0.62, 0), ring(-0.05, 1, 0.3), ring(0.34, 0.74, 0.6)], [centre[0], centre[1] + tall * 0.54, centre[2]]);
  for (let side = 1; side < sides - 1; side++) triangles.push([0, side, side + 1]);
  return mesh.solid(corners, triangles, part, ([, y]) => 0.72 + Math.min(1, Math.max(0, (y - centre[1]) / tall + 0.5)) * 0.52);
}

export type BushKind = "hazel" | "sallow";

const BUSH_PARTS: Record<BushKind, RuralPart> = { hazel: "bush-lit", sallow: "sallow-lit" };

/** A shrub about two metres across, in masses of leaf down to the ground. Scale it from 0.5 to 2 for a hedge bank or a thicket. */
export function buildBush(seed = 1, kind: BushKind = "hazel"): RoadsideModel {
  const random = seeded(seed * 6151 + 11);
  const part = BUSH_PARTS[kind];
  const near = new RuralMesh();
  const lumps = 3 + (seed % 2);
  blob(near, [0, 0.72, 0], 0.72, 1.3, 6, random, part);
  for (let lump = 1; lump < lumps; lump++) {
    const turn = (lump / (lumps - 1)) * 6.283 + random();
    const out = 0.52 + random() * 0.2;
    blob(near, [Math.cos(turn) * out, 0.42 + random() * 0.14, Math.sin(turn) * out], 0.52 + random() * 0.14, 0.92 + random() * 0.2, 5, random, part);
  }
  return finished(near, blob(new RuralMesh(), [0, 0.68, 0], 1.08, 1.5, 3, random, part), 70, 380);
}

export type JuniperForm = "column" | "spreading";

/** Grazed islands' own shrub, dark and blue-green. A column stands like a small cypress, up to about 2.8 m; a spreading one lies low over rock. */
export function buildJuniper(seed = 1, form: JuniperForm = "column"): RoadsideModel {
  const random = seeded(seed * 2741 + 5);
  const near = new RuralMesh();
  const far = new RuralMesh();
  if (form === "spreading") {
    for (let lump = 0; lump < 3; lump++) {
      const turn = (lump / 3) * 6.283 + random();
      blob(near, [Math.cos(turn) * 0.62, 0.22, Math.sin(turn) * 0.46], 0.68 + random() * 0.2, 0.5 + random() * 0.2, 5, random, "juniper-lit");
    }
    blob(far, [0, 0.22, 0], 1.25, 0.66, 3, random, "juniper-lit");
    return finished(near, far, 60, 300);
  }
  const tall = 2.1 + random() * 0.7;
  const lean: V3 = [(random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3];
  const widths = [0.42, 0.52, 0.44, 0.3, 0.17];
  const shape = (corners: number, rough: number) => {
    const stations = widths.map((width, level) => {
      const share = level / (widths.length - 1) * 0.86;
      return Array.from({ length: corners }, (_, side): V3 => {
        const angle = (side / corners) * 6.283 + level * 0.5;
        const reach = width * (1 + (random() - 0.5) * rough);
        return [Math.cos(angle) * reach + lean[0] * share, share * tall - 0.1 + (random() - 0.5) * rough * 0.2, Math.sin(angle) * reach + lean[2] * share];
      });
    });
    return ringed(stations, [lean[0], tall, lean[2]]);
  };
  const body = shape(7, 0.42);
  near.solid(body.corners, body.triangles, "juniper-lit", ([, y]) => 0.66 + (y / tall) * 0.44);
  const outline = ringed([0, 0.55].map((share, level) => Array.from({ length: 3 }, (_, side): V3 => [Math.cos(side * 2.094 + level) * (level === 0 ? 0.55 : 0.4), share * tall, Math.sin(side * 2.094 + level) * (level === 0 ? 0.55 : 0.4)])), [lean[0], tall, lean[2]]);
  far.solid(outline.corners, outline.triangles, "juniper-lit", ([, y]) => 0.66 + (y / tall) * 0.44);
  return finished(near, far, 70, 380);
}

export type BirchForm = "silver" | "young" | "clump";

interface BirchShape {
  stems: readonly { foot: V3; top: V3; radius: number }[];
  /** Up the tree, out from the stem, which way round, how wide, how tall, which stem. Shares of the tree's height. */
  crown: readonly (readonly [up: number, out: number, turn: number, wide: number, tall: number, stem: number])[];
}

const BIRCHES: Record<BirchForm, BirchShape> = {
  // Masses hung close round a slim leader, narrow and longer than they're wide, with the bare trunk below.
  silver: {
    stems: [{ foot: [0, -0.03, 0], top: [0.015, 0.97, 0.01], radius: 0.017 }],
    crown: [[0.42, 0.075, 0.6, 0.1, 0.26, 0], [0.47, 0.075, 3.7, 0.105, 0.28, 0], [0.62, 0.04, 2, 0.13, 0.32, 0], [0.8, 0.012, 5.2, 0.085, 0.3, 0]],
  },
  young: {
    stems: [{ foot: [0, -0.03, 0], top: [-0.01, 0.98, 0.015], radius: 0.013 }],
    crown: [[0.42, 0.03, 1.1, 0.085, 0.34, 0], [0.66, 0.02, 4.2, 0.09, 0.38, 0], [0.84, 0.005, 2.7, 0.05, 0.27, 0]],
  },
  // Stems from one stool, as a birch comes back from being cut.
  clump: {
    stems: [{ foot: [0.02, -0.03, 0], top: [0.1, 0.96, 0.03], radius: 0.015 }, { foot: [-0.02, -0.03, 0.015], top: [-0.13, 0.86, 0.05], radius: 0.013 }, { foot: [0, -0.03, -0.02], top: [0.01, 0.8, -0.13], radius: 0.012 }],
    crown: [[0.68, 0.015, 0.3, 0.12, 0.42, 0], [0.62, 0.02, 2.9, 0.105, 0.4, 1], [0.58, 0.02, 4.7, 0.1, 0.38, 2]],
  },
};

/** A birch one unit tall, in one of three forms; a seed varies its leaf. */
export function buildBirch(seed = 1, form: BirchForm = "silver"): RoadsideModel {
  const random = seeded(seed * 3571 + 13);
  const { stems, crown } = BIRCHES[form];
  const near = new RuralMesh();
  const stemAt = (stem: number, up: number): V3 => {
    const { foot, top } = stems[stem];
    const share = (up - foot[1]) / (top[1] - foot[1]);
    return [foot[0] + (top[0] - foot[0]) * share, up, foot[2] + (top[2] - foot[2]) * share];
  };
  for (const [index, { foot, top, radius }] of stems.entries()) {
    const middle = stemAt(index, 0.5);
    near.tube(foot, middle, radius, 3, { radiusTo: radius * 0.68 }, "birch-bark");
    near.tube(middle, top, radius * 0.68, 3, { radiusTo: 0.002 }, "birch-bark");
  }
  for (const [up, out, turn, wide, tall, stem] of crown) {
    const leader = stemAt(stem, up);
    blob(near, [leader[0] + Math.cos(turn) * out, up, leader[2] + Math.sin(turn) * out], wide, tall, 5, random, "birch-leaf");
  }
  const lowest = Math.min(...crown.map(([up]) => up));
  const far = new RuralMesh().tube([0, -0.03, 0], [0, lowest, 0], 0.02, 3, { radiusTo: 0.012 }, "birch-bark");
  blob(far, [0, (lowest + 1) / 2, 0], 0.16, 1 - lowest, 3, random, "birch-leaf");
  return finished(near, far, 150, 1100);
}

const REED_ROWS = 4;
const REEDS_PER_ROW = 24;
const REED_TEETH = 12;
/** How far along the shore a bed runs, for placing one after another; stretch it to fit. */
export const REED_BED_M = 7;
const REED_DEEP_M = 3.2;

/**
 * A bed of last year's reeds with this year's green at their feet: rows of narrow
 * blades standing in water, with their plumes. Its y 0 is the water, its +x runs
 * along the shore and +z is out to sea, where the reeds thin and shorten.
 */
export function buildReedBed(seed = 1): RoadsideModel {
  const random = seeded(seed * 9173 + 17);
  const near = new RuralMesh({ grounded: false });
  const leanX = 0.2 + random() * 0.15;
  for (let row = 0; row < REED_ROWS; row++) {
    const z = (row / (REED_ROWS - 1) - 0.5) * REED_DEEP_M;
    const seaward = row / (REED_ROWS - 1);
    const reeds = REEDS_PER_ROW - row * 5;
    near.face([[0, -0.3, z], [REED_BED_M, -0.3, z], [REED_BED_M, 0.3, z], [0, 0.3, z]], "reed-green", 0.6);
    for (let tooth = 0; tooth < REED_TEETH; tooth++) {
      const [from, to] = [(tooth / REED_TEETH) * REED_BED_M - 0.15, ((tooth + 1) / REED_TEETH) * REED_BED_M + 0.15];
      near.solid([[from, 0.1, z], [to, 0.1, z], [(from + to) / 2 + leanX * 0.4, (1.7 - seaward * 0.8) * (0.7 + random() * 0.5), z]], [[0, 1, 2]], "reed-green", ([, y]) => (y < 0.5 ? 0.6 : 0.88));
    }
    for (let reed = 0; reed < reeds; reed++) {
      const x = (reed + random()) / reeds * REED_BED_M;
      const tall = (2.5 - seaward * 1.1) * (0.8 + random() * 0.35);
      const wide = 0.1 + random() * 0.06;
      const tip: V3 = [x + leanX * tall * 0.4, tall, z + (random() - 0.5) * 0.5];
      const part: RuralPart = random() < 0.35 ? "reed-green" : "reed-straw";
      const [from, to] = [[x - wide, -0.3, z], [x + wide, -0.3, z]] as const;
      near.solid([from, to, tip], [[0, 1, 2]], part, ([, y]) => (y < 0 ? 0.66 : 1.12));
      if (reed % 5 === 0 && part === "reed-straw") {
        const [up, side] = [tip[1] - 0.42, 0.055];
        near.solid([[tip[0] - leanX * 0.17 - side, up, tip[2]], [tip[0] - leanX * 0.17 + side, up, tip[2]], [tip[0] + leanX * 0.05, tip[1] + 0.08, tip[2]]], [[0, 1, 2]], "reed-plume", () => 1);
      }
    }
  }
  const far = new RuralMesh({ grounded: false });
  for (let spike = 0; spike < 10; spike++) {
    const [from, to] = [(spike / 10) * REED_BED_M, ((spike + 1) / 10) * REED_BED_M];
    far.solid([[from, -0.3, 0], [to, -0.3, 0], [(from + to) / 2 + 0.3, 1.9 + random() * 0.5, 0]], [[0, 1, 2]], "reed-straw", ([, y]) => (y < 0 ? 0.66 : 1.05));
  }
  far.face([[0, -0.3, 0], [REED_BED_M, -0.3, 0], [REED_BED_M, 0.85, 0], [0, 0.85, 0]], "reed-straw", 0.82);
  return finished(near, far, 90, 620);
}

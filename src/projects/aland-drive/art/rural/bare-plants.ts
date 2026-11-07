import { BareWood, CLUMP_REACH_SHARE, rolled } from "../bare-wood";

/*
 * Hazel, sallow and the young birches without their leaves (`art/leaves.ts`), for the shrubs' planting
 * (`render/shrubs.ts`): a low tangle of stems and twigs from the foot, and the clumps of leaves at the twigs' ends while
 * it has any. A hazel is many straight stems from the ground fanning out; a sallow a rounded mass of stems arching out;
 * a young birch a slim leader with limbs climbing off it and twigs hanging; a birch come back from a cut stool three
 * stems with their limbs. Hazel and sallow are in metres, as their leafy bushes are; a birch is one unit tall, as its
 * leafy model is, both scaled by each plant's size.
 *
 * Every form is one set of vertices on one shared list of triangles, so one draw serves them all, the shader picking a
 * plant's set by its form; a vertex is two rows of four floats, its place and then `bare-wood.ts`'s `bare` vec4.
 */

export const BARE_FORMS = ["hazel", "sallow", "birch", "birch-clump"] as const;
export type BareForm = (typeof BARE_FORMS)[number];

type V3 = readonly [number, number, number];

const STEMS = 7;
const TWIGS_A_STEM = 3;

interface Stem {
  points: [V3, V3, V3];
  radius: number;
}

/** Stems from the foot fanning out straight, each with twigs out and up from its upper half. */
function fanned(spread: number, tall: number, bend: number, footRadius: number): Stem[] {
  return Array.from({ length: STEMS }, (_, stem) => {
    const angle = (stem / STEMS) * 2 * Math.PI + rolled(stem, 1) * 0.6;
    const out = spread * (0.65 + rolled(stem, 2) * 0.35);
    const height = tall * (0.8 + rolled(stem, 3) * 0.2);
    const foot: V3 = [Math.sin(angle) * footRadius, -0.05, Math.cos(angle) * footRadius];
    // A bend above 0 arches a stem out early, as a sallow's do; 0 keeps it straight, as a hazel's are.
    const middle: V3 = [Math.sin(angle) * out * (0.5 + bend), height * (0.5 - bend * 0.15), Math.cos(angle) * out * (0.5 + bend)];
    const tip: V3 = [Math.sin(angle) * out, height, Math.cos(angle) * out];
    return { points: [foot, middle, tip], radius: 0.018 };
  });
}

/** A birch's stems: each a leader, then limbs climbing off them to make up the seven. */
function birch(leaders: readonly { foot: V3; top: V3; radius: number }[], wide: number): Stem[] {
  const stems: Stem[] = leaders.map(({ foot, top, radius }) => ({ points: [foot, lerp(foot, top, 0.5), top], radius }));
  for (let limb = stems.length; limb < STEMS; limb++) {
    const leader = leaders[limb % leaders.length];
    const up = 0.38 + ((limb - leaders.length) / (STEMS - leaders.length)) * 0.42;
    const from = lerp(leader.foot, leader.top, (up - leader.foot[1]) / (leader.top[1] - leader.foot[1]));
    const angle = limb * 2.4 + rolled(limb, 4);
    const reach = wide * (1 - (up - 0.38) * 0.6);
    const out = (share: number): V3 => [from[0] + Math.sin(angle) * reach * share, from[1] + 0.12 * share + 0.02, from[2] + Math.cos(angle) * reach * share];
    stems.push({ points: [from, out(0.5), out(1)], radius: leader.radius * 0.45 });
  }
  return stems;
}

const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface FormSpec {
  stems: Stem[];
  /** Twigs: how far out and up from the stem, a share of the stem's own length, and how far they turn from it. */
  twigOut: number;
  twigUp: number;
  twigRadius: number;
  /** A clump's half width and half height, in the form's units, and how far out its middle may sit. */
  clump: [number, number];
  reach: number;
}

const FORMS: Record<BareForm, FormSpec> = {
  hazel: { stems: fanned(0.9, 1.75, 0, 0.12), twigOut: 0.22, twigUp: 0.1, twigRadius: 0.007, clump: [0.2, 0.13], reach: 1.05 },
  sallow: { stems: fanned(1, 1.5, 0.25, 0.1), twigOut: 0.2, twigUp: 0.16, twigRadius: 0.007, clump: [0.21, 0.14], reach: 1.1 },
  birch: {
    stems: birch([{ foot: [0, -0.03, 0], top: [-0.01, 0.98, 0.015], radius: 0.013 }], 0.11),
    twigOut: 0.035,
    twigUp: -0.08,
    twigRadius: 0.0022,
    clump: [0.04, 0.032],
    reach: 0.13,
  },
  "birch-clump": {
    stems: birch(
      [
        { foot: [0.02, -0.03, 0], top: [0.1, 0.96, 0.03], radius: 0.015 },
        { foot: [-0.02, -0.03, 0.015], top: [-0.13, 0.86, 0.05], radius: 0.013 },
        { foot: [0, -0.03, -0.02], top: [0.01, 0.8, -0.13], radius: 0.012 },
      ],
      0.1,
    ),
    twigOut: 0.035,
    twigUp: -0.06,
    twigRadius: 0.0022,
    clump: [0.042, 0.034],
    reach: 0.22,
  },
};

function formOf(form: BareForm): BareWood {
  const { stems, twigOut, twigUp, twigRadius, clump, reach } = FORMS[form];
  const built = new BareWood();
  const ends: V3[] = [];
  stems.forEach(({ points, radius }, stem) => {
    built.branch(points, [radius, radius * 0.6, 0], 3, [0.2, 0.8]);
    ends.push(points[2]);
    for (let twig = 0; twig < TWIGS_A_STEM; twig++) {
      const base = lerp(points[1], points[2], 0.2 + (twig / TWIGS_A_STEM) * 0.6);
      const way = [points[2][0] - points[0][0], points[2][2] - points[0][2]];
      const turn = Math.atan2(way[0], way[1]) + (twig % 2 === 0 ? 1 : -1) * (0.5 + rolled(stem * 5 + twig, 6) * 0.5);
      const end: V3 = [base[0] + Math.sin(turn) * twigOut * 2, base[1] + twigUp * 2 * (0.6 + rolled(stem * 5 + twig, 7) * 0.4) + twigOut, base[2] + Math.cos(turn) * twigOut * 2];
      built.branch([base, end], [twigRadius, 0], 3, [0.7, 1]);
      if (twig !== 1) ends.push(end);
    }
  });
  ends.forEach((end, index) => {
    const size = 0.75 + rolled(index, 8) * 0.5;
    const [wide, high] = [clump[0] * size, clump[1] * size];
    const out = Math.hypot(end[0], end[2]);
    const pulled = Math.min(out, reach - wide * CLUMP_REACH_SHARE) / Math.max(out, 1e-6);
    built.clump([end[0] * pulled, end[1], end[2] * pulled], wide, high, (index * 0.6180339887) % 1);
  });
  return built;
}

/** Every form's vertices, form after form, two vec4s each, on one list of triangles. */
export interface BarePlants {
  table: Float32Array;
  vertices: number;
  indices: number[];
}

export function barePlants(): BarePlants {
  const built = BARE_FORMS.map(formOf);
  const [first] = built;
  for (const other of built) {
    if (other.indices.length !== first.indices.length || other.indices.some((index, at) => index !== first.indices[at])) throw new Error("Every bare plant form must share one list of triangles.");
  }
  const table = Float32Array.from(built.flatMap(({ positions, bare }) => Array.from({ length: positions.length / 3 }, (_, at) => [positions[at * 3], positions[at * 3 + 1], positions[at * 3 + 2], 0, ...bare.slice(at * 4, at * 4 + 4)]).flat()));
  return { table, vertices: first.positions.length / 3, indices: first.indices };
}

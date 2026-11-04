import { blend, createBuilder, flat, headed, type MeshBuilder, type Paint, type Vec2 } from "./kit";
import type { GroundSite } from "./places";

/*
 * Mariehamn's two bronze statues on the Esplanade, each a figure on a granite plinth, sculpted as turned forms: a
 * skirt, a coat, a body, a head, each a lathe of a few rings, so the figure reads by its outline and its lit and shaded
 * sides, as a statue does from a street away. Andrej Kovaltjuk's Empress Maria Alexandrovna (2011) stands at the foot
 * of Stadshusbacken in a full crinoline gown, a shawl over her shoulders, on a stepped plinth with her name on it,
 * looking up the slope towards the town hall. Viktor Jansson's Julius Sundblom (1948), the editor and Åland's first
 * speaker, stands on Torget's round plaza in a long coat, one hand behind his back, on a tall plain block. The figures
 * are our own forms, not copies of the sculptors': a statue's place and its kind are the real thing, its pose a nod.
 */

interface Figure {
  /** The figure's height and how it's dressed. */
  tall: number;
  gown: boolean;
}

interface StatueSpec {
  id: string;
  name: string;
  east: number;
  north: number;
  /** Which way the figure looks, a compass bearing. */
  facingDeg: number;
  plinth: { steps: readonly (readonly [number, number])[]; block: readonly [number, number, number] };
  figure: Figure;
}

const STATUES: readonly StatueSpec[] = [
  {
    id: "maria-alexandrovna",
    name: "Kejsarinnan Maria Alexandrovna",
    east: 108059,
    north: 6683160,
    facingDeg: 355,
    plinth: {
      steps: [
        [2.1, 0.25],
        [1.6, 0.25],
      ],
      block: [1.05, 1.05, 1.6],
    },
    figure: { tall: 2.3, gown: true },
  },
  {
    id: "julius-sundblom",
    name: "Julius Sundblom",
    east: 108054,
    north: 6683243,
    facingDeg: 175,
    plinth: { steps: [[1.3, 0.3]], block: [0.85, 0.85, 2.1] },
    figure: { tall: 2.4, gown: false },
  },
];

const SINK = 0.5;

function plinth(mesh: MeshBuilder, spec: StatueSpec, near: boolean) {
  let y = 0;
  for (const [half, rise] of spec.plinth.steps) {
    mesh.box([0, (y + rise - SINK) / 2, 0], [half * 2, rise + y + SINK, half * 2], flat("plinth-granite", 0.92), 0, flat("plinth-granite", 1.05));
    y += rise;
  }
  const [hx, hz, tall] = spec.plinth.block;
  mesh.box([0, y + tall / 2, 0], [hx * 2, tall, hz * 2], flat("plinth-granite"), 0, flat("plinth-granite", 1.08));
  if (near) {
    // A cornice under the figure, and a darker inscription panel on the front (+z faces the way the figure looks).
    mesh.box([0, y + tall - 0.09, 0], [hx * 2 + 0.16, 0.18, hz * 2 + 0.16], flat("plinth-granite", 1.04));
    mesh.box([0, y + 0.18, 0], [hx * 2 + 0.12, 0.2, hz * 2 + 0.12], flat("plinth-dark"));
    mesh.box([0, y + tall * 0.55, hz + 0.01], [hx * 1.3, tall * 0.28, 0.02], flat("plinth-dark"));
  }
  return y + tall;
}

/** A turned part: rings of (radius, height) about an upright axis at a plan point, squashed front to back. */
function turned(mesh: MeshBuilder, at: Vec2, rings: readonly Vec2[], sides: number, paints: Paint | readonly Paint[], depth = 1) {
  mesh.within(
    ([x, y, z]) => [at[0] + (x - at[0]), y, at[1] + (z - at[1]) * depth],
    () => {
      mesh.lathe(at, rings, sides, paints);
    },
  );
}

/** A figure facing +z, its feet at `base`. */
function figure(mesh: MeshBuilder, { tall, gown }: Figure, base: number, sides: number) {
  const s = tall / 2.3;
  const bronze = flat("bronze");
  const lit = flat("bronze", 1.18);
  const dark = flat("bronze-dark");
  const shoulder = base + 1.88 * s;
  if (gown) {
    // A crinoline gown from the ground to a narrow waist, a bodice, and a shawl over the shoulders.
    turned(mesh, [0, 0], [[0.62 * s, base], [0.6 * s, base + 0.25 * s], [0.48 * s, base + 0.7 * s], [0.3 * s, base + 1.15 * s], [0.17 * s, base + 1.38 * s]], sides, [flat("bronze", 0.8), bronze, bronze, lit], 0.86);
    turned(mesh, [0, 0], [[0.17 * s, base + 1.38 * s], [0.2 * s, base + 1.6 * s], [0.26 * s, shoulder - 0.05 * s], [0.1 * s, shoulder + 0.04 * s]], sides, [bronze, lit, bronze], 0.7);
    turned(mesh, [0, 0], [[0.3 * s, shoulder - 0.2 * s], [0.31 * s, shoulder - 0.02 * s], [0.08 * s, shoulder + 0.06 * s]], sides, lit, 0.72);
  } else {
    // Two legs under a long coat, its skirts open a little at the front.
    for (const side of [-1, 1]) mesh.tube([side * 0.11 * s, base, 0.02 * s], [side * 0.1 * s, base + 0.85 * s, 0], 0.075 * s, 0.085 * s, sides / 2, dark);
    for (const side of [-1, 1]) mesh.box([side * 0.11 * s, base + 0.05 * s, 0.07 * s], [0.13 * s, 0.1 * s, 0.3 * s], dark);
    turned(mesh, [0, 0], [[0.29 * s, base + 0.62 * s], [0.27 * s, base + 1.0 * s], [0.22 * s, base + 1.3 * s], [0.25 * s, base + 1.62 * s], [0.29 * s, shoulder - 0.06 * s], [0.12 * s, shoulder + 0.03 * s]], sides, [bronze, bronze, lit, lit, bronze], 0.62);
    // The coat's collar.
    mesh.box([0, shoulder - 0.08 * s, 0.1 * s], [0.34 * s, 0.14 * s, 0.1 * s], dark);
  }
  // Arms: the left down at the side (holding a fold of the gown, or a book), the right behind the back or across.
  const arm = (side: number, hand: readonly [number, number, number]) => {
    const from = [side * 0.27 * s, shoulder - 0.08 * s, 0] as const;
    const elbow = [side * 0.31 * s, shoulder - 0.45 * s, hand[2] * 0.4] as const;
    mesh.tube(from, elbow, 0.075 * s, 0.065 * s, sides / 2, bronze);
    mesh.tube(elbow, hand, 0.065 * s, 0.05 * s, sides / 2, bronze);
  };
  if (gown) {
    arm(-1, [-0.34 * s, shoulder - 0.85 * s, 0.12 * s]);
    arm(1, [0.08 * s, shoulder - 0.62 * s, 0.24 * s]);
    // A fan in the hand held to the waist.
    mesh.box([0.1 * s, shoulder - 0.6 * s, 0.28 * s], [0.18 * s, 0.03 * s, 0.1 * s], lit);
  } else {
    arm(-1, [-0.33 * s, shoulder - 0.82 * s, 0.05 * s]);
    arm(1, [0.12 * s, shoulder - 0.75 * s, -0.22 * s]);
    // A book or hat held at the left side.
    mesh.box([-0.36 * s, shoulder - 0.88 * s, 0.05 * s], [0.06 * s, 0.24 * s, 0.18 * s], dark);
  }
  // The neck and head, a little forward, and the hair: a gathered crown for the empress, short for Sundblom.
  turned(mesh, [0, 0.02 * s], [[0.06 * s, shoulder], [0.065 * s, shoulder + 0.1 * s], [0.1 * s, shoulder + 0.13 * s], [0.115 * s, shoulder + 0.24 * s], [0.09 * s, shoulder + 0.33 * s], [0, shoulder + 0.38 * s]], sides, [bronze, bronze, lit, lit, dark], 0.95);
  if (gown) turned(mesh, [0, -0.06 * s], [[0.07 * s, shoulder + 0.28 * s], [0.08 * s, shoulder + 0.36 * s], [0, shoulder + 0.42 * s]], sides / 2, dark);
}

function farFigure(mesh: MeshBuilder, { tall, gown }: Figure, base: number) {
  const s = tall / 2.3;
  const paint = blend(flat("bronze"), flat("bronze-dark"), 0.4);
  const shoulder = base + 1.88 * s;
  if (gown) mesh.lathe([0, 0], [[0.58 * s, base], [0.3 * s, base + 1.1 * s], [0.27 * s, shoulder], [0.11 * s, shoulder + 0.05 * s], [0.11 * s, shoulder + 0.3 * s], [0, shoulder + 0.4 * s]], 5, paint);
  else mesh.lathe([0, 0], [[0.2 * s, base], [0.28 * s, base + 0.7 * s], [0.28 * s, shoulder], [0.11 * s, shoulder + 0.05 * s], [0.11 * s, shoulder + 0.3 * s], [0, shoulder + 0.4 * s]], 5, paint);
}

export const STATUE_SITES: GroundSite[] = STATUES.map((spec) => ({
  id: spec.id,
  name: spec.name,
  east: spec.east,
  north: spec.north,
  replaces: "inside",
  build() {
    // The figure faces the model's +z, which `headed` keeps on the right of its +x.
    const frame = headed(spec.facingDeg - 90);
    const near = createBuilder(frame);
    figure(near, spec.figure, plinth(near, spec, true), 12);
    const far = createBuilder(frame);
    farFigure(far, spec.figure, plinth(far, spec, false));
    return { near: near.done(), far: far.done() };
  },
}));

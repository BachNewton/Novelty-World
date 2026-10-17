import { type BufferGeometry, type Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, type Matrix4, type Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ForageSpot } from "../engine/forage";
import type { ForageKind } from "../engine/regions";
import { lumpy, paint, type Piece } from "./painted";

/*
 * The berries and mushrooms to pick, each readable at a glance in the
 * storybook style: soft, simple forms with their colours in their vertices,
 * the fruit drawn a little larger than life so it reads among the leaves.
 * A berry bush is two parts, the plant and its fruit, so a picked bush is
 * the plant alone; a mushroom is the grown mushrooms, or the little cut
 * stumps they leave. Shapes are in metres, standing on the origin; each spot
 * scales and turns its copy.
 */

const FORAGE_THINGS = [
  "twig",
  "bilberry-leaf",
  "bilberry",
  "lingonberry-leaf",
  "lingonberry",
  "strawberry-leaf",
  "strawberry",
  "raspberry-leaf",
  "raspberry-cane",
  "raspberry",
  "cloudberry-leaf",
  "cloudberry",
  "chanterelle",
  "porcini-cap",
  "porcini-stem",
  "funnel-cap",
  "funnel-stem",
  "fly-agaric-cap",
  "fly-agaric-spot",
  "fly-agaric-stem",
  "cut",
  "sparkle",
] as const;
export type ForageThing = (typeof FORAGE_THINGS)[number];
export type ForagePalette = Record<ForageThing, Color>;

export function readForagePalette(): ForagePalette {
  return Object.fromEntries(FORAGE_THINGS.map((t) => [t, themeColor(`--color-hearthwood-forage-${t}`)])) as ForagePalette;
}

/** A bush's plant and its fruit; a mushroom grown, or cut to its stumps. */
export type ForagePart = "plant" | "fruit" | "cut";
export const FORAGE_PARTS: readonly ForagePart[] = ["plant", "fruit", "cut"];

const UP = new Vector3(0, 1, 0);

function ball(radius: number, at: Vector3, detail = 1, squash = 1, rng?: Rng): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  if (rng) lumpy(g, () => rng.next(), 0.9, 1.1);
  g.scale(1, squash, 1);
  g.translate(at.x, at.y, at.z);
  return g;
}

/** A round stalk from one point to another. */
function stalk(from: Vector3, to: Vector3, radius: number, sides = 5): BufferGeometry {
  const way = to.clone().sub(from);
  const g = new CylinderGeometry(radius * 0.8, radius, way.length(), sides, 1, true);
  g.translate(0, way.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, way.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** A point round about the origin, `out` metres off at most, more of them near the middle. */
function scatter(rng: Rng, out: number, y: number): Vector3 {
  const angle = rng.next() * Math.PI * 2;
  const r = out * Math.sqrt(rng.next());
  return new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}

/** A point on a ball's surface, from a little below its middle to near its top. */
function onBall(rng: Rng, centre: Vector3, radius: number, lowest = -0.3, highest = 0.7): Vector3 {
  const angle = rng.next() * Math.PI * 2;
  const up = uniform(rng, lowest, highest);
  const round = Math.sqrt(1 - up * up);
  return new Vector3(centre.x + Math.cos(angle) * round * radius, centre.y + up * radius, centre.z + Math.sin(angle) * round * radius);
}

interface Clump {
  at: Vector3;
  radius: number;
}

/** The leafy clumps of a low berry shrub, laid out the same for its plant and its fruit. */
function clumps(rng: Rng, count: number, spread: number, low: number, high: number, size: readonly [number, number]): Clump[] {
  return Array.from({ length: count }, (_, i) => ({ at: i === 0 ? new Vector3(0, high, 0) : scatter(rng, spread, uniform(rng, low, high)), radius: uniform(rng, size[0], size[1]) }));
}

function bilberry(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  const layout = clumps(rng, 6 + variant * 2, 0.2, 0.1, 0.24, [0.075, 0.11]);
  const crown = new Vector3(0, 0.1, 0);
  if (part === "plant") {
    const pieces: Piece[] = layout.map((c) => ({ geometry: ball(c.radius, c.at, 1, 0.8, rng), colour: p["bilberry-leaf"], crown, shading: 0.55 }));
    for (const c of layout) pieces.push({ geometry: stalk(new Vector3(c.at.x * 0.3, 0, c.at.z * 0.3), c.at, 0.007, 4), colour: p.twig });
    return pieces;
  }
  return Array.from({ length: 16 + variant * 4 }, (_, i) => {
    const c = layout[i % layout.length];
    return { geometry: ball(uniform(rng, 0.022, 0.028), onBall(rng, c.at, c.radius * 0.96, -0.4, 0.5)), colour: p.bilberry.clone().multiplyScalar(uniform(rng, 0.85, 1.12)), shading: 0.5 };
  });
}

function lingonberry(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  const layout = clumps(rng, 4 + variant, 0.16, 0.05, 0.07, [0.08, 0.12]);
  if (part === "plant") return layout.map((c) => ({ geometry: ball(c.radius, c.at, 1, 0.5, rng), colour: p["lingonberry-leaf"], crown: new Vector3(0, 0.02, 0), shading: 0.5 }));
  const pieces: Piece[] = [];
  for (let cluster = 0; cluster < 3 + variant; cluster++) {
    const c = layout[cluster % layout.length];
    const at = onBall(rng, c.at, c.radius, 0.2, 0.5);
    at.y = c.at.y + c.radius * 0.5 * 0.45;
    for (let b = 0; b < 5; b++) pieces.push({ geometry: ball(uniform(rng, 0.016, 0.02), at.clone().add(new Vector3(uniform(rng, -0.025, 0.025), uniform(rng, 0, 0.02), uniform(rng, -0.025, 0.025)))), colour: p.lingonberry, shading: 0.5 });
  }
  return pieces;
}

function strawberry(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  const leaves = 5 + variant;
  if (part === "plant") {
    const pieces: Piece[] = [];
    for (let l = 0; l < leaves; l++) {
      const angle = (l / leaves) * Math.PI * 2 + rng.next() * 0.5;
      const reach = uniform(rng, 0.07, 0.11);
      const tip = new Vector3(Math.cos(angle) * reach, uniform(rng, 0.07, 0.1), Math.sin(angle) * reach);
      pieces.push({ geometry: stalk(new Vector3(0, 0, 0), tip, 0.004, 4), colour: p["strawberry-leaf"] });
      // Three leaflets, a strawberry's own.
      for (let f = -1; f <= 1; f++) {
        const leaflet = new SphereGeometry(0.03, 7, 4);
        leaflet.scale(0.8, 0.22, 1.2);
        leaflet.translate(0, 0, 0.032);
        leaflet.rotateY(-angle + Math.PI / 2 + f * 0.75);
        leaflet.translate(tip.x, tip.y, tip.z);
        pieces.push({ geometry: leaflet, colour: p["strawberry-leaf"].clone().multiplyScalar(uniform(rng, 0.9, 1.1)), shading: 0.4 });
      }
    }
    return pieces;
  }
  return Array.from({ length: 4 + variant }, () => {
    const angle = rng.next() * Math.PI * 2;
    const reach = uniform(rng, 0.06, 0.12);
    const berry = new CylinderGeometry(0.019, 0.003, 0.034, 8, 2);
    berry.translate(Math.cos(angle) * reach, 0.035, Math.sin(angle) * reach);
    return { geometry: berry, colour: p.strawberry, shading: 0.6 };
  });
}

/** A raspberry cane: up from the ground and arching outwards. */
function canePoints(rng: Rng, angle: number): Vector3[] {
  const height = uniform(rng, 0.85, 1.25);
  const lean = uniform(rng, 0.25, 0.45);
  return Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const out = lean * t * t;
    return new Vector3(Math.cos(angle) * (0.04 + out), height * t * (1 - 0.15 * t * t), Math.sin(angle) * (0.04 + out));
  });
}

function raspberry(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  const canes = Array.from({ length: 4 + variant }, (_, c) => canePoints(rng, (c / (4 + variant)) * Math.PI * 2 + rng.next() * 0.6));
  const pieces: Piece[] = [];
  for (const cane of canes) {
    for (let i = 1; i < cane.length; i++) {
      if (part === "plant") pieces.push({ geometry: stalk(cane[i - 1], cane[i], 0.012 * (1 - i * 0.12), 5), colour: p["raspberry-cane"] });
      if (i < 2) continue;
      if (part === "plant") pieces.push({ geometry: ball(uniform(rng, 0.075, 0.1), cane[i], 1, 0.55, rng), colour: p["raspberry-leaf"], crown: new Vector3(0, 0.6, 0), shading: 0.55 });
      else for (let b = 0; b < 2; b++) pieces.push({ geometry: ball(0.024, onBall(rng, cane[i], 0.085, -0.8, -0.2), 1, 1, rng), colour: p.raspberry, shading: 0.45 });
    }
  }
  return pieces;
}

function cloudberry(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  const plants = Array.from({ length: 3 + variant }, (_, i) => {
    const at = i === 0 ? new Vector3() : scatter(rng, 0.14, 0);
    return { at, top: at.clone().add(new Vector3(uniform(rng, -0.01, 0.01), uniform(rng, 0.1, 0.13), uniform(rng, -0.01, 0.01))) };
  });
  const pieces: Piece[] = [];
  for (const { at, top } of plants) {
    if (part === "fruit") {
      pieces.push({ geometry: ball(0.026, top, 1, 1, rng), colour: p.cloudberry, shading: 0.5 });
      continue;
    }
    pieces.push({ geometry: stalk(at, top, 0.004, 4), colour: p["cloudberry-leaf"] });
    for (let l = 0; l < 2; l++) {
      const angle = rng.next() * Math.PI * 2;
      const leafAt = at.clone().add(new Vector3(Math.cos(angle) * 0.045, uniform(rng, 0.05, 0.08), Math.sin(angle) * 0.045));
      pieces.push({ geometry: stalk(at, leafAt, 0.003, 3), colour: p["cloudberry-leaf"] });
      const leaf = new CylinderGeometry(0.048, 0.044, 0.008, 9);
      leaf.rotateZ(uniform(rng, -0.25, 0.25));
      leaf.translate(leafAt.x, leafAt.y, leafAt.z);
      pieces.push({ geometry: lumpy(leaf, () => rng.next(), 0.92, 1.08), colour: p["cloudberry-leaf"].clone().multiplyScalar(uniform(rng, 0.9, 1.1)), shading: 0.3 });
    }
  }
  return pieces;
}

/** A funnel-shaped mushroom, stem to wavy rim, `height` tall and `rim` wide. */
function funnel(height: number, rim: number, stem: number, waves: number, rng: Rng): BufferGeometry {
  const profile = [
    new Vector2(stem * 0.9, 0),
    new Vector2(stem, height * 0.4),
    new Vector2(rim * 0.45, height * 0.8),
    new Vector2(rim, height),
    new Vector2(rim * 0.96, height * 1.06),
    new Vector2(rim * 0.4, height * 0.94),
    new Vector2(0.0001, height * 0.86),
  ];
  const g = new LatheGeometry(profile, 12);
  const position = g.getAttribute("position");
  const phase = rng.next() * Math.PI * 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const wave = 1 + 0.12 * Math.sin(Math.atan2(z, x) * waves + phase) * Math.min(1, Math.hypot(x, z) / rim);
    position.setXYZ(i, x * wave, position.getY(i), z * wave);
  }
  g.computeVertexNormals();
  return g;
}

/** Where each mushroom of a cluster stands and how big it is, the same whether grown or cut. */
function cluster(rng: Rng, count: number, spread: number, size: readonly [number, number]): { at: Vector3; size: number }[] {
  return Array.from({ length: count }, (_, i) => ({ at: i === 0 ? new Vector3() : scatter(rng, spread, 0), size: uniform(rng, size[0], size[1]) * (i === 0 ? 1.15 : 1) }));
}

/** The stump a cut mushroom leaves: a bit of its stem with the pale cut on top. */
function stump(at: Vector3, radius: number, height: number, stem: Color, p: ForagePalette): Piece[] {
  const base = new CylinderGeometry(radius, radius * 1.1, height, 8);
  base.translate(at.x, height / 2, at.z);
  const cut = new CylinderGeometry(radius * 0.92, radius * 0.92, 0.003, 8);
  cut.translate(at.x, height, at.z);
  return [
    { geometry: base, colour: stem },
    { geometry: cut, colour: p.cut },
  ];
}

function chanterelle(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  return cluster(rng, 4 + variant * 2, 0.13, [0.8, 1.25]).flatMap(({ at, size }) => {
    if (part === "cut") return stump(at, 0.011 * size, 0.012, p.chanterelle, p);
    const g = funnel(0.085 * size, 0.05 * size, 0.011 * size, 5, rng);
    g.rotateZ(uniform(rng, -0.15, 0.15));
    g.translate(at.x, 0, at.z);
    return [{ geometry: g, colour: p.chanterelle.clone().multiplyScalar(uniform(rng, 0.92, 1.06)), shading: 0.55 }];
  });
}

function porcini(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  return cluster(rng, 1 + variant, 0.12, [0.8, 1.15]).flatMap(({ at, size }) => {
    if (part === "cut") return stump(at, 0.04 * size, 0.02, p["porcini-stem"], p);
    const stem = new LatheGeometry([new Vector2(0.034, 0), new Vector2(0.05, 0.03), new Vector2(0.044, 0.075), new Vector2(0.032, 0.11), new Vector2(0.0001, 0.115)].map((v) => v.multiplyScalar(size)), 12);
    stem.translate(at.x, 0, at.z);
    const cap = new SphereGeometry(0.075 * size, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(at.x, 0.1 * size, at.z);
    const underside = new CylinderGeometry(0.072 * size, 0.06 * size, 0.012 * size, 14);
    underside.translate(at.x, 0.095 * size, at.z);
    return [
      { geometry: stem, colour: p["porcini-stem"], shading: 0.35 },
      { geometry: underside, colour: p["porcini-stem"].clone().lerp(p.chanterelle, 0.35) },
      { geometry: lumpy(cap, () => rng.next(), 0.97, 1.03), colour: p["porcini-cap"], shading: 0.5 },
    ];
  });
}

function funnelChanterelle(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  return cluster(rng, 7 + variant * 3, 0.14, [0.75, 1.2]).flatMap(({ at, size }) => {
    if (part === "cut") return stump(at, 0.006 * size, 0.01, p["funnel-stem"], p);
    const lean = new Vector3(uniform(rng, -0.012, 0.012), 0.06 * size, uniform(rng, -0.012, 0.012));
    const top = at.clone().add(lean);
    const cap = funnel(0.02 * size, 0.026 * size, 0.004 * size, 4, rng);
    cap.translate(top.x, top.y - 0.012 * size, top.z);
    return [
      { geometry: stalk(at, top, 0.0055 * size, 5), colour: p["funnel-stem"] },
      { geometry: cap, colour: p["funnel-cap"].clone().multiplyScalar(uniform(rng, 0.9, 1.1)), shading: 0.4 },
    ];
  });
}

function flyAgaric(rng: Rng, variant: number, part: ForagePart, p: ForagePalette): Piece[] {
  return cluster(rng, 1 + variant * 2, 0.16, [0.8, 1.2]).flatMap(({ at, size }, i) => {
    if (part === "cut") return stump(at, 0.019 * size, 0.022, p["fly-agaric-stem"], p);
    const height = 0.16 * size * (i === 0 ? 1 : uniform(rng, 0.7, 0.95));
    const stem = new LatheGeometry([new Vector2(0.03, 0), new Vector2(0.034, 0.015), new Vector2(0.021, 0.04), new Vector2(0.017, height), new Vector2(0.0001, height)].map((v) => new Vector2(v.x * size, v.y)), 12);
    stem.translate(at.x, 0, at.z);
    const ring = new TorusGeometry(0.02 * size, 0.006 * size, 5, 12);
    ring.rotateX(Math.PI / 2);
    ring.scale(1, 0.6, 1);
    ring.translate(at.x, height * 0.78, at.z);
    // An older one has opened out flatter.
    const open = i === 0 ? 0.55 : 0.75;
    const radius = 0.075 * size;
    const cap = new SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, open, 1);
    cap.translate(at.x, height - 0.01, at.z);
    const pieces: Piece[] = [
      { geometry: stem, colour: p["fly-agaric-stem"], shading: 0.3 },
      { geometry: ring, colour: p["fly-agaric-stem"] },
      { geometry: cap, colour: p["fly-agaric-cap"], shading: 0.45 },
    ];
    for (let s = 0; s < 11; s++) {
      const angle = rng.next() * Math.PI * 2;
      const up = s === 0 ? 1 : uniform(rng, 0.3, 0.95);
      const round = Math.sqrt(1 - up * up);
      const wart = new IcosahedronGeometry(0.011 * size, 0);
      wart.scale(1, 0.5, 1);
      wart.translate(at.x + Math.cos(angle) * round * radius, height - 0.01 + up * radius * open, at.z + Math.sin(angle) * round * radius);
      pieces.push({ geometry: wart, colour: p["fly-agaric-spot"] });
    }
    return pieces;
  });
}

const SHAPES: Record<ForageKind, (rng: Rng, variant: number, part: ForagePart, p: ForagePalette) => Piece[]> = {
  bilberry,
  lingonberry,
  "wild-strawberry": strawberry,
  raspberry,
  cloudberry,
  chanterelle,
  porcini,
  "funnel-chanterelle": funnelChanterelle,
  "fly-agaric": flyAgaric,
};

/** Which parts a kind is drawn in. */
export function partsOf(kind: ForageKind): readonly ForagePart[] {
  return kind === "chanterelle" || kind === "porcini" || kind === "funnel-chanterelle" || kind === "fly-agaric" ? ["plant", "cut"] : ["plant", "fruit"];
}

/** How much larger than life each kind is drawn, so the small ones read among the leaves from a few steps off. */
const SHOWN_LARGER: Record<ForageKind, number> = {
  bilberry: 1,
  lingonberry: 1.3,
  "wild-strawberry": 1.6,
  raspberry: 1,
  cloudberry: 1.6,
  chanterelle: 1.7,
  porcini: 1.5,
  "funnel-chanterelle": 1.8,
  "fly-agaric": 1.3,
};

/** One design of a kind, in one of its parts. Each part comes from the same layout, so a bush's fruit sits on its plant. */
export function forageShape(kind: ForageKind, variant: number, part: ForagePart, palette: ForagePalette): BufferGeometry {
  if (!partsOf(kind).includes(part)) throw new Error(`A ${kind} has no ${part}`);
  const rng = createRng(`hearthwood/forage/${kind}/${variant}`);
  const shape = paint(SHAPES[kind](rng, variant, part, palette));
  return shape.scale(SHOWN_LARGER[kind], SHOWN_LARGER[kind], SHOWN_LARGER[kind]);
}

/** Sets `dummy` to the spot's placing and returns its matrix. */
export function forageMatrix(spot: Pick<ForageSpot, "x" | "y" | "z" | "turn" | "size">, dummy: Object3D): Matrix4 {
  dummy.position.set(spot.x, spot.y - 0.01, spot.z);
  dummy.rotation.set(0, spot.turn, 0);
  dummy.scale.setScalar(spot.size);
  dummy.updateMatrix();
  return dummy.matrix;
}

/** The spot's small shift of colour, as an rgb multiplier written at `at`. */
export function forageColour(spot: Pick<ForageSpot, "x" | "z">, out: Float32Array, at: number): void {
  const shift = 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(spot.x * 0.71 + spot.z * 1.37));
  out[at] = shift;
  out[at + 1] = shift;
  out[at + 2] = shift;
}

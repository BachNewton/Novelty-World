import { type BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, OctahedronGeometry, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { PlantKind } from "../../world/life";
import { lumpy, paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * The shapes plants are drawn with: a few designs per kind, each built from
 * soft primitives with its colours in its vertices, at two levels of detail
 * (near, and a far one of a handful of faces). A tree is one unit tall and
 * stands on the origin; the scatter scales, turns and leans each copy.
 */

export type Detail = "near" | "far";

function blob(radius: number, detail: number, at: Vector3, squash = 1, rng?: Rng): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  if (rng) lumpy(g, () => rng.next(), 0.91, 1.09);
  g.scale(1, squash, 1);
  g.translate(at.x, at.y, at.z);
  return g;
}

function trunk(height: number, bottom: number, top: number, sides: number): BufferGeometry {
  const g = new CylinderGeometry(top, bottom, height, sides, 1, true);
  g.translate(0, height / 2, 0);
  return g;
}

function conifer(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things.conifer;
  if (detail === "far") {
    const cone = new ConeGeometry(0.27, 0.9, 6);
    cone.translate(0, 0.55, 0);
    return paint([{ geometry: cone, colour: leaf, shading: 0.5 }]);
  }
  const tiers = 3 + variant;
  const pieces: Piece[] = [{ geometry: trunk(0.25, 0.04, 0.025, 5), colour: p.things.bark }];
  for (let t = 0; t < tiers; t++) {
    const share = t / tiers;
    const base = 0.13 + share * 0.66;
    const height = 0.4 - share * 0.12;
    const radius = (0.3 - share * 0.2) * uniform(rng, 0.92, 1.08);
    const cone = new ConeGeometry(radius, Math.min(height, 1.02 - base), 9, 1, false);
    cone.rotateY(rng.next() * Math.PI);
    cone.translate(0, base + Math.min(height, 1.02 - base) / 2, 0);
    pieces.push({ geometry: cone, colour: leaf.clone().multiplyScalar(0.82 + share * 0.3), shading: 0.55 });
  }
  return paint(pieces);
}

function broadleaf(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things.broadleaf;
  const crown = new Vector3(0, 0.64, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.3, 0, new Vector3(0, 0.62, 0), 0.9), colour: leaf, crown, shading: 0.6 },
      { geometry: trunk(0.36, 0.05, 0.035, 4), colour: p.things.bark },
    ]);
  }
  const pieces: Piece[] = [{ geometry: trunk(0.5, 0.055, 0.035, 6), colour: p.things.bark }];
  const blobs = 4 + (variant % 2) + (variant === 2 ? 1 : 0);
  for (let b = 0; b < blobs; b++) {
    const angle = (b / blobs) * Math.PI * 2 + rng.next();
    const out = b === 0 ? 0 : uniform(rng, 0.12, 0.2);
    const at = new Vector3(Math.cos(angle) * out, (b === 0 ? 0.78 : uniform(rng, 0.56, 0.72)), Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.17, 0.25), 1, at, 0.9, rng), colour: leaf, crown, shading: 0.7 });
  }
  return paint(pieces);
}

function birch(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things["birch-leaf"];
  const bark = p.things["birch-bark"];
  const crown = new Vector3(0, 0.72, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.2, 0, new Vector3(0, 0.7, 0), 1.6), colour: leaf, crown, shading: 0.6 },
      { geometry: trunk(0.5, 0.03, 0.02, 4), colour: bark },
    ]);
  }
  const pieces: Piece[] = [];
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const g = trunk(0.68 / bands, 0.032 - b * 0.003, 0.029 - b * 0.003, 6);
    g.translate(0, (b * 0.68) / bands, 0);
    pieces.push({ geometry: g, colour: b % 2 === 1 ? bark.clone().multiplyScalar(0.55) : bark });
  }
  const blobs = 3 + variant;
  for (let b = 0; b < blobs; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = b === 0 ? 0 : uniform(rng, 0.06, 0.13);
    const at = new Vector3(Math.cos(angle) * out, uniform(rng, 0.55, 0.88), Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.11, 0.16), 1, at, 1.45, rng), colour: leaf, crown, shading: 0.6 });
  }
  return paint(pieces);
}

function bush(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things.bush;
  const crown = new Vector3(0, 0.25, 0);
  if (detail === "far") return paint([{ geometry: blob(0.5, 0, new Vector3(0, 0.3, 0), 0.7), colour: leaf, crown, shading: 0.5 }]);
  const pieces: Piece[] = [];
  const blobs = 3 + variant;
  for (let b = 0; b < blobs; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = b === 0 ? 0 : uniform(rng, 0.2, 0.32);
    pieces.push({ geometry: blob(uniform(rng, 0.28, 0.42), 1, new Vector3(Math.cos(angle) * out, uniform(rng, 0.3, 0.42), Math.sin(angle) * out), 0.8, rng), colour: leaf, crown, shading: 0.6 });
  }
  return paint(pieces);
}

function rock(rng: Rng, detail: Detail, p: Palette): BufferGeometry {
  const g = lumpy(new IcosahedronGeometry(0.5, detail === "near" ? 1 : 0), () => rng.next(), 0.78, 1.15);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.12, 0);
  g.computeVertexNormals();
  return paint([{ geometry: g, colour: p.things.rock, shading: 0.35 }]);
}

const FLOWER_COLOURS = ["flower-white", "flower-yellow", "flower-violet"] as const;

function flowers(rng: Rng, variant: number, p: Palette): BufferGeometry {
  const pieces: Piece[] = [];
  const blossom = p.things[FLOWER_COLOURS[variant % FLOWER_COLOURS.length]];
  for (let t = 0; t < 3; t++) {
    const leaves = new ConeGeometry(0.09, 0.22, 4);
    leaves.translate(uniform(rng, -0.25, 0.25), 0.1, uniform(rng, -0.25, 0.25));
    pieces.push({ geometry: leaves, colour: p.things.bush, shading: 0.4 });
  }
  const count = 7 + Math.floor(rng.next() * 4);
  for (let f = 0; f < count; f++) {
    const head = new OctahedronGeometry(uniform(rng, 0.045, 0.065), 0);
    head.scale(1, 0.6, 1);
    head.translate(uniform(rng, -0.35, 0.35), uniform(rng, 0.14, 0.3), uniform(rng, -0.35, 0.35));
    pieces.push({ geometry: head, colour: blossom });
  }
  return paint(pieces);
}

/** One design of a kind at a level of detail, or null when the kind isn't drawn that far out. */
export function plantShape(kind: PlantKind, variant: number, detail: Detail, palette: Palette): BufferGeometry | null {
  const rng = createRng(`hearthwood/plant/${kind}/${variant}`);
  switch (kind) {
    case "conifer":
      return conifer(rng, variant, detail, palette);
    case "broadleaf":
      return broadleaf(rng, variant, detail, palette);
    case "birch":
      return birch(rng, variant, detail, palette);
    case "bush":
      return bush(rng, variant, detail, palette);
    case "rock":
      return rock(rng, detail, palette);
    case "flowers":
      return detail === "near" ? flowers(rng, variant, palette) : null;
  }
}

import { type BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, OctahedronGeometry, SphereGeometry, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { PlantKind } from "../engine/regions";
import type { Detail } from "../engine/streaming";
import { lumpy, paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * The shapes plants are drawn with: a few designs per kind, each built from
 * soft primitives with its colours in its vertices, at two levels of detail
 * (near, and a far one of a handful of faces). A tree is one unit tall and
 * stands on the origin, and the smaller plants are about a unit across; the
 * scatter scales, turns and leans each copy.
 */

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

function birch(rng: Rng, variant: number, detail: Detail, p: Palette, aspen = false): BufferGeometry {
  const leaf = aspen ? p.things["aspen-gold"].clone().lerp(p.things["birch-leaf"], variant * 0.2) : p.things["birch-leaf"];
  const bark = aspen ? p.things["aspen-bark"] : p.things["birch-bark"];
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
    pieces.push({ geometry: g, colour: b % 2 === 1 ? bark.clone().multiplyScalar(aspen ? 0.82 : 0.55) : bark });
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

/** A Scots pine: a tall bare trunk, warm-barked up top, and a few flat clouds of needles high on it. */
function pine(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things["pine-leaf"];
  const crown = new Vector3(0, 0.82, 0);
  const pieces: Piece[] = [{ geometry: trunk(0.86, 0.035, 0.02, detail === "near" ? 6 : 4), colour: p.things["pine-bark"], shading: 0.5 }];
  if (detail === "far") {
    pieces.push({ geometry: blob(0.24, 0, new Vector3(0, 0.84, 0), 0.5), colour: leaf, crown, shading: 0.6 });
    return paint(pieces);
  }
  const clouds = 3 + variant;
  for (let c = 0; c < clouds; c++) {
    const angle = rng.next() * Math.PI * 2;
    const out = c === 0 ? 0 : uniform(rng, 0.08, 0.17);
    const at = new Vector3(Math.cos(angle) * out, c === 0 ? 0.9 : uniform(rng, 0.66, 0.86), Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.13, 0.19), 1, at, 0.45, rng), colour: leaf.clone().multiplyScalar(uniform(rng, 0.9, 1.08)), crown, shading: 0.65 });
    if (c > 0) {
      const branch = new CylinderGeometry(0.008, 0.012, out + 0.02, 4);
      branch.rotateZ(Math.PI / 2);
      branch.translate(out / 2, 0, 0);
      branch.rotateY(-angle);
      branch.translate(0, at.y - 0.03, 0);
      pieces.push({ geometry: branch, colour: p.things["pine-bark"] });
    }
  }
  return paint(pieces);
}

const MAPLE_COLOURS = ["maple-red", "maple-orange", "maple-gold"] as const;

/** An autumn maple: a broad, full crown in red, orange or gold. */
function maple(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = p.things[MAPLE_COLOURS[variant % MAPLE_COLOURS.length]];
  const crown = new Vector3(0, 0.6, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.36, 1, new Vector3(0, 0.6, 0), 0.82), colour: leaf, crown, shading: 0.6 },
      { geometry: trunk(0.3, 0.05, 0.035, 4), colour: p.things.bark },
    ]);
  }
  const pieces: Piece[] = [{ geometry: trunk(0.42, 0.055, 0.035, 6), colour: p.things.bark }];
  for (let b = 0; b < 6; b++) {
    const angle = (b / 6) * Math.PI * 2 + rng.next() * 0.5;
    const out = b === 0 ? 0 : uniform(rng, 0.16, 0.24);
    const at = new Vector3(Math.cos(angle) * out, b === 0 ? 0.72 : uniform(rng, 0.5, 0.66), Math.sin(angle) * out);
    const shade = uniform(rng, 0.88, 1.1);
    pieces.push({ geometry: blob(uniform(rng, 0.19, 0.26), 1, at, 0.85, rng), colour: leaf.clone().multiplyScalar(shade), crown, shading: 0.7 });
  }
  return paint(pieces);
}

const HEATHER_COLOURS = ["heather-purple", "heather-pink", "gorse"] as const;

/** A clump of heather (purple or pink), or of gorse, dark and yellow-flowered. */
function heather(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const blossom = p.things[HEATHER_COLOURS[variant % HEATHER_COLOURS.length]];
  const gorse = variant === 2;
  const stem = gorse ? p.things.conifer : p.things["heather-stem"];
  const crown = new Vector3(0, 0.05, 0);
  if (detail === "far") return paint([{ geometry: blob(0.45, 0, new Vector3(0, 0.12, 0), 0.45), colour: stem.clone().lerp(blossom, 0.6), crown, shading: 0.4 }]);
  const pieces: Piece[] = [];
  const mounds = 3 + Math.floor(rng.next() * 2);
  for (let m = 0; m < mounds; m++) {
    const angle = rng.next() * Math.PI * 2;
    const out = m === 0 ? 0 : uniform(rng, 0.15, 0.3);
    const at = new Vector3(Math.cos(angle) * out, gorse ? 0.2 : 0.1, Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.2, 0.3), 1, at, gorse ? 0.85 : 0.55, rng), colour: stem.clone().lerp(blossom, gorse ? 0.05 : 0.35), crown, shading: 0.5 });
  }
  const flowers = gorse ? 18 : 26;
  for (let f = 0; f < flowers; f++) {
    const angle = rng.next() * Math.PI * 2;
    const out = Math.sqrt(rng.next()) * 0.4;
    const head = new OctahedronGeometry(uniform(rng, 0.035, 0.055), 0);
    head.translate(Math.cos(angle) * out, (gorse ? 0.32 : 0.19) - out * (gorse ? 0.35 : 0.2) + rng.next() * 0.05, Math.sin(angle) * out);
    pieces.push({ geometry: head, colour: blossom });
  }
  return paint(pieces);
}

/** Fronds arching out from a crown: a green fern, or autumn's rust-brown bracken. */
function fern(rng: Rng, variant: number, detail: Detail, p: Palette): BufferGeometry {
  const leaf = variant === 2 ? p.things.bracken : p.things.fern;
  if (detail === "far") return paint([{ geometry: blob(0.4, 0, new Vector3(0, 0.18, 0), 0.45), colour: leaf, shading: 0.4 }]);
  const pieces: Piece[] = [];
  const fronds = 7 + variant;
  for (let f = 0; f < fronds; f++) {
    const angle = (f / fronds) * Math.PI * 2 + rng.next() * 0.4;
    const length = uniform(rng, 0.45, 0.62);
    const frond = new ConeGeometry(0.075, length, 3, 4);
    frond.scale(1, 1, 0.25);
    frond.translate(0, length / 2, 0);
    const pos = frond.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // Arches over: the further along, the more it bends out and down.
      const t = y / length;
      pos.setZ(i, pos.getZ(i) + t * t * 0.28);
      pos.setY(i, y * (1 - 0.35 * t));
    }
    frond.computeVertexNormals();
    frond.rotateX(0.55);
    frond.rotateY(angle);
    pieces.push({ geometry: frond, colour: leaf.clone().multiplyScalar(uniform(rng, 0.88, 1.08)), shading: 0.5 });
  }
  return paint(pieces);
}

const MUSHROOM_CAPS = ["mushroom-red", "mushroom-brown", "mushroom-gold"] as const;

/** A little cluster of mushrooms: a red cap spotted white, a brown one, or a golden chanterelle's funnel. */
function mushroom(rng: Rng, variant: number, p: Palette): BufferGeometry {
  const cap = p.things[MUSHROOM_CAPS[variant % MUSHROOM_CAPS.length]];
  const pieces: Piece[] = [];
  const count = 3 + Math.floor(rng.next() * 3);
  for (let m = 0; m < count; m++) {
    const angle = rng.next() * Math.PI * 2;
    const out = m === 0 ? 0 : uniform(rng, 0.08, 0.2);
    const x = Math.cos(angle) * out;
    const z = Math.sin(angle) * out;
    const height = uniform(rng, 0.09, 0.2) * (m === 0 ? 1.2 : 1);
    const width = height * uniform(rng, 0.55, 0.8);
    const stem = new CylinderGeometry(width * 0.22, width * 0.28, height, 6);
    stem.translate(x, height / 2, z);
    pieces.push({ geometry: stem, colour: p.things["mushroom-stem"] });
    const top =
      variant === 2
        ? new ConeGeometry(width * 0.85, width * 0.6, 9, 1, true).rotateX(Math.PI)
        : new SphereGeometry(width, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1);
    top.translate(x, height + (variant === 2 ? 0 : -width * 0.15), z);
    pieces.push({ geometry: top, colour: cap, shading: 0.4 });
    if (variant === 0) {
      for (let s = 0; s < 5; s++) {
        const a = rng.next() * Math.PI * 2;
        const r = width * uniform(rng, 0.2, 0.7);
        const spot = new OctahedronGeometry(width * 0.11, 0);
        spot.translate(x + Math.cos(a) * r, height - width * 0.15 + Math.sqrt(Math.max(0, width * width - r * r)) * 0.75, z + Math.sin(a) * r);
        pieces.push({ geometry: spot, colour: p.things["mushroom-spot"] });
      }
    }
  }
  return paint(pieces);
}

/** One design of a kind at a level of detail, or null when the kind isn't drawn that far out. */
export function plantShape(kind: PlantKind, variant: number, detail: Detail, palette: Palette): BufferGeometry | null {
  const rng = createRng(`hearthwood/plant/${kind}/${variant}`);
  switch (kind) {
    case "conifer":
      return conifer(rng, variant, detail, palette);
    case "pine":
      return pine(rng, variant, detail, palette);
    case "broadleaf":
      return broadleaf(rng, variant, detail, palette);
    case "birch":
      return birch(rng, variant, detail, palette);
    case "aspen":
      return birch(rng, variant, detail, palette, true);
    case "maple":
      return maple(rng, variant, detail, palette);
    case "bush":
      return bush(rng, variant, detail, palette);
    case "heather":
      return heather(rng, variant, detail, palette);
    case "fern":
      return fern(rng, variant, detail, palette);
    case "mushroom":
      return detail === "near" ? mushroom(rng, variant, palette) : null;
    case "rock":
      return rock(rng, detail, palette);
    case "flowers":
      return detail === "near" ? flowers(rng, variant, palette) : null;
  }
}

import { type BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, OctahedronGeometry, Quaternion, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { PlantKind } from "../engine/regions";
import { seasonGroupOf, type SeasonGroup } from "../engine/seasons";
import type { Detail } from "../engine/streaming";
import { lumpy, paint, type Piece, type SeasonPart, type SeasonTag } from "./painted";
import type { Palette } from "./palette";

/*
 * The shapes plants are drawn with: a few designs per kind, each built from
 * soft primitives with its colours in its vertices, at two levels of detail
 * (near, and a far one of a handful of faces). A tree is one unit tall and
 * stands on the origin, and the smaller plants are about a unit across; the
 * scatter scales, turns and leans each copy.
 *
 * Built for the seasons (while their foliage feature is on), each piece says
 * what it is to them, and a broadleaf tree grows the branches and twigs its
 * crown hides in leaf, so it stands as a bare tree in winter; built without,
 * a shape is just its summer self, with nothing extra to draw.
 */

/** How a design is built: whether for the seasons, and which season group it is in. */
interface Build {
  seasonal: boolean;
  group: SeasonGroup;
}

function tag(build: Build, part: SeasonPart, centre?: Vector3): SeasonTag | undefined {
  return build.seasonal ? { part, group: build.group, centre } : undefined;
}

/** A tapered limb from one point to another, open at both ends. */
function limb(from: Vector3, to: Vector3, base: number, tip: number, sides = 4): BufferGeometry {
  const along = to.clone().sub(from);
  const length = along.length();
  const g = new CylinderGeometry(tip, base, length, sides, 1, true);
  g.translate(0, length / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), along.normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

interface Mass {
  at: Vector3;
  radius: number;
  squash: number;
}

/**
 * A bare crown's branches: a leader carrying the trunk up through the crown,
 * a limb from the trunk out to each mass of leaves and most of the way
 * through it, and a few twigs forking from its end, all inside the leaves so
 * they show only as the leaves go.
 */
function branches(masses: readonly Mass[], from: number, top: Vector3, rng: Rng, season: SeasonTag | undefined, colour: Piece["colour"]): Piece[] {
  const pieces: Piece[] = [{ geometry: limb(new Vector3(0, from, 0), top, 0.03, 0.008, 5), colour, season }];
  for (const mass of masses) {
    const out = new Vector3(mass.at.x, 0, mass.at.z);
    if (out.length() < 0.02) continue;
    const root = new Vector3(0, from + (mass.at.y - from) * uniform(rng, 0.1, 0.35), 0);
    const end = mass.at
      .clone()
      .add(out.clone().normalize().multiplyScalar(mass.radius * 0.3))
      .add(new Vector3(0, mass.radius * mass.squash * 0.1, 0));
    pieces.push({ geometry: limb(root, end, 0.022, 0.009), colour, season });
    for (let t = 0; t < 3; t++) {
      const angle = Math.atan2(out.z, out.x) + (t - 1) * 0.9 + uniform(rng, -0.25, 0.25);
      // Short enough to end inside the leaves: their tips stay a little under the mass's surface.
      const length = mass.radius * uniform(rng, 0.4, 0.5);
      const tip = end.clone().add(new Vector3(Math.cos(angle) * length * 0.8, length * uniform(rng, 0.35, 0.6) * mass.squash, Math.sin(angle) * length * 0.8));
      pieces.push({ geometry: limb(end, tip, 0.009, 0.003, 3), colour, season });
    }
  }
  return pieces;
}

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

function conifer(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = p.things.conifer;
  if (detail === "far") {
    const cone = new ConeGeometry(0.27, 0.9, 6);
    cone.translate(0, 0.55, 0);
    return paint([{ geometry: cone, colour: leaf, shading: 0.5, season: tag(build, "far-crown") }]);
  }
  const tiers = 3 + variant;
  const pieces: Piece[] = [{ geometry: trunk(0.25, 0.04, 0.025, 5), colour: p.things.bark, season: tag(build, "bark") }];
  for (let t = 0; t < tiers; t++) {
    const share = t / tiers;
    const base = 0.13 + share * 0.66;
    const height = 0.4 - share * 0.12;
    const radius = (0.3 - share * 0.2) * uniform(rng, 0.92, 1.08);
    const cone = new ConeGeometry(radius, Math.min(height, 1.02 - base), 9, 1, false);
    cone.rotateY(rng.next() * Math.PI);
    cone.translate(0, base + Math.min(height, 1.02 - base) / 2, 0);
    pieces.push({ geometry: cone, colour: leaf.clone().multiplyScalar(0.82 + share * 0.3), shading: 0.55, season: tag(build, "crown") });
  }
  return paint(pieces);
}

function broadleaf(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = p.things.broadleaf;
  const crown = new Vector3(0, 0.64, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.3, 0, new Vector3(0, 0.62, 0), 0.9), colour: leaf, crown, shading: 0.6, season: tag(build, "far-crown") },
      { geometry: trunk(0.36, 0.05, 0.035, 4), colour: p.things.bark, season: tag(build, "bark") },
    ]);
  }
  const pieces: Piece[] = [{ geometry: trunk(0.5, 0.055, 0.035, 6), colour: p.things.bark, season: tag(build, "bark") }];
  const blobs = 4 + (variant % 2) + (variant === 2 ? 1 : 0);
  const masses: Mass[] = [];
  for (let b = 0; b < blobs; b++) {
    const angle = (b / blobs) * Math.PI * 2 + rng.next();
    const out = b === 0 ? 0 : uniform(rng, 0.12, 0.2);
    const at = new Vector3(Math.cos(angle) * out, (b === 0 ? 0.78 : uniform(rng, 0.56, 0.72)), Math.sin(angle) * out);
    const radius = uniform(rng, 0.17, 0.25);
    masses.push({ at, radius, squash: 0.9 });
    pieces.push({ geometry: blob(radius, 1, at, 0.9, rng), colour: leaf, crown, shading: 0.7, season: tag(build, "crown", at) });
  }
  if (build.seasonal) pieces.push(...branches(masses, 0.46, new Vector3(0, 0.86, 0), createRng(`hearthwood/plant/broadleaf/${String(variant)}/branches`), tag(build, "branch"), p.things.bark));
  return paint(pieces);
}

function birch(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build, aspen = false): BufferGeometry {
  const leaf = aspen ? p.things["aspen-gold"].clone().lerp(p.things["birch-leaf"], variant * 0.2) : p.things["birch-leaf"];
  const bark = aspen ? p.things["aspen-bark"] : p.things["birch-bark"];
  const crown = new Vector3(0, 0.72, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.2, 0, new Vector3(0, 0.7, 0), 1.6), colour: leaf, crown, shading: 0.6, season: tag(build, "far-crown") },
      { geometry: trunk(0.5, 0.03, 0.02, 4), colour: bark, season: tag(build, "bark") },
    ]);
  }
  const pieces: Piece[] = [];
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const g = trunk(0.68 / bands, 0.032 - b * 0.003, 0.029 - b * 0.003, 6);
    g.translate(0, (b * 0.68) / bands, 0);
    pieces.push({ geometry: g, colour: b % 2 === 1 ? bark.clone().multiplyScalar(aspen ? 0.82 : 0.55) : bark, season: tag(build, "bark") });
  }
  const blobs = 3 + variant;
  const masses: Mass[] = [];
  for (let b = 0; b < blobs; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = b === 0 ? 0 : uniform(rng, 0.06, 0.13);
    const at = new Vector3(Math.cos(angle) * out, uniform(rng, 0.55, 0.88), Math.sin(angle) * out);
    const radius = uniform(rng, 0.11, 0.16);
    masses.push({ at, radius, squash: 1.45 });
    pieces.push({ geometry: blob(radius, 1, at, 1.45, rng), colour: leaf, crown, shading: 0.6, season: tag(build, "crown", at) });
  }
  if (build.seasonal) {
    pieces.push(...branches(masses, 0.5, new Vector3(0, 0.97, 0), createRng(`hearthwood/plant/${aspen ? "aspen" : "birch"}/${String(variant)}/branches`), tag(build, "branch"), p.things.bark.clone().lerp(bark, 0.3)));
  }
  return paint(pieces);
}

function bush(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = p.things.bush;
  const crown = new Vector3(0, 0.25, 0);
  if (detail === "far") return paint([{ geometry: blob(0.5, 0, new Vector3(0, 0.3, 0), 0.7), colour: leaf, crown, shading: 0.5, season: tag(build, "herb", new Vector3()) }]);
  const pieces: Piece[] = [];
  const blobs = 3 + variant;
  for (let b = 0; b < blobs; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = b === 0 ? 0 : uniform(rng, 0.2, 0.32);
    pieces.push({ geometry: blob(uniform(rng, 0.28, 0.42), 1, new Vector3(Math.cos(angle) * out, uniform(rng, 0.3, 0.42), Math.sin(angle) * out), 0.8, rng), colour: leaf, crown, shading: 0.6, season: tag(build, "herb", new Vector3()) });
  }
  return paint(pieces);
}

function rock(rng: Rng, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const g = lumpy(new IcosahedronGeometry(0.5, detail === "near" ? 1 : 0), () => rng.next(), 0.78, 1.15);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.12, 0);
  g.computeVertexNormals();
  return paint([{ geometry: g, colour: p.things.rock, shading: 0.35, season: tag(build, "stone") }]);
}

const FLOWER_COLOURS = ["flower-white", "flower-yellow", "flower-violet"] as const;

function flowers(rng: Rng, variant: number, p: Palette, build: Build): BufferGeometry {
  const pieces: Piece[] = [];
  const blossom = p.things[FLOWER_COLOURS[variant % FLOWER_COLOURS.length]];
  for (let t = 0; t < 3; t++) {
    const leaves = new ConeGeometry(0.09, 0.22, 4);
    const x = uniform(rng, -0.25, 0.25);
    const z = uniform(rng, -0.25, 0.25);
    leaves.translate(x, 0.1, z);
    pieces.push({ geometry: leaves, colour: p.things.bush, shading: 0.4, season: tag(build, "herb", new Vector3(x, 0, z)) });
  }
  const count = 7 + Math.floor(rng.next() * 4);
  for (let f = 0; f < count; f++) {
    const head = new OctahedronGeometry(uniform(rng, 0.045, 0.065), 0);
    head.scale(1, 0.6, 1);
    head.translate(uniform(rng, -0.35, 0.35), uniform(rng, 0.14, 0.3), uniform(rng, -0.35, 0.35));
    pieces.push({ geometry: head, colour: blossom, season: tag(build, "blossom") });
  }
  return paint(pieces);
}

/** A Scots pine: a tall bare trunk, warm-barked up top, and a few flat clouds of needles high on it. */
function pine(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = p.things["pine-leaf"];
  const crown = new Vector3(0, 0.82, 0);
  const pieces: Piece[] = [{ geometry: trunk(0.86, 0.035, 0.02, detail === "near" ? 6 : 4), colour: p.things["pine-bark"], shading: 0.5, season: tag(build, "bark") }];
  if (detail === "far") {
    pieces.push({ geometry: blob(0.24, 0, new Vector3(0, 0.84, 0), 0.5), colour: leaf, crown, shading: 0.6, season: tag(build, "far-crown") });
    return paint(pieces);
  }
  const clouds = 3 + variant;
  for (let c = 0; c < clouds; c++) {
    const angle = rng.next() * Math.PI * 2;
    const out = c === 0 ? 0 : uniform(rng, 0.08, 0.17);
    const at = new Vector3(Math.cos(angle) * out, c === 0 ? 0.9 : uniform(rng, 0.66, 0.86), Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.13, 0.19), 1, at, 0.45, rng), colour: leaf.clone().multiplyScalar(uniform(rng, 0.9, 1.08)), crown, shading: 0.65, season: tag(build, "crown", at) });
    if (c > 0) {
      const branch = new CylinderGeometry(0.008, 0.012, out + 0.02, 4);
      branch.rotateZ(Math.PI / 2);
      branch.translate(out / 2, 0, 0);
      branch.rotateY(-angle);
      branch.translate(0, at.y - 0.03, 0);
      pieces.push({ geometry: branch, colour: p.things["pine-bark"], season: tag(build, "branch") });
    }
  }
  return paint(pieces);
}

const MAPLE_COLOURS = ["maple-red", "maple-orange", "maple-gold"] as const;

/** An autumn maple: a broad, full crown in red, orange or gold. */
function maple(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = p.things[MAPLE_COLOURS[variant % MAPLE_COLOURS.length]];
  const crown = new Vector3(0, 0.6, 0);
  if (detail === "far") {
    return paint([
      { geometry: blob(0.36, 1, new Vector3(0, 0.6, 0), 0.82), colour: leaf, crown, shading: 0.6, season: tag(build, "far-crown") },
      { geometry: trunk(0.3, 0.05, 0.035, 4), colour: p.things.bark, season: tag(build, "bark") },
    ]);
  }
  const pieces: Piece[] = [{ geometry: trunk(0.42, 0.055, 0.035, 6), colour: p.things.bark, season: tag(build, "bark") }];
  const masses: Mass[] = [];
  for (let b = 0; b < 6; b++) {
    const angle = (b / 6) * Math.PI * 2 + rng.next() * 0.5;
    const out = b === 0 ? 0 : uniform(rng, 0.16, 0.24);
    const at = new Vector3(Math.cos(angle) * out, b === 0 ? 0.72 : uniform(rng, 0.5, 0.66), Math.sin(angle) * out);
    const shade = uniform(rng, 0.88, 1.1);
    const radius = uniform(rng, 0.19, 0.26);
    masses.push({ at, radius, squash: 0.85 });
    pieces.push({ geometry: blob(radius, 1, at, 0.85, rng), colour: leaf.clone().multiplyScalar(shade), crown, shading: 0.7, season: tag(build, "crown", at) });
  }
  if (build.seasonal) pieces.push(...branches(masses, 0.38, new Vector3(0, 0.84, 0), createRng(`hearthwood/plant/maple/${String(variant)}/branches`), tag(build, "branch"), p.things.bark));
  return paint(pieces);
}

const HEATHER_COLOURS = ["heather-purple", "heather-pink", "gorse"] as const;

/** A clump of heather (purple or pink), or of gorse, dark and yellow-flowered. */
function heather(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const blossom = p.things[HEATHER_COLOURS[variant % HEATHER_COLOURS.length]];
  const gorse = variant === 2;
  const stem = gorse ? p.things.conifer : p.things["heather-stem"];
  const crown = new Vector3(0, 0.05, 0);
  if (detail === "far") return paint([{ geometry: blob(0.45, 0, new Vector3(0, 0.12, 0), 0.45), colour: stem.clone().lerp(blossom, 0.6), crown, shading: 0.4, season: tag(build, "far-crown") }]);
  const pieces: Piece[] = [];
  const mounds = 3 + Math.floor(rng.next() * 2);
  for (let m = 0; m < mounds; m++) {
    const angle = rng.next() * Math.PI * 2;
    const out = m === 0 ? 0 : uniform(rng, 0.15, 0.3);
    const at = new Vector3(Math.cos(angle) * out, gorse ? 0.2 : 0.1, Math.sin(angle) * out);
    pieces.push({ geometry: blob(uniform(rng, 0.2, 0.3), 1, at, gorse ? 0.85 : 0.55, rng), colour: stem.clone().lerp(blossom, gorse ? 0.05 : 0.35), crown, shading: 0.5, season: tag(build, "herb") });
  }
  const flowers = gorse ? 18 : 26;
  for (let f = 0; f < flowers; f++) {
    const angle = rng.next() * Math.PI * 2;
    const out = Math.sqrt(rng.next()) * 0.4;
    const head = new OctahedronGeometry(uniform(rng, 0.035, 0.055), 0);
    head.translate(Math.cos(angle) * out, (gorse ? 0.32 : 0.19) - out * (gorse ? 0.35 : 0.2) + rng.next() * 0.05, Math.sin(angle) * out);
    pieces.push({ geometry: head, colour: blossom, season: tag(build, "blossom") });
  }
  return paint(pieces);
}

/** Fronds arching out from a crown: a green fern, or autumn's rust-brown bracken. */
function fern(rng: Rng, variant: number, detail: Detail, p: Palette, build: Build): BufferGeometry {
  const leaf = variant === 2 ? p.things.bracken : p.things.fern;
  if (detail === "far") return paint([{ geometry: blob(0.4, 0, new Vector3(0, 0.18, 0), 0.45), colour: leaf, shading: 0.4, season: tag(build, "herb", new Vector3()) }]);
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
    pieces.push({ geometry: frond, colour: leaf.clone().multiplyScalar(uniform(rng, 0.88, 1.08)), shading: 0.5, season: tag(build, "herb", new Vector3()) });
  }
  return paint(pieces);
}

/** One design of a kind at a level of detail, or null when the kind isn't drawn that far out; `seasonal` builds it for the seasons' foliage feature. */
export function plantShape(kind: PlantKind, variant: number, detail: Detail, palette: Palette, seasonal = false): BufferGeometry | null {
  const rng = createRng(`hearthwood/plant/${kind}/${variant}`);
  const build: Build = { seasonal, group: seasonGroupOf(kind, variant) };
  switch (kind) {
    case "conifer":
      return conifer(rng, variant, detail, palette, build);
    case "pine":
      return pine(rng, variant, detail, palette, build);
    case "broadleaf":
      return broadleaf(rng, variant, detail, palette, build);
    case "birch":
      return birch(rng, variant, detail, palette, build);
    case "aspen":
      return birch(rng, variant, detail, palette, build, true);
    case "maple":
      return maple(rng, variant, detail, palette, build);
    case "bush":
      return bush(rng, variant, detail, palette, build);
    case "heather":
      return heather(rng, variant, detail, palette, build);
    case "fern":
      return fern(rng, variant, detail, palette, build);
    case "rock":
      return rock(rng, detail, palette, build);
    case "flowers":
      return detail === "near" ? flowers(rng, variant, palette, build) : null;
  }
}

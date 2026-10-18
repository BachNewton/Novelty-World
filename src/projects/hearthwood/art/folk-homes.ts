import { type BufferGeometry, BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Shape, SphereGeometry, TorusGeometry, Vector2 } from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { HomeKind } from "../engine/people";
import type { Keepsake } from "../stories/story";
import type { FolkPalette } from "./folk";
import { lumpy, paint, type Piece } from "./painted";

/*
 * What the people keep by them, and what they give: storybook models in the
 * folk's own tones, soft simple forms with their colours in their vertices,
 * each facing +z on the ground at its origin. A few woolly sheep; straw skeps
 * on a little bench; a rowing boat drawn up on the shore; a smoke sauna of
 * dark logs with its chimney and water bucket; a Falu-red cottage with white
 * corners and window frames under a turf roof; a herder's canvas tent on its
 * poles; a stone to sit on. And the keepsakes Elliott is given, set out at
 * camp: a jar of heather honey, a little carved pike, a felted reindeer, a
 * piece of sea glass, a rowan seedling with its berries, a brass compass,
 * a reading glass and a tweed deerstalker for the mysteries solved.
 */

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const uniform = (rng: Rng, low: number, high: number) => low + rng.next() * (high - low);

function sheep(p: FolkPalette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  for (let k = 0; k < 7; k++) {
    const puff = new SphereGeometry(uniform(rng, 0.17, 0.23), 9, 7);
    pieces.push({ geometry: at(puff, uniform(rng, -0.14, 0.14), 0.46 + uniform(rng, -0.05, 0.07), -0.22 + (k / 6) * 0.44), colour: p.sheep, shading: 0.35 });
  }
  const head = new SphereGeometry(0.11, 10, 8);
  head.scale(0.85, 0.9, 1.25);
  pieces.push({ geometry: at(head, 0, 0.5, 0.36), colour: p["sheep-face"] });
  for (const side of [-1, 1]) {
    const ear = new SphereGeometry(0.04, 6, 4);
    ear.scale(1.6, 0.6, 0.8);
    pieces.push({ geometry: at(ear, side * 0.1, 0.55, 0.32), colour: p["sheep-face"] });
    const eye = new SphereGeometry(0.014, 6, 4);
    pieces.push({ geometry: at(eye, side * 0.05, 0.54, 0.47), colour: p.sheep });
  }
  pieces.push({ geometry: at(new SphereGeometry(0.08, 8, 6), 0, 0.6, 0.31), colour: p.sheep });
  for (const [x, z] of [
    [-0.1, -0.16],
    [0.1, -0.16],
    [-0.1, 0.18],
    [0.1, 0.18],
  ]) {
    pieces.push({ geometry: at(new CylinderGeometry(0.03, 0.028, 0.32, 5), x, 0.16, z), colour: p["sheep-face"] });
  }
  return pieces;
}

function skep(p: FolkPalette): Piece[] {
  const pieces: Piece[] = [];
  pieces.push({ geometry: at(new BoxGeometry(0.62, 0.05, 0.5), 0, 0.42, 0), colour: p.wood, shading: 0.2 });
  for (const x of [-0.25, 0.25]) pieces.push({ geometry: at(new BoxGeometry(0.06, 0.42, 0.42), x, 0.2, 0), colour: p.wood.clone().multiplyScalar(0.85) });
  const rings = 6;
  for (let r = 0; r < rings; r++) {
    const t = r / rings;
    const radius = 0.24 * Math.cos(t * 1.25) + 0.02;
    const coil = new TorusGeometry(radius, 0.045, 6, 18);
    coil.rotateX(Math.PI / 2);
    pieces.push({ geometry: at(coil, 0, 0.49 + r * 0.075, 0), colour: p.straw.clone().multiplyScalar(r % 2 === 0 ? 1 : 0.92), shading: 0.3 });
  }
  pieces.push({ geometry: at(new SphereGeometry(0.06, 8, 6), 0, 0.49 + rings * 0.075, 0), colour: p.straw });
  const door = new SphereGeometry(0.045, 8, 6);
  door.scale(1.3, 0.7, 0.5);
  pieces.push({ geometry: at(door, 0, 0.48, 0.24), colour: p["sheep-face"] });
  return pieces;
}

function boat(p: FolkPalette): Piece[] {
  const hull = new SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(0.62, 0.36, 1.6);
  const inside = new CylinderGeometry(1, 1, 0.02, 16);
  inside.scale(0.55, 1, 1.45);
  const rim = new TorusGeometry(1, 0.035, 5, 24);
  rim.rotateX(Math.PI / 2);
  rim.scale(0.62, 1, 1.6);
  const pieces: Piece[] = [
    { geometry: at(hull, 0, 0.36, 0), colour: p.hull, shading: 0.4 },
    { geometry: at(inside, 0, 0.28, 0), colour: p.hull.clone().multiplyScalar(0.7) },
    { geometry: at(rim, 0, 0.36, 0), colour: p.wood },
    { geometry: at(new BoxGeometry(1.1, 0.04, 0.22), 0, 0.33, 0.1), colour: p.wood },
  ];
  for (const side of [-1, 1]) {
    const oar = new CylinderGeometry(0.02, 0.02, 1.9, 5);
    oar.rotateX(Math.PI / 2);
    oar.rotateY(side * 0.08);
    pieces.push({ geometry: at(oar, side * 0.3, 0.38, -0.1), colour: p.wood });
    const blade = new BoxGeometry(0.1, 0.015, 0.36);
    pieces.push({ geometry: at(blade, side * 0.37, 0.38, -0.95), colour: p.wood });
  }
  return pieces;
}

/** Courses of logs round a box, its door on +z. */
function logWalls(p: FolkPalette, tone: "sauna" | "wood", width: number, depth: number, wall: number, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const courses = 7;
  for (let c = 0; c < courses; c++) {
    const y = ((c + 0.5) / courses) * wall;
    for (const side of [-1, 1]) {
      const long = new CylinderGeometry(0.14, 0.14, width + 0.3, 7);
      long.rotateZ(Math.PI / 2);
      pieces.push({ geometry: at(long, 0, y, (side * depth) / 2), colour: p[tone].clone().multiplyScalar(uniform(rng, 0.85, 1.05)), shading: 0.2 });
      const short = new CylinderGeometry(0.14, 0.14, depth + 0.3, 7);
      short.rotateX(Math.PI / 2);
      pieces.push({ geometry: at(short, (side * width) / 2, y + wall / courses / 2, 0), colour: p[tone].clone().multiplyScalar(uniform(rng, 0.85, 1.05)), shading: 0.2 });
    }
  }
  pieces.push({ geometry: at(new BoxGeometry(width - 0.1, wall, depth - 0.1), 0, wall / 2, 0), colour: p[tone].clone().multiplyScalar(0.78) });
  return pieces;
}

/** A pitched roof over a box, its ridge along z, with gables of the walls' own tone. */
function gableRoof(width: number, depth: number, wall: number, pitch: number, over: number, roofTone: Piece["colour"], gableTone: Piece["colour"], rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const triangle = new Shape([new Vector2(-width / 2, 0), new Vector2(width / 2, 0), new Vector2(0, pitch)]);
  const gable = new ExtrudeGeometry(triangle, { depth: depth - 0.1, bevelEnabled: false });
  pieces.push({ geometry: at(gable, 0, wall, -(depth - 0.1) / 2), colour: gableTone, shading: 0.3 });
  const slope = Math.atan2(pitch, width / 2);
  const length = Math.hypot(pitch, width / 2) + over;
  for (const side of [-1, 1]) {
    const roof = lumpy(new BoxGeometry(length, 0.3, depth + 0.7, 3, 1, 3).toNonIndexed(), () => rng.next(), 0.98, 1.02);
    roof.rotateZ(side * slope);
    pieces.push({ geometry: at(roof, -side * (length / 2 - over / 2) * Math.cos(slope), wall + pitch - (length / 2 - over / 2) * Math.sin(slope) + 0.1, 0), colour: roofTone, shading: 0.35 });
  }
  return pieces;
}

function footing(p: FolkPalette, width: number, depth: number): Piece {
  return { geometry: at(new BoxGeometry(width + 0.25, 0.9, depth + 0.25), 0, -0.4, 0), colour: p.charcoal.clone().lerp(p.oat, 0.45), shading: 0.3 };
}

function sauna(p: FolkPalette, rng: Rng): Piece[] {
  const width = 3;
  const depth = 2.6;
  const wall = 1.9;
  const pieces: Piece[] = [footing(p, width, depth), ...logWalls(p, "sauna", width, depth, wall, rng)];
  pieces.push(...gableRoof(width, depth, wall, 0.9, 0.4, p.turf, p.sauna.clone().multiplyScalar(0.85), rng));
  pieces.push({ geometry: at(new BoxGeometry(0.7, 1.45, 0.08), -0.6, 0.73, depth / 2 + 0.16), colour: p.wood.clone().multiplyScalar(0.7) });
  pieces.push({ geometry: at(new BoxGeometry(0.4, 0.3, 0.08), 0.65, 1.25, depth / 2 + 0.16), colour: p.glow.clone().multiplyScalar(0.55) });
  pieces.push({ geometry: at(new BoxGeometry(0.34, 0.9, 0.34), 0.7, wall + 1.0, -0.4), colour: p.charcoal.clone().lerp(p.oat, 0.3), shading: 0.3 });
  // A bench by the door, and the bucket with its ladle.
  pieces.push({ geometry: at(new BoxGeometry(1.2, 0.06, 0.32), 0.5, 0.42, depth / 2 + 0.45), colour: p.wood });
  for (const x of [0, 1]) pieces.push({ geometry: at(new BoxGeometry(0.06, 0.42, 0.28), x, 0.21, depth / 2 + 0.45), colour: p.wood.clone().multiplyScalar(0.85) });
  pieces.push({ geometry: at(new CylinderGeometry(0.17, 0.14, 0.26, 12), -1.25, 0.13, depth / 2 + 0.55), colour: p.wood, shading: 0.3 });
  const ladle = new CylinderGeometry(0.015, 0.015, 0.5, 4);
  ladle.rotateZ(0.6);
  pieces.push({ geometry: at(ladle, -1.15, 0.38, depth / 2 + 0.55), colour: p.wood });
  return pieces;
}

function cottage(p: FolkPalette, rng: Rng): Piece[] {
  const width = 4.6;
  const depth = 3.8;
  const wall = 2.3;
  const pieces: Piece[] = [footing(p, width, depth)];
  pieces.push({ geometry: at(new BoxGeometry(width, wall, depth), 0, wall / 2, 0), colour: p.falu, shading: 0.25 });
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) pieces.push({ geometry: at(new BoxGeometry(0.16, wall + 0.05, 0.16), (x * width) / 2, wall / 2, (z * depth) / 2), colour: p.trim });
  }
  pieces.push(...gableRoof(width, depth, wall, 1.5, 0.5, p.turf, p.falu, rng));
  // The front: a door and two windows, each in its white frame, the panes crossed.
  const front = depth / 2 + 0.03;
  pieces.push({ geometry: at(new BoxGeometry(0.95, 1.85, 0.06), 0, 0.93, front), colour: p.trim });
  pieces.push({ geometry: at(new BoxGeometry(0.8, 1.75, 0.08), 0, 0.88, front + 0.01), colour: p.forest });
  pieces.push({ geometry: at(new SphereGeometry(0.04, 6, 4), 0.28, 0.9, front + 0.07), colour: p.brass });
  for (const x of [-1.45, 1.45]) {
    pieces.push({ geometry: at(new BoxGeometry(0.9, 0.95, 0.06), x, 1.35, front), colour: p.trim });
    pieces.push({ geometry: at(new BoxGeometry(0.72, 0.77, 0.08), x, 1.35, front + 0.01), colour: p.glass });
    pieces.push({ geometry: at(new BoxGeometry(0.06, 0.77, 0.1), x, 1.35, front + 0.02), colour: p.trim });
    pieces.push({ geometry: at(new BoxGeometry(0.72, 0.06, 0.1), x, 1.35, front + 0.02), colour: p.trim });
    pieces.push({ geometry: at(new BoxGeometry(0.85, 0.16, 0.22), x, 0.84, front + 0.1), colour: p.wood });
    for (let f = 0; f < 3; f++) pieces.push({ geometry: at(new SphereGeometry(0.07, 6, 5), x - 0.25 + f * 0.25, 0.97, front + 0.12), colour: f === 1 ? p.ochre : p.rowan });
  }
  // A window at each gable end, and a chimney.
  for (const side of [-1, 1]) {
    pieces.push({ geometry: at(new BoxGeometry(0.06, 0.7, 0.6), (side * width) / 2 + side * 0.03, 1.45, 0), colour: p.trim });
    pieces.push({ geometry: at(new BoxGeometry(0.08, 0.55, 0.45), (side * width) / 2 + side * 0.04, 1.45, 0), colour: p.glass });
  }
  pieces.push({ geometry: at(new BoxGeometry(0.5, 1.4, 0.5), 1.0, wall + 1.2, -0.5), colour: p.trim, shading: 0.3 });
  // A bench by the door.
  pieces.push({ geometry: at(new BoxGeometry(1.3, 0.06, 0.34), -1.45, 0.45, front + 0.5), colour: p.wood });
  for (const x of [-2, -0.9]) pieces.push({ geometry: at(new BoxGeometry(0.06, 0.45, 0.3), x, 0.22, front + 0.5), colour: p.wood.clone().multiplyScalar(0.85) });
  return pieces;
}

function lavvu(p: FolkPalette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  pieces.push({ geometry: at(new ConeGeometry(1.7, 2.7, 14, 3), 0, 1.35, 0), colour: p.canvas, shading: 0.45 });
  pieces.push({ geometry: at(new CylinderGeometry(1.7, 1.72, 0.02, 14), 0, 0.01, 0), colour: p.canvas.clone().multiplyScalar(0.6) });
  for (let k = 0; k < 7; k++) {
    const angle = (k / 7) * Math.PI * 2 + uniform(rng, -0.1, 0.1);
    const pole = new CylinderGeometry(0.025, 0.03, 3.6, 5);
    pole.translate(0, 1.8, 0);
    pole.rotateZ(0.53);
    pole.rotateY(angle);
    pieces.push({ geometry: at(pole, Math.cos(angle) * 1.0, -0.15, -Math.sin(angle) * 1.0), colour: p.wood });
  }
  const door = new BoxGeometry(0.8, 1.3, 0.04);
  door.rotateX(-0.53);
  pieces.push({ geometry: at(door, 0, 0.6, 1.36), colour: p.brown.clone().multiplyScalar(0.8) });
  for (let b = 0; b < 2; b++) {
    const band = new CylinderGeometry(1.7 * (1 - (0.35 + b * 0.12)), 1.7 * (1 - (0.35 + b * 0.12) + 0.05), 0.12, 14, 1, true);
    pieces.push({ geometry: at(band, 0, 2.7 * (0.35 + b * 0.12) - 0.05, 0), colour: b === 0 ? p.red : p.ochre });
  }
  return pieces;
}

function stone(p: FolkPalette, rng: Rng): Piece[] {
  const rock = lumpy(new IcosahedronGeometry(0.5, 1).toNonIndexed(), () => rng.next(), 0.88, 1.08);
  rock.scale(1.1, 0.75, 0.95);
  return [{ geometry: at(rock, 0, 0.04, 0), colour: p.charcoal.clone().lerp(p.oat, 0.55), shading: 0.4 }];
}

/** One thing a person keeps, built from its seed. */
export function homeShape(kind: HomeKind, seed: string, palette: FolkPalette): BufferGeometry {
  const rng = createRng(`${seed}:home`);
  switch (kind) {
    case "sheep":
      return paint(sheep(palette, rng));
    case "hives":
      return paint(skep(palette));
    case "boat":
      return paint(boat(palette));
    case "sauna":
      return paint(sauna(palette, rng));
    case "cottage":
      return paint(cottage(palette, rng));
    case "lavvu":
      return paint(lavvu(palette, rng));
    case "stone":
      return paint(stone(palette, rng));
  }
}

/** How high each kind's footing reaches below its ground, so it never floats on a slope: buildings sit on stones. */
export const SINKS: Record<HomeKind, number> = { sheep: 0, hives: 0.03, boat: 0.12, sauna: 0, cottage: 0, lavvu: 0.35, stone: 0.12 };

/** A keepsake, small, at its own origin on the ground. */
export function keepsakeShape(keepsake: Keepsake, palette: FolkPalette): BufferGeometry {
  const p = palette;
  switch (keepsake) {
    case "honey-jar":
      return paint([
        { geometry: at(new CylinderGeometry(0.085, 0.08, 0.17, 12), 0, 0.085, 0), colour: p.honey, shading: 0.3 },
        { geometry: at(new CylinderGeometry(0.1, 0.095, 0.035, 12), 0, 0.18, 0), colour: p.red.clone().lerp(p.cream, 0.3) },
        { geometry: at(new SphereGeometry(0.03, 6, 4), 0, 0.205, 0), colour: p.red.clone().lerp(p.cream, 0.3) },
      ]);
    case "carved-fish": {
      const body = new SphereGeometry(0.08, 10, 8);
      body.scale(0.6, 0.7, 2.2);
      const tail = new ConeGeometry(0.07, 0.1, 6);
      tail.rotateX(-Math.PI / 2);
      tail.scale(0.3, 1, 1);
      return paint([
        { geometry: at(body, 0, 0.06, 0), colour: p.wood, shading: 0.4 },
        { geometry: at(tail, 0, 0.06, -0.22), colour: p.wood.clone().multiplyScalar(0.85) },
        { geometry: at(new SphereGeometry(0.012, 5, 4), 0.042, 0.075, 0.12), colour: p.eye },
        { geometry: at(new SphereGeometry(0.012, 5, 4), -0.042, 0.075, 0.12), colour: p.eye },
      ]);
    }
    case "felted-reindeer": {
      const body = new SphereGeometry(0.08, 10, 8);
      body.scale(0.8, 0.75, 1.3);
      const pieces: Piece[] = [{ geometry: at(body, 0, 0.17, 0), colour: p.felt, shading: 0.35 }];
      for (const [x, z] of [
        [-0.04, -0.06],
        [0.04, -0.06],
        [-0.04, 0.06],
        [0.04, 0.06],
      ]) {
        pieces.push({ geometry: at(new CylinderGeometry(0.016, 0.014, 0.12, 5), x, 0.06, z), colour: p.felt.clone().multiplyScalar(0.8) });
      }
      pieces.push({ geometry: at(new SphereGeometry(0.05, 8, 6), 0, 0.25, 0.11), colour: p.felt, shading: 0.2 });
      pieces.push({ geometry: at(new SphereGeometry(0.014, 5, 4), 0, 0.24, 0.16), colour: p.red });
      for (const side of [-1, 1]) {
        const antler = new CylinderGeometry(0.008, 0.01, 0.1, 4);
        antler.rotateZ(side * 0.5);
        pieces.push({ geometry: at(antler, side * 0.03, 0.31, 0.1), colour: p.oat });
        const tine = new CylinderGeometry(0.006, 0.008, 0.05, 4);
        tine.rotateX(0.6);
        pieces.push({ geometry: at(tine, side * 0.045, 0.32, 0.12), colour: p.oat });
      }
      return paint(pieces);
    }
    case "sea-glass": {
      const glass = new SphereGeometry(0.06, 10, 6);
      glass.scale(1.2, 0.45, 0.9);
      return paint([{ geometry: at(glass, 0, 0.03, 0), colour: p["sea-glass"], shading: 0.3 }]);
    }
    case "rowan-seedling": {
      const pieces: Piece[] = [{ geometry: at(new CylinderGeometry(0.012, 0.016, 0.42, 5), 0, 0.21, 0), colour: p.wood }];
      for (let l = 0; l < 4; l++) {
        const leaf = new SphereGeometry(0.06, 6, 4);
        leaf.scale(1.6, 0.25, 0.6);
        leaf.rotateY(l * 1.6);
        pieces.push({ geometry: at(leaf, Math.cos(l * 1.6) * 0.07, 0.22 + l * 0.06, -Math.sin(l * 1.6) * 0.07), colour: p.leaf, shading: 0.3 });
      }
      for (let b = 0; b < 4; b++) pieces.push({ geometry: at(new SphereGeometry(0.022, 6, 4), (b % 2) * 0.03 - 0.015, 0.43 - Math.floor(b / 2) * 0.03, 0.02), colour: p.rowan });
      return paint(pieces);
    }
    case "compass":
      return paint([
        { geometry: at(new CylinderGeometry(0.075, 0.075, 0.03, 16), 0, 0.015, 0), colour: p.brass, shading: 0.3 },
        { geometry: at(new CylinderGeometry(0.062, 0.062, 0.006, 16), 0, 0.033, 0), colour: p.paper },
        { geometry: at(new BoxGeometry(0.012, 0.006, 0.09), 0, 0.038, 0), colour: p.red },
        { geometry: at(new TorusGeometry(0.02, 0.006, 4, 8), 0, 0.03, 0.085), colour: p.brass },
      ]);
    case "magnifying-glass": {
      const rim = new TorusGeometry(0.065, 0.012, 6, 20);
      rim.rotateX(Math.PI / 2);
      const lens = new CylinderGeometry(0.062, 0.062, 0.008, 18);
      const handle = new CylinderGeometry(0.016, 0.019, 0.13, 8);
      handle.rotateX(Math.PI / 2);
      return paint([
        { geometry: at(rim, 0, 0.014, 0.05), colour: p.brass, shading: 0.3 },
        { geometry: at(lens, 0, 0.012, 0.05), colour: p["sea-glass"].clone().lerp(p.paper, 0.4) },
        { geometry: at(handle, 0, 0.018, -0.09), colour: p.wood, shading: 0.3 },
        { geometry: at(new SphereGeometry(0.02, 8, 6), 0, 0.018, -0.16), colour: p.wood },
      ]);
    }
    case "deerstalker": {
      const tweed = p.brown.clone().lerp(p.oat, 0.35);
      const crown = new SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      crown.scale(1, 0.8, 1.08);
      const pieces: Piece[] = [{ geometry: at(crown, 0, 0.02, 0), colour: tweed, shading: 0.35 }];
      for (const side of [-1, 1]) {
        const peak = new CylinderGeometry(0.075, 0.075, 0.012, 14, 1, false, 0, Math.PI);
        peak.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
        peak.scale(1.15, 1, 0.7);
        pieces.push({ geometry: at(peak, 0, 0.024, side * 0.085), colour: tweed.clone().multiplyScalar(0.92) });
        const flap = new SphereGeometry(0.03, 8, 6);
        flap.scale(0.4, 1, 1.2);
        pieces.push({ geometry: at(flap, side * 0.1, 0.05, 0), colour: tweed.clone().multiplyScalar(0.88) });
      }
      // The flaps tied up over the crown, with a little bow.
      pieces.push({ geometry: at(new SphereGeometry(0.016, 6, 4), -0.012, 0.1, 0), colour: p.charcoal });
      pieces.push({ geometry: at(new SphereGeometry(0.016, 6, 4), 0.012, 0.1, 0), colour: p.charcoal });
      return paint(pieces);
    }
  }
}

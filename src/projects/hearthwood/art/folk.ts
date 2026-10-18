import { BufferAttribute, BufferGeometry, BoxGeometry, Float32BufferAttribute, CapsuleGeometry, type Color, ConeGeometry, CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Role } from "../engine/people";
import { paint, type Piece } from "./painted";

/*
 * The people Elliott meets, as storybook folk: rounded peg-doll figures in
 * the same soft silhouettes as Elliott, a bell of a body, a big round head
 * with dot eyes and a little blush that read face to face, and the garments
 * that say who they are: a knitted cap and a crook, a beekeeper's veil and
 * smoker, a sou'wester and a rod, a herder's tasselled hat with bright bands
 * at the hem, a sauna keeper's felt hat, towel and birch whisk, an old
 * cottager's headscarf, shawl and apron, a traveller's hood and lantern, a
 * hiker's cap and map. Every person's look is generated from their seed
 * within their role's choices (colours, which hat, hair, a beard, how tall
 * and how round), as plain data the portraits are drawn from too, so the two
 * always agree. The figure faces +z, its feet on the ground at the origin,
 * in four parts that move: the body, the head (which turns to look), and
 * each arm from its shoulder (the right holding the tool of their trade).
 */

export const FOLK_TONES = [
  "skin-1",
  "skin-2",
  "skin-3",
  "skin-4",
  "skin-5",
  "hair-black",
  "hair-brown",
  "hair-auburn",
  "hair-blonde",
  "hair-ash",
  "hair-grey",
  "hair-white",
  "red",
  "rust",
  "ochre",
  "moss",
  "forest",
  "sky",
  "indigo",
  "plum",
  "cream",
  "oat",
  "charcoal",
  "brown",
  "oilskin",
  "linen",
  "eye",
  "blush",
  "wood",
  "tin",
  "glow",
  "leaf",
  "paper",
  "straw",
  "hull",
  "sauna",
  "falu",
  "trim",
  "glass",
  "turf",
  "canvas",
  "sheep",
  "sheep-face",
  "honey",
  "sea-glass",
  "felt",
  "rowan",
  "brass",
] as const;
export type FolkTone = (typeof FOLK_TONES)[number];
export type FolkPalette = Record<FolkTone, Color>;

export function readFolkPalette(): FolkPalette {
  return Object.fromEntries(FOLK_TONES.map((t) => [t, themeColor(`--color-hearthwood-folk-${t}`)])) as FolkPalette;
}

/** A tone as the CSS colour the portraits paint it with. */
export const folkVar = (tone: FolkTone) => `var(--color-hearthwood-folk-${tone})`;

export const HATS = ["knit", "headscarf", "veil", "souwester", "cap", "tasselled", "felt", "hood", "none"] as const;
export type Hat = (typeof HATS)[number];

export const TOOLS = ["crook", "smoker", "rod", "lasso", "whisk", "cane", "lantern", "map"] as const;
export type Tool = (typeof TOOLS)[number];

export interface FolkLook {
  role: Role;
  skin: FolkTone;
  hair: FolkTone;
  hat: Hat;
  hatTone: FolkTone;
  /** A hat's band or tassel. */
  hatTrim: FolkTone;
  coat: FolkTone;
  /** Bright bands at the hem, the waist and the shoulders, or none. */
  trim: FolkTone | null;
  /** A scarf (or a sauna keeper's towel) round the neck. */
  scarf: FolkTone | null;
  apron: FolkTone | null;
  /** A shawl over the shoulders, in the scarf's tone. */
  shawl: boolean;
  pack: FolkTone | null;
  beard: boolean;
  bun: boolean;
  tool: Tool;
  /** About 1: how tall and how round they are against the usual. */
  height: number;
  girth: number;
}

interface RoleWardrobe {
  hats: readonly Hat[];
  hatTones: readonly FolkTone[];
  hatTrims?: readonly FolkTone[];
  coats: readonly FolkTone[];
  trims?: readonly FolkTone[];
  scarves?: readonly FolkTone[];
  /** How likely a scarf is, if they have them. */
  scarfChance?: number;
  aprons?: readonly FolkTone[];
  shawl?: boolean;
  packs?: readonly FolkTone[];
  hair?: readonly FolkTone[];
  tool: Tool;
}

const ANY_HAIR: readonly FolkTone[] = ["hair-black", "hair-brown", "hair-brown", "hair-auburn", "hair-blonde", "hair-blonde", "hair-ash", "hair-grey"];

const WARDROBE: Record<Role, RoleWardrobe> = {
  shepherd: { hats: ["knit", "knit", "headscarf"], hatTones: ["red", "ochre", "moss", "indigo", "cream"], hatTrims: ["cream", "red"], coats: ["cream", "oat", "charcoal", "brown", "moss"], trims: ["red", "indigo", "charcoal", "cream"], scarves: ["red", "ochre", "moss"], scarfChance: 0.4, tool: "crook" },
  beekeeper: { hats: ["veil"], hatTones: ["linen", "oat"], coats: ["oat", "sky", "moss", "cream"], aprons: ["linen", "cream"], tool: "smoker" },
  fisher: { hats: ["souwester", "souwester", "cap"], hatTones: ["oilskin"], coats: ["oilskin", "forest", "indigo", "charcoal"], scarves: ["red", "ochre", "cream"], scarfChance: 0.5, tool: "rod" },
  herder: { hats: ["tasselled"], hatTones: ["indigo", "red", "forest"], hatTrims: ["red", "ochre"], coats: ["indigo", "sky", "red", "forest"], trims: ["red", "ochre"], scarves: ["red", "ochre"], scarfChance: 0.6, tool: "lasso" },
  "sauna-keeper": { hats: ["felt"], hatTones: ["oat", "cream", "felt"], coats: ["linen", "cream", "sky"], scarves: ["linen"], scarfChance: 1, tool: "whisk" },
  cottager: {
    hats: ["headscarf", "headscarf", "none", "cap"],
    hatTones: ["plum", "red", "sky", "moss", "ochre"],
    coats: ["plum", "forest", "indigo", "brown", "rust"],
    aprons: ["linen", "cream", "oat"],
    scarves: ["ochre", "rust", "moss", "red"],
    scarfChance: 1,
    shawl: true,
    hair: ["hair-grey", "hair-white", "hair-white", "hair-ash"],
    tool: "cane",
  },
  traveller: { hats: ["hood"], hatTones: ["forest", "brown", "plum", "charcoal", "rust"], coats: ["forest", "brown", "plum", "charcoal", "rust"], packs: ["brown", "oat"], scarves: ["ochre", "red", "cream"], scarfChance: 0.5, tool: "lantern" },
  hiker: { hats: ["knit"], hatTones: ["red", "ochre", "sky", "moss"], hatTrims: ["cream"], coats: ["red", "sky", "ochre", "forest", "rust"], packs: ["indigo", "charcoal", "moss"], tool: "map" },
};

const pick = <T>(rng: Rng, options: readonly T[]): T => options[Math.floor(rng.next() * options.length)];

/** Who a person is to look at, from their seed, within their role's wardrobe. */
export function folkLook(seed: string, role: Role): FolkLook {
  const rng = createRng(`${seed}:look`);
  const w = WARDROBE[role];
  const hat = pick(rng, w.hats);
  const hatTone = role === "traveller" ? "forest" : pick(rng, w.hatTones);
  const coat = pick(rng, w.coats);
  const trims = (w.trims ?? []).filter((t) => t !== coat);
  const hair = pick(rng, w.hair ?? ANY_HAIR);
  const look: FolkLook = {
    role,
    skin: pick(rng, ["skin-1", "skin-2", "skin-2", "skin-3", "skin-4", "skin-5"] as const),
    hair,
    hat,
    hatTone,
    hatTrim: pick(rng, w.hatTrims ?? ["cream"]),
    coat,
    trim: trims.length > 0 ? pick(rng, trims) : null,
    scarf: w.scarves && rng.next() < (w.scarfChance ?? 0) ? pick(rng, w.scarves) : null,
    apron: w.aprons ? pick(rng, w.aprons) : null,
    shawl: w.shawl === true,
    pack: w.packs ? pick(rng, w.packs) : null,
    beard: hat !== "headscarf" && rng.next() < 0.2,
    bun: hat === "none",
    tool: w.tool,
    height: 0.93 + rng.next() * 0.13,
    girth: 0.9 + rng.next() * 0.25,
  };
  // A traveller's hood is their cloak's.
  if (role === "traveller") look.hatTone = look.coat;
  return look;
}

/** Where a figure's moving parts hang from, for the scene to turn them about. */
export interface FolkFrame {
  /** The neck, which the head turns about. */
  neck: number;
  /** Each shoulder's height and how far out it is. */
  shoulder: { y: number; x: number };
}

/** A figure's frame: standing, or seated at a height. */
export function folkFrame(look: FolkLook, seat: number | null): FolkFrame {
  const h = look.height;
  const drop = seat === null ? 0 : 0.52 * h - seat;
  return { neck: 1.13 * h - drop, shoulder: { y: 1.02 * h - drop, x: 0.205 * look.girth } };
}

/** The parts of a figure, each in its own frame: the body at the feet, the head at the neck, each arm at its shoulder. */
export interface FolkParts {
  body: BufferGeometry;
  head: BufferGeometry;
  armLeft: BufferGeometry;
  armRight: BufferGeometry;
  frame: FolkFrame;
}

const HEAD = 0.175;

function lathe(points: [number, number][], segments = 18): BufferGeometry {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

/** A geometry seen from both sides: its faces again, turned the other way. */
function bothSides(geometry: BufferGeometry): BufferGeometry[] {
  const back = (geometry.index ? geometry.toNonIndexed() : geometry.clone()) as BufferGeometry;
  const position = back.getAttribute("position");
  const normal = back.getAttribute("normal");
  for (let i = 0; i < position.count; i += 3) {
    for (const attribute of [position, normal]) {
      const a = [attribute.getX(i + 1), attribute.getY(i + 1), attribute.getZ(i + 1)];
      attribute.setXYZ(i + 1, attribute.getX(i + 2), attribute.getY(i + 2), attribute.getZ(i + 2));
      attribute.setXYZ(i + 2, a[0], a[1], a[2]);
    }
  }
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  (back.getAttribute("normal") as BufferAttribute).needsUpdate = true;
  return [geometry, back];
}

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** A round shape with a hole cut in it: its faces within `angle` of a direction left out, and those below a height (a share of its radius). */
function withHole(geometry: BufferGeometry, towards: [number, number, number], angle: number, below: number): BufferGeometry {
  const flat = geometry.toNonIndexed();
  const position = flat.getAttribute("position");
  const normal = flat.getAttribute("normal");
  const length = Math.hypot(...towards);
  const [tx, ty, tz] = towards.map((v) => v / length);
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 1;
  const keptPosition: number[] = [];
  const keptNormal: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += position.getX(i + k) / 3;
      cy += position.getY(i + k) / 3;
      cz += position.getZ(i + k) / 3;
    }
    const d = Math.hypot(cx, cy, cz) || 1;
    if ((cx * tx + cy * ty + cz * tz) / d > Math.cos(angle) || cy < below * radius) continue;
    for (let k = 0; k < 3; k++) {
      keptPosition.push(position.getX(i + k), position.getY(i + k), position.getZ(i + k));
      keptNormal.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k));
    }
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(keptPosition, 3));
  out.setAttribute("normal", new Float32BufferAttribute(keptNormal, 3));
  return out;
}

/** The body: a bell of a coat, and whatever goes over it (bands, an apron, a shawl, a scarf, a pack, a coiled rope), seated or standing. */
function bodyPieces(look: FolkLook, p: FolkPalette, seat: number | null): Piece[] {
  const h = look.height;
  const g = look.girth;
  const coat = p[look.coat];
  const pieces: Piece[] = [];
  const standing: [number, number][] = [
    [0, 0.02],
    [0.3, 0.02],
    [0.33, 0.08],
    [0.305, 0.28],
    [0.26, 0.52],
    [0.238, 0.65],
    [0.246, 0.8],
    [0.232, 0.94],
    [0.19, 1.05],
    [0.11, 1.12],
    [0, 1.14],
  ];
  const drop = seat === null ? 0 : 0.52 * h - seat;
  const profile: [number, number][] =
    seat === null
      ? standing.map(([r, y]) => [r * g, y * h])
      : [
          [0, seat - 0.05],
          [0.3 * g, seat - 0.05],
          [0.31 * g, seat + 0.04],
          ...standing.filter(([, y]) => y > 0.62).map(([r, y]): [number, number] => [r * g, y * h - drop]),
        ];
  pieces.push({ geometry: lathe(profile), colour: coat, shading: 0.45 });
  const radiusAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1];
      const [r1, y1] = profile[i];
      if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
    }
    return profile[1][0];
  };
  const band = (y: number, height: number, tone: FolkTone) => {
    const r = radiusAt(y) + 0.008;
    pieces.push({ geometry: at(new CylinderGeometry(r, r + 0.004, height, 18, 1, true), 0, y, 0), colour: p[tone] });
  };
  if (look.trim) {
    if (seat === null) band(0.12 * h, 0.07, look.trim);
    band(0.62 * h - drop, 0.05, look.trim);
    band(0.97 * h - drop, 0.06, look.trim);
  }
  if (look.apron) {
    const top = 0.88 * h - drop;
    const bottom = seat === null ? 0.12 : seat + 0.02;
    const apron = new CylinderGeometry(radiusAt(top) + 0.012, radiusAt(bottom) + 0.02, top - bottom, 12, 1, true, -0.75, 1.5);
    pieces.push({ geometry: at(apron, 0, (top + bottom) / 2, 0), colour: p[look.apron], shading: 0.2 });
  }
  if (look.shawl && look.scarf) {
    const neck = 1.11 * h - drop;
    // From the bottom up, so the lathe faces outwards.
    pieces.push({ geometry: lathe([[0.0, neck - 0.26], [0.27 * g, neck - 0.26], [0.275 * g, neck - 0.22], [0.21 * g, neck - 0.08], [0.115 * g, neck]]), colour: p[look.scarf], shading: 0.35 });
  } else if (look.scarf) {
    const scarf = new TorusGeometry(0.13 * g, 0.052, 7, 18);
    scarf.rotateX(Math.PI / 2);
    pieces.push({ geometry: at(scarf, 0, 1.075 * h - drop, 0), colour: p[look.scarf], shading: 0.2 });
    const end = new BoxGeometry(0.085, 0.28, 0.035);
    end.rotateZ(0.12);
    pieces.push({ geometry: at(end, 0.085 * g, 0.93 * h - drop, 0.215 * g), colour: p[look.scarf], shading: 0.2 });
  }
  if (look.pack) {
    const pack = new BoxGeometry(0.32, 0.38, 0.17, 2, 2, 2);
    pieces.push({ geometry: at(pack, 0, 0.84 * h - drop, -0.24 * g), colour: p[look.pack], shading: 0.3 });
    const roll = new CylinderGeometry(0.075, 0.075, 0.4, 10);
    roll.rotateZ(Math.PI / 2);
    pieces.push({ geometry: at(roll, 0, 1.06 * h - drop, -0.25 * g), colour: p.oat, shading: 0.3 });
  }
  if (look.tool === "lasso") {
    const coil = new TorusGeometry(0.17, 0.02, 6, 20);
    coil.rotateY(Math.PI / 2);
    coil.rotateX(0.5);
    pieces.push({ geometry: at(coil, -0.13 * g, 0.92 * h - drop, 0.02), colour: p.oat });
  }
  if (look.tool === "map") {
    const map = new BoxGeometry(0.34, 0.24, 0.008);
    map.rotateX(-0.9);
    pieces.push({ geometry: at(map, 0, 0.74 * h - drop, 0.36 * g), colour: p.paper });
    const route = new BoxGeometry(0.2, 0.015, 0.004);
    route.rotateZ(0.4);
    route.rotateX(-0.9);
    pieces.push({ geometry: at(route, 0.02, 0.745 * h - drop, 0.365 * g), colour: p.sky });
  }
  if (seat === null) {
    // The toes of their boots, peeking out under the hem.
    for (const side of [-1, 1]) {
      const boot = new SphereGeometry(0.075, 8, 6);
      boot.scale(0.9, 0.62, 1.4);
      pieces.push({ geometry: at(boot, side * 0.11, 0.04, 0.27 * g), colour: p.brown });
    }
  } else {
    // The lap and the shins, down to the ground.
    const lap = new BoxGeometry(0.44 * g, 0.16, 0.36, 2, 1, 2);
    pieces.push({ geometry: at(lap, 0, seat + 0.07, 0.2), colour: coat, shading: 0.3 });
    for (const side of [-1, 1]) {
      const shin = new CapsuleGeometry(0.065, Math.max(0.05, seat - 0.12), 4, 8);
      pieces.push({ geometry: at(shin, side * 0.11, seat / 2, 0.36), colour: coat, shading: 0.3 });
      const boot = new SphereGeometry(0.075, 8, 6);
      boot.scale(0.9, 0.6, 1.4);
      pieces.push({ geometry: at(boot, side * 0.11, 0.04, 0.42), colour: p.brown });
    }
  }
  return pieces;
}

function capOf(radius: number, cover: number): BufferGeometry {
  return new SphereGeometry(radius, 16, 9, 0, Math.PI * 2, 0, cover);
}

/** The head, from the neck: the face (dot eyes, blush, a little nose), hair, a beard, and the hat. */
function headPieces(look: FolkLook, p: FolkPalette): Piece[] {
  const c = 0.17;
  const skin = p[look.skin];
  const hair = p[look.hair];
  const pieces: Piece[] = [];
  pieces.push({ geometry: at(new CylinderGeometry(0.06, 0.07, 0.08, 8), 0, 0.02, 0), colour: skin });
  pieces.push({ geometry: at(new SphereGeometry(HEAD, 20, 14), 0, c, 0), colour: skin, shading: 0.15 });
  for (const side of [-1, 1]) {
    const eye = new SphereGeometry(0.021, 8, 6);
    eye.scale(1, 1.15, 0.5);
    pieces.push({ geometry: at(eye, side * 0.058, c + 0.015, HEAD * 0.93), colour: p.eye });
    const blush = new SphereGeometry(0.032, 8, 6);
    blush.scale(1, 0.62, 0.35);
    pieces.push({ geometry: at(blush, side * 0.1, c - 0.035, HEAD * 0.83), colour: p.blush });
  }
  pieces.push({ geometry: at(new SphereGeometry(0.022, 8, 6), 0, c - 0.012, HEAD * 0.99), colour: skin.clone().multiplyScalar(0.94) });

  // Hair: a cap over the top and back of the head, tipped back so the brow shows.
  const hairCap = capOf(HEAD * 1.05, 1.3);
  hairCap.rotateX(-0.55);
  pieces.push({ geometry: at(hairCap, 0, c, 0), colour: hair, shading: 0.2 });
  if (look.bun) pieces.push({ geometry: at(new SphereGeometry(0.075, 10, 8), 0, c + 0.14, -0.13), colour: hair, shading: 0.2 });
  if (look.hat !== "hood" && look.hat !== "headscarf" && look.hat !== "none") {
    // Hair showing at the temples under a hat.
    for (const side of [-1, 1]) {
      const lock = new SphereGeometry(0.062, 8, 6);
      lock.scale(0.7, 1.1, 1);
      pieces.push({ geometry: at(lock, side * 0.148, c + 0.005, -0.015), colour: hair, shading: 0.2 });
    }
  }
  if (look.beard) {
    // A full beard along the jaw, below the cheeks' blush.
    const beard = new SphereGeometry(0.15, 14, 9, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    beard.scale(1, 1.0, 0.85);
    pieces.push({ geometry: at(beard, 0, c - 0.06, 0.03), colour: hair, shading: 0.25 });
  }

  const tone = p[look.hatTone];
  const trim = p[look.hatTrim];
  switch (look.hat) {
    case "knit": {
      const cap = capOf(HEAD * 1.1, 1.35);
      cap.rotateX(-0.2);
      pieces.push({ geometry: at(cap, 0, c + 0.01, 0), colour: tone, shading: 0.3 });
      const brim = new TorusGeometry(HEAD * 1.04, 0.035, 6, 20);
      brim.rotateX(Math.PI / 2 - 0.2);
      pieces.push({ geometry: at(brim, 0, c + 0.075, -0.015), colour: tone.clone().multiplyScalar(0.88) });
      pieces.push({ geometry: at(new SphereGeometry(0.058, 10, 8), 0, c + HEAD * 1.1 + 0.02, -0.05), colour: trim });
      break;
    }
    case "headscarf": {
      const scarf = capOf(HEAD * 1.1, 1.7);
      scarf.rotateX(-0.42);
      pieces.push({ geometry: at(scarf, 0, c + 0.005, -0.01), colour: tone, shading: 0.3 });
      pieces.push({ geometry: at(new SphereGeometry(0.04, 8, 6), 0.03, c - 0.15, 0.11), colour: tone });
      break;
    }
    case "veil": {
      pieces.push({ geometry: at(new CylinderGeometry(0.33, 0.33, 0.02, 22), 0, c + 0.12, 0), colour: tone, shading: 0.2 });
      pieces.push({ geometry: at(new CylinderGeometry(0.14, 0.165, 0.13, 16), 0, c + 0.19, 0), colour: tone, shading: 0.3 });
      // The veil is put back off the face, hanging behind.
      for (const side of bothSides(new CylinderGeometry(0.3, 0.315, 0.24, 16, 2, true, Math.PI / 2, Math.PI))) {
        pieces.push({ geometry: at(side, 0, c, 0), colour: p.linen.clone().multiplyScalar(0.95) });
      }
      break;
    }
    case "souwester": {
      const crown = capOf(HEAD * 1.12, 1.45);
      pieces.push({ geometry: at(crown, 0, c + 0.02, -0.01), colour: tone, shading: 0.3 });
      const brim = new CylinderGeometry(0.21, 0.3, 0.05, 20);
      brim.rotateX(-0.18);
      pieces.push({ geometry: at(brim, 0, c + 0.06, -0.03), colour: tone, shading: 0.2 });
      break;
    }
    case "cap": {
      const crown = new SphereGeometry(HEAD * 1.12, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2);
      crown.scale(1, 0.6, 1.05);
      pieces.push({ geometry: at(crown, 0, c + 0.07, -0.01), colour: tone, shading: 0.3 });
      const bill = new BoxGeometry(0.2, 0.022, 0.12);
      bill.rotateX(0.2);
      pieces.push({ geometry: at(bill, 0, c + 0.08, HEAD + 0.03), colour: tone.clone().multiplyScalar(0.85) });
      break;
    }
    case "tasselled": {
      pieces.push({ geometry: at(new CylinderGeometry(0.165, 0.185, 0.15, 18), 0, c + 0.13, -0.01), colour: tone, shading: 0.3 });
      pieces.push({ geometry: at(new SphereGeometry(0.165, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, c + 0.2, -0.01), colour: tone, shading: 0.3 });
      pieces.push({ geometry: at(new CylinderGeometry(0.19, 0.19, 0.05, 18, 1, true), 0, c + 0.075, -0.01), colour: trim });
      pieces.push({ geometry: at(new SphereGeometry(0.06, 10, 8), 0, c + 0.37, -0.01), colour: trim });
      break;
    }
    case "felt": {
      pieces.push({ geometry: at(new CylinderGeometry(0.12, 0.2, 0.2, 16), 0, c + 0.17, 0), colour: tone, shading: 0.35 });
      const brim = new TorusGeometry(0.2, 0.025, 6, 20);
      brim.rotateX(Math.PI / 2);
      pieces.push({ geometry: at(brim, 0, c + 0.075, 0), colour: tone.clone().multiplyScalar(0.92) });
      break;
    }
    case "hood": {
      // Open round the face and at the neck, so it is drawn from both sides.
      for (const side of bothSides(withHole(new SphereGeometry(HEAD * 1.3, 20, 14), [0, -0.2, 1], 0.78, -0.62))) pieces.push({ geometry: at(side, 0, c + 0.01, -0.02), colour: tone, shading: 0.3 });
      break;
    }
    case "none":
      break;
  }
  return pieces;
}

/** The arm's sleeve and hand, hanging from the shoulder; the right one holds the tool. */
function armPieces(look: FolkLook, p: FolkPalette, right: boolean, seat: number | null): Piece[] {
  const coat = p[look.coat];
  const pieces: Piece[] = [{ geometry: at(new CapsuleGeometry(0.062, 0.3, 4, 8), 0, -0.21, 0), colour: coat, shading: 0.3 }];
  if (look.trim) pieces.push({ geometry: at(new CylinderGeometry(0.068, 0.068, 0.04, 10, 1, true), 0, -0.37, 0), colour: p[look.trim] });
  pieces.push({ geometry: at(new SphereGeometry(0.058, 10, 8), 0, -0.43, 0), colour: p[look.skin] });
  if (!right) return pieces;
  const hand = -0.43;
  const wood = p.wood;
  switch (look.tool) {
    case "crook":
    case "lantern": {
      const length = seat === null ? 1.55 : 1.15;
      pieces.push({ geometry: at(new CylinderGeometry(0.022, 0.026, length, 6), 0, hand + length / 2 - 0.55, 0.02), colour: wood });
      const top = hand + length - 0.55;
      if (look.tool === "crook") {
        const hook = new TorusGeometry(0.075, 0.021, 6, 12, Math.PI);
        hook.rotateY(Math.PI / 2);
        pieces.push({ geometry: at(hook, 0, top, 0.02 + 0.075), colour: wood });
      } else {
        const arm = new BoxGeometry(0.02, 0.02, 0.16);
        pieces.push({ geometry: at(arm, 0, top - 0.02, 0.09), colour: wood });
        pieces.push({ geometry: at(new BoxGeometry(0.1, 0.13, 0.1), 0, top - 0.13, 0.16), colour: p.tin, shading: 0.2 });
        pieces.push({ geometry: at(new SphereGeometry(0.042, 8, 6), 0, top - 0.13, 0.16), colour: p.glow });
        pieces.push({ geometry: at(new ConeGeometry(0.065, 0.06, 6), 0, top - 0.04, 0.16), colour: p.tin });
      }
      break;
    }
    case "cane":
      pieces.push({ geometry: at(new CylinderGeometry(0.018, 0.02, seat === null ? 0.6 : 0.4, 6), 0, hand - 0.28, 0.06), colour: wood });
      break;
    case "smoker": {
      pieces.push({ geometry: at(new CylinderGeometry(0.06, 0.065, 0.15, 10), 0, hand - 0.14, 0.04), colour: p.tin, shading: 0.25 });
      pieces.push({ geometry: at(new ConeGeometry(0.06, 0.08, 10), 0, hand - 0.03, 0.04), colour: p.tin });
      pieces.push({ geometry: at(new BoxGeometry(0.03, 0.11, 0.09), -0.07, hand - 0.12, 0.04), colour: p.brown });
      break;
    }
    case "rod": {
      const rod = new CylinderGeometry(0.012, 0.02, 2.4, 5);
      rod.translate(0, 1.2, 0);
      rod.rotateX(0.95);
      pieces.push({ geometry: at(rod, 0, hand, 0.02), colour: wood });
      // The line hangs straight down from the tip as the arm is held, so it is tipped back against the arm's own lift.
      const tipY = hand + Math.cos(0.95) * 2.4;
      const tipZ = 0.02 + Math.sin(0.95) * 2.4;
      const lift = -armRest("rod", true).x;
      const length = 1.5;
      const line = new CylinderGeometry(0.004, 0.004, length, 3);
      line.rotateX(lift);
      pieces.push({ geometry: at(line, 0, tipY - (Math.cos(lift) * length) / 2, tipZ - (Math.sin(lift) * length) / 2), colour: p.paper });
      break;
    }
    case "whisk": {
      pieces.push({ geometry: at(new CylinderGeometry(0.018, 0.02, 0.16, 6), 0, hand - 0.08, 0.03), colour: wood });
      const leaves = new SphereGeometry(0.1, 9, 7);
      leaves.scale(0.8, 1.6, 0.6);
      pieces.push({ geometry: at(leaves, 0, hand - 0.3, 0.04), colour: p.leaf, shading: 0.3 });
      break;
    }
    case "lasso":
    case "map":
      break;
  }
  return pieces;
}

/** A person's figure, from their look, standing or seated at a height (a bench, a stone). */
export function folkParts(look: FolkLook, palette: FolkPalette, seat: number | null = null): FolkParts {
  return {
    body: paint(bodyPieces(look, palette, seat)),
    head: paint(headPieces(look, palette)),
    armLeft: paint(armPieces(look, palette, false, seat)),
    armRight: paint(armPieces(look, palette, true, seat)),
    frame: folkFrame(look, seat),
  };
}

/** A moment of a person's idling, which the scene works out and the art draws. */
export interface FolkPose {
  /** Seconds of their own clock. */
  seconds: number;
  /** How far their head is turned to look, in radians (left positive), and tipped down. */
  look: number;
  nod: number;
  /** 0 to 1 through a wave of the left hand, or 0 when not waving. */
  wave: number;
  /** Talking: a little bob while they speak. */
  talking: boolean;
}

/** How each arm hangs at rest for the tool held: a staff held out to the side, a rod forward, a map in both hands. */
export function armRest(tool: Tool, right: boolean): { x: number; z: number } {
  if (tool === "map") return { x: -0.95, z: right ? 0.15 : -0.15 };
  if (!right) return { x: 0, z: 0.12 };
  switch (tool) {
    case "crook":
    case "lantern":
      return { x: -0.35, z: -0.3 };
    case "rod":
      return { x: -0.55, z: -0.1 };
    case "cane":
      return { x: -0.15, z: -0.12 };
    default:
      return { x: -0.15, z: -0.1 };
  }
}

import * as THREE from "three";
import { createRng, pick, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { Edge } from "../../types";
import { candelabra, candle, chair, cobweb, FAN_WEB_PX, rug } from "../kit";
import { RAMPS, type PaletteKey } from "../palette";
import { CUT_HEIGHT, onWall, WAINSCOT_DEPTH, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, pixelPlane, textured, type Batch } from "../shapes";
import { panelling, pixelTexture, TEXELS_PER_METRE, wallpaper, woodPlanks } from "../textures";

/** Bindings, weighted towards the dark leathers and cloths of an old library. */
const BINDINGS: readonly PaletteKey[] = [
  "bloodDark", "blood", "blood", "blood", "bloodLight",
  "verdigrisDark", "verdigris", "verdigris",
  "bruise", "bruiseLight",
  "wood", "woodMid", "woodMid", "woodLight",
  "moonDark", "moon",
  "ash", "stoneDark",
  "boneDark", "brass",
];
const BANDS: readonly PaletteKey[] = ["brass", "brass", "brass", "boneDark", "void"];

interface Book {
  w: number;
  h: number;
  d: number;
  colour: PaletteKey;
  band: PaletteKey | null;
}

function randomBook(rng: Rng, room: number): Book {
  const folio = rng.next() < 0.08;
  return {
    w: uniform(rng, 0.028, folio ? 0.09 : 0.065),
    h: room * (folio ? uniform(rng, 0.9, 0.97) : uniform(rng, 0.6, 0.9)),
    d: uniform(rng, 0.14, 0.21),
    colour: pick(rng, BINDINGS),
    band: rng.next() < 0.4 ? pick(rng, BANDS) : null,
  };
}

const BAND = 0.024;

/** One book in its own frame: the bottom-left corner of its spine at the
 *  origin, spine facing +z, pages running back into −z. Its bands are slices
 *  of the book in their own colour, flush with the spine: a band standing
 *  proud of it shows only a lip thinner than a pixel, drawn as a row of dots. */
function addBook(b: Batch, place: THREE.Matrix4, book: Book) {
  const slice = (y0: number, y1: number, colour: PaletteKey) => {
    const matrix = place.clone().multiply(new THREE.Matrix4().makeTranslation(book.w / 2, (y0 + y1) / 2, -book.d / 2));
    b.add([book.w, y1 - y0, book.d], colour, matrix);
  };
  let y = 0;
  if (book.band) {
    for (const at of book.h > 0.2 ? [0.16, 0.84] : [0.8]) {
      const centre = book.h * at;
      slice(y, centre - BAND / 2, book.colour);
      slice(centre - BAND / 2, centre + BAND / 2, book.band);
      y = centre + BAND / 2;
    }
  }
  slice(y, book.h, book.colour);
}

/** Neighbouring books overlap a little: two boxes that only touch leave a
 *  crack the dark shelf back shows through, as a column of dots. */
const OVERLAP = 0.004;
/** Two overlapping books' tops or spines nearer than this share a plane as far as the depth buffer can tell; one is
 *  then moved this far clear of the other. */
const NEAR = 0.002;
const CLEAR = 0.003;

const Z_TURN = new THREE.Vector3(0, 0, 1);
function standing(x: number, y: number, z: number, lean = 0, pivot = 0): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(x + pivot, y, z)
    .multiply(new THREE.Matrix4().makeRotationAxis(Z_TURN, lean))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot, 0, 0));
}

/**
 * Fills one shelf, left to right, with books: runs of a matching set, single
 * volumes of every size, a book leaning into a gap, a stack lying flat. The
 * irregular tops, gaps and leans are what make a shelf read as books rather
 * than stripes. `fill` below 1 leaves more of the shelf empty.
 */
function fillShelf(b: Batch, rng: Rng, x0: number, x1: number, y: number, room: number, front: number, fill = 1) {
  let x = x0 + uniform(rng, 0, 0.03);
  const fits = (width: number) => x + width <= x1;
  /** The last book stood upright, while the next may overlap it. */
  let last: { top: number; spine: number; right: number } | null = null;
  /** Stands a book upright at x, its spine at z. Where it overlaps the last,
   *  a top or a spine within a hair of the last's is moved clear of it, so
   *  the two never share a plane. */
  const upright = (book: Book, z: number) => {
    const near = (a: number, b: number) => Math.abs(a - b) < NEAR;
    if (last && x < last.right) {
      if (near(book.h, last.top)) book.h = last.top + (last.top + CLEAR <= room ? CLEAR : -CLEAR);
      if (near(z, last.spine)) z = last.spine - CLEAR;
    }
    addBook(b, standing(x, y, z), book);
    last = { top: book.h, spine: z, right: x + book.w };
  };
  const finish = () => {
    while (x < x1 - 0.025) {
      const book = randomBook(rng, room);
      book.w = Math.min(book.w, x1 - x);
      upright(book, front - uniform(rng, 0, 0.03));
      x += book.w - OVERLAP;
    }
  };
  while (x < x1 - 0.03) {
    const roll = rng.next();
    const pull = front - uniform(rng, 0, 0.04);
    if (roll > fill) {
      x += uniform(rng, 0.08, 0.3);
    } else if (roll < 0.06 * fill) {
      // A book leaning left onto its neighbour, with a gap beyond it.
      const book = randomBook(rng, room * 0.95);
      const lean = uniform(rng, 0.2, 0.5);
      const foot = book.h * Math.sin(lean);
      if (!fits(foot + book.w)) {
        finish();
        break;
      }
      addBook(b, standing(x + foot, y, pull, lean), book);
      x += foot + book.w * Math.cos(lean) + uniform(rng, 0.04, 0.16);
    } else if (roll < 0.11 * fill) {
      // A gap, then a book leaning right onto the next.
      const book = randomBook(rng, room * 0.95);
      const lean = uniform(rng, 0.2, 0.45);
      x += uniform(rng, 0.03, 0.12);
      const reach = book.w + book.h * Math.sin(lean);
      if (!fits(reach)) {
        finish();
        break;
      }
      addBook(b, standing(x, y, pull, -lean, book.w), book);
      x += reach;
    } else if (roll < 0.13 * fill) {
      // A short stack lying flat, spines out.
      const length = uniform(rng, 0.17, 0.25);
      if (!fits(length)) {
        finish();
        break;
      }
      let top = y;
      for (let i = 0, count = 2 + Math.floor(rng.next() * 3); i < count; i++) {
        const book = { ...randomBook(rng, length), h: length - uniform(rng, 0, 0.04) };
        if (top + book.w > y + room) break;
        const place = new THREE.Matrix4()
          .makeTranslation(x + uniform(rng, -0.01, 0.01), top + book.w, pull)
          .multiply(new THREE.Matrix4().makeRotationAxis(Z_TURN, -Math.PI / 2));
        addBook(b, place, book);
        top += book.w;
      }
      x += length + uniform(rng, 0.01, 0.04);
    } else if (roll < 0.3 * fill) {
      // A matching set.
      const book = randomBook(rng, room);
      for (let i = 0, count = 3 + Math.floor(rng.next() * 5); i < count && fits(book.w); i++) {
        upright({ ...book, h: book.h - uniform(rng, 0, 0.025) }, front - uniform(rng, 0, 0.012));
        x += book.w - OVERLAP;
      }
    } else {
      const book = randomBook(rng, room);
      if (!fits(book.w)) {
        finish();
        break;
      }
      upright(book, pull);
      x += book.w + (rng.next() < 0.12 ? uniform(rng, 0.015, 0.04) : -OVERLAP);
    }
  }
}

const UPPER_HEIGHT = 2.6;
const UPPER_DEPTH = 0.36;
const BASE_DEPTH = 0.42;
const SHELF_PITCH = 0.36;
const BOARD = 0.035;
const POST = 0.05;
/** How far under the cut height the cupboard's top stops, so it never shares the plane of the cut wall's top. */
const BELOW_CUT = 0.005;
/** The shelving's back stands just proud of the wainscot it hangs in front of. */
const BACK = WAINSCOT_DEPTH + 0.01;

interface CaseOptions {
  width: number;
  height?: number;
  depth?: number;
  seed: string;
  /** How full the shelves are, 0–1. */
  fill?: number;
  /** A shelf whose board has given way: its books slide into a heap below. */
  broken?: { bay: number; level: number };
  /** Cobwebs in the top corners of these bays. */
  webs?: { bay: number; side: "left" | "right" }[];
  /** A brass rail along the front for a rolling ladder. */
  rail?: boolean;
  back?: PaletteKey;
}

/** The posts of a run of shelving, left to right; the bays lie between them. */
function posts(width: number): number[] {
  const bays = Math.max(1, Math.round(width / 0.95));
  return Array.from({ length: bays + 1 }, (_, i) => -width / 2 + POST / 2 + (i * (width - POST)) / bays);
}

/**
 * Open shelving full of books, its back at z = 0 and its front facing +z.
 * Hung on a wall above the base cabinet, it hides with the wall when the
 * camera cuts that wall away.
 */
function shelving({ width, height = UPPER_HEIGHT, depth = UPPER_DEPTH, seed, fill = 1, broken, webs = [], rail = false, back = "soot" }: CaseOptions): THREE.Group {
  const rng = createRng(`library:${seed}`);
  const b = batch();
  const columns = posts(width);
  const levels = Math.floor((height - 0.12) / SHELF_PITCH);
  const pitch = (height - 0.12) / levels;
  // The back stops inside the end posts and under the cornice, and the posts under the cornice, so no faces share a
  // plane. The posts and the lowest boards reach a little below the shelving's foot, down to the cupboard it stands on,
  // which stops short of the cut wall's top.
  b.block([width - POST, height - 0.01, BACK], back, [0, 0, BACK / 2]);
  for (const x of columns) b.block([POST, height - 0.12 + BELOW_CUT, depth], "woodMid", [x, -BELOW_CUT, depth / 2]);
  // The cornice overhangs at the front only: runs meet in the corners and at the walls.
  b.block([width, 0.07, depth + 0.06], "woodDark", [0, height - 0.07, depth / 2 + 0.03]);
  b.block([width, 0.05, depth + 0.03], "woodMid", [0, height - 0.12, depth / 2 + 0.015]);
  for (let level = 0; level < levels; level++) {
    const y = level * pitch;
    for (let bay = 0; bay < columns.length - 1; bay++) {
      const left = columns[bay] + POST / 2;
      const right = columns[bay + 1] - POST / 2;
      const span = right - left;
      const isBroken = broken?.bay === bay && broken.level === level;
      if (isBroken) {
        const drop = pitch - BOARD - 0.02;
        const tilt = Math.asin(drop / span);
        b.add([span, BOARD, depth - 0.02], "woodMid", standing(left, y + BOARD / 2, depth / 2, tilt, span).multiply(new THREE.Matrix4().makeTranslation(span / 2, 0, 0)));
        continue;
      }
      const foot = level === 0 ? BELOW_CUT : 0;
      b.block([span, BOARD + foot, depth - 0.02], "woodMid", [(left + right) / 2, y - foot, depth / 2]);
      const floor = y + BOARD;
      const room = pitch - BOARD - 0.015;
      if (broken?.bay === bay && broken.level === level + 1) {
        // The heap the broken shelf above dropped: books tumbled at all angles.
        let x = left + 0.02;
        while (x < left + span * 0.62) {
          const book = randomBook(rng, room * 0.8);
          const lean = uniform(rng, -1.3, 1.3);
          addBook(b, standing(x, floor + Math.abs(Math.sin(lean)) * book.w, depth - uniform(rng, 0.02, 0.08), lean), book);
          x += uniform(rng, 0.04, 0.09);
        }
        fillShelf(b, rng, left + span * 0.7, right, floor, room, depth - 0.02, fill);
        continue;
      }
      // A webbed corner stands empty, so the web shows against the dark back.
      const web = level === levels - 1 ? webs.find((w) => w.bay === bay)?.side : undefined;
      const clear = FAN_WEB_PX / TEXELS_PER_METRE + 0.04;
      fillShelf(b, rng, web === "left" ? left + clear : left, web === "right" ? right - clear : right, floor, room, depth - 0.02, fill);
    }
  }
  if (rail) {
    const railY = height - 0.32;
    b.block([width, 0.03, 0.03], "brass", [0, railY, depth + 0.06]);
    // The brackets are a hair slimmer than the rail they carry, so their tops never share its plane.
    for (const x of columns) b.block([0.03, 0.026, 0.08], "brass", [x, railY + 0.002, depth + 0.02]);
  }
  const result = group(b.mesh());
  for (const { bay, side } of webs) {
    const web = cobweb({ form: "fan", flip: side === "right", colour: "stoneLight", lit: true });
    const x = side === "left" ? columns[bay] + POST / 2 : columns[bay + 1] - POST / 2;
    web.position.set(x, height - 0.12, depth - 0.01);
    result.add(web);
  }
  return result;
}

/** The panelled cupboard the shelving stands on, as tall as a cut-away wall. */
function cupboard(width: number): THREE.Group {
  const b = batch();
  const height = CUT_HEIGHT - BELOW_CUT;
  b.block([width, 0.08, BASE_DEPTH - 0.04], "woodDark", [0, 0, (BASE_DEPTH - 0.04) / 2]);
  b.block([width, height - 0.12, BASE_DEPTH - 0.03], "wood", [0, 0.08, (BASE_DEPTH - 0.03) / 2]);
  const columns = posts(width);
  for (let bay = 0; bay < columns.length - 1; bay++) {
    const span = columns[bay + 1] - columns[bay] - POST;
    const centre = (columns[bay] + columns[bay + 1]) / 2;
    for (const half of [-1, 1]) {
      const door = span / 2 - 0.04;
      const x = centre + (half * span) / 4;
      b.block([door, height - 0.2, 0.02], "woodMid", [x, 0.11, BASE_DEPTH - 0.02]);
      b.block([door - 0.08, height - 0.3, 0.02], "wood", [x, 0.16, BASE_DEPTH - 0.005]);
    }
    // The handles stand clear of the doors' inner edges, so their sides never share the doors' planes.
    b.block([0.02, 0.06, 0.03], "brass", [centre - 0.035, 0.26, BASE_DEPTH]);
    b.block([0.02, 0.06, 0.03], "brass", [centre + 0.035, 0.26, BASE_DEPTH]);
  }
  b.block([width, 0.04, BASE_DEPTH], "woodMid", [0, height - 0.04, BASE_DEPTH / 2]);
  return group(b.mesh());
}

/** A run of library shelving against a wall: the cupboard on the floor, and
 *  the shelves above it hung on the wall so they hide with it. */
function bookcase(edge: Edge, along: number, options: CaseOptions): PropPlacement[] {
  return [
    { build: () => cupboard(options.width), name: "cupboard", ...onWall(edge, along) },
    { build: () => shelving(options), name: "shelving", ...onWall(edge, along, { y: CUT_HEIGHT }) },
  ];
}

const LADDER = { width: 0.5, top: 2.78, foot: 0.78, standOff: UPPER_DEPTH + 0.07 };

function beam(b: Batch, from: THREE.Vector3, to: THREE.Vector3, thickness: number, colour: PaletteKey) {
  const along = to.clone().sub(from);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
  const middle = from.clone().add(to).multiplyScalar(0.5);
  b.add([thickness, along.length(), thickness], colour, new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
}

/**
 * The rolling ladder, hooked on the shelving's rail and leaning out into the
 * room, built in the wall's frame. It is made in two parts split at `from`–`to`
 * heights, so the part above the cut height can hang with the wall.
 */
function ladder(from: number, to: number): THREE.Group {
  const b = batch();
  const outAt = (y: number) => LADDER.standOff + LADDER.foot * (1 - y / LADDER.top);
  const point = (x: number, y: number) => new THREE.Vector3(x, y - from, outAt(y));
  for (const x of [-LADDER.width / 2, LADDER.width / 2]) {
    beam(b, point(x, Math.max(from, 0.06)), point(x, Math.min(to, LADDER.top)), 0.05, "woodMid");
    if (from === 0) b.block([0.06, 0.07, 0.07], "soot", [x, 0, outAt(0.03)]);
    if (to >= LADDER.top) b.add([0.04, 0.1, 0.1], "brass", new THREE.Matrix4().makeTranslation(x, LADDER.top - from, LADDER.standOff - 0.02));
  }
  for (let y = 0.28; y < LADDER.top - 0.1; y += 0.3) {
    if (y < from || y >= to) continue;
    b.add([LADDER.width, 0.035, 0.07], "woodLight", new THREE.Matrix4().makeTranslation(0, y - from, outAt(y)));
  }
  return group(b.mesh());
}

function rollingLadder(edge: Edge, along: number): PropPlacement[] {
  return [
    { build: () => ladder(0, CUT_HEIGHT), name: "ladder", ...onWall(edge, along) },
    {
      build: () => ladder(CUT_HEIGHT, LADDER.top + 0.1),
      name: "ladder",
      ...onWall(edge, along, { y: CUT_HEIGHT }),
      contacts: [{ with: "shelving", because: "its hooks hang on the shelving's rail" }],
    },
  ];
}

/** A brass candle sconce screwed to the front of a shelving post. Faces +z. */
function sconce(): THREE.Group {
  const brass = flat("brass");
  const taper = candle({ height: 0.13, intensity: 1.1 });
  taper.position.set(0, 0.04, 0.22);
  return group(
    box([0.06, 0.18, 0.02], brass, [0, -0.08, 0.01]),
    box([0.025, 0.025, 0.22], brass, [0, -0.01, 0.11]),
    cylinder(0.05, 0.025, brass, [0, 0.015, 0.22], { top: 0.06, sides: 6 }),
    taper,
  );
}

/** A deep leather wingback armchair. It faces +z. */
function wingback(): THREE.Group {
  const leather = flat("blood");
  const shade = flat("bloodDark");
  const legs = flat("woodDark");
  const result = group();
  for (const [x, z] of [[-0.33, -0.3], [0.33, -0.3], [-0.33, 0.3], [0.33, 0.3]]) {
    result.add(box([0.06, 0.12, 0.06], legs, [x, 0, z]));
  }
  result.add(
    box([0.8, 0.3, 0.74], shade, [0, 0.12, 0]),
    box([0.56, 0.1, 0.6], leather, [0, 0.42, 0.06]),
    box([0.78, 0.74, 0.16], leather, [0, 0.42, -0.28]),
    box([0.7, 0.06, 0.14], shade, [0, 1.16, -0.28]),
  );
  for (const side of [-1, 1]) {
    result.add(
      box([0.13, 0.28, 0.66], leather, [side * 0.335, 0.42, 0.04]),
      box([0.17, 0.07, 0.68], shade, [side * 0.34, 0.7, 0.04]),
    );
    const wing = box([0.1, 0.44, 0.3], leather, [0, 0, 0.11]);
    const holder = group(wing);
    holder.position.set(side * 0.34, 0.7, -0.32);
    holder.rotation.y = side * 0.28;
    result.add(holder);
  }
  return result;
}

const PAGE = [
  "bbbbbbb",
  "bllllbb",
  "bbbbbbb",
  "blllllb",
  "bbbbbbb",
  "bllbllb",
  "bbbbbbb",
  "blllllb",
  "bbbbbbb",
];

/** An open book lying on its back, spine along z. `glowing` pages light themselves. */
function openBook({ cover = "bloodDark", glowing = false }: { cover?: PaletteKey; glowing?: boolean } = {}): THREE.Group {
  const pageArt = pixelTexture(PAGE, { b: glowing ? "boneLight" : "bone", l: glowing ? "verdigris" : "boneDark" });
  const result = group(box([0.48, 0.015, 0.31], flat(cover), [0, 0, 0]));
  for (const side of [-1, 1]) {
    const leaf = group(box([0.22, 0.03, 0.28], flat("boneDark"), [side * 0.115, 0, 0]));
    const text = pixelPlane(pageArt, { lit: !glowing });
    text.rotation.x = -Math.PI / 2;
    text.position.set(side * 0.115, 0.032, 0);
    if (glowing) text.userData.noShadow = true;
    leaf.add(text);
    leaf.position.y = 0.012;
    leaf.rotation.z = side * 0.1;
    result.add(leaf);
  }
  return result;
}

/** A loose page lying on the floor. */
function looseSheet(): THREE.Mesh {
  const sheet = pixelPlane(pixelTexture(PAGE, { b: "bone", l: "boneDark" }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.008;
  return sheet;
}

/** Books lying in a rough pile, as left on the floor. */
function bookPile(seed: string, count: number): THREE.Group {
  const rng = createRng(`pile:${seed}`);
  const b = batch();
  let y = 0;
  for (let i = 0; i < count; i++) {
    const book = randomBook(rng, 0.3);
    const thick = uniform(rng, 0.04, 0.08);
    const place = new THREE.Matrix4().makeRotationY(uniform(rng, -0.5, 0.5)).setPosition(uniform(rng, -0.04, 0.04), y + thick / 2, uniform(rng, -0.04, 0.04));
    b.add([book.d + 0.06, thick, book.h * 0.9], book.colour, place);
    y += thick;
  }
  return group(b.mesh());
}

/** Books flung across the floor, as when a case comes down. */
function spill(seed: string, count: number, radius: number): THREE.Group {
  const rng = createRng(`spill:${seed}`);
  const b = batch();
  for (let i = 0; i < count; i++) {
    const book = randomBook(rng, 0.28);
    const angle = rng.next() * Math.PI * 2;
    const distance = Math.sqrt(rng.next()) * radius;
    const thick = uniform(rng, 0.035, 0.07);
    const tilt = rng.next() < 0.3 ? uniform(rng, 0.2, 0.6) : 0;
    const place = new THREE.Matrix4().compose(
      // Tilted books rest on an edge, their lowest corner on the floor.
      new THREE.Vector3(Math.cos(angle) * distance, (book.h / 2) * Math.sin(tilt) + (thick / 2) * Math.cos(tilt) + 0.002, Math.sin(angle) * distance),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rng.next() * Math.PI * 2, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    b.add([book.d + 0.05, thick, book.h], book.colour, place);
  }
  return group(b.mesh());
}

/** A free-standing bookcase that has fallen on its back, most of its books
 *  thrown out, one side propped on a fallen volume. Its top points to −z. */
function fallenBookcase(): THREE.Group {
  const length = 1.5;
  const upright = shelving({ width: 0.9, height: length, depth: 0.32, seed: "fallen", fill: 0.4 });
  upright.rotation.x = -Math.PI / 2;
  upright.position.set(0.45, 0, length / 2);
  const rolled = group(upright);
  rolled.rotation.z = 0.1;
  rolled.position.x = -0.45;
  return group(rolled, spill("fallen-top", 5, 0.18).translateZ(-length / 2 - 0.05));
}

/** A reading desk on two pedestals of drawers. The sitter's side faces −z. */
function desk(): THREE.Group {
  const top = textured(woodPlanks({ ramp: RAMPS.wood, plankPx: 6, seed: "library-desk" }));
  const body = flat("woodDark");
  const front = flat("woodMid");
  const brass = flat("brass");
  const result = group(box([1.5, 0.05, 0.8], top, [0, 0.72, 0]), box([0.66, 0.5, 0.03], body, [0, 0.22, 0.34]));
  for (const side of [-1, 1]) {
    result.add(box([0.42, 0.72, 0.72], body, [side * 0.52, 0, 0]));
    for (let drawer = 0; drawer < 3; drawer++) {
      const y = 0.08 + drawer * 0.2;
      result.add(box([0.36, 0.16, 0.02], front, [side * 0.52, y, -0.37]), box([0.06, 0.02, 0.02], brass, [side * 0.52, y + 0.07, -0.39]));
    }
  }
  return result;
}

function inkwell(): THREE.Group {
  const quill = box([0.012, 0.3, 0.004], flat("boneLight"), [0, 0, 0]);
  quill.position.set(0.02, 0.05, 0);
  quill.rotation.z = -0.5;
  return group(cylinder(0.04, 0.06, flat("void"), [0, 0, 0], { top: 0.03, sides: 6 }), cylinder(0.02, 0.015, flat("brass"), [0, 0.06, 0], { sides: 6 }), quill);
}

/** A round lamp table on a single turned pedestal. */
function sideTable(): THREE.Group {
  const wood = flat("wood");
  return group(
    cylinder(0.2, 0.04, flat("woodDark"), [0, 0, 0], { top: 0.16, sides: 8 }),
    cylinder(0.04, 0.56, wood, [0, 0.04, 0], { sides: 6 }),
    cylinder(0.3, 0.04, flat("woodMid"), [0, 0.6, 0], { sides: 10 }),
  );
}

/** A terrestrial globe in a brass meridian on a three-legged stand. */
function globe(): THREE.Group {
  const rng = createRng("library-globe");
  const rows: string[] = [];
  for (let y = 0; y < 12; y++) {
    let row = "";
    for (let x = 0; x < 24; x++) {
      const land = Math.sin(x * 0.55 + y * 0.3) + Math.cos(x * 0.21 - y * 0.8) + rng.next() * 0.6 > 0.9;
      row += y === 0 || y === 11 ? "p" : land ? "l" : "s";
    }
    rows.push(row);
  }
  const map = pixelTexture(rows, { s: "verdigrisDark", l: "boneDark", p: "bone" });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshLambertMaterial({ map, flatShading: true }));
  sphere.position.y = 0.82;
  sphere.rotation.z = 0.4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.014, 4, 16), flat("brass"));
  ring.position.y = 0.82;
  ring.rotation.z = 0.4;
  const legs = flat("woodDark");
  const result = group(sphere, ring, cylinder(0.035, 0.47, legs, [0, 0.06, 0], { sides: 6 }), cylinder(0.14, 0.06, flat("woodMid"), [0, 0.5, 0], { top: 0.05, sides: 8 }));
  for (let i = 0; i < 3; i++) {
    const leg = box([0.04, 0.06, 0.32], legs, [0, 0, 0.16]);
    const holder = group(leg);
    holder.rotation.y = (i * Math.PI * 2) / 3;
    result.add(holder);
  }
  return result;
}

const SHEETS: [x: number, z: number, turn: number][] = [
  [0.25, 0.85, 20],
  [1.15, 0.15, -35],
  [0.45, 0.05, 70],
  [-0.55, 1.0, 10],
  [-0.75, 2.05, -60],
  [1.0, 1.0, 45],
];

/** Doors on the left and bottom walls, no windows: every free run of wall is
 *  shelving, and the only light is candles and the book on the floor. */
export const LIBRARY: RoomDefinition = {
  id: "library",
  floor: () => woodPlanks({ seed: "library" }),
  wall: () => wallpaper({ ground: "verdigrisDark", stripe: "verdigris", motif: "verdigrisLight", seed: "library" }),
  wainscot: () => panelling({ ramp: RAMPS.wood }),
  trim: "woodDark",
  props: [
    // A hair wider than the wall, its end posts standing into the side walls off the dado rails' faces.
    ...bookcase("top", 0, { width: 5.62, seed: "top", webs: [{ bay: 0, side: "left" }, { bay: 3, side: "right" }] }),
    ...bookcase("right", 0, { width: 4.76, seed: "right", rail: true, broken: { bay: 4, level: 4 }, webs: [{ bay: 4, side: "right" }] }),
    ...bookcase("bottom", 1.75, { width: 2.1, seed: "bottom-a" }),
    ...bookcase("bottom", -1.755, { width: 2.11, seed: "bottom-b", webs: [{ bay: 1, side: "right" }] }),
    ...bookcase("left", 1.54, { width: 1.68, seed: "left-a" }),
    ...bookcase("left", -1.54, { width: 1.68, seed: "left-b", webs: [{ bay: 0, side: "left" }] }),
    ...rollingLadder("right", -1.3),
    { build: sconce, ...onWall("top", -0.925, { y: 1.6, out: UPPER_DEPTH }) },
    { build: sconce, ...onWall("top", 0.925, { y: 1.6, out: UPPER_DEPTH }) },
    { build: sconce, ...onWall("right", 0.47, { y: 1.6, out: UPPER_DEPTH }) },
    { build: sconce, ...onWall("bottom", 1.75, { y: 1.6, out: UPPER_DEPTH }) },
    { build: sconce, ...onWall("left", 1.54, { y: 1.6, out: UPPER_DEPTH }) },

    { build: () => rug({ width: 3.2, length: 2.2, field: "verdigrisDark", border: "soot", motif: "verdigris", fringe: "boneDark" }), at: [-0.3, -1.0] },
    { build: desk, at: [0.4, -1.05], turn: 180 },
    { build: () => chair({ cushion: "verdigris" }), at: [0.45, -1.85] },
    { build: () => candelabra({ arms: 3, intensity: 4 }), at: [0.95, -1.2], y: 0.77 },
    { build: () => openBook({ cover: "verdigrisDark" }), at: [0.25, -0.95], y: 0.77, turn: -8 },
    { build: inkwell, at: [-0.15, -1.25], y: 0.77 },
    { build: () => bookPile("desk", 3), name: "bookPile", at: [-0.2, -0.78], y: 0.77, turn: 15 },

    { build: wingback, at: [-1.6, -1.35], turn: 45 },
    { build: sideTable, at: [-0.85, -1.95] },
    { build: () => candle({ height: 0.16, intensity: 2 }), at: [-0.8, -1.9], y: 0.64 },
    { build: () => bookPile("table", 2), at: [-0.95, -2.02], y: 0.64, turn: 40 },
    { build: () => bookPile("chair", 5), at: [-2.05, -0.9], turn: -20 },

    { build: globe, at: [1.85, 1.0] },
    { build: () => bookPile("globe", 4), at: [1.6, 1.9], turn: 30 },

    // Fallen across the corner between the two doors, its top in the corner.
    { build: fallenBookcase, at: [-1.4, 1.4], turn: 135 },
    { build: () => openBook({ glowing: true, cover: "bruiseDark" }), at: [0.7, 0.5], turn: 25 },
    ...SHEETS.map(([x, z, turn]) => ({ build: looseSheet, at: [x, z] as [number, number], turn })),
  ],
  lights: [{ at: [0.7, 0.35, 0.5], colour: "verdigrisLight", intensity: 1.6, range: 3 }],
  focus: [-0.2, 0.8, -0.8],
  pawn: [0.1, 1.7],
  spots: [[-0.15, 0.45], [-0.85, -0.65], [-1.7, 0.3], [1.1, 0.9], [1.55, -0.3]],
  overflow: [[0.9, 1.7], [-0.9, 0.2], [0.35, -0.15]],
  // In from the left doorway and down between the desk and the armchair to the bottom one.
  lanes: [[[-2.2, 0], [-0.5, -0.1], [0.2, 0.2], [0.2, 1.9], [0, 2.2]]],
};
